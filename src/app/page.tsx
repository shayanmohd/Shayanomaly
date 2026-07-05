"use client";

import { useState, useCallback } from "react";
import { useBinanceWs } from "@/hooks/use-binance-ws";
import { useMarketData } from "@/lib/market-engine";
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
  const { opportunities, anomalies, live } = useMarketData();

  const handleRowClick = useCallback((asset: string) => setSelectedAsset(asset), []);

  return (
    <>
      <Header wsConnected={connected} livePrice={lastPrice} prevPrice={prevPrice} selectedAsset={selectedAsset} />

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
              live={live}
              selectedAsset={selectedAsset}
              onRowClick={handleRowClick}
            />
          </div>
          <div className="min-h-[300px]">
            <AnomalyFeed events={anomalies} live={live} />
          </div>
        </div>
      </main>
    </>
  );
}
