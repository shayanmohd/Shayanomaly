"use client";

import { useEffect, useState, useRef } from "react";
import { Fuel, Globe, TrendingUp, Wifi, WifiOff } from "lucide-react";
import { generateGlobalStats } from "@/lib/mock-data";
import type { GlobalMarketStats } from "@/lib/types";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// Stable defaults for SSR — no randomness
const INITIAL_STATS: GlobalMarketStats = {
  totalVolume24h: 0,
  ethGasGwei: 0,
  btcDominance: 0,
  activeArbitrages: 0,
  connectedExchanges: 0,
};

interface HeaderProps {
  wsConnected: boolean;
  livePrice: number;
  prevPrice: number;
}

export default function Header({
  wsConnected,
  livePrice,
  prevPrice,
}: HeaderProps) {
  const [stats, setStats] = useState<GlobalMarketStats>(INITIAL_STATS);
  const [clock, setClock] = useState("--:--:--");
  const mounted = useRef(false);

  // Hydrate stats + clock only on the client after mount
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setStats(generateGlobalStats());
    }

    const statsInterval = setInterval(() => {
      setStats(generateGlobalStats());
    }, 8000);

    const tick = () => {
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    tick();
    const clockInterval = setInterval(tick, 1000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const priceUp = livePrice >= prevPrice;

  return (
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 bg-surface border-b border-border shrink-0">
      {/* Left: Live Price */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {wsConnected ? (
            <Wifi className="w-3.5 h-3.5 text-neon-green" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-neon-red" />
          )}
          <span className="text-xs text-muted">ETH/USDT</span>
          {livePrice > 0 && (
            <span
              className={`text-sm font-bold tabular-nums ${
                priceUp ? "text-neon-green glow-green" : "text-neon-red glow-red"
              }`}
            >
              ${livePrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Center: Stats */}
      <div className="hidden md:flex items-center gap-6">
        <StatChip
          icon={<Globe className="w-3.5 h-3.5" />}
          label="24h Vol"
          value={stats.totalVolume24h > 0 ? `$${stats.totalVolume24h}B` : "—"}
        />
        <StatChip
          icon={<Fuel className="w-3.5 h-3.5" />}
          label="Gas"
          value={stats.ethGasGwei > 0 ? `${stats.ethGasGwei} gwei` : "—"}
        />
        <StatChip
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="BTC.D"
          value={stats.btcDominance > 0 ? `${stats.btcDominance}%` : "—"}
        />
        <StatChip
          icon={<Wifi className="w-3.5 h-3.5" />}
          label="Exchanges"
          value={stats.connectedExchanges > 0 ? `${stats.connectedExchanges}` : "—"}
        />
      </div>

      {/* Right: Wallet + Clock */}
      <div className="flex items-center gap-3">
        <ConnectButton
          chainStatus="icon"
          accountStatus="address"
          showBalance={false}
        />
        <div className="w-px h-5 bg-border" />
        <span className="text-xs text-muted tabular-nums font-mono" suppressHydrationWarning>
          {clock} UTC
        </span>
        <div
          className={`w-2 h-2 rounded-full ${
            wsConnected ? "bg-neon-green" : "bg-neon-red"
          } animate-pulse-neon`}
        />
      </div>
    </header>
  );
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted">{icon}</span>
      <span className="text-muted">{label}</span>
      <span className="text-foreground font-medium tabular-nums">{value}</span>
    </div>
  );
}
