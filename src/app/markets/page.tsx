"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Fuel,
  Crown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  fetchBinanceKlines,
  fetchBinanceMovers,
  type MoverRow,
} from "@/lib/exchanges";
import { useMarketData } from "@/lib/market-engine";

const ACCENT = {
  green:  { bg: "bg-neon-green/10",  border: "border-neon-green/20",  text: "text-neon-green"  },
  blue:   { bg: "bg-neon-blue/10",   border: "border-neon-blue/20",   text: "text-neon-blue"   },
  yellow: { bg: "bg-neon-yellow/10", border: "border-neon-yellow/20", text: "text-neon-yellow" },
  purple: { bg: "bg-neon-purple/10", border: "border-neon-purple/20", text: "text-neon-purple" },
} as const;

const fmtBig = (usd: number) => {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  return `$${(usd / 1e6).toFixed(0)}M`;
};

const fmtPrice = (n: number) =>
  n >= 1
    ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toPrecision(4)}`;

interface VolumePoint {
  day: string;
  eth: number;
  btc: number;
}

const MOVERS_REFRESH_MS = 120_000;

export default function MarketsPage() {
  const { global, gasGwei } = useMarketData();

  const [movers, setMovers] = useState<MoverRow[] | null>(null);
  const [volumeData, setVolumeData] = useState<VolumePoint[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadMovers() {
      try {
        const rows = await fetchBinanceMovers();
        if (!cancelled) setMovers(rows);
      } catch {
        // keep previous board on transient failure
      }
    }

    async function loadVolumes() {
      try {
        const [eth, btc] = await Promise.all([
          fetchBinanceKlines("ETH/USDT", "1d", 7),
          fetchBinanceKlines("BTC/USDT", "1d", 7),
        ]);
        if (cancelled) return;
        setVolumeData(
          eth.map((k, i) => ({
            day: new Date(k.ts).toLocaleDateString("en-US", { weekday: "short" }),
            // kline volume is in base units — convert to USD notional ($B)
            eth: +((k.volume * k.close) / 1e9).toFixed(2),
            btc: btc[i] ? +((btc[i].volume * btc[i].close) / 1e9).toFixed(2) : 0,
          }))
        );
      } catch {
        // chart stays hidden on failure
      }
    }

    loadMovers();
    loadVolumes();
    // Periodic refresh doubles as retry if the initial loads failed.
    const t = setInterval(() => {
      loadMovers();
      loadVolumes();
    }, MOVERS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const gainers = (movers ?? [])
    .filter((m) => m.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 6);
  const losers = (movers ?? [])
    .filter((m) => m.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 6);

  const metrics = [
    {
      label: "Total Market Cap",
      value: global ? fmtBig(global.totalMarketCapUsd) : "—",
      change: global?.marketCapChange24h ?? null,
      icon: DollarSign,
      accent: "green" as const,
    },
    {
      label: "24h Volume",
      value: global ? fmtBig(global.totalVolumeUsd) : "—",
      change: null,
      icon: BarChart3,
      accent: "blue" as const,
    },
    {
      label: "BTC Dominance",
      value: global ? `${global.btcDominance.toFixed(1)}%` : "—",
      change: null,
      icon: Crown,
      accent: "yellow" as const,
    },
    {
      label: "ETH Gas (Gwei)",
      value: gasGwei !== null ? (gasGwei < 10 ? gasGwei.toFixed(2) : gasGwei.toFixed(1)) : "—",
      change: null,
      icon: Fuel,
      accent: "purple" as const,
    },
  ];

  return (
    <div className="flex-1 overflow-auto p-3 lg:p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Markets</h1>
          <p className="text-xs text-muted">Live macro overview — CoinGecko &amp; Binance public data</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {metrics.map((m) => {
          const a = ACCENT[m.accent];
          const up = (m.change ?? 0) >= 0;
          return (
            <div
              key={m.label}
              className="glass-panel p-4 relative overflow-hidden"
            >
              <div
                className={`absolute -top-8 -right-8 w-20 h-20 ${a.bg} rounded-full blur-2xl opacity-40 pointer-events-none`}
              />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
                    {m.label}
                  </p>
                  <p className={`text-xl font-bold tabular-nums ${a.text}`}>
                    {m.value}
                  </p>
                </div>
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${a.bg} border ${a.border}`}
                >
                  <m.icon className={`w-4 h-4 ${a.text}`} />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {m.change !== null ? (
                  <>
                    {up ? (
                      <TrendingUp className="w-3 h-3 text-neon-green" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-neon-red" />
                    )}
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        up ? "text-neon-green" : "text-neon-red"
                      }`}
                    >
                      {up ? "+" : ""}
                      {m.change.toFixed(2)}%
                    </span>
                    <span className="text-[10px] text-muted">24h</span>
                  </>
                ) : (
                  <span className="text-[10px] text-muted">live</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <MoverList title="Top Gainers (24h)" items={gainers} positive loading={movers === null} />
        <MoverList title="Top Losers (24h)" items={losers} positive={false} loading={movers === null} />
      </div>

      <div className="glass-panel p-5 relative overflow-hidden">
        <div className="absolute -top-28 -left-28 w-56 h-56 bg-neon-blue/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <h2 className="text-sm font-bold text-foreground mb-1">
            Spot Volume — BTC vs ETH (7 Days, Binance)
          </h2>
          <p className="text-[11px] text-muted mb-4">
            Daily USD notional traded on the USDT pair
          </p>

          <div className="h-72">
            {volumeData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                Loading volume history…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={volumeData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradBtc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradEth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b36bff" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#b36bff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(30,45,61,0.5)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#6b7d8f", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6b7d8f", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${v}B`}
                    width={55}
                  />
                  <Tooltip
                    content={<VolumeTooltip />}
                    cursor={{ stroke: "rgba(0,212,255,0.15)", strokeWidth: 1 }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#6b7d8f" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="btc"
                    name="BTC"
                    stroke="#00d4ff"
                    strokeWidth={2}
                    fill="url(#gradBtc)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#00d4ff", stroke: "#0a0e14", strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="eth"
                    name="ETH"
                    stroke="#b36bff"
                    strokeWidth={2}
                    fill="url(#gradEth)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#b36bff", stroke: "#0a0e14", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VolumeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted mb-1.5 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-foreground/70 uppercase">{p.dataKey}:</span>
          <span className="text-foreground font-semibold">${p.value}B</span>
        </div>
      ))}
    </div>
  );
}

function MoverList({
  title,
  items,
  positive,
  loading,
}: {
  title: string;
  items: MoverRow[];
  positive: boolean;
  loading: boolean;
}) {
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <div className="glass-panel p-4 relative overflow-hidden">
      <div
        className={`absolute -top-16 -right-16 w-32 h-32 ${positive ? "bg-neon-green/5" : "bg-neon-red/5"} rounded-full blur-3xl pointer-events-none`}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`w-4 h-4 ${positive ? "text-neon-green" : "text-neon-red"}`} />
          <h2 className="text-xs font-bold text-foreground">{title}</h2>
          <span className="text-[9px] text-muted ml-auto uppercase tracking-wider">Binance spot · vol ≥ $10M</span>
        </div>

        <div className="space-y-0.5">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 pb-1.5 border-b border-border/40">
            <span className="text-[10px] text-muted uppercase tracking-wider">
              Asset
            </span>
            <span className="text-[10px] text-muted uppercase tracking-wider text-right w-24">
              Price
            </span>
            <span className="text-[10px] text-muted uppercase tracking-wider text-right w-20">
              24h
            </span>
          </div>

          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-2 py-2">
                  <div className="h-3 w-24 rounded skeleton" />
                  <div className="h-3 w-20 rounded skeleton" />
                  <div className="h-3 w-14 rounded skeleton" />
                </div>
              ))
            : items.map((m) => (
                <div
                  key={m.symbol}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-2 py-2 rounded-md hover:bg-surface-hover/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-foreground">
                      {m.symbol}
                    </span>
                    <span className="text-[10px] text-muted truncate">
                      {fmtBig(m.quoteVolume)} vol
                    </span>
                  </div>
                  <span className="text-xs text-foreground font-medium tabular-nums text-right w-24">
                    {fmtPrice(m.lastPrice)}
                  </span>
                  <span
                    className={`inline-flex items-center justify-end text-[11px] font-bold tabular-nums w-20 ${
                      positive ? "text-neon-green" : "text-neon-red"
                    }`}
                  >
                    <span
                      className={`px-2 py-0.5 rounded-md ${
                        positive
                          ? "bg-neon-green/10 border border-neon-green/20"
                          : "bg-neon-red/10 border border-neon-red/20"
                      }`}
                    >
                      {m.changePercent > 0 ? "+" : ""}
                      {m.changePercent.toFixed(1)}%
                    </span>
                  </span>
                </div>
              ))}
          {!loading && items.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-muted">No data yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
