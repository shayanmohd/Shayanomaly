// Client-side connectors for public, keyless market-data APIs.
// Every endpoint here is CORS-enabled and serves read-only market data,
// so the terminal runs fully in the browser — no backend required.

export const EXCHANGE_IDS = ["binance", "coinbase", "kraken", "okx", "bybit"] as const;
export type ExchangeId = (typeof EXCHANGE_IDS)[number];

export const EXCHANGE_LABELS: Record<ExchangeId, string> = {
  binance: "Binance",
  coinbase: "Coinbase",
  kraken: "Kraken",
  okx: "OKX",
  bybit: "Bybit",
};

export const ASSETS = [
  "ETH/USDT",
  "BTC/USDT",
  "SOL/USDT",
  "XRP/USDT",
  "ADA/USDT",
  "DOGE/USDT",
  "LINK/USDT",
  "AVAX/USDT",
] as const;
export type Asset = (typeof ASSETS)[number];

export interface Quote {
  exchange: ExchangeId;
  asset: Asset;
  bid: number;
  ask: number;
  ts: number;
}

export interface Ticker24h {
  asset: Asset;
  lastPrice: number;
  changePercent: number;
  quoteVolume: number;
}

// data-api.binance.vision is Binance's official market-data-only mirror;
// unlike api.binance.com it is not geo-restricted.
export const BINANCE_REST = "https://data-api.binance.vision";
export const BINANCE_WS = "wss://data-stream.binance.vision";

const binanceSymbol = (a: Asset) => a.replace("/", "");
const coinbaseProduct = (a: Asset) => a.replace("/", "-");
const okxInstId = (a: Asset) => a.replace("/", "-");
const bybitSymbol = (a: Asset) => a.replace("/", "");

// Kraken uses legacy names for BTC and DOGE.
const KRAKEN_PAIRS: Record<string, Asset> = {
  ETHUSDT: "ETH/USDT",
  XBTUSDT: "BTC/USDT",
  SOLUSDT: "SOL/USDT",
  XRPUSDT: "XRP/USDT",
  ADAUSDT: "ADA/USDT",
  XDGUSDT: "DOGE/USDT",
  LINKUSDT: "LINK/USDT",
  AVAXUSDT: "AVAX/USDT",
};

async function fetchJson<T>(url: string, timeoutMs = 6000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json() as Promise<T>;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

function makeQuote(exchange: ExchangeId, asset: Asset, bid: number, ask: number): Quote | null {
  if (bid <= 0 || ask <= 0) return null;
  return { exchange, asset, bid, ask, ts: Date.now() };
}

export async function fetchBinanceQuotes(assets: readonly Asset[]): Promise<Quote[]> {
  const symbols = encodeURIComponent(JSON.stringify(assets.map(binanceSymbol)));
  const rows = await fetchJson<{ symbol: string; bidPrice: string; askPrice: string }[]>(
    `${BINANCE_REST}/api/v3/ticker/bookTicker?symbols=${symbols}`
  );
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  return assets
    .map((a) => {
      const r = bySymbol.get(binanceSymbol(a));
      return r ? makeQuote("binance", a, num(r.bidPrice), num(r.askPrice)) : null;
    })
    .filter((q): q is Quote => q !== null);
}

export async function fetchCoinbaseQuotes(assets: readonly Asset[]): Promise<Quote[]> {
  const results = await Promise.allSettled(
    assets.map((a) =>
      fetchJson<{ bid: string; ask: string }>(
        `https://api.exchange.coinbase.com/products/${coinbaseProduct(a)}/ticker`
      ).then((r) => makeQuote("coinbase", a, num(r.bid), num(r.ask)))
    )
  );
  const quotes = results
    .filter((r): r is PromiseFulfilledResult<Quote | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((q): q is Quote => q !== null);
  if (quotes.length === 0) throw new Error("coinbase: no quotes");
  return quotes;
}

export async function fetchKrakenQuotes(): Promise<Quote[]> {
  const pairs = Object.keys(KRAKEN_PAIRS).join(",");
  const body = await fetchJson<{
    error: string[];
    result: Record<string, { a: string[]; b: string[] }>;
  }>(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`);
  if (body.error?.length) throw new Error(`kraken: ${body.error[0]}`);
  return Object.entries(body.result)
    .map(([key, t]) => {
      const asset = KRAKEN_PAIRS[key];
      return asset ? makeQuote("kraken", asset, num(t.b?.[0]), num(t.a?.[0])) : null;
    })
    .filter((q): q is Quote => q !== null);
}

// Per-symbol queries (like Coinbase) rather than the full spot-ticker
// universe — the all-tickers endpoints weigh ~600KB combined per poll.
export async function fetchOkxQuotes(assets: readonly Asset[]): Promise<Quote[]> {
  const results = await Promise.allSettled(
    assets.map((a) =>
      fetchJson<{ code: string; data: { bidPx: string; askPx: string }[] }>(
        `https://www.okx.com/api/v5/market/ticker?instId=${okxInstId(a)}`
      ).then((body) => {
        if (body.code !== "0" || !body.data?.[0]) return null;
        return makeQuote("okx", a, num(body.data[0].bidPx), num(body.data[0].askPx));
      })
    )
  );
  const quotes = results
    .filter((r): r is PromiseFulfilledResult<Quote | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((q): q is Quote => q !== null);
  if (quotes.length === 0) throw new Error("okx: no quotes");
  return quotes;
}

export async function fetchBybitQuotes(assets: readonly Asset[]): Promise<Quote[]> {
  const results = await Promise.allSettled(
    assets.map((a) =>
      fetchJson<{
        retCode: number;
        result: { list: { bid1Price: string; ask1Price: string }[] };
      }>(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${bybitSymbol(a)}`).then(
        (body) => {
          const d = body.result?.list?.[0];
          if (body.retCode !== 0 || !d) return null;
          return makeQuote("bybit", a, num(d.bid1Price), num(d.ask1Price));
        }
      )
    )
  );
  const quotes = results
    .filter((r): r is PromiseFulfilledResult<Quote | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((q): q is Quote => q !== null);
  if (quotes.length === 0) throw new Error("bybit: no quotes");
  return quotes;
}

export const QUOTE_FETCHERS: Record<ExchangeId, (assets: readonly Asset[]) => Promise<Quote[]>> = {
  binance: fetchBinanceQuotes,
  coinbase: fetchCoinbaseQuotes,
  kraken: () => fetchKrakenQuotes(),
  okx: fetchOkxQuotes,
  bybit: fetchBybitQuotes,
};

export async function fetchBinanceTickers24h(assets: readonly Asset[]): Promise<Ticker24h[]> {
  const symbols = encodeURIComponent(JSON.stringify(assets.map(binanceSymbol)));
  const rows = await fetchJson<
    { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }[]
  >(`${BINANCE_REST}/api/v3/ticker/24hr?symbols=${symbols}`);
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  return assets
    .map((a) => {
      const r = bySymbol.get(binanceSymbol(a));
      if (!r) return null;
      return {
        asset: a,
        lastPrice: num(r.lastPrice),
        changePercent: num(r.priceChangePercent),
        quoteVolume: num(r.quoteVolume),
      };
    })
    .filter((t): t is Ticker24h => t !== null);
}

export interface GlobalStats {
  totalMarketCapUsd: number;
  totalVolumeUsd: number;
  btcDominance: number;
  marketCapChange24h: number;
}

export async function fetchGlobalStats(): Promise<GlobalStats> {
  const body = await fetchJson<{
    data: {
      total_market_cap: { usd: number };
      total_volume: { usd: number };
      market_cap_percentage: { btc: number };
      market_cap_change_percentage_24h_usd: number;
    };
  }>("https://api.coingecko.com/api/v3/global", 8000);
  return {
    totalMarketCapUsd: body.data.total_market_cap.usd,
    totalVolumeUsd: body.data.total_volume.usd,
    btcDominance: body.data.market_cap_percentage.btc,
    marketCapChange24h: body.data.market_cap_change_percentage_24h_usd,
  };
}

// Keyless JSON-RPC endpoints with permissive CORS, tried in order.
const ETH_RPCS = ["https://ethereum-rpc.publicnode.com", "https://1rpc.io/eth"];

export async function fetchGasGwei(): Promise<number> {
  for (const rpc of ETH_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { result?: string };
      if (body.result) {
        const gwei = parseInt(body.result, 16) / 1e9;
        if (Number.isFinite(gwei) && gwei > 0) return gwei;
      }
    } catch {
      // try next RPC
    }
  }
  throw new Error("all ETH RPCs unreachable");
}

export interface Candle {
  ts: number;
  close: number;
  volume: number;
}

export async function fetchBinanceKlines(
  asset: Asset,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const rows = await fetchJson<[number, string, string, string, string, string][]>(
    `${BINANCE_REST}/api/v3/klines?symbol=${binanceSymbol(asset)}&interval=${interval}&limit=${limit}`
  );
  return rows.map((r) => ({ ts: r[0], close: num(r[4]), volume: num(r[5]) }));
}

export async function fetchCoinbaseCandles(asset: Asset, limit: number): Promise<Candle[]> {
  // Returns [time(s), low, high, open, close, volume], newest first.
  const rows = await fetchJson<[number, number, number, number, number, number][]>(
    `https://api.exchange.coinbase.com/products/${coinbaseProduct(asset)}/candles?granularity=60`
  );
  return rows
    .slice(0, limit)
    .reverse()
    .map((r) => ({ ts: r[0] * 1000, close: r[4], volume: r[5] }));
}

export interface MoverRow {
  symbol: string;
  lastPrice: number;
  changePercent: number;
  quoteVolume: number;
}

// Full Binance spot 24h snapshot, filtered to liquid USDT pairs — used for
// the Markets page gainers/losers board.
export async function fetchBinanceMovers(minQuoteVolume = 10_000_000): Promise<MoverRow[]> {
  const rows = await fetchJson<
    { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }[]
  >(`${BINANCE_REST}/api/v3/ticker/24hr`, 10000);
  // No leveraged-token suffix filter: Binance delisted UP/DOWN spot tokens
  // in 2022, and a suffix regex wrongly drops real assets like JUP or SYRUP.
  return rows
    .filter((r) => r.symbol.endsWith("USDT") && num(r.quoteVolume) >= minQuoteVolume)
    .map((r) => ({
      symbol: r.symbol.slice(0, -4),
      lastPrice: num(r.lastPrice),
      changePercent: num(r.priceChangePercent),
      quoteVolume: num(r.quoteVolume),
    }));
}
