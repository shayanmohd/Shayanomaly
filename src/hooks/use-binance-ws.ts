"use client";

import { useState, useEffect, useRef } from "react";
import { BINANCE_WS } from "@/lib/exchanges";

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

  // Reset derived stream state when the symbol prop changes (render-time
  // derivation per react.dev "You Might Not Need an Effect").
  const [lastSymbol, setLastSymbol] = useState(symbol);
  if (symbol !== lastSymbol) {
    setLastSymbol(symbol);
    setTrades([]);
    setLastPrice(0);
    setPrevPrice(0);
    setConnected(false);
  }

  useEffect(() => {
    mountedRef.current = true;
    lastPriceRef.current = 0;

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN ||
          wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      const ws = new WebSocket(`${BINANCE_WS}/ws/${symbol}@trade`);
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

          setPrevPrice(lastPriceRef.current || trade.price);
          lastPriceRef.current = trade.price;
          setLastPrice(trade.price);
        } catch {
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
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol]);

  return { trades, lastPrice, prevPrice, connected };
}
