"use client";

import { useState, useEffect, useRef } from "react";
import { BINANCE_REST, BINANCE_WS } from "@/lib/exchanges";

export interface BookLevel {
  price: number;
  size: number;
  total: number;
}

export interface OrderBook {
  asks: BookLevel[]; // sorted far → near mid (render order)
  bids: BookLevel[]; // sorted near → far from mid
}

const EMPTY_BOOK: OrderBook = { asks: [], bids: [] };

function toLevels(raw: [string, string][], reverse: boolean): BookLevel[] {
  let running = 0;
  const levels = raw.map(([p, q]) => {
    const size = parseFloat(q);
    running += size;
    return { price: parseFloat(p), size, total: running };
  });
  return reverse ? levels.reverse() : levels;
}

/**
 * Live Binance order book (top 20 levels, 1s cadence) over WebSocket,
 * with REST polling as fallback if the stream cannot connect.
 */
export function useBinanceDepth(symbol: string = "ethusdt") {
  const [book, setBook] = useState<OrderBook>(EMPTY_BOOK);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Reset when the symbol prop changes (render-time derivation).
  const [lastSymbol, setLastSymbol] = useState(symbol);
  if (symbol !== lastSymbol) {
    setLastSymbol(symbol);
    setBook(EMPTY_BOOK);
    setConnected(false);
  }

  useEffect(() => {
    mountedRef.current = true;

    function applyDepth(bids: [string, string][], asks: [string, string][]) {
      if (!mountedRef.current) return;
      setBook({ asks: toLevels(asks, true), bids: toLevels(bids, false) });
    }

    function startPolling() {
      if (pollRef.current) return;
      const poll = async () => {
        try {
          const res = await fetch(
            `${BINANCE_REST}/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=20`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (!res.ok) return;
          const data = (await res.json()) as {
            bids: [string, string][];
            asks: [string, string][];
          };
          applyDepth(data.bids, data.asks);
        } catch {
          // transient failure — next poll retries
        }
      };
      poll();
      pollRef.current = setInterval(poll, 2500);
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    function connect() {
      if (
        wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }
      const ws = new WebSocket(`${BINANCE_WS}/ws/${symbol}@depth20@1000ms`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        stopPolling();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as {
            bids: [string, string][];
            asks: [string, string][];
          };
          if (Array.isArray(data.bids) && Array.isArray(data.asks)) {
            applyDepth(data.bids, data.asks);
          }
        } catch {
          // malformed frame — ignore
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        startPolling();
        reconnectRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      mountedRef.current = false;
      stopPolling();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol]);

  return { book, connected };
}
