"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Info, ShieldAlert, Terminal } from "lucide-react";
import type { AnomalyEvent } from "@/lib/types";

const SEVERITY_CONFIG = {
  critical: {
    icon: ShieldAlert,
    color: "text-neon-red",
    bg: "bg-neon-red/5",
    border: "border-l-neon-red",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-neon-yellow",
    bg: "bg-neon-yellow/5",
    border: "border-l-neon-yellow",
  },
  info: {
    icon: Info,
    color: "text-neon-blue",
    bg: "bg-neon-blue/5",
    border: "border-l-neon-blue",
  },
};

interface AnomalyFeedProps {
  events: AnomalyEvent[];
  backendConnected: boolean;
}

export default function AnomalyFeed({ events, backendConnected }: AnomalyFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top for newest
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="glass-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-neon-yellow" />
          <h3 className="text-sm font-semibold text-foreground">
            Anomaly Detection Feed
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <div
            className={`w-1.5 h-1.5 rounded-full animate-pulse-neon ${
              backendConnected ? "bg-neon-green" : "bg-neon-red"
            }`}
          />
          <span
            className={`text-[10px] font-medium ${
              backendConnected ? "text-neon-green" : "text-neon-red"
            }`}
          >
            {backendConnected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto min-h-0 space-y-1 font-mono"
      >
        {events.map((event) => {
          const config = SEVERITY_CONFIG[event.severity];
          const Icon = config.icon;

          return (
            <div
              key={event.id}
              className={`flex items-start gap-2 px-2 py-1.5 rounded-sm border-l-2 ${config.bg} ${config.border} transition-opacity`}
            >
              <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] leading-snug ${config.color}`}>
                  {event.message}
                </p>
              </div>
              <span className="text-[10px] text-muted tabular-nums shrink-0">
                {formatTime(event.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
