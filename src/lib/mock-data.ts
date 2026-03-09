import type {
  ArbitrageOpportunity,
  AnomalyEvent,
  ChartDataPoint,
  GlobalMarketStats,
} from "./types";

const EXCHANGES_CEX = [
  "Binance",
  "Coinbase",
  "Kraken",
  "OKX",
  "Bybit",
  "KuCoin",
  "Gate.io",
  "Bitfinex",
];

const EXCHANGES_DEX = [
  "Uniswap V3",
  "SushiSwap",
  "PancakeSwap",
  "Curve",
  "dYdX",
  "1inch",
];

const ASSETS = [
  "ETH/USDT",
  "BTC/USDT",
  "SOL/USDT",
  "ARB/USDT",
  "MATIC/USDT",
  "AVAX/USDT",
  "LINK/USDT",
  "UNI/USDT",
  "AAVE/USDT",
  "OP/USDT",
  "APT/USDT",
  "DOGE/USDT",
];

const BASE_PRICES: Record<string, number> = {
  "ETH/USDT": 3845.2,
  "BTC/USDT": 97250.0,
  "SOL/USDT": 187.45,
  "ARB/USDT": 1.82,
  "MATIC/USDT": 0.89,
  "AVAX/USDT": 42.15,
  "LINK/USDT": 19.87,
  "UNI/USDT": 12.45,
  "AAVE/USDT": 285.3,
  "OP/USDT": 3.42,
  "APT/USDT": 11.78,
  "DOGE/USDT": 0.178,
};

function jitter(base: number, maxPercent: number): number {
  const factor = 1 + (Math.random() - 0.5) * 2 * (maxPercent / 100);
  return parseFloat((base * factor).toFixed(base < 1 ? 5 : 2));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let arbIdCounter = 0;

export function generateArbitrageOpportunities(
  count: number = 12
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (let i = 0; i < count; i++) {
    const asset = ASSETS[i % ASSETS.length];
    const base = BASE_PRICES[asset];
    const buyPrice = jitter(base, 0.8);
    const spreadPercent = 0.15 + Math.random() * 2.5;
    const sellPrice = parseFloat(
      (buyPrice * (1 + spreadPercent / 100)).toFixed(base < 1 ? 5 : 2)
    );

    const allExchanges = [...EXCHANGES_CEX, ...EXCHANGES_DEX];
    const buyExchange = pickRandom(allExchanges);
    let sellExchange = pickRandom(allExchanges);
    while (sellExchange === buyExchange) {
      sellExchange = pickRandom(allExchanges);
    }

    opportunities.push({
      id: `arb-${++arbIdCounter}`,
      asset,
      buyExchange,
      buyPrice,
      sellExchange,
      sellPrice,
      spreadPercent: parseFloat(spreadPercent.toFixed(3)),
      volume: parseFloat((Math.random() * 5000000 + 50000).toFixed(0)),
      timestamp: Date.now() - Math.floor(Math.random() * 60000),
    });
  }

  return opportunities.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

const ANOMALY_TEMPLATES: Array<{
  severity: AnomalyEvent["severity"];
  template: (asset: string, exchange: string) => string;
}> = [
  {
    severity: "critical",
    template: (a, e) =>
      `[ALERT] ${a} volume spike 500% on ${e} — possible whale activity`,
  },
  {
    severity: "critical",
    template: (a, e) =>
      `[ALERT] ${a} flash crash -8.2% in 30s on ${e}`,
  },
  {
    severity: "warning",
    template: (a, e) =>
      `[WARN] ${a} spread widening to 2.4% between ${e} and Binance`,
  },
  {
    severity: "warning",
    template: (a, e) =>
      `[WARN] Unusual order book depth shift for ${a} on ${e}`,
  },
  {
    severity: "info",
    template: (a, e) =>
      `[INFO] ${a} new ATH detected on ${e} — $${(Math.random() * 5000 + 100).toFixed(2)}`,
  },
  {
    severity: "info",
    template: (a, e) =>
      `[INFO] Large transfer: ${(Math.random() * 10000 + 500).toFixed(0)} ${a.split("/")[0]} moved to ${e}`,
  },
  {
    severity: "critical",
    template: (a, e) =>
      `[ALERT] Liquidity drain detected: ${a} pool on ${e} — TVL down 34%`,
  },
  {
    severity: "warning",
    template: (a, e) =>
      `[WARN] ${a} funding rate anomaly on ${e} — 0.15% (3x normal)`,
  },
  {
    severity: "info",
    template: (a, e) =>
      `[INFO] MEV bot activity detected on ${a} pair — ${e}`,
  },
  {
    severity: "critical",
    template: (a, e) =>
      `[ALERT] ${a} depeg risk — price divergence >3% across ${e} and 4 other venues`,
  },
];

let anomalyIdCounter = 0;

export function generateAnomaly(): AnomalyEvent {
  const asset = pickRandom(ASSETS);
  const exchange = pickRandom([...EXCHANGES_CEX, ...EXCHANGES_DEX]);
  const template = pickRandom(ANOMALY_TEMPLATES);

  return {
    id: `anomaly-${++anomalyIdCounter}`,
    severity: template.severity,
    message: template.template(asset, exchange),
    asset,
    exchange,
    timestamp: Date.now(),
  };
}

export function generateInitialAnomalies(count: number = 20): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  for (let i = 0; i < count; i++) {
    const event = generateAnomaly();
    event.timestamp = Date.now() - (count - i) * 3000;
    events.push(event);
  }
  return events;
}

export function generateChartHistory(points: number = 60): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];
  const now = Date.now();
  let binancePrice = 3845;
  let coinbasePrice = 3848;

  for (let i = 0; i < points; i++) {
    binancePrice += (Math.random() - 0.48) * 8;
    coinbasePrice += (Math.random() - 0.48) * 8;

    binancePrice = Math.max(3700, Math.min(4000, binancePrice));
    coinbasePrice = Math.max(3700, Math.min(4000, coinbasePrice));

    const time = new Date(now - (points - i) * 5000);
    const timeStr = time.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    data.push({
      time: timeStr,
      binance: parseFloat(binancePrice.toFixed(2)),
      coinbase: parseFloat(coinbasePrice.toFixed(2)),
      volume: parseFloat((Math.random() * 500 + 100).toFixed(0)),
    });
  }

  return data;
}

export function generateGlobalStats(): GlobalMarketStats {
  return {
    totalVolume24h: parseFloat(
      (Math.random() * 50 + 80).toFixed(1)
    ),
    ethGasGwei: parseFloat((Math.random() * 30 + 15).toFixed(1)),
    btcDominance: parseFloat((Math.random() * 5 + 52).toFixed(1)),
    activeArbitrages: Math.floor(Math.random() * 15 + 5),
    connectedExchanges: 14,
  };
}
