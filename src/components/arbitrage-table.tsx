"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Radar, Zap, Loader2, Check, FlaskConical } from "lucide-react";
import type { ArbitrageOpportunity } from "@/lib/types";

type ButtonState = "idle" | "simulating" | "done";

interface ArbitrageTableProps {
  opportunities: ArbitrageOpportunity[];
  live: boolean;
  selectedAsset?: string;
  onRowClick?: (asset: string) => void;
}

const fmtPrice = (n: number) =>
  `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 1 ? 5 : 2,
  })}`;

export default function ArbitrageTable({
  opportunities,
  live,
  selectedAsset,
  onRowClick,
}: ArbitrageTableProps) {
  const [buttonStates, setButtonStates] = useState<Record<string, ButtonState>>({});
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // Paper-trade simulation: no keys, no backend, no orders — the button
  // walks the same lifecycle a real executor would, clearly labeled SIM.
  const handleSimulate = useCallback((opp: ArbitrageOpportunity) => {
    const id = opp.id;
    setButtonStates((s) => ({ ...s, [id]: "simulating" }));
    timersRef.current.push(
      setTimeout(() => {
        setButtonStates((s) => ({ ...s, [id]: "done" }));
        timersRef.current.push(
          setTimeout(() => {
            setButtonStates((s) => {
              const next = { ...s };
              delete next[id];
              return next;
            });
          }, 2000)
        );
      }, 900 + Math.random() * 600)
    );
  }, []);

  return (
    <div className="glass-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">
            Arbitrage Scanner
          </h3>
          <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-semibold text-neon-yellow/80 bg-neon-yellow/10 border border-neon-yellow/20 rounded px-1.5 py-px uppercase tracking-wider">
            <FlaskConical className="w-2.5 h-2.5" />
            exec: paper
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full animate-pulse-neon ${
              live ? "bg-neon-green" : "bg-neon-red"
            }`}
          />
          <span className="text-[10px] text-muted">
            {live ? "LIVE" : "CONNECTING"}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {opportunities.length} routes
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {opportunities.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted">
            Scanning venues for spreads…
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left py-2 pr-2 font-medium">Asset</th>
                <th className="text-left py-2 pr-2 font-medium">Buy</th>
                <th className="text-right py-2 pr-2 font-medium">Ask $</th>
                <th className="text-left py-2 pr-2 font-medium">Sell</th>
                <th className="text-right py-2 pr-2 font-medium">Bid $</th>
                <th className="text-right py-2 pr-2 font-medium">Spread</th>
                <th className="text-right py-2 pr-2 font-medium hidden lg:table-cell" title="Net per $1k notional after 2×0.1% taker fees">Net/$1k</th>
                <th className="text-right py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp) => {
                const isHot = opp.spreadPercent >= 0.25;
                const btnState = buttonStates[opp.id] ?? "idle";
                const isSelected = opp.asset === selectedAsset;
                const net = opp.netProfit ?? 0;

                return (
                  <tr
                    key={opp.id}
                    onClick={() => onRowClick?.(opp.asset)}
                    className={`border-b border-border/50 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-accent/5 hover:bg-accent/10"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    <td className="py-2 pr-2 font-semibold text-foreground whitespace-nowrap">
                      {opp.asset}
                    </td>
                    <td className="py-2 pr-2 text-muted whitespace-nowrap">
                      {opp.buyExchange}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-neon-green">
                      {fmtPrice(opp.buyPrice)}
                    </td>
                    <td className="py-2 pr-2 text-muted whitespace-nowrap">
                      {opp.sellExchange}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-neon-blue">
                      {fmtPrice(opp.sellPrice)}
                    </td>
                    <td
                      className={`py-2 pr-2 text-right tabular-nums font-bold ${
                        isHot
                          ? "text-neon-green glow-green"
                          : opp.spreadPercent > 0
                          ? "text-foreground/80"
                          : "text-muted"
                      }`}
                    >
                      {isHot && "▲ "}
                      {opp.spreadPercent.toFixed(3)}%
                    </td>
                    <td
                      className={`py-2 pr-2 text-right tabular-nums hidden lg:table-cell ${
                        net > 0 ? "text-neon-green font-semibold" : "text-muted"
                      }`}
                    >
                      {net > 0 ? `+$${net.toFixed(2)}` : `-$${Math.abs(net).toFixed(2)}`}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSimulate(opp);
                        }}
                        disabled={btnState !== "idle"}
                        aria-label={`Simulate ${opp.asset} arbitrage route`}
                        title="Paper-trade simulation — no real order is placed"
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all min-w-[62px] ${
                          btnState === "simulating"
                            ? "bg-neon-yellow/20 text-neon-yellow"
                            : btnState === "done"
                            ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                            : isHot
                            ? "bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30"
                            : "bg-surface-hover text-muted hover:text-foreground border border-border"
                        }`}
                      >
                        {btnState === "simulating" ? (
                          <span className="flex items-center justify-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            SIM
                          </span>
                        ) : btnState === "done" ? (
                          <span className="flex items-center justify-center gap-1">
                            <Check className="w-3 h-3" />
                            SIM ✓
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-1">
                            <Zap className="w-3 h-3" />
                            Simulate
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
