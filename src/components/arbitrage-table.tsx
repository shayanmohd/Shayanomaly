"use client";

import { useState, useCallback } from "react";
import { Radar, Zap, Loader2, Check, X } from "lucide-react";
import type { ArbitrageOpportunity } from "@/lib/types";

type ButtonState = "idle" | "loading" | "success" | "error";

interface ArbitrageTableProps {
  opportunities: ArbitrageOpportunity[];
  backendConnected: boolean;
  selectedAsset?: string;
  onRowClick?: (asset: string) => void;
}

const EXECUTE_API = "http://localhost:8081/api/execute";

export default function ArbitrageTable({
  opportunities,
  backendConnected,
  selectedAsset,
  onRowClick,
}: ArbitrageTableProps) {
  const [buttonStates, setButtonStates] = useState<Record<string, ButtonState>>({});

  const handleExecute = useCallback(async (opp: ArbitrageOpportunity) => {
    const id = opp.id;
    setButtonStates((s) => ({ ...s, [id]: "loading" }));

    try {
      const res = await fetch(EXECUTE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: opp.asset,
          buyExchange: opp.buyExchange,
          sellExchange: opp.sellExchange,
          buyPrice: opp.buyPrice,
          sellPrice: opp.sellPrice,
          spreadPercent: opp.spreadPercent,
        }),
      });

      if (res.ok) {
        setButtonStates((s) => ({ ...s, [id]: "success" }));
      } else {
        setButtonStates((s) => ({ ...s, [id]: "error" }));
      }
    } catch {
      setButtonStates((s) => ({ ...s, [id]: "error" }));
    }

    setTimeout(() => {
      setButtonStates((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
    }, 2000);
  }, []);

  return (
    <div className="glass-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-neon-purple" />
          <h3 className="text-sm font-semibold text-foreground">
            Arbitrage Scanner
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full animate-pulse-neon ${
              backendConnected ? "bg-neon-green" : "bg-neon-red"
            }`}
          />
          <span className="text-[10px] text-muted">
            {backendConnected ? "LIVE" : "OFFLINE"}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {opportunities.length} opps
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="text-left py-2 pr-2 font-medium">Asset</th>
              <th className="text-left py-2 pr-2 font-medium">Buy</th>
              <th className="text-right py-2 pr-2 font-medium">Buy $</th>
              <th className="text-left py-2 pr-2 font-medium">Sell</th>
              <th className="text-right py-2 pr-2 font-medium">Sell $</th>
              <th className="text-right py-2 pr-2 font-medium">Spread</th>
              <th className="text-right py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((opp) => {
              const isHot = opp.spreadPercent >= 1;
              const btnState = buttonStates[opp.id] ?? "idle";
              const isBusy = btnState !== "idle";

              const isSelected = opp.asset === selectedAsset;

              return (
                <tr
                  key={opp.id}
                  onClick={() => onRowClick?.(opp.asset)}
                  className={`border-b border-border/50 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-neon-green/5 hover:bg-neon-green/10"
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
                    ${opp.buyPrice.toLocaleString()}
                  </td>
                  <td className="py-2 pr-2 text-muted whitespace-nowrap">
                    {opp.sellExchange}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-neon-blue">
                    ${opp.sellPrice.toLocaleString()}
                  </td>
                  <td
                    className={`py-2 pr-2 text-right tabular-nums font-bold ${
                      isHot
                        ? "text-neon-green glow-green"
                        : "text-muted"
                    }`}
                  >
                    {isHot && "▲ "}
                    {opp.spreadPercent.toFixed(2)}%
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleExecute(opp)}
                      disabled={isBusy}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all min-w-[62px] ${
                        btnState === "loading"
                          ? "bg-neon-yellow/20 text-neon-yellow"
                          : btnState === "success"
                          ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                          : btnState === "error"
                          ? "bg-neon-red/20 text-neon-red border border-neon-red/40"
                          : isHot
                          ? "bg-neon-green/15 text-neon-green hover:bg-neon-green/25 border border-neon-green/30"
                          : "bg-surface-hover text-muted hover:text-foreground border border-border"
                      }`}
                    >
                      {btnState === "loading" ? (
                        <span className="flex items-center justify-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          EXEC
                        </span>
                      ) : btnState === "success" ? (
                        <span className="flex items-center justify-center gap-1">
                          <Check className="w-3 h-3" />
                          DONE
                        </span>
                      ) : btnState === "error" ? (
                        <span className="flex items-center justify-center gap-1">
                          <X className="w-3 h-3" />
                          FAIL
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1">
                          <Zap className="w-3 h-3" />
                          Execute
                        </span>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
