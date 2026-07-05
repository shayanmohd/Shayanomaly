"use client";

import { ReactNode, useSyncExternalStore } from "react";
import { WagmiProvider, http } from "wagmi";
import { mainnet, arbitrum } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { MarketDataProvider } from "@/lib/market-engine";

// Without a WalletConnect Cloud project ID (repo variable NEXT_PUBLIC_WC_PROJECT_ID),
// QR-based mobile wallets are unavailable but injected wallets (MetaMask, Rabby,
// Coinbase extension) work normally.
const config = getDefaultConfig({
  appName: "Shayanomaly",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "SHAYANOMALY_DEMO",
  chains: [mainnet, arbitrum],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

const rbTheme = darkTheme({
  accentColor: "#6366f1",
  accentColorForeground: "#ffffff",
  borderRadius: "medium",
  overlayBlur: "small",
});

rbTheme.colors.modalBackground = "#0f1117";
rbTheme.colors.profileForeground = "#0f1117";
rbTheme.colors.connectButtonBackground = "#0f1117";
rbTheme.colors.connectButtonInnerBackground = "#09090b";
rbTheme.fonts.body = "var(--font-geist-mono), monospace";

const emptySubscribe = () => () => {};

export default function Web3Provider({ children }: { children: ReactNode }) {
  // Hydration gate: false during prerender/hydration, true right after —
  // wagmi/RainbowKit touch browser-only APIs so the tree renders client-side.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rbTheme} modalSize="compact">
          <MarketDataProvider>{children}</MarketDataProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
