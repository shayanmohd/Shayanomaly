"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Info, ShieldAlert, Terminal } from "lucide-react";
import type { AnomalyEvent } from "@/lib/types";

const SEVERITY = {
  critical: { icon: ShieldAlert, color: "text-neon-red", bg: "bg-neon-red/5", border: "border-l-neon-red" },
  warning:  { icon: AlertTriangle, color: "text-neon-yellow", bg: "bg-neon-yellow/5", border: "border-l-neon-yellow" },
  info:     { icon: Info, color: "text-neon-blue", bg: "bg-neon-blue/5", border: "border-l-neon-blue" },
};

interface AnomalyFeedProps {
  events: AnomalyEvent[];
  backendConnected: boolean;
}

export default function AnomalyFeed({ events, backendConnected }: AnomalyFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [events.length]);

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="glass-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-neon-purple" />
          <h3 className="text-sm font-semibold text-foreground">Anomaly Feed</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse-neon ${backendConnected ? "bg-neon-green" : "bg-neon-red"}`} />
          <span className={`text-[10px] font-medium ${backendConnected ? "text-neon-green" : "text-muted"}`}>
            {backendConnected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0 space-y-1 font-mono">
        {events.map((event) => {
          const cfg = SEVERITY[event.severity];
          const Icon = cfg.icon;
          return (
            <div key={event.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-sm border-l-2 ${cfg.bg} ${cfg.border} animate-fade-in`}>
              <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${cfg.color}`} />
              <p className={`flex-1 min-w-0 text-[11px] leading-snug ${cfg.color}`}>{event.message}</p>
              <span className="text-[10px] text-muted tabular-nums shrink-0">{fmtTime(event.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
