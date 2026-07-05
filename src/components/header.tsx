"use client";

import { useEffect, useState } from "react";
import { Fuel, Globe, TrendingUp, Wifi, WifiOff } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMarketData } from "@/lib/market-engine";

interface HeaderProps {
  wsConnected: boolean;
  livePrice: number;
  prevPrice: number;
  selectedAsset?: string;
}

function fmtVolume(usd: number): string {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  return `$${(usd / 1e6).toFixed(0)}M`;
}

export default function Header({ wsConnected, livePrice, prevPrice, selectedAsset = "ETH/USDT" }: HeaderProps) {
  const { gasGwei, global } = useMarketData();
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: "UTC",
        })
      );
    tick();
    const ci = setInterval(tick, 1000);
    return () => clearInterval(ci);
  }, []);

  const up = livePrice >= prevPrice;

  return (
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 bg-surface border-b border-border shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {wsConnected ? <Wifi className="w-3.5 h-3.5 text-neon-green" /> : <WifiOff className="w-3.5 h-3.5 text-muted" />}
          <span className="text-xs text-muted font-medium">{selectedAsset}</span>
          {livePrice > 0 && (
            <span className={`text-sm font-bold tabular-nums ${up ? "text-neon-green" : "text-neon-red"}`}>
              ${livePrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="hidden md:flex items-center gap-6">
        <StatChip
          icon={<Globe className="w-3.5 h-3.5" />}
          label="24h Vol"
          value={global ? fmtVolume(global.totalVolumeUsd) : "—"}
        />
        <StatChip
          icon={<Fuel className="w-3.5 h-3.5" />}
          label="Gas"
          value={gasGwei !== null ? `${gasGwei < 10 ? gasGwei.toFixed(2) : gasGwei.toFixed(1)} gwei` : "—"}
        />
        <StatChip
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="BTC.D"
          value={global ? `${global.btcDominance.toFixed(1)}%` : "—"}
        />
      </div>

      <div className="flex items-center gap-3">
        <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />
        <div className="w-px h-5 bg-border" />
        <span className="text-xs text-muted tabular-nums font-mono" suppressHydrationWarning>
          {clock} UTC
        </span>
        <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-neon-green" : "bg-neon-red"} animate-pulse-neon`} />
      </div>
    </header>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted">{icon}</span>
      <span className="text-muted">{label}</span>
      <span className="text-foreground font-medium tabular-nums">{value}</span>
    </div>
  );
}
