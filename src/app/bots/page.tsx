"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Zap,
  Plus,
  Power,
  TrendingUp,
  DollarSign,
  Activity,
  Timer,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Gauge,
  ChevronDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Bot {
  id: string;
  name: string;
  strategy: string;
  pair: string;
  threshold: number;        // spread threshold %
  execSize: number;         // execution size in USD
  active: boolean;
  pnl24h: number;
  trades: number;
  sparkline: number[];
}

interface LogEntry {
  id: number;
  ts: string;
  bot: string;
  message: string;
  level: "info" | "success" | "warn" | "error";
}

// ─── Seed Data ──────────────────────────────────────────────────────────────
function randomSparkline(base: number, len = 24) {
  const arr: number[] = [];
  let v = base;
  for (let i = 0; i < len; i++) {
    v += (Math.random() - 0.46) * base * 0.09;
    arr.push(parseFloat(v.toFixed(2)));
  }
  return arr;
}

const VENUES_BUY  = ["Binance", "Kraken", "Coinbase"] as const;
const VENUES_SELL = ["Uniswap", "Binance", "Kraken", "Coinbase"] as const;

const SEED_BOTS: Bot[] = [
  {
    id: "bot-1",
    name: "Bot-ETH-1",
    strategy: "CEX-DEX Triangular",
    pair: "ETH/USDT",
    threshold: 0.15,
    execSize: 5000,
    active: true,
    pnl24h: 1247.83,
    trades: 412,
    sparkline: randomSparkline(100),
  },
  {
    id: "bot-2",
    name: "Bot-BTC-1",
    strategy: "Flash Loan Arb",
    pair: "BTC/USDT",
    threshold: 0.12,
    execSize: 10000,
    active: true,
    pnl24h: 892.41,
    trades: 287,
    sparkline: randomSparkline(80),
  },
  {
    id: "bot-3",
    name: "Bot-ETH-2",
    strategy: "DEX-CEX Spread",
    pair: "ETH/USDC",
    threshold: 0.20,
    execSize: 3000,
    active: false,
    pnl24h: -134.20,
    trades: 64,
    sparkline: randomSparkline(50),
  },
  {
    id: "bot-4",
    name: "Bot-WETH-1",
    strategy: "MEV Backrun",
    pair: "WETH/DAI",
    threshold: 0.08,
    execSize: 8000,
    active: false,
    pnl24h: 2103.55,
    trades: 831,
    sparkline: randomSparkline(120),
  },
];

const SEED_LOGS: LogEntry[] = [
  { id: 1, ts: "14:02:01", bot: "Bot-ETH-1", message: "Executed buy on Binance, sell on Uniswap. Profit: +$14.50", level: "success" },
  { id: 2, ts: "14:01:58", bot: "Bot-ETH-1", message: "Spread detected: Binance → Uniswap 0.18% — executing", level: "info" },
  { id: 3, ts: "13:59:44", bot: "Bot-BTC-1", message: "Flash loan 2.5 BTC via Aave V3. Net profit: +$22.80", level: "success" },
  { id: 4, ts: "13:59:41", bot: "Bot-BTC-1", message: "Triangular route: BTC→ETH→USDT→BTC spread 0.14%", level: "info" },
  { id: 5, ts: "13:57:12", bot: "Bot-ETH-2", message: "Gas spike detected (82 gwei) — skipping opportunity", level: "warn" },
  { id: 6, ts: "13:54:03", bot: "Bot-ETH-1", message: "Executed buy on Kraken, sell on Uniswap. Profit: +$9.33", level: "success" },
  { id: 7, ts: "13:50:18", bot: "Bot-BTC-1", message: "Aave callback reverted — insufficient liquidity", level: "error" },
  { id: 8, ts: "13:48:30", bot: "Bot-WETH-1", message: "Paused by user", level: "warn" },
];

const STRATEGIES = ["CEX-DEX Triangular", "Flash Loan Arb", "DEX-CEX Spread", "MEV Backrun"] as const;
const PAIRS = ["ETH/USDT", "BTC/USDT", "ETH/USDC", "WETH/DAI", "BTC/ETH"] as const;

// ─── Page ───────────────────────────────────────────────────────────────────
export default function BotsPage() {
  const [bots, setBots] = useState<Bot[]>(SEED_BOTS);
  const [logs, setLogs] = useState<LogEntry[]>(SEED_LOGS);
  const [showCreate, setShowCreate] = useState(false);

  // Create-form state
  const [newPair, setNewPair] = useState<string>(PAIRS[0]);
  const [newStrategy, setNewStrategy] = useState<string>(STRATEGIES[0]);
  const [newThreshold, setNewThreshold] = useState("0.15");
  const [newExecSize, setNewExecSize] = useState("5000");

  const logContainerRef = useRef<HTMLDivElement>(null);

  // ─── Derived Stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeCnt = bots.filter((b) => b.active).length;
    const profit24h = bots.reduce((s, b) => s + b.pnl24h, 0);
    const totalTrades = bots.reduce((s, b) => s + b.trades, 0);
    return { activeCnt, profit24h, totalTrades };
  }, [bots]);

  // ─── Toggle bot ─────────────────────────────────────────────────────────
  const toggleBot = useCallback((id: string) => {
    setBots((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const next = !b.active;
        // push log entry for toggle
        const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
        setLogs((l) => [
          {
            id: Date.now(),
            ts,
            bot: b.name,
            message: next ? "Bot activated — scanning for spreads" : "Bot paused by user",
            level: next ? "info" : "warn",
          },
          ...l.slice(0, 99),
        ]);
        return { ...b, active: next };
      })
    );
  }, []);

  // ─── Create bot ─────────────────────────────────────────────────────────
  const createBot = useCallback(() => {
    const threshold = parseFloat(newThreshold);
    const execSize = parseFloat(newExecSize);
    if (!newPair || isNaN(threshold) || isNaN(execSize) || threshold <= 0 || execSize <= 0) return;

    const symbol = newPair.split("/")[0];
    const idx = bots.filter((b) => b.pair === newPair).length + 1;
    const name = `Bot-${symbol}-${idx}`;

    const bot: Bot = {
      id: `bot-${Date.now()}`,
      name,
      strategy: newStrategy,
      pair: newPair,
      threshold,
      execSize,
      active: false,
      pnl24h: 0,
      trades: 0,
      sparkline: Array(24).fill(0),
    };
    setBots((p) => [...p, bot]);
    setLogs((p) => [
      {
        id: Date.now(),
        ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
        bot: name,
        message: `Deployed — ${newStrategy} on ${newPair}, threshold ${threshold}%, size $${execSize.toLocaleString()}`,
        level: "info",
      },
      ...p,
    ]);
    setShowCreate(false);
    setNewThreshold("0.15");
    setNewExecSize("5000");
  }, [newPair, newStrategy, newThreshold, newExecSize, bots]);

  // ─── Simulated live log injection ───────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const activeBots = bots.filter((b) => b.active);
      if (activeBots.length === 0) return;
      const pick = activeBots[Math.floor(Math.random() * activeBots.length)];
      const buyVenue  = VENUES_BUY[Math.floor(Math.random() * VENUES_BUY.length)];
      const sellVenue = VENUES_SELL.filter((v) => v !== buyVenue)[
        Math.floor(Math.random() * (VENUES_SELL.length - 1))
      ] ?? "Uniswap";
      const profit = (Math.random() * 25 + 2).toFixed(2);
      const spread = (pick.threshold + Math.random() * 0.08).toFixed(2);

      const msgs: { message: string; level: LogEntry["level"] }[] = [
        { message: `Spread detected: ${buyVenue} → ${sellVenue} ${spread}% — executing`, level: "info" },
        { message: `Executed buy on ${buyVenue}, sell on ${sellVenue}. Profit: +$${profit}`, level: "success" },
        { message: `Spread narrowed below ${pick.threshold}% threshold — skipping`, level: "warn" },
        { message: `Order filled on ${buyVenue}, latency 38ms. Net: +$${profit}`, level: "success" },
      ];
      const m = msgs[Math.floor(Math.random() * msgs.length)];
      setLogs((p) => [
        {
          id: Date.now(),
          ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
          bot: pick.name,
          ...m,
        },
        ...p.slice(0, 99),
      ]);
    }, 3500);
    return () => clearInterval(interval);
  }, [bots]);

  // Auto-scroll log to top on new entry
  useEffect(() => {
    logContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [logs[0]?.id]);

  return (
    <div className="flex-1 overflow-auto p-3 lg:p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neon-yellow/10 border border-neon-yellow/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-neon-yellow drop-shadow-[0_0_6px_rgba(255,208,0,0.4)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Bot Control Center</h1>
            <p className="text-xs text-muted">Create, monitor & toggle automated arbitrage bots</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/20 hover:bg-neon-yellow/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Deploy New Bot
        </button>
      </div>

      {/* ── Stats Row (3 widgets) ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <StatCard
          icon={Power}
          label="Total Active Bots"
          value={`${stats.activeCnt} / ${bots.length}`}
          accent={stats.activeCnt > 0 ? "green" : "muted"}
        />
        <StatCard
          icon={DollarSign}
          label="24h Bot Profit"
          value={`${stats.profit24h >= 0 ? "+" : ""}$${Math.abs(stats.profit24h).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          accent={stats.profit24h >= 0 ? "green" : "red"}
        />
        <StatCard
          icon={Activity}
          label="Total Executed Trades"
          value={stats.totalTrades.toLocaleString()}
          accent="yellow"
        />
      </div>

      {/* ── Create Bot Panel ───────────────────────────────────────────── */}
      {showCreate && (
        <div className="glass-panel p-5 mb-5 animate-fade-in relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-neon-yellow/5 rounded-full blur-3xl pointer-events-none" />
          <h3 className="text-sm font-bold text-foreground mb-4 relative">Deploy New Bot</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 relative">
            {/* Pair */}
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider mb-1 block">Trading Pair</label>
              <div className="relative">
                <select
                  value={newPair}
                  onChange={(e) => setNewPair(e.target.value)}
                  className="w-full appearance-none bg-background border border-border rounded-md px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-neon-yellow/40 pr-8"
                >
                  {PAIRS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>

            {/* Strategy */}
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider mb-1 block">Strategy</label>
              <div className="relative">
                <select
                  value={newStrategy}
                  onChange={(e) => setNewStrategy(e.target.value)}
                  className="w-full appearance-none bg-background border border-border rounded-md px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-neon-yellow/40 pr-8"
                >
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>

            {/* Spread Threshold */}
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider mb-1 block">Spread Threshold</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="5"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-neon-yellow/40 pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">%</span>
              </div>
            </div>

            {/* Execution Size */}
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider mb-1 block">Execution Size</label>
              <div className="relative">
                <input
                  type="number"
                  step="100"
                  min="100"
                  max="100000"
                  value={newExecSize}
                  onChange={(e) => setNewExecSize(e.target.value)}
                  className="w-full bg-background border border-border rounded-md pl-6 pr-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-neon-yellow/40"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">$</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-end gap-2">
              <button
                onClick={createBot}
                className="flex-1 px-3 py-2.5 rounded-md text-[11px] font-semibold bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/20 hover:bg-neon-yellow/20 transition-colors"
              >
                Deploy
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-2.5 rounded-md text-[11px] text-muted border border-border hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Bots Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {bots.map((bot) => (
          <BotCard key={bot.id} bot={bot} onToggle={toggleBot} />
        ))}
      </div>

      {/* ── Activity Log ───────────────────────────────────────────────── */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-neon-yellow" />
          <h3 className="text-xs font-bold text-foreground">Bot Activity Log</h3>
          <span className="text-[10px] text-muted ml-auto tabular-nums">{logs.length} entries</span>
        </div>
        <div
          ref={logContainerRef}
          className="bg-background/80 rounded-lg border border-border p-3 max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5"
        >
          {logs.map((entry) => (
            <div key={entry.id} className="flex gap-1.5">
              <span className="text-muted/60 shrink-0">[{entry.ts}]</span>
              <LogIcon level={entry.level} />
              <span className="text-neon-yellow/80 shrink-0">{entry.bot}:</span>
              <span
                className={
                  entry.level === "success"
                    ? "text-neon-green"
                    : entry.level === "warn"
                    ? "text-neon-yellow/70"
                    : entry.level === "error"
                    ? "text-neon-red"
                    : "text-foreground/60"
                }
              >
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────
const ACCENT_MAP = {
  green:  { bg: "bg-neon-green/10",  border: "border-neon-green/20",  text: "text-neon-green"  },
  red:    { bg: "bg-neon-red/10",    border: "border-neon-red/20",    text: "text-neon-red"    },
  yellow: { bg: "bg-neon-yellow/10", border: "border-neon-yellow/20", text: "text-neon-yellow" },
  muted:  { bg: "bg-surface-hover",  border: "border-border",         text: "text-muted"       },
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  accent: keyof typeof ACCENT_MAP;
}) {
  const a = ACCENT_MAP[accent];
  return (
    <div className="glass-panel p-4 flex items-center gap-3 relative overflow-hidden">
      <div className={`absolute -top-8 -right-8 w-20 h-20 ${a.bg} rounded-full blur-2xl opacity-40 pointer-events-none`} />
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${a.bg} border ${a.border}`}>
        <Icon className={`w-4.5 h-4.5 ${a.text}`} />
      </div>
      <div className="relative">
        <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-base font-bold tabular-nums ${a.text}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Bot Card ───────────────────────────────────────────────────────────────
function BotCard({ bot, onToggle }: { bot: Bot; onToggle: (id: string) => void }) {
  const sparkData = useMemo(
    () => bot.sparkline.map((v, i) => ({ i, v })),
    [bot.sparkline]
  );
  const trend = bot.sparkline[bot.sparkline.length - 1] >= bot.sparkline[0];
  const chartColor = trend ? "#00ff9d" : "#ff3b5c";
  const fillId = `fill-${bot.id}`;

  return (
    <div
      className={`glass-panel p-4 relative overflow-hidden transition-all duration-300 ${
        bot.active
          ? "border-neon-green/20 shadow-[0_0_20px_rgba(0,255,157,0.04)]"
          : "opacity-50 grayscale-[30%]"
      }`}
    >
      {/* Live pulse dot */}
      {bot.active && (
        <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
          <span className="text-[9px] text-neon-green/60 font-semibold uppercase">Live</span>
          <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse-neon" />
        </div>
      )}

      {/* Header: pair, strategy, toggle */}
      <div className="flex items-start justify-between mb-2 pr-14">
        <div>
          <h3 className="text-sm font-bold text-foreground leading-tight">{bot.pair}</h3>
          <p className="text-[10px] text-muted mt-0.5">{bot.strategy}</p>
        </div>
      </div>

      {/* Trigger threshold */}
      <div className="flex items-center gap-1.5 mb-3">
        <Gauge className="w-3 h-3 text-neon-yellow" />
        <span className="text-[10px] text-muted">Trigger:</span>
        <span className="text-[10px] text-neon-yellow font-semibold tabular-nums">
          Spread &gt; {bot.threshold.toFixed(2)}%
        </span>
      </div>

      {/* Sparkline — AreaChart */}
      <div className="h-12 mb-3 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={chartColor}
              strokeWidth={1.5}
              fill={`url(#${fillId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div>
          <p className="text-[10px] text-muted">24h PnL</p>
          <p
            className={`text-[11px] font-bold tabular-nums ${
              bot.pnl24h >= 0 ? "text-neon-green" : "text-neon-red"
            }`}
          >
            {bot.pnl24h >= 0 ? "+" : "-"}${Math.abs(bot.pnl24h).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted">Trades</p>
          <p className="text-[11px] font-bold text-foreground tabular-nums">{bot.trades}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted">Size</p>
          <p className="text-[11px] font-bold text-foreground tabular-nums">
            ${bot.execSize.toLocaleString()}
          </p>
        </div>
      </div>

      {/* iOS-style toggle switch */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className={`text-[10px] font-semibold ${bot.active ? "text-neon-green" : "text-muted"}`}>
          {bot.active ? "RUNNING" : "PAUSED"}
        </span>
        <button
          onClick={() => onToggle(bot.id)}
          aria-label={`Toggle ${bot.name}`}
          className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${
            bot.active ? "bg-neon-green/30" : "bg-border"
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-300 ${
              bot.active
                ? "left-6 bg-neon-green shadow-[0_0_10px_rgba(0,255,157,0.6)]"
                : "left-1 bg-muted"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ─── Log Level Icon ─────────────────────────────────────────────────────────
function LogIcon({ level }: { level: LogEntry["level"] }) {
  switch (level) {
    case "success":
      return <CheckCircle2 className="w-3 h-3 text-neon-green shrink-0 mt-[3px]" />;
    case "warn":
      return <AlertTriangle className="w-3 h-3 text-neon-yellow shrink-0 mt-[3px]" />;
    case "error":
      return <XCircle className="w-3 h-3 text-neon-red shrink-0 mt-[3px]" />;
    default:
      return <Activity className="w-3 h-3 text-muted shrink-0 mt-[3px]" />;
  }
}
