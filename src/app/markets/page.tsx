"use client";

import {
  Activity,
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

// ─── Mock Data ──────────────────────────────────────────────────────────────
const METRICS = [
  {
    label: "Total Market Cap",
    value: "$2.41T",
    change: +1.84,
    icon: DollarSign,
    accent: "green" as const,
  },
  {
    label: "24h Volume",
    value: "$94.7B",
    change: -3.12,
    icon: BarChart3,
    accent: "blue" as const,
  },
  {
    label: "BTC Dominance",
    value: "52.4%",
    change: +0.32,
    icon: Crown,
    accent: "yellow" as const,
  },
  {
    label: "ETH Gas (Gwei)",
    value: "18",
    change: -8.6,
    icon: Fuel,
    accent: "purple" as const,
  },
];

const ACCENT = {
  green:  { bg: "bg-neon-green/10",  border: "border-neon-green/20",  text: "text-neon-green"  },
  blue:   { bg: "bg-neon-blue/10",   border: "border-neon-blue/20",   text: "text-neon-blue"   },
  yellow: { bg: "bg-neon-yellow/10", border: "border-neon-yellow/20", text: "text-neon-yellow" },
  purple: { bg: "bg-neon-purple/10", border: "border-neon-purple/20", text: "text-neon-purple" },
} as const;

interface Mover {
  ticker: string;
  name: string;
  price: string;
  change: number;
}

const GAINERS: Mover[] = [
  { ticker: "PEPE",  name: "Pepe",         price: "$0.00001842", change: +34.7  },
  { ticker: "FET",   name: "Fetch.ai",     price: "$2.38",       change: +18.2  },
  { ticker: "RNDR",  name: "Render",        price: "$10.47",      change: +14.5  },
  { ticker: "INJ",   name: "Injective",     price: "$38.91",      change: +11.8  },
  { ticker: "ARB",   name: "Arbitrum",      price: "$1.87",       change: +9.3   },
  { ticker: "IMX",   name: "ImmutableX",    price: "$3.21",       change: +7.6   },
];

const LOSERS: Mover[] = [
  { ticker: "APE",   name: "ApeCoin",       price: "$1.24",  change: -12.4 },
  { ticker: "SAND",  name: "The Sandbox",   price: "$0.58",  change: -9.8  },
  { ticker: "MANA",  name: "Decentraland",  price: "$0.61",  change: -8.1  },
  { ticker: "AXS",   name: "Axie Infinity", price: "$8.93",  change: -7.5  },
  { ticker: "GALA",  name: "Gala",          price: "$0.041", change: -6.2  },
  { ticker: "ENJ",   name: "Enjin Coin",    price: "$0.34",  change: -5.4  },
];

const VOLUME_DATA = [
  { day: "Mon", dex: 8.2,  cex: 41.3 },
  { day: "Tue", dex: 9.7,  cex: 38.8 },
  { day: "Wed", dex: 11.4, cex: 44.1 },
  { day: "Thu", dex: 10.1, cex: 42.6 },
  { day: "Fri", dex: 13.8, cex: 48.2 },
  { day: "Sat", dex: 12.3, cex: 36.9 },
  { day: "Sun", dex: 10.9, cex: 34.5 },
];

// ─── Custom Tooltip ─────────────────────────────────────────────────────────
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
          <span className="text-foreground/70 capitalize">{p.dataKey}:</span>
          <span className="text-foreground font-semibold">${p.value}B</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function MarketsPage() {
  return (
    <div className="flex-1 overflow-auto p-3 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-neon-blue/10 border border-neon-blue/20 flex items-center justify-center">
          <Activity className="w-5 h-5 text-neon-blue drop-shadow-[0_0_6px_rgba(0,212,255,0.4)]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Markets</h1>
          <p className="text-xs text-muted">Macro overview across CEXs &amp; DEXs</p>
        </div>
      </div>

      {/* ── Global Metrics Row ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {METRICS.map((m) => {
          const a = ACCENT[m.accent];
          const up = m.change >= 0;
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
              {/* Change badge */}
              <div className="mt-2 flex items-center gap-1">
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
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Gainers / Losers ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <MoverList title="Top Gainers (24h)" items={GAINERS} positive />
        <MoverList title="Top Losers (24h)" items={LOSERS} positive={false} />
      </div>

      {/* ── Volume Trend Chart ───────────────────────────────────────── */}
      <div className="glass-panel p-5 relative overflow-hidden">
        <div className="absolute -top-28 -left-28 w-56 h-56 bg-neon-blue/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <h2 className="text-sm font-bold text-foreground mb-1">
            Global DEX vs CEX Volume (7 Days)
          </h2>
          <p className="text-[11px] text-muted mb-4">
            Aggregated daily trading volume comparison
          </p>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={VOLUME_DATA}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradCex" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDex" x1="0" y1="0" x2="0" y2="1">
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
                  dataKey="cex"
                  name="CEX"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  fill="url(#gradCex)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#00d4ff", stroke: "#0a0e14", strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="dex"
                  name="DEX"
                  stroke="#b36bff"
                  strokeWidth={2}
                  fill="url(#gradDex)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#b36bff", stroke: "#0a0e14", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mover List Component ───────────────────────────────────────────────────
function MoverList({
  title,
  items,
  positive,
}: {
  title: string;
  items: Mover[];
  positive: boolean;
}) {
  const accent = positive ? "neon-green" : "neon-red";
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <div className="glass-panel p-4 relative overflow-hidden">
      <div
        className={`absolute -top-16 -right-16 w-32 h-32 bg-${accent}/5 rounded-full blur-3xl pointer-events-none`}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`w-4 h-4 text-${accent}`} />
          <h2 className="text-xs font-bold text-foreground">{title}</h2>
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

          {items.map((m) => (
            <div
              key={m.ticker}
              className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-2 py-2 rounded-md hover:bg-surface-hover/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-foreground">
                  {m.ticker}
                </span>
                <span className="text-[10px] text-muted truncate">
                  {m.name}
                </span>
              </div>
              <span className="text-xs text-foreground font-medium tabular-nums text-right w-24">
                {m.price}
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
                  {m.change > 0 ? "+" : ""}
                  {m.change.toFixed(1)}%
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
