import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/sidebar";
import Footer from "@/components/footer";
import Web3Provider from "@/components/providers";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shayanomaly — Web3 Arbitrage & Trading Terminal",
  description:
    "Institutional-grade Web3 trading terminal for real-time CEX/DEX arbitrage detection, MEV-protected execution, and multi-exchange order book aggregation.",
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
