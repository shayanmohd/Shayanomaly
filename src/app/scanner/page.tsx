"use client";

import { useState, useMemo } from "react";
import { Search, Radar, SlidersHorizontal, Wifi, WifiOff, ChevronDown } from "lucide-react";
import { useMarketData } from "@/lib/market-engine";
import type { ArbitrageOpportunity } from "@/lib/types";

const DEX_EXCHANGES = new Set(["uniswap", "uniswap_v3", "sushiswap", "curve"]);
const isCex = (ex: string) => !DEX_EXCHANGES.has(ex.toLowerCase());
const isDex = (ex: string) => DEX_EXCHANGES.has(ex.toLowerCase());

// Rough on-chain gas cost when a DEX leg is involved (self-hosted backend
// mode streams Uniswap routes; the browser engine covers CEX venues only).
const GAS_ESTIMATE: Record<string, number> = { cex_cex: 0.0, cex_dex: 4.2, dex_dex: 8.1 };

function estimateGas(buy: string, sell: string): number {
  const bDex = isDex(buy), sDex = isDex(sell);
  if (bDex && sDex) return GAS_ESTIMATE.dex_dex;
  if (bDex || sDex) return GAS_ESTIMATE.cex_dex;
  return GAS_ESTIMATE.cex_cex;
}

// Net per $1k notional after 0.1% taker fees on both legs and gas.
function netProfit(row: ArbitrageOpportunity, gas: number): number {
  if (row.buyPrice === 0 || row.sellPrice === 0) return 0;
  const gross = 1000 * (row.spreadPercent / 100);
  return gross - 2.0 - gas;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type ExchangeFilter = "all" | "cex" | "dex";

export default function ScannerPage() {
  const { opportunities, history, live, backendConnected } = useMarketData();

  const mergedData = useMemo(() => {
    const rows: ArbitrageOpportunity[] = [...opportunities];
    // Route keys from display labels on both sides so live/history compare equal.
    const liveRoutes = new Set(
      opportunities.map((o) => `${o.asset}:${o.buyExchange}>${o.sellExchange}`)
    );
    for (const h of history) {
      // Skip history rows whose route is currently shown live at ~the same spread.
      if (liveRoutes.has(`${h.asset}:${h.buyExchange}>${h.sellExchange}`)) continue;
      rows.push({
        id: h.id,
        asset: h.asset,
        buyExchange: h.buyExchange,
        sellExchange: h.sellExchange,
        buyPrice: h.buyPrice,
        sellPrice: h.sellPrice,
        spreadPercent: h.spreadPercent,
        volume: 0,
        timestamp: h.ts,
      });
    }
    return rows.sort((a, b) => b.timestamp - a.timestamp);
  }, [opportunities, history]);

  const [search, setSearch] = useState("");
  const [minSpread, setMinSpread] = useState(0);
  const [exchFilter, setExchFilter] = useState<ExchangeFilter>("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mergedData.filter((r) => {
      if (q && !r.asset.toLowerCase().includes(q) && !r.buyExchange.toLowerCase().includes(q) && !r.sellExchange.toLowerCase().includes(q)) return false;
      if (minSpread > 0 && r.spreadPercent < minSpread) return false;
      if (exchFilter === "cex" && !(isCex(r.buyExchange) && isCex(r.sellExchange))) return false;
      if (exchFilter === "dex" && !(isDex(r.buyExchange) || isDex(r.sellExchange))) return false;
      return true;
    });
  }, [mergedData, search, minSpread, exchFilter]);

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
            <p className="text-xs text-muted">
              Real-time cross-venue spread detection
              {backendConnected ? " — backend engine" : " — 5 exchange feeds, in-browser"}
            </p>
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
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${live ? "bg-neon-green/10 text-neon-green" : "bg-neon-red/10 text-neon-red"}`}>
            {live ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {live ? "LIVE" : "CONNECTING"}
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
            max={1}
            step={0.01}
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
                <th className="text-right text-muted font-medium px-3 py-2.5 whitespace-nowrap" title="Net per $1k notional after fees and gas">Net /$1k</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted">
                    {mergedData.length === 0 ? "Connecting to exchange feeds…" : "No opportunities match current filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const gas = estimateGas(r.buyExchange, r.sellExchange);
                  const profit = netProfit(r, gas);
                  const hot = r.spreadPercent >= 0.5;
                  const warm = r.spreadPercent >= 0.15 && r.spreadPercent < 0.5;
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
                        {profit > 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`}
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
          <span>
            {filtered.length} of {mergedData.length} rows shown
            {history.length > 0 ? ` (${history.length} historical, stored locally)` : ""}
          </span>
          <span className="text-muted/70">
            Spreads ≥0.15% are archived to your browser&apos;s local storage
          </span>
        </div>
      </div>
    </div>
  );
}

const EXCH_COLORS: Record<string, string> = {
  binance: "text-neon-yellow",
  kraken: "text-neon-purple",
  coinbase: "text-neon-blue",
  okx: "text-foreground",
  bybit: "text-neon-yellow",
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
