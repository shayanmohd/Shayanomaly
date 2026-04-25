"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Terminal, Wifi, WifiOff, ArrowUpDown } from "lucide-react";
import { useBinanceWs } from "@/hooks/use-binance-ws";
import type { LiveTrade } from "@/hooks/use-binance-ws";

interface BookLevel { price: number; size: number; total: number }

function generateBook(mid: number): { asks: BookLevel[]; bids: BookLevel[] } {
  const LEVELS = 14;
  const asks: BookLevel[] = [];
  const bids: BookLevel[] = [];
  let askTotal = 0;
  let bidTotal = 0;

  for (let i = 0; i < LEVELS; i++) {
    const offset = (i + 1) * (mid * 0.00015 + Math.random() * mid * 0.0001);
    const askSize = +(1 + Math.random() * 18).toFixed(4);
    askTotal += askSize;
    asks.push({ price: +(mid + offset).toFixed(2), size: askSize, total: +askTotal.toFixed(4) });

    const bidSize = +(1 + Math.random() * 18).toFixed(4);
    bidTotal += bidSize;
    bids.push({ price: +(mid - offset).toFixed(2), size: bidSize, total: +bidTotal.toFixed(4) });
  }

  return { asks: asks.reverse(), bids };
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TerminalPage() {
  const { trades, lastPrice, connected } = useBinanceWs("ethusdt");

  const midPrice = lastPrice || 3845.0;
  const bookRef = useRef(generateBook(midPrice));
  const lastGenRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastGenRef.current > 400) {
      bookRef.current = generateBook(midPrice);
      lastGenRef.current = now;
    }
  }, [midPrice]);

  const { asks, bids } = bookRef.current;
  const maxTotal = Math.max(asks[0]?.total ?? 1, bids[bids.length - 1]?.total ?? 1);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [priceLimit, setPriceLimit] = useState("");
  const BALANCE = 12.4821; // simulated wallet balance

  const setPercent = useCallback((pct: number) => {
    setAmount((BALANCE * pct).toFixed(4));
  }, []);

  const [mockTape, setMockTape] = useState<LiveTrade[]>([]);
  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (trades.length > 0) {
      if (mockIntervalRef.current) { clearInterval(mockIntervalRef.current); mockIntervalRef.current = null; }
      return;
    }
    if (!mockIntervalRef.current) {
      mockIntervalRef.current = setInterval(() => {
        setMockTape((prev) => {
          const t: LiveTrade = {
            price: +(3840 + Math.random() * 12).toFixed(2),
            quantity: +(0.01 + Math.random() * 4).toFixed(4),
            time: Date.now(),
            side: Math.random() > 0.5 ? "buy" : "sell",
          };
          const next = [t, ...prev];
          return next.length > 60 ? next.slice(0, 60) : next;
        });
      }, 250);
    }
    return () => { if (mockIntervalRef.current) { clearInterval(mockIntervalRef.current); mockIntervalRef.current = null; } };
  }, [trades.length]);

  const tape = trades.length > 0 ? trades : mockTape;

  const [submitFlash, setSubmitFlash] = useState(false);
  const handleSubmit = useCallback(() => {
    if (!amount || parseFloat(amount) <= 0) return;
    setSubmitFlash(true);
    setTimeout(() => setSubmitFlash(false), 600);
  }, [amount]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden font-mono">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-accent" />
          <span className="text-sm font-bold text-foreground">ETH / USDT</span>
          <span className={`text-sm font-bold tabular-nums ${lastPrice ? "text-neon-green" : "text-muted"}`}>
            {lastPrice ? fmtPrice(lastPrice) : "—"}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${connected ? "bg-neon-green/10 text-neon-green" : "bg-neon-red/10 text-neon-red"}`}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? "LIVE" : "MOCK"}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[60%] border-r border-border flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-[10px] text-muted font-semibold uppercase tracking-wider">
            <ArrowUpDown className="w-3 h-3" />
            Live Order Book
          </div>
          <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-muted font-medium border-b border-border/50">
            <span>Price (USDT)</span>
            <span className="text-right">Size (ETH)</span>
            <span className="text-right">Total</span>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="flex flex-col">
              {asks.map((lvl, i) => {
                const depthPct = (lvl.total / maxTotal) * 100;
                return (
                  <div key={`a-${i}`} className="relative grid grid-cols-3 px-3 py-[3px] text-xs tabular-nums hover:bg-neon-red/[0.06] transition-colors">
                    <div className="absolute inset-y-0 right-0 bg-neon-red/[0.07]" style={{ width: `${depthPct}%` }} />
                    <span className="relative text-neon-red">{fmtPrice(lvl.price)}</span>
                    <span className="relative text-right text-foreground/80">{lvl.size.toFixed(4)}</span>
                    <span className="relative text-right text-muted">{lvl.total.toFixed(4)}</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 px-3 py-2 border-y border-border/60 bg-surface">
              <span className="text-xs font-bold text-foreground tabular-nums">
                {fmtPrice(midPrice)}
              </span>
              <span className="col-span-2 text-right text-[10px] text-muted">
                Spread: {asks.length && bids.length ? fmtPrice(asks[asks.length - 1].price - bids[0].price) : "—"}
              </span>
            </div>

            <div className="flex flex-col">
              {bids.map((lvl, i) => {
                const depthPct = (lvl.total / maxTotal) * 100;
                return (
                  <div key={`b-${i}`} className="relative grid grid-cols-3 px-3 py-[3px] text-xs tabular-nums hover:bg-neon-green/[0.06] transition-colors">
                    <div className="absolute inset-y-0 right-0 bg-neon-green/[0.07]" style={{ width: `${depthPct}%` }} />
                    <span className="relative text-neon-green">{fmtPrice(lvl.price)}</span>
                    <span className="relative text-right text-foreground/80">{lvl.size.toFixed(4)}</span>
                    <span className="relative text-right text-muted">{lvl.total.toFixed(4)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="w-[40%] flex flex-col overflow-auto p-4 gap-4">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-background border border-border">
            <button
              onClick={() => setSide("buy")}
              className={`py-2.5 rounded-md text-xs font-bold tracking-wide transition-all ${
                side === "buy"
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-muted hover:text-foreground"
              }`}
            >
              BUY
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`py-2.5 rounded-md text-xs font-bold tracking-wide transition-all ${
                side === "sell"
                  ? "bg-neon-red/15 text-neon-red border border-neon-red/30"
                  : "text-muted hover:text-foreground"
              }`}
            >
              SELL
            </button>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Available Balance</span>
            <span className="text-foreground font-semibold tabular-nums">{BALANCE.toFixed(4)} ETH</span>
          </div>

          <div>
            <label className="block text-[10px] text-muted font-medium uppercase tracking-wider mb-1.5">Amount (ETH)</label>
            <input
              type="number"
              min={0}
              step={0.0001}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0000"
              className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground tabular-nums placeholder:text-muted/40 focus:outline-none focus:border-accent/50 transition-colors"
            />
            {/* preset buttons */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setPercent(pct)}
                  className="py-1.5 rounded text-[10px] font-bold text-muted bg-background border border-border hover:border-accent/40 hover:text-foreground transition-colors"
                >
                  {pct === 1 ? "MAX" : `${pct * 100}%`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-muted font-medium uppercase tracking-wider mb-1.5">Price Limit (USDT)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={priceLimit}
              onChange={(e) => setPriceLimit(e.target.value)}
              placeholder={midPrice ? fmtPrice(midPrice) : "0.00"}
              className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground tabular-nums placeholder:text-muted/40 focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>

          <div className="glass-panel p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted">Side</span>
              <span className={side === "buy" ? "text-neon-green font-semibold" : "text-neon-red font-semibold"}>
                {side.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Est. Total</span>
              <span className="text-foreground tabular-nums font-semibold">
                {amount && midPrice ? `$${(parseFloat(amount) * (parseFloat(priceLimit) || midPrice)).toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Fee (est.)</span>
              <span className="text-muted tabular-nums">
                {amount ? `$${(parseFloat(amount) * midPrice * 0.001).toFixed(2)}` : "—"}
              </span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!amount || parseFloat(amount) <= 0}
            className={`w-full py-4 rounded-lg text-sm font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              side === "buy"
                ? "bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
                : "bg-neon-red/20 text-neon-red border border-neon-red/30 hover:bg-neon-red/30"
            } ${submitFlash ? "scale-[0.98] brightness-150" : ""}`}
          >
            {submitFlash ? "ORDER SENT" : "SUBMIT ORDER"}
          </button>
        </div>
      </div>

      <div className="border-t border-border h-[120px] flex flex-col shrink-0">
        <div className="px-3 py-1 border-b border-border/50 text-[10px] text-muted font-semibold uppercase tracking-wider flex items-center justify-between">
          <span>Trade Tape — ETH/USDT</span>
          <span className="tabular-nums text-foreground/50">{tape.length} trades</span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-muted font-medium">
                <th className="text-left px-3 py-1 w-20">Time</th>
                <th className="text-right px-3 py-1">Price</th>
                <th className="text-right px-3 py-1">Size</th>
                <th className="text-left px-3 py-1 w-12">Side</th>
              </tr>
            </thead>
            <tbody>
              {tape.slice(0, 40).map((t, i) => (
                <tr key={`${t.time}-${i}`} className="border-b border-border/20 hover:bg-surface-hover transition-colors">
                  <td className="px-3 py-0.5 text-muted tabular-nums">{fmtTime(t.time)}</td>
                  <td className={`px-3 py-0.5 text-right tabular-nums font-medium ${t.side === "buy" ? "text-neon-green" : "text-neon-red"}`}>
                    {fmtPrice(t.price)}
                  </td>
                  <td className="px-3 py-0.5 text-right tabular-nums text-foreground/80">{t.quantity.toFixed(4)}</td>
                  <td className="px-3 py-0.5">
                    <span className={`text-[9px] font-bold uppercase ${t.side === "buy" ? "text-neon-green" : "text-neon-red"}`}>
                      {t.side}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
