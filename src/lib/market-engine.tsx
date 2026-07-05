"use client";

// The live market engine. Runs entirely in the browser against public,
// keyless market-data APIs: polls five exchanges for order-book tops,
// computes real cross-venue arbitrage spreads, flags anomalies (price
// moves, venue divergence, whale prints, gas spikes), and tracks an
// EIP-1559 gas oracle via public JSON-RPC.
//
// If NEXT_PUBLIC_WS_URL is set at build time, the engine instead consumes
// the self-hosted backend stream (backend/) and the local detector becomes
// a fallback — the deployed static site and the full-stack Docker setup
// share this one code path.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ASSETS,
  BINANCE_WS,
  EXCHANGE_IDS,
  EXCHANGE_LABELS,
  QUOTE_FETCHERS,
  fetchBinanceTickers24h,
  fetchGasGwei,
  fetchGlobalStats,
  type Asset,
  type ExchangeId,
  type GlobalStats,
  type Quote,
  type Ticker24h,
} from "@/lib/exchanges";
import type { AnomalyEvent, ArbitrageOpportunity } from "@/lib/types";

const QUOTE_POLL_MS = 6_000;
const TICKER_POLL_MS = 30_000;
const GAS_POLL_MS = 30_000;
const GLOBAL_POLL_MS = 90_000;
const QUOTE_STALE_MS = 20_000;
const MAX_ANOMALIES = 100;
const HISTORY_KEY = "shy_scanner_history_v1";
const MAX_HISTORY = 200;
// Taker fees on both legs (0.1% each side) per $1k notional.
const FEES_PER_1K_USD = 2.0;

export type FeedStatus = "init" | "up" | "down";

export interface HistoryEntry {
  id: string;
  ts: number;
  asset: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
}

export interface MarketData {
  quotes: Partial<Record<Asset, Partial<Record<ExchangeId, Quote>>>>;
  opportunities: ArbitrageOpportunity[];
  anomalies: AnomalyEvent[];
  tickers: Partial<Record<Asset, Ticker24h>>;
  history: HistoryEntry[];
  gasGwei: number | null;
  global: GlobalStats | null;
  feeds: Record<ExchangeId, FeedStatus>;
  /** true once at least one venue has delivered quotes (or backend is live) */
  live: boolean;
  backendConnected: boolean;
  lastUpdate: number;
}

const INITIAL_FEEDS = Object.fromEntries(
  EXCHANGE_IDS.map((e) => [e, "init"])
) as Record<ExchangeId, FeedStatus>;

const INITIAL: MarketData = {
  quotes: {},
  opportunities: [],
  anomalies: [],
  tickers: {},
  history: [],
  gasGwei: null,
  global: null,
  feeds: INITIAL_FEEDS,
  live: false,
  backendConnected: false,
  lastUpdate: 0,
};

const MarketDataContext = createContext<MarketData>(INITIAL);

export function useMarketData(): MarketData {
  return useContext(MarketDataContext);
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++idCounter}`;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

interface EngineRefs {
  quotes: Map<Asset, Map<ExchangeId, Quote>>;
  feeds: Record<ExchangeId, FeedStatus>;
  anomalies: AnomalyEvent[];
  history: HistoryEntry[];
  /** consensus mid-price ring buffer per asset for move detection */
  midHistory: Map<Asset, { ts: number; mid: number }[]>;
  /** cooldown map so one condition doesn't spam the feed */
  cooldowns: Map<string, number>;
  gasHistory: number[];
  historyThrottle: Map<string, number>;
}

function onCooldown(refs: EngineRefs, key: string, ms: number): boolean {
  const now = Date.now();
  const until = refs.cooldowns.get(key) ?? 0;
  if (now < until) return true;
  refs.cooldowns.set(key, now + ms);
  return false;
}

function pushAnomaly(refs: EngineRefs, event: Omit<AnomalyEvent, "id" | "timestamp">) {
  refs.anomalies = [
    { ...event, id: nextId("anom"), timestamp: Date.now() },
    ...refs.anomalies,
  ].slice(0, MAX_ANOMALIES);
}

const fmtUsd = (n: number) =>
  n >= 1
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toPrecision(4);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Best cross-venue route per asset from fresh order-book tops. */
function computeOpportunities(refs: EngineRefs): ArbitrageOpportunity[] {
  const now = Date.now();
  const opps: ArbitrageOpportunity[] = [];

  for (const asset of ASSETS) {
    const venueQuotes = refs.quotes.get(asset);
    if (!venueQuotes) continue;
    const fresh = [...venueQuotes.values()].filter((q) => now - q.ts < QUOTE_STALE_MS);
    if (fresh.length < 2) continue;

    let buy = fresh[0];
    let sell = fresh[0];
    for (const q of fresh) {
      if (q.ask < buy.ask) buy = q;
      if (q.bid > sell.bid) sell = q;
    }
    if (buy.exchange === sell.exchange) {
      // Best bid and ask on the same venue — pick the next-best sell venue.
      const others = fresh.filter((q) => q.exchange !== buy.exchange);
      if (others.length === 0) continue;
      sell = others.reduce((a, b) => (b.bid > a.bid ? b : a));
    }

    const spreadPercent = ((sell.bid - buy.ask) / buy.ask) * 100;
    const grossPer1k = 1000 * (spreadPercent / 100);

    opps.push({
      id: `${asset}:${buy.exchange}>${sell.exchange}`,
      asset,
      buyExchange: EXCHANGE_LABELS[buy.exchange],
      buyPrice: buy.ask,
      sellExchange: EXCHANGE_LABELS[sell.exchange],
      sellPrice: sell.bid,
      spreadPercent,
      volume: 0, // filled from 24h tickers by the caller
      timestamp: now,
      netProfit: grossPer1k - FEES_PER_1K_USD,
      estimatedGas: 0,
    });
  }

  return opps.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

function detectAnomalies(refs: EngineRefs, opps: ArbitrageOpportunity[]) {
  const now = Date.now();

  // 1. Real arbitrage windows (spread net of fees). Cooldown keys are
  // per-tier so an earlier warning can't suppress a genuine critical.
  for (const o of opps) {
    if (o.spreadPercent >= 0.6) {
      if (!onCooldown(refs, `arb:crit:${o.asset}`, 90_000)) {
        pushAnomaly(refs, {
          severity: "critical",
          asset: o.asset,
          exchange: o.buyExchange,
          message: `[ARB] ${o.asset} ${o.spreadPercent.toFixed(2)}% window — buy ${o.buyExchange} $${fmtUsd(o.buyPrice)} / sell ${o.sellExchange} $${fmtUsd(o.sellPrice)}`,
        });
      }
    } else if (o.spreadPercent >= 0.25) {
      if (!onCooldown(refs, `arb:warn:${o.asset}`, 90_000)) {
        pushAnomaly(refs, {
          severity: "warning",
          asset: o.asset,
          exchange: o.buyExchange,
          message: `[ARB] ${o.asset} spread ${o.spreadPercent.toFixed(2)}% between ${o.buyExchange} and ${o.sellExchange}`,
        });
      }
    }
  }

  // 2. Consensus price moves + per-venue divergence.
  for (const asset of ASSETS) {
    const venueQuotes = refs.quotes.get(asset);
    if (!venueQuotes) continue;
    const fresh = [...venueQuotes.values()].filter((q) => now - q.ts < QUOTE_STALE_MS);
    if (fresh.length < 2) continue;

    const mids = fresh.map((q) => (q.bid + q.ask) / 2);
    const consensus = median(mids);

    for (const q of fresh) {
      const mid = (q.bid + q.ask) / 2;
      const devPct = ((mid - consensus) / consensus) * 100;
      if (Math.abs(devPct) >= 0.5 && !onCooldown(refs, `div:${asset}:${q.exchange}`, 120_000)) {
        pushAnomaly(refs, {
          severity: "warning",
          asset,
          exchange: EXCHANGE_LABELS[q.exchange],
          message: `[DIVERGENCE] ${EXCHANGE_LABELS[q.exchange]} ${asset} mid ${devPct > 0 ? "+" : ""}${devPct.toFixed(2)}% vs ${fresh.length}-venue median`,
        });
      }
    }

    let buffer = refs.midHistory.get(asset);
    if (!buffer) {
      buffer = [];
      refs.midHistory.set(asset, buffer);
    }
    buffer.push({ ts: now, mid: consensus });
    while (buffer.length > 0 && now - buffer[0].ts > 5 * 60_000) buffer.shift();

    const ref = buffer.find((p) => now - p.ts >= 60_000 && now - p.ts <= 120_000);
    if (ref) {
      const movePct = ((consensus - ref.mid) / ref.mid) * 100;
      const abs = Math.abs(movePct);
      if (abs >= 1.0 && !onCooldown(refs, `move:crit:${asset}`, 120_000)) {
        pushAnomaly(refs, {
          severity: "critical",
          asset,
          exchange: "Consensus",
          message: `[MOVE] ${asset} ${movePct > 0 ? "+" : ""}${movePct.toFixed(2)}% in ~${Math.round((now - ref.ts) / 1000)}s across all venues`,
        });
      } else if (abs >= 0.35 && !onCooldown(refs, `move:warn:${asset}`, 120_000)) {
        pushAnomaly(refs, {
          severity: "warning",
          asset,
          exchange: "Consensus",
          message: `[MOVE] ${asset} ${movePct > 0 ? "+" : ""}${movePct.toFixed(2)}% in ~${Math.round((now - ref.ts) / 1000)}s`,
        });
      }
    }
  }
}

function recordHistory(refs: EngineRefs, opps: ArbitrageOpportunity[]) {
  const now = Date.now();
  let changed = false;
  for (const o of opps) {
    if (o.spreadPercent < 0.15) continue;
    const route = o.id;
    const last = refs.historyThrottle.get(route) ?? 0;
    if (now - last < 60_000) continue;
    refs.historyThrottle.set(route, now);
    refs.history = [
      {
        id: nextId("hist"),
        ts: now,
        asset: o.asset,
        buyExchange: o.buyExchange,
        sellExchange: o.sellExchange,
        buyPrice: o.buyPrice,
        sellPrice: o.sellPrice,
        spreadPercent: o.spreadPercent,
      },
      ...refs.history,
    ].slice(0, MAX_HISTORY);
    changed = true;
  }
  if (changed) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(refs.history));
    } catch {
      // storage full/blocked — history stays in-memory
    }
  }
}

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MarketData>(INITIAL);

  const refsRef = useRef<EngineRefs | null>(null);
  if (refsRef.current === null) {
    refsRef.current = {
      quotes: new Map(),
      feeds: { ...INITIAL_FEEDS },
      anomalies: [],
      history: [],
      midHistory: new Map(),
      cooldowns: new Map(),
      gasHistory: [],
      historyThrottle: new Map(),
    };
  }

  useEffect(() => {
    const refs = refsRef.current!;
    refs.history = loadHistory();
    pushAnomaly(refs, {
      severity: "info",
      asset: "—",
      exchange: "Engine",
      message: `[ENGINE] In-browser detection engine online — tracking ${ASSETS.length} pairs across ${EXCHANGE_IDS.length} venues`,
    });

    let disposed = false;
    let tickers: Partial<Record<Asset, Ticker24h>> = {};
    let gasGwei: number | null = null;
    let globalStats: GlobalStats | null = null;
    let backendConnected = false;
    let backendOpps: ArbitrageOpportunity[] = [];

    const timers: ReturnType<typeof setInterval>[] = [];

    function publish() {
      if (disposed) return;
      const opps = backendConnected ? backendOpps : computeOpportunities(refs);
      if (!backendConnected) {
        // Attach 24h volume from Binance tickers where available.
        for (const o of opps) {
          const t = tickers[o.asset as Asset];
          if (t) o.volume = t.quoteVolume;
        }
        recordHistory(refs, opps);
      }
      // Publish only fresh quotes so consumers (chart venue picker, tables)
      // never render prices from a feed that has gone dark.
      const now = Date.now();
      const quotesObj: MarketData["quotes"] = {};
      for (const [asset, venues] of refs.quotes) {
        const fresh = [...venues].filter(([, q]) => now - q.ts < QUOTE_STALE_MS);
        if (fresh.length > 0) {
          quotesObj[asset] = Object.fromEntries(fresh) as Partial<Record<ExchangeId, Quote>>;
        }
      }
      const feedsUp = Object.values(refs.feeds).some((f) => f === "up");
      setData({
        quotes: quotesObj,
        opportunities: opps,
        anomalies: refs.anomalies,
        tickers,
        history: refs.history,
        gasGwei,
        global: globalStats,
        feeds: { ...refs.feeds },
        live: feedsUp || backendConnected,
        backendConnected,
        lastUpdate: Date.now(),
      });
    }

    async function pollQuotes() {
      await Promise.allSettled(
        EXCHANGE_IDS.map(async (exchange) => {
          try {
            const quotes = await QUOTE_FETCHERS[exchange](ASSETS);
            if (disposed) return;
            for (const q of quotes) {
              let venues = refs.quotes.get(q.asset);
              if (!venues) {
                venues = new Map();
                refs.quotes.set(q.asset, venues);
              }
              venues.set(exchange, q);
            }
            if (refs.feeds[exchange] === "down") {
              pushAnomaly(refs, {
                severity: "info",
                asset: "—",
                exchange: EXCHANGE_LABELS[exchange],
                message: `[FEED] ${EXCHANGE_LABELS[exchange]} feed restored`,
              });
            }
            refs.feeds[exchange] = "up";
          } catch {
            if (disposed) return;
            if (refs.feeds[exchange] === "up") {
              pushAnomaly(refs, {
                severity: "info",
                asset: "—",
                exchange: EXCHANGE_LABELS[exchange],
                message: `[FEED] ${EXCHANGE_LABELS[exchange]} feed unreachable — degraded coverage`,
              });
            }
            refs.feeds[exchange] = "down";
          }
        })
      );
      if (disposed) return;
      if (!backendConnected) {
        detectAnomalies(refs, computeOpportunities(refs));
      }
      publish();
    }

    async function pollTickers() {
      try {
        const rows = await fetchBinanceTickers24h(ASSETS);
        if (disposed) return;
        tickers = Object.fromEntries(rows.map((t) => [t.asset, t]));
      } catch {
        // keep last known tickers
      }
    }

    async function pollGas() {
      try {
        const gwei = await fetchGasGwei();
        if (disposed) return;
        refs.gasHistory.push(gwei);
        if (refs.gasHistory.length > 20) refs.gasHistory.shift();
        const med = median(refs.gasHistory);
        if (
          refs.gasHistory.length >= 5 &&
          gwei > med * 2.5 &&
          gwei > 1 &&
          !onCooldown(refs, "gas", 180_000)
        ) {
          pushAnomaly(refs, {
            severity: "warning",
            asset: "ETH",
            exchange: "Ethereum",
            message: `[GAS] Gas spike: ${gwei.toFixed(1)} gwei (${(gwei / med).toFixed(1)}× rolling median)`,
          });
        }
        gasGwei = gwei;
      } catch {
        // keep last known gas
      }
    }

    async function pollGlobal() {
      try {
        const stats = await fetchGlobalStats();
        if (disposed) return;
        globalStats = stats;
      } catch {
        // keep last known stats
      }
    }

    // Whale watcher: combined Binance aggTrade stream for the majors.
    let whaleWs: WebSocket | null = null;
    let whaleReconnect: ReturnType<typeof setTimeout> | null = null;
    function connectWhaleWatcher() {
      const streams = ["ethusdt", "btcusdt", "solusdt"].map((s) => `${s}@aggTrade`).join("/");
      try {
        whaleWs = new WebSocket(`${BINANCE_WS}/stream?streams=${streams}`);
      } catch {
        return;
      }
      whaleWs.onmessage = (event: MessageEvent) => {
        if (disposed) return;
        try {
          const wrapper = JSON.parse(event.data as string) as {
            data: { s: string; p: string; q: string; m: boolean };
          };
          const t = wrapper.data;
          const notional = parseFloat(t.p) * parseFloat(t.q);
          if (!Number.isFinite(notional)) return;
          const base = t.s.replace("USDT", "");
          const asset = `${base}/USDT`;
          if (notional >= 1_000_000 && !onCooldown(refs, `whale:crit:${asset}`, 30_000)) {
            pushAnomaly(refs, {
              severity: "critical",
              asset,
              exchange: "Binance",
              message: `[WHALE] $${(notional / 1e6).toFixed(2)}M ${base} ${t.m ? "sell" : "buy"} on Binance @ $${fmtUsd(parseFloat(t.p))}`,
            });
            publish();
          } else if (notional >= 250_000 && !onCooldown(refs, `whale:info:${asset}`, 45_000)) {
            pushAnomaly(refs, {
              severity: "info",
              asset,
              exchange: "Binance",
              message: `[WHALE] $${(notional / 1e3).toFixed(0)}K ${base} ${t.m ? "sell" : "buy"} on Binance @ $${fmtUsd(parseFloat(t.p))}`,
            });
            publish();
          }
        } catch {
          // malformed frame — ignore
        }
      };
      whaleWs.onclose = () => {
        whaleWs = null;
        if (!disposed) whaleReconnect = setTimeout(connectWhaleWatcher, 10_000);
      };
      whaleWs.onerror = () => whaleWs?.close();
    }

    // Optional self-hosted backend stream (full-stack mode).
    const backendUrl = process.env.NEXT_PUBLIC_WS_URL;
    let backendWs: WebSocket | null = null;
    let backendReconnect: ReturnType<typeof setTimeout> | null = null;
    function connectBackend() {
      if (!backendUrl) return;
      try {
        backendWs = new WebSocket(backendUrl);
      } catch {
        return;
      }
      backendWs.onopen = () => {
        backendConnected = true;
        publish();
      };
      backendWs.onmessage = (event: MessageEvent) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            data: ArbitrageOpportunity[] | AnomalyEvent;
          };
          if (msg.type === "arbitrage_update" && Array.isArray(msg.data)) {
            backendOpps = msg.data;
            publish();
          } else if (msg.type === "anomaly" && !Array.isArray(msg.data)) {
            // Sanitize the frame — an unknown severity or missing message
            // from the backend must not be able to crash the feed UI.
            const raw = msg.data as Partial<AnomalyEvent> | null;
            if (raw && typeof raw.message === "string") {
              const severity: AnomalyEvent["severity"] =
                raw.severity === "critical" || raw.severity === "warning" ? raw.severity : "info";
              refs.anomalies = [
                {
                  id: typeof raw.id === "string" ? raw.id : nextId("anom"),
                  severity,
                  message: raw.message,
                  asset: typeof raw.asset === "string" ? raw.asset : "—",
                  exchange: typeof raw.exchange === "string" ? raw.exchange : "—",
                  timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
                },
                ...refs.anomalies,
              ].slice(0, MAX_ANOMALIES);
              publish();
            }
          }
        } catch {
          // malformed frame — ignore
        }
      };
      backendWs.onclose = () => {
        backendWs = null;
        backendConnected = false;
        publish();
        if (!disposed) backendReconnect = setTimeout(connectBackend, 3000);
      };
      backendWs.onerror = () => backendWs?.close();
    }

    pollQuotes();
    pollTickers();
    pollGas();
    pollGlobal();
    connectWhaleWatcher();
    connectBackend();

    timers.push(setInterval(pollQuotes, QUOTE_POLL_MS));
    timers.push(setInterval(pollTickers, TICKER_POLL_MS));
    timers.push(setInterval(pollGas, GAS_POLL_MS));
    timers.push(setInterval(pollGlobal, GLOBAL_POLL_MS));

    return () => {
      disposed = true;
      timers.forEach(clearInterval);
      if (whaleReconnect) clearTimeout(whaleReconnect);
      if (backendReconnect) clearTimeout(backendReconnect);
      if (whaleWs) {
        whaleWs.onclose = null;
        whaleWs.close();
      }
      if (backendWs) {
        backendWs.onclose = null;
        backendWs.close();
      }
    };
  }, []);

  return <MarketDataContext.Provider value={data}>{children}</MarketDataContext.Provider>;
}
