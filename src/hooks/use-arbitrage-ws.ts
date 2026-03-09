"use client";

import { useState, useEffect, useRef } from "react";
import type { ArbitrageOpportunity, AnomalyEvent } from "@/lib/types";

interface WSMessage {
  type: "arbitrage_update" | "anomaly";
  data: ArbitrageOpportunity[] | AnomalyEvent;
}

const WS_URL = "ws://localhost:8080";
const RECONNECT_DELAY = 3000;

export function useArbitrageWs() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      // Prevent duplicate connections
      if (wsRef.current?.readyState === WebSocket.OPEN ||
          wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) {
          setConnected(true);
          console.log("[arb-ws] Connected to backend");
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const msg: WSMessage = JSON.parse(event.data as string);

          if (msg.type === "arbitrage_update" && Array.isArray(msg.data)) {
            setOpportunities(msg.data as ArbitrageOpportunity[]);
          }

          if (msg.type === "anomaly" && !Array.isArray(msg.data)) {
            setAnomalies((prev) => {
              const next = [msg.data as AnomalyEvent, ...prev];
              return next.length > 100 ? next.slice(0, 100) : next;
            });
          }
        } catch {
          // skip malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        console.log("[arb-ws] Disconnected, reconnecting...");
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // stable — no deps, connect once

  return { opportunities, anomalies, connected };
}
