"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  ComposedChart,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { generateChartHistory } from "@/lib/mock-data";
import type { ChartDataPoint } from "@/lib/types";

interface PriceChartProps {
  livePrice: number;
  selectedAsset?: string;
}

export default function PriceChart({ livePrice, selectedAsset = "ETH/USDT" }: PriceChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);

  useEffect(() => {
    setData(generateChartHistory(60));
  }, [selectedAsset]);

  // Append new live data points periodically
  useEffect(() => {
    if (livePrice <= 0 || data.length === 0) return;

    const interval = setInterval(() => {
      setData((prev) => {
        const last = prev[prev.length - 1];
        const coinbaseDrift = last.coinbase + (Math.random() - 0.48) * 5;
        const now = new Date();
        const timeStr = now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        const next: ChartDataPoint = {
          time: timeStr,
          binance: livePrice,
          coinbase: parseFloat(
            Math.max(3700, Math.min(4000, coinbaseDrift)).toFixed(2)
          ),
          volume: parseFloat((Math.random() * 500 + 100).toFixed(0)),
        };

        return [...prev.slice(1), next];
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [livePrice, data.length]);

  const formatPrice = useCallback(
    (value: number) => `$${value.toFixed(0)}`,
    []
  );

  return (
    <div className="glass-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neon-blue" />
          <h3 className="text-sm font-semibold text-foreground">
            {selectedAsset} Cross-Exchange
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-neon-green" />
            Binance
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-neon-blue" />
            Coinbase
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="gradBinance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ff9d" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#00ff9d" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCoinbase" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#6b7d8f" }}
              interval={9}
            />
            <YAxis
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#6b7d8f" }}
              tickFormatter={formatPrice}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111923",
                border: "1px solid #1e2d3d",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#c5d1de",
              }}
              labelStyle={{ color: "#6b7d8f" }}
            />

            <Bar
              dataKey="volume"
              fill="rgba(0, 212, 255, 0.1)"
              yAxisId="right"
              barSize={3}
            />

            <Area
              type="monotone"
              dataKey="binance"
              stroke="#00ff9d"
              strokeWidth={1.5}
              fill="url(#gradBinance)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="coinbase"
              stroke="#00d4ff"
              strokeWidth={1.5}
              fill="url(#gradCoinbase)"
              dot={false}
              isAnimationActive={false}
            />

            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={false}
              width={0}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
