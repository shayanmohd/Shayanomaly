/** Message types sent from backend WS to frontend clients */

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
  netProfit?: number;
  estimatedGas?: number;
}

export interface WSMessage {
  type: "arbitrage_update" | "anomaly";
  data: ArbitrageOpportunity[] | AnomalyEvent;
}
