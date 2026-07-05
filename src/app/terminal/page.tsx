"use client";

import { useState, useCallback } from "react";
import { Terminal, Wifi, WifiOff, ArrowUpDown, FlaskConical } from "lucide-react";
import { useBinanceWs } from "@/hooks/use-binance-ws";
import { useBinanceDepth } from "@/hooks/use-binance-depth";

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PaperOrder {
  id: number;
  ts: number;
  side: "buy" | "sell";
  amount: number;
  price: number;
}

const PAPER_BALANCE_ETH = 12.4821;

export default function TerminalPage() {
  const { trades, lastPrice, connected } = useBinanceWs("ethusdt");
  const { book, connected: depthConnected } = useBinanceDepth("ethusdt");

  const midPrice = lastPrice || (book.asks.length && book.bids.length
    ? (book.asks[book.asks.length - 1].price + book.bids[0].price) / 2
    : 0);

  const { asks, bids } = book;
  const maxTotal = Math.max(
    asks[0]?.total ?? 1,
    bids[bids.length - 1]?.total ?? 1
  );

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [priceLimit, setPriceLimit] = useState("");
  const [paperOrders, setPaperOrders] = useState<PaperOrder[]>([]);

  const setPercent = useCallback((pct: number) => {
    setAmount((PAPER_BALANCE_ETH * pct).toFixed(4));
  }, []);

  const [submitFlash, setSubmitFlash] = useState(false);
  const handleSubmit = useCallback(() => {
    const qty = parseFloat(amount);
    if (!qty || qty <= 0 || midPrice <= 0) return;
    setPaperOrders((prev) => [
      {
        id: Date.now(),
        ts: Date.now(),
        side,
        amount: qty,
        price: parseFloat(priceLimit) || midPrice,
      },
      ...prev.slice(0, 19),
    ]);
    setSubmitFlash(true);
    setTimeout(() => setSubmitFlash(false), 900);
  }, [amount, midPrice, priceLimit, side]);

  const liveOk = connected || depthConnected;

  return (
    <div className="flex-1 flex flex-col overflow-hidden font-mono">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-accent" />
          <span className="text-sm font-bold text-foreground">ETH / USDT</span>
          <span className={`text-sm font-bold tabular-nums ${lastPrice ? "text-neon-green" : "text-muted"}`}>
            {lastPrice ? fmtPrice(lastPrice) : "—"}
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-neon-yellow/80 bg-neon-yellow/10 border border-neon-yellow/20 rounded px-1.5 py-px uppercase tracking-wider">
            <FlaskConical className="w-2.5 h-2.5" />
            paper trading
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${liveOk ? "bg-neon-green/10 text-neon-green" : "bg-neon-red/10 text-neon-red"}`}>
          {liveOk ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {liveOk ? "LIVE" : "CONNECTING"}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[60%] border-r border-border flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-[10px] text-muted font-semibold uppercase tracking-wider">
            <ArrowUpDown className="w-3 h-3" />
            Live Order Book — Binance
          </div>
          <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-muted font-medium border-b border-border/50">
            <span>Price (USDT)</span>
            <span className="text-right">Size (ETH)</span>
            <span className="text-right">Total</span>
          </div>

          <div className="flex-1 overflow-auto">
            {asks.length === 0 && bids.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                Connecting to depth stream…
              </div>
            ) : (
              <>
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
                    {midPrice > 0 ? fmtPrice(midPrice) : "—"}
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
              </>
            )}
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
            <span className="text-muted">Paper Balance</span>
            <span className="text-foreground font-semibold tabular-nums">{PAPER_BALANCE_ETH.toFixed(4)} ETH</span>
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
              <span className="text-muted">Fee (est. 0.1%)</span>
              <span className="text-muted tabular-nums">
                {amount && midPrice ? `$${(parseFloat(amount) * midPrice * 0.001).toFixed(2)}` : "—"}
              </span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!amount || parseFloat(amount) <= 0 || midPrice <= 0}
            title="Paper order — nothing is sent to an exchange"
            className={`w-full py-4 rounded-lg text-sm font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              side === "buy"
                ? "bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
                : "bg-neon-red/20 text-neon-red border border-neon-red/30 hover:bg-neon-red/30"
            } ${submitFlash ? "scale-[0.98] brightness-150" : ""}`}
          >
            {submitFlash ? "PAPER ORDER FILLED" : "SUBMIT PAPER ORDER"}
          </button>

          {paperOrders.length > 0 && (
            <div className="glass-panel p-3">
              <p className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-2">
                Paper Orders (this session)
              </p>
              <div className="space-y-1 max-h-32 overflow-auto">
                {paperOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-[11px] tabular-nums">
                    <span className="text-muted">{fmtTime(o.ts)}</span>
                    <span className={o.side === "buy" ? "text-neon-green font-bold" : "text-neon-red font-bold"}>
                      {o.side.toUpperCase()}
                    </span>
                    <span className="text-foreground/80">{o.amount.toFixed(4)} ETH</span>
                    <span className="text-muted">@ {fmtPrice(o.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border h-[120px] flex flex-col shrink-0">
        <div className="px-3 py-1 border-b border-border/50 text-[10px] text-muted font-semibold uppercase tracking-wider flex items-center justify-between">
          <span>Trade Tape — ETH/USDT (Binance live)</span>
          <span className="tabular-nums text-foreground/50">{trades.length} trades</span>
        </div>
        <div className="flex-1 overflow-auto">
          {trades.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted">
              Waiting for live trades…
            </div>
          ) : (
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
                {trades.slice(0, 40).map((t, i) => (
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
          )}
        </div>
      </div>
    </div>
  );
}
