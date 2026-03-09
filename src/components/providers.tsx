"use client";

import { ReactNode } from "react";
import { WagmiProvider, http } from "wagmi";
import { mainnet, arbitrum } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

/* ── Wagmi config ─────────────────────────────────────────── */
const config = getDefaultConfig({
  appName: "W3 Terminal",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [mainnet, arbitrum],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
  },
  ssr: true,
});

/* ── React Query client (singleton) ──────────────────────── */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

/* ── RainbowKit dark theme tuned to our palette ──────────── */
const rbTheme = darkTheme({
  accentColor: "#00ff9d",
  accentColorForeground: "#0a0e14",
  borderRadius: "medium",
  overlayBlur: "small",
});

// Override specific tokens to match our deep-dark aesthetic
rbTheme.colors.modalBackground = "#111923";
rbTheme.colors.profileForeground = "#111923";
rbTheme.colors.connectButtonBackground = "#111923";
rbTheme.colors.connectButtonInnerBackground = "#0a0e14";
rbTheme.fonts.body = "var(--font-geist-mono), monospace";

/* ── Provider tree ────────────────────────────────────────── */
export default function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rbTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
