"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  ComposedChart,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { fetchBinanceKlines, fetchCoinbaseCandles, type Asset, type ExchangeId } from "@/lib/exchanges";
import { useMarketData } from "@/lib/market-engine";
import type { ChartDataPoint } from "@/lib/types";

interface PriceChartProps {
  livePrice: number;
  selectedAsset?: string;
}

// Preferred comparison venue for the second line, by availability.
const COMPARE_PRIORITY: ExchangeId[] = ["coinbase", "kraken", "okx", "bybit"];

const fmtClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export default function PriceChart({ livePrice, selectedAsset = "ETH/USDT" }: PriceChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const { quotes } = useMarketData();
  const quotesRef = useRef(quotes);
  const livePriceRef = useRef(livePrice);
  const compareVenueRef = useRef<ExchangeId>("coinbase");

  const asset = selectedAsset as Asset;
  const assetQuotes = quotes[asset];
  const compareVenue = COMPARE_PRIORITY.find((v) => assetQuotes?.[v]) ?? "coinbase";
  const compareLabel = compareVenue.charAt(0).toUpperCase() + compareVenue.slice(1);

  // Keep latest values available to the interval closure below.
  useEffect(() => {
    quotesRef.current = quotes;
    livePriceRef.current = livePrice;
    compareVenueRef.current = compareVenue;
  }, [quotes, livePrice, compareVenue]);

  // Clear the series when switching assets (render-time derivation).
  const [lastAsset, setLastAsset] = useState(asset);
  if (asset !== lastAsset) {
    setLastAsset(asset);
    setData([]);
  }

  // Seed with real 1-minute history from Binance + Coinbase.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [klines, candles] = await Promise.all([
          fetchBinanceKlines(asset, "1m", 60),
          fetchCoinbaseCandles(asset, 60).catch(() => []),
        ]);
        if (cancelled) return;
        const candleByMinute = new Map(candles.map((c) => [Math.floor(c.ts / 60_000), c]));
        setData(
          klines.map((k) => {
            const cb = candleByMinute.get(Math.floor(k.ts / 60_000));
            return {
              time: fmtClock(k.ts),
              binance: k.close,
              coinbase: cb ? cb.close : k.close,
              volume: k.volume,
            };
          })
        );
      } catch {
        // seeds unavailable — the live appender below still builds the series
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  // Append a live point every 5s from the trade stream + venue quotes.
  useEffect(() => {
    const interval = setInterval(() => {
      const assetQ = quotesRef.current[asset];
      const binanceQ = assetQ?.binance;
      const compareQ = assetQ?.[compareVenueRef.current];
      const binancePrice = livePriceRef.current > 0 ? livePriceRef.current : binanceQ ? (binanceQ.bid + binanceQ.ask) / 2 : 0;
      if (binancePrice <= 0) return;

      setData((prev) => {
        const comparePrice = compareQ
          ? (compareQ.bid + compareQ.ask) / 2
          : prev[prev.length - 1]?.coinbase ?? binancePrice;
        const point: ChartDataPoint = {
          time: fmtClock(Date.now()),
          binance: binancePrice,
          coinbase: comparePrice,
          volume: prev[prev.length - 1]?.volume ?? 0,
        };
        const next = [...prev, point];
        return next.length > 120 ? next.slice(next.length - 120) : next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [asset]);

  const formatPrice = useCallback(
    (value: number) => (value >= 100 ? `$${value.toFixed(0)}` : `$${value.toPrecision(3)}`),
    []
  );

  return (
    <div className="glass-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">
            {selectedAsset} Cross-Exchange
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Binance
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-neon-blue" />
            {compareLabel}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted">
            Loading market history…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradBinance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCoinbase" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>

              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} interval={Math.max(9, Math.floor(data.length / 7))} />
              <YAxis domain={["auto", "auto"]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={formatPrice} width={55} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f1117", border: "1px solid #1e2030", borderRadius: "8px", fontSize: "12px", color: "#e2e4eb" }}
                labelStyle={{ color: "#6b7280" }}
                formatter={(value, name) => [
                  typeof value === "number"
                    ? name === "volume"
                      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                    : value,
                  name === "binance" ? "Binance" : name === "coinbase" ? compareLabel : "Volume",
                ]}
              />

              <Bar dataKey="volume" fill="rgba(99, 102, 241, 0.08)" yAxisId="right" barSize={3} />

              <Area type="monotone" dataKey="binance" stroke="#6366f1" strokeWidth={1.5} fill="url(#gradBinance)" dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="coinbase" stroke="#3b82f6" strokeWidth={1.5} fill="url(#gradCoinbase)" dot={false} isAnimationActive={false} />

              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={false} width={0} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
