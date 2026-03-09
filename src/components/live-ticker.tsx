"use client";

import { useBinanceWs } from "@/hooks/use-binance-ws";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface LiveTickerProps {
  symbol?: string;
  selectedAsset?: string;
}

export default function LiveTicker({ symbol = "ethusdt", selectedAsset = "ETH/USDT" }: LiveTickerProps) {
  const { trades, connected } = useBinanceWs(symbol);

  if (!connected || trades.length === 0) {
    return (
      <div className="glass-panel p-4 h-full flex flex-col">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Live Trade Stream
        </h3>
        <div className="flex-1 flex items-center justify-center text-muted text-xs">
          Connecting to Binance WebSocket...
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">
          Live Trades — {selectedAsset}
        </h3>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse-neon" />
          <span className="text-[10px] text-neon-green font-medium">
            BINANCE WS
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 text-[10px] text-muted pb-1 border-b border-border mb-1">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>

      <div className="flex-1 overflow-auto min-h-0 space-y-px">
        {trades.slice(0, 25).map((trade, i) => {
          const isBuy = trade.side === "buy";
          return (
            <div
              key={`${trade.time}-${i}`}
              className="grid grid-cols-3 text-[11px] py-0.5 tabular-nums"
            >
              <span
                className={`flex items-center gap-0.5 ${
                  isBuy ? "text-neon-green" : "text-neon-red"
                }`}
              >
                {isBuy ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {trade.price.toFixed(2)}
              </span>
              <span className="text-right text-muted">
                {trade.quantity.toFixed(4)}
              </span>
              <span className="text-right text-muted">
                {new Date(trade.time).toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
