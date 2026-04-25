"use client";

import { useState, useCallback } from "react";
import { useBinanceWs } from "@/hooks/use-binance-ws";
import { useArbitrageWs } from "@/hooks/use-arbitrage-ws";
import Header from "@/components/header";
import PriceChart from "@/components/price-chart";
import ArbitrageTable from "@/components/arbitrage-table";
import AnomalyFeed from "@/components/anomaly-feed";
import LiveTicker from "@/components/live-ticker";

function pairToSymbol(pair: string) {
  return pair.replace("/", "").toLowerCase();
}

export default function Home() {
  const [selectedAsset, setSelectedAsset] = useState("ETH/USDT");

  const binanceSymbol = pairToSymbol(selectedAsset);
  const { lastPrice, prevPrice, connected } = useBinanceWs(binanceSymbol);
  const { opportunities, anomalies, connected: arbConnected, useMock } = useArbitrageWs();

  const handleRowClick = useCallback((asset: string) => setSelectedAsset(asset), []);

  return (
    <>
      <Header wsConnected={connected} livePrice={lastPrice} prevPrice={prevPrice} />

      <main className="flex-1 overflow-auto p-3 lg:p-4">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 lg:gap-4 h-full grid-rows-[minmax(280px,1fr)_minmax(300px,1.2fr)]">
          <div className="xl:col-span-2 min-h-[280px]">
            <PriceChart livePrice={lastPrice} selectedAsset={selectedAsset} />
          </div>
          <div className="min-h-[280px]">
            <LiveTicker symbol={binanceSymbol} selectedAsset={selectedAsset} />
          </div>

          <div className="xl:col-span-2 min-h-[300px]">
            <ArbitrageTable
              opportunities={opportunities}
              backendConnected={arbConnected || useMock}
              selectedAsset={selectedAsset}
              onRowClick={handleRowClick}
            />
          </div>
          <div className="min-h-[300px]">
            <AnomalyFeed events={anomalies} backendConnected={arbConnected || useMock} />
          </div>
        </div>
      </main>
    </>
  );
}
