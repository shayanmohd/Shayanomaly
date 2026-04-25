"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Search, Radar, SlidersHorizontal, Wifi, WifiOff, ChevronDown, Loader2 } from "lucide-react";
import { useArbitrageWs } from "@/hooks/use-arbitrage-ws";
import type { ArbitrageOpportunity } from "@/lib/types";

interface AnomalyLogRow {
  id: string;
  timestamp: string; // ISO 8601 from Prisma DateTime
  asset: string;
  buyEx: string;
  sellEx: string;
  spread: number;
  severity: string;
}

const DEX_EXCHANGES = new Set(["uniswap", "uniswap_v3", "sushiswap", "curve"]);
const isCex = (ex: string) => !DEX_EXCHANGES.has(ex.toLowerCase());
const isDex = (ex: string) => DEX_EXCHANGES.has(ex.toLowerCase());

const MOCK_DATA: ArbitrageOpportunity[] = [
  { id: "m1", asset: "ETH/USDT", buyExchange: "binance", buyPrice: 3842.1, sellExchange: "kraken", sellPrice: 3849.7, spreadPercent: 0.198, volume: 42.5, timestamp: Date.now() - 3000 },
  { id: "m2", asset: "BTC/USDT", buyExchange: "coinbase", buyPrice: 97240.0, sellExchange: "binance", sellPrice: 97415.0, spreadPercent: 0.18, volume: 1.2, timestamp: Date.now() - 5000 },
  { id: "m3", asset: "ETH/USDT", buyExchange: "uniswap_v3", buyPrice: 3838.4, sellExchange: "binance", sellPrice: 3848.9, spreadPercent: 0.274, volume: 18.3, timestamp: Date.now() - 1200 },
  { id: "m4", asset: "SOL/USDT", buyExchange: "kraken", buyPrice: 186.3, sellExchange: "coinbase", sellPrice: 188.6, spreadPercent: 1.234, volume: 310, timestamp: Date.now() - 800 },
  { id: "m5", asset: "ARB/USDT", buyExchange: "binance", buyPrice: 1.082, sellExchange: "uniswap_v3", sellPrice: 1.098, spreadPercent: 1.479, volume: 15200, timestamp: Date.now() - 2200 },
  { id: "m6", asset: "LINK/USDT", buyExchange: "coinbase", buyPrice: 18.42, sellExchange: "kraken", sellPrice: 18.49, spreadPercent: 0.38, volume: 620, timestamp: Date.now() - 4500 },
  { id: "m7", asset: "MATIC/USDT", buyExchange: "binance", buyPrice: 0.5821, sellExchange: "uniswap_v3", sellPrice: 0.5912, spreadPercent: 1.563, volume: 45000, timestamp: Date.now() - 1500 },
  { id: "m8", asset: "AVAX/USDT", buyExchange: "kraken", buyPrice: 38.14, sellExchange: "coinbase", sellPrice: 38.29, spreadPercent: 0.393, volume: 280, timestamp: Date.now() - 6000 },
];

function mapAnomalyToOpportunity(log: AnomalyLogRow): ArbitrageOpportunity {
  return {
    id: log.id,
    asset: log.asset,
    buyExchange: log.buyEx,
    sellExchange: log.sellEx,
    buyPrice: 0,   // not stored in anomaly log
    sellPrice: 0,  // not stored in anomaly log
    spreadPercent: log.spread,
    volume: 0,     // not stored in anomaly log
    timestamp: new Date(log.timestamp).getTime(),
  };
}

const GAS_ESTIMATE: Record<string, number> = { cex_cex: 0.0, cex_dex: 4.2, dex_dex: 8.1 };

function estimateGas(buy: string, sell: string): number {
  const bDex = isDex(buy), sDex = isDex(sell);
  if (bDex && sDex) return GAS_ESTIMATE.dex_dex;
  if (bDex || sDex) return GAS_ESTIMATE.cex_dex;
  return GAS_ESTIMATE.cex_cex;
}

function netProfit(row: ArbitrageOpportunity, gas: number): number {
  if (row.buyPrice === 0 || row.sellPrice === 0) return 0; // historical — no price data
  const gross = (row.sellPrice - row.buyPrice) * Math.min(row.volume, 1);
  return Math.max(gross - gas, 0);
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type ExchangeFilter = "all" | "cex" | "dex";

export default function ScannerPage() {
  const { opportunities, connected } = useArbitrageWs();

  const [historicalData, setHistoricalData] = useState<ArbitrageOpportunity[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history/anomalies");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { ok: boolean; data: AnomalyLogRow[] };
      if (json.ok && Array.isArray(json.data)) {
        setHistoricalData(json.data.map(mapAnomalyToOpportunity));
      }
    } catch (err) {
      console.warn("[scanner] Failed to fetch history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const mergedData = useMemo(() => {
    const liveMap = new Map<string, ArbitrageOpportunity>();
    for (const opp of opportunities) liveMap.set(opp.id, opp);
    for (const hist of historicalData) {
      if (!liveMap.has(hist.id)) liveMap.set(hist.id, hist);
    }

    return Array.from(liveMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [opportunities, historicalData]);

  const [useMock, setUseMock] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mergedData.length > 0 || historyLoading) {
      setUseMock(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => setUseMock(true), 4000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [mergedData, historyLoading]);

  const rows = useMock ? MOCK_DATA : mergedData;

  const [search, setSearch] = useState("");
  const [minSpread, setMinSpread] = useState(0);
  const [exchFilter, setExchFilter] = useState<ExchangeFilter>("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.asset.toLowerCase().includes(q) && !r.buyExchange.toLowerCase().includes(q) && !r.sellExchange.toLowerCase().includes(q)) return false;
      if (r.spreadPercent < minSpread) return false;
      if (exchFilter === "cex" && !(isCex(r.buyExchange) && isCex(r.sellExchange))) return false;
      if (exchFilter === "dex" && !(isDex(r.buyExchange) || isDex(r.sellExchange))) return false;
      return true;
    });
  }, [rows, search, minSpread, exchFilter]);

  const maxSpread = filtered.length ? Math.max(...filtered.map((r) => r.spreadPercent)) : 0;
  const avgSpread = filtered.length ? filtered.reduce((s, r) => s + r.spreadPercent, 0) / filtered.length : 0;
  const liveCount = opportunities.length;

  const EXCH_LABELS: Record<ExchangeFilter, string> = { all: "All Exchanges", cex: "CEX Only", dex: "DEX Only" };

  return (
    <div className="flex-1 flex flex-col gap-4 p-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Radar className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Arbitrage Scanner</h1>
            <p className="text-xs text-muted">Real-time cross-venue spread detection</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* live stats */}
          <div className="glass-panel px-3 py-1.5 flex items-center gap-4 text-xs">
            <span className="text-muted">Live <span className="text-neon-green font-semibold">{liveCount}</span></span>
            <span className="text-muted">Total <span className="text-foreground font-semibold">{filtered.length}</span></span>
            <span className="text-muted">Max <span className="text-neon-green font-semibold">{maxSpread.toFixed(3)}%</span></span>
            <span className="text-muted">Avg <span className="text-neon-blue font-semibold">{avgSpread.toFixed(3)}%</span></span>
          </div>

          {/* connection badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${connected ? "bg-neon-green/10 text-neon-green" : "bg-neon-red/10 text-neon-red"}`}>
            {historyLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : connected ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            {historyLoading ? "LOADING" : connected ? "LIVE" : useMock ? "MOCK" : "OFFLINE"}
          </div>
        </div>
      </div>

      <div className="glass-panel p-3 flex flex-wrap items-center gap-3">
        <SlidersHorizontal className="w-4 h-4 text-muted shrink-0" />

        {/* search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search asset or exchange…"
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-background border border-border text-xs text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent/40 transition-colors"
          />
        </div>

        {/* min spread */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted whitespace-nowrap">Min Spread %</label>
          <input
            type="number"
            min={0}
            max={10}
            step={0.05}
            value={minSpread}
            onChange={(e) => setMinSpread(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-20 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground text-center focus:outline-none focus:border-accent/40 transition-colors"
          />
          {/* slider */}
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={minSpread}
            onChange={(e) => setMinSpread(parseFloat(e.target.value))}
            className="w-24 accent-accent h-1 cursor-pointer"
          />
        </div>

        {/* exchange dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background border border-border text-xs text-foreground hover:border-accent/40 transition-colors"
          >
            {EXCH_LABELS[exchFilter]}
            <ChevronDown className={`w-3 h-3 text-muted transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {dropdownOpen && (
            <div className="absolute top-full mt-1 right-0 z-50 glass-panel border border-border rounded-md overflow-hidden min-w-[140px]">
              {(["all", "cex", "dex"] as ExchangeFilter[]).map((v) => (
                <button
                  key={v}
                  onClick={() => { setExchFilter(v); setDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-hover transition-colors ${exchFilter === v ? "text-accent bg-accent/5" : "text-foreground"}`}
                >
                  {EXCH_LABELS[v]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface border-b border-border">
                <th className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">Timestamp</th>
                <th className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">Asset Pair</th>
                <th className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">Buy Exchange</th>
                <th className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">Sell Exchange</th>
                <th className="text-right text-muted font-medium px-3 py-2.5 whitespace-nowrap">Buy Price</th>
                <th className="text-right text-muted font-medium px-3 py-2.5 whitespace-nowrap">Sell Price</th>
                <th className="text-right text-muted font-medium px-3 py-2.5 whitespace-nowrap">Spread %</th>
                <th className="text-right text-muted font-medium px-3 py-2.5 whitespace-nowrap">Est. Gas</th>
                <th className="text-right text-muted font-medium px-3 py-2.5 whitespace-nowrap">Net Profit</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && filtered.length === 0 ? (
                /* Skeleton loading rows */
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="border-b border-border/50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 rounded bg-surface-hover animate-pulse" style={{ width: j === 0 ? 64 : j < 4 ? 80 : 56 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted">
                    {rows.length === 0 ? "Waiting for data stream…" : "No opportunities match current filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const gas = estimateGas(r.buyExchange, r.sellExchange);
                  const profit = netProfit(r, gas);
                  const hot = r.spreadPercent >= 1;
                  const warm = r.spreadPercent >= 0.5 && r.spreadPercent < 1;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border/50 transition-colors hover:bg-surface-hover ${hot ? "bg-neon-green/[0.03]" : ""}`}
                    >
                      <td className="px-3 py-2 text-muted tabular-nums">{fmtTime(r.timestamp)}</td>
                      <td className="px-3 py-2 text-foreground font-medium">{r.asset}</td>
                      <td className="px-3 py-2">
                        <ExchangeBadge name={r.buyExchange} />
                      </td>
                      <td className="px-3 py-2">
                        <ExchangeBadge name={r.sellExchange} />
                      </td>
                      <td className="px-3 py-2 text-right text-neon-green tabular-nums">{r.buyPrice > 0 ? `$${r.buyPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2 text-right text-neon-red tabular-nums">{r.sellPrice > 0 ? `$${r.sellPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-semibold ${hot ? "bg-neon-green/15 text-neon-green" : warm ? "text-neon-yellow" : "text-muted"}`}>
                          {r.spreadPercent.toFixed(3)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted tabular-nums">{gas > 0 ? `$${gas.toFixed(2)}` : "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${profit > 0 ? "text-neon-green" : "text-muted"}`}>
                        {profit > 0 ? `$${profit.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* footer */}
        <div className="border-t border-border px-3 py-2 flex items-center justify-between text-xs text-muted">
          <span>{filtered.length} of {rows.length} opportunities shown{historicalData.length > 0 && !useMock ? ` (${historicalData.length} historical)` : ""}</span>
          {useMock && <span className="text-neon-yellow">Using simulated data — backend offline</span>}
        </div>
      </div>
    </div>
  );
}

const EXCH_COLORS: Record<string, string> = {
  binance: "text-neon-yellow",
  kraken: "text-neon-purple",
  coinbase: "text-neon-blue",
  uniswap_v3: "text-neon-green",
  uniswap: "text-neon-green",
  sushiswap: "text-neon-red",
};

function ExchangeBadge({ name }: { name: string }) {
  const color = EXCH_COLORS[name.toLowerCase()] ?? "text-foreground";
  const label = name.charAt(0).toUpperCase() + name.slice(1).replace("_", " ");
  const dex = isDex(name);
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      {label}
      {dex && <span className="text-[9px] px-1 py-px rounded bg-neon-green/10 text-neon-green font-semibold leading-none">DEX</span>}
    </span>
  );
}
