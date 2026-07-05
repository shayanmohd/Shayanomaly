import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/sidebar";
import Footer from "@/components/footer";
import Web3Provider from "@/components/providers";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://shayanmohd.github.io/Shayanomaly";

const TITLE = "Shayanomaly — Web3 Arbitrage & Trading Terminal";
const DESCRIPTION =
  "Real-time Web3 trading terminal: live cross-exchange arbitrage detection across Binance, Coinbase, Kraken, OKX & Bybit, anomaly feed, on-chain gas oracle and order-book streaming — running entirely in your browser.";

export const metadata: Metadata = {
  // Origin only — Next.js already prefixes file-convention metadata
  // (opengraph-image etc.) with basePath, so including it here would
  // double it: /Shayanomaly/Shayanomaly/opengraph-image.png.
  metadataBase: new URL(new URL(SITE_URL).origin),
  title: {
    default: TITLE,
    template: "%s · Shayanomaly",
  },
  description: DESCRIPTION,
  applicationName: "Shayanomaly",
  authors: [{ name: "Mohd Shayan", url: "https://mohdshayan.com" }],
  creator: "Mohd Shayan",
  keywords: [
    "web3",
    "arbitrage",
    "trading terminal",
    "crypto",
    "cross-exchange",
    "order book",
    "MEV",
    "flash loans",
    "DeFi",
    "market anomaly detection",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Shayanomaly",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    creator: "@mohdshayanX",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistMono.variable} antialiased`}>
        <Web3Provider>
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              {children}
              <Footer />
            </div>
          </div>
        </Web3Provider>
      </body>
    </html>
  );
}
