export interface TickerData {
  symbol: string;
  price: number;
  volume24h: number;
  change24h: number;
  exchange: string;
  timestamp: number;
}

export interface ArbitrageOpportunity {
  id: string;
  asset: string;
  buyExchange: string;
  buyPrice: number;
  sellExchange: string;
  sellPrice: number;
  spreadPercent: number;
  volume: number;
  timestamp: number;
  netProfit?: number;
  estimatedGas?: number;
}

export interface AnomalyEvent {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  asset: string;
  exchange: string;
  timestamp: number;
}

export interface ChartDataPoint {
  time: string;
  binance: number;
  coinbase: number;
  volume: number;
}

export interface GlobalMarketStats {
  totalVolume24h: number;
  ethGasGwei: number;
  btcDominance: number;
  activeArbitrages: number;
  connectedExchanges: number;
}
