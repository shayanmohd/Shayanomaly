"use client";

import { useState, useEffect, useRef } from "react";

export interface LiveTrade {
  price: number;
  quantity: number;
  time: number;
  side: "buy" | "sell";
}

export function useBinanceWs(symbol: string = "ethusdt") {
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [lastPrice, setLastPrice] = useState<number>(0);
  const [prevPrice, setPrevPrice] = useState<number>(0);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPriceRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Reset state when symbol changes so no stale data flashes
    setTrades([]);
    setLastPrice(0);
    setPrevPrice(0);
    setConnected(false);
    lastPriceRef.current = 0;

    function connect() {
      // Prevent duplicate connections
      if (wsRef.current?.readyState === WebSocket.OPEN ||
          wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      const ws = new WebSocket(
        `wss://stream.binance.com:9443/ws/${symbol}@trade`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) setConnected(true);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const raw = JSON.parse(event.data) as {
            p: string;
            q: string;
            T: number;
            m: boolean;
          };
          const trade: LiveTrade = {
            price: parseFloat(raw.p),
            quantity: parseFloat(raw.q),
            time: raw.T,
            side: raw.m ? "sell" : "buy",
          };

          setTrades((prev) => {
            const next = [trade, ...prev];
            return next.length > 50 ? next.slice(0, 50) : next;
          });

          // Use ref for prev price to avoid stale closure / dependency issues
          setPrevPrice(lastPriceRef.current || trade.price);
          lastPriceRef.current = trade.price;
          setLastPrice(trade.price);
        } catch {
          // skip malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        reconnectRef.current = setTimeout(connect, 3000);
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
  }, [symbol]); // only reconnect if symbol changes

  return { trades, lastPrice, prevPrice, connected };
}
