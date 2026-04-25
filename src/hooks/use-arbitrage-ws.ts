"use client";

import { useState, useEffect, useRef } from "react";
import type { ArbitrageOpportunity, AnomalyEvent } from "@/lib/types";
import {
  generateArbitrageOpportunities,
  generateAnomaly,
  generateInitialAnomalies,
} from "@/lib/mock-data";

interface WSMessage {
  type: "arbitrage_update" | "anomaly";
  data: ArbitrageOpportunity[] | AnomalyEvent;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
const RECONNECT_DELAY = 3000;
const MOCK_FALLBACK_MS = 4000;

export function useArbitrageWs() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [useMock, setUseMock] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    mockTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        setUseMock(true);
        setOpportunities(generateArbitrageOpportunities(8));
        setAnomalies(generateInitialAnomalies(12));

        mockIntervalRef.current = setInterval(() => {
          if (!mountedRef.current) return;
          setOpportunities(generateArbitrageOpportunities(8));
          setAnomalies((prev) => {
            const next = [generateAnomaly(), ...prev];
            return next.length > 50 ? next.slice(0, 50) : next;
          });
        }, 4000);
      }
    }, MOCK_FALLBACK_MS);

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN ||
          wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        setUseMock(false);
        if (mockTimerRef.current) { clearTimeout(mockTimerRef.current); mockTimerRef.current = null; }
        if (mockIntervalRef.current) { clearInterval(mockIntervalRef.current); mockIntervalRef.current = null; }
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
        } catch {}
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
      if (mockTimerRef.current) { clearTimeout(mockTimerRef.current); mockTimerRef.current = null; }
      if (mockIntervalRef.current) { clearInterval(mockIntervalRef.current); mockIntervalRef.current = null; }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return { opportunities, anomalies, connected, useMock };
}
