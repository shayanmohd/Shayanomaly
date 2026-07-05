<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Solidity-%5E0.8.20-363636?style=for-the-badge&logo=solidity" />
  <img src="https://img.shields.io/badge/Ethers.js-v6-274BE5?style=for-the-badge&logo=ethereum&logoColor=white" />
  <img src="https://img.shields.io/badge/MEV-Flashbots-FFB800?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" />
</p>

<h1 align="center">⚡ Shayanomaly</h1>
<h3 align="center">Web3 Arbitrage & Trading Terminal</h3>

<p align="center">
  <strong>A real-time quantitative trading terminal that runs entirely in your browser.</strong><br/>
  Streams live order books from five exchanges, detects cross-venue arbitrage spreads and market
  anomalies in real time,<br/> tracks on-chain gas — with an optional self-hosted engine for
  MEV-protected flash-loan execution via Flashbots.
</p>

<p align="center">
  <a href="https://shayanmohd.github.io/Shayanomaly/"><strong>🟢 LIVE DEMO — shayanmohd.github.io/Shayanomaly</strong></a>
</p>

<p align="center">
  <a href="https://mohdshayan.com">Website</a> ·
  <a href="https://github.com/shayanmohd">GitHub</a> ·
  <a href="https://linkedin.com/in/shayanmohd">LinkedIn</a> ·
  <a href="https://x.com/mohdshayanX">X / Twitter</a>
</p>

---

## What makes it interesting

The hosted demo is **not a mock**. Open it and you are watching real markets:

- **Live cross-exchange arbitrage** — the browser polls public market-data APIs of
  **Binance, Coinbase, Kraken, OKX and Bybit** every few seconds, normalizes order-book tops
  for 8 major pairs, and computes the best buy/sell route with net profit after taker fees.
- **Real anomaly detection** — consensus price moves, single-venue divergence from the
  5-venue median, whale prints (≥$250K trades via Binance WebSocket), arbitrage windows,
  gas spikes and feed outages stream into a severity-ranked anomaly feed.
- **Live order book & trade tape** — Binance depth (20 levels) and trades over WebSocket.
- **On-chain gas oracle** — `eth_gasPrice` polled from public JSON-RPC endpoints.
- **Zero backend required** — everything above is client-side; the site deploys as a static
  export to GitHub Pages. No accounts, no API keys, no server of its own — the browser talks
  directly to the exchanges' public endpoints.

Trading actions in the hosted demo are **clearly-labeled paper simulations** — no orders are
ever placed. Live execution is only possible in self-hosted full-stack mode.

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          SHAYANOMALY TERMINAL                              │
├──────────────────────────────┬─────────────────────────────────────────────┤
│  STATIC MODE (GitHub Pages)  │  FULL-STACK MODE (self-hosted, optional)    │
│                              │                                             │
│  Next.js 16 static export    │  Node.js backend engine                     │
│  In-browser market engine:   │  · ccxt CEX + Uniswap V3 RPC aggregation    │
│  · 5 exchange REST/WS feeds  │  · EIP-1559 gas oracle w/ profit guard      │
│  · spread & anomaly detector │  · Flashbots bundle execution               │
│  · public JSON-RPC gas       │  · Prisma persistence (anomalies/trades)    │
│  · localStorage history      │  Solidity FlashArb.sol (Aave V3 flash loans)│
└──────────────────────────────┴─────────────────────────────────────────────┘
        zero secrets                   NEXT_PUBLIC_WS_URL switches the
        zero servers                   frontend onto the backend stream
```

| Layer | Responsibility | Stack |
|-------|---------------|-------|
| **Frontend** | High-density terminal UI, real-time charts, order books, wallet auth | Next.js 16, React 19, Tailwind v4, Recharts, RainbowKit, wagmi, viem |
| **In-browser engine** | Polls 5 exchanges' public APIs, computes spreads, detects anomalies, tracks gas | Browser `fetch`/WebSocket, public keyless endpoints |
| **Backend engine** *(optional)* | CEX/DEX aggregation, profitability-guarded Flashbots execution | Node.js, ccxt, ethers v6, `@flashbots/ethers-provider-bundle` |
| **Persistence** | Anomaly + trade history (backend mode); localStorage (static mode) | Prisma 7 + SQLite / browser localStorage |
| **Smart contracts** | Atomic flash-loan arbitrage with zero upfront capital | Solidity ^0.8.20, Aave V3, Hardhat mainnet-fork tests |

## Dashboard Views

| View | Purpose |
|------|---------|
| **Dashboard** | Live dual-venue price chart, trade stream, arbitrage routes, anomaly feed |
| **Markets** | Live global stats (CoinGecko), Binance top gainers/losers, 7-day volume |
| **Scanner** | Cross-venue spread table with filters; notable spreads archived locally |
| **Terminal** | Live Binance order book + trade tape, paper-trading order ticket |
| **Bots** | Strategy sandbox — simulated bots, fills and PnL (clearly labeled) |
| **Settings** | Demo API-key vault (local-only), wallet status, trading preferences |

## Getting Started

### Static mode (what the live demo runs)

```bash
npm install
npm run dev        # http://localhost:3000 — live data, no backend needed
npm run build      # static export to out/
```

### Full-stack mode (optional)

```bash
# 1. Backend engine
cd backend
npm install
cp .env.example .env       # add RPC URL / keys
npx prisma db push && npx prisma generate
npm run dev                # WS :8080, HTTP :8081

# 2. Frontend pointed at the backend
NEXT_PUBLIC_WS_URL=ws://localhost:8080 npm run dev
```

### Smart contract tests (optional)

```bash
cd contracts
npm install
npx hardhat test           # FlashArb.sol against a mainnet fork
```

## Deployment

**GitHub Pages (automatic).** Every push to `main` runs
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): lint → typecheck →
static export → deploy. The workflow bakes in `NEXT_PUBLIC_BASE_PATH=/Shayanomaly`.

**Docker (full-stack).** `docker compose up` builds the standalone server image
(`BUILD_TARGET=node`) together with the backend — see [DEPLOY.md](DEPLOY.md).

## Environment Variables

All optional — the app runs fully on public data with none set. See
[.env.example](.env.example).

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect Cloud ID (enables QR mobile wallets) |
| `NEXT_PUBLIC_WS_URL` | Backend stream URL — switches frontend to full-stack mode |
| `NEXT_PUBLIC_BASE_PATH` | Sub-path when hosted under `/<repo>/` (set by CI) |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for metadata/sitemap |
| `BUILD_TARGET=node` | Produce the standalone server build instead of static export |

## Security Model

- **No secrets in the static build** — the hosted site talks only to public, keyless,
  CORS-enabled market-data endpoints.
- **No private keys in the browser** — wallet connection is read-only via wagmi/RainbowKit;
  signing stays inside the user's wallet.
- **Paper trading everywhere in the demo** — execution buttons simulate and say so.
- **Settings vault is local-only** — anything typed in Settings stays in your browser's
  localStorage and is never transmitted (and the UI warns against real keys anyway).
- **Backend mode keeps keys server-side** — Flashbots bundles bypass the public mempool;
  a gas-aware profitability guard rejects negative-EV executions.

## Project Structure

```
├── src/                      # Next.js frontend (App Router)
│   ├── app/                  # dashboard, markets, scanner, terminal, bots, settings
│   ├── components/           # sidebar, header, charts, tables, feeds
│   ├── hooks/                # Binance trade & depth WebSocket hooks
│   └── lib/
│       ├── exchanges.ts      # public API connectors (5 CEXs, CoinGecko, JSON-RPC)
│       └── market-engine.tsx # in-browser arbitrage & anomaly engine (React context)
├── backend/                  # optional Node engine (ccxt, Flashbots, Prisma)
├── contracts/                # FlashArb.sol + Hardhat mainnet-fork tests
└── .github/workflows/        # GitHub Pages CI/CD
```

## Disclaimer

This software is for **educational and research purposes only**. Nothing here is financial
advice. Do not deploy the contracts or connect wallets holding real funds without a
professional security audit. High-frequency trading and smart-contract execution carry
significant financial risk.

---

<p align="center">
  Made with 🩵 by <a href="https://mohdshayan.com"><strong>Mohd Shayan</strong></a>
</p>

<p align="center">
  <a href="https://shayanmohd.github.io/Shayanomaly/">🟢 Live Demo</a> ·
  <a href="https://mohdshayan.com">🌐 Website</a> ·
  <a href="https://github.com/shayanmohd">GitHub</a> ·
  <a href="https://linkedin.com/in/shayanmohd">LinkedIn</a> ·
  <a href="https://x.com/mohdshayanX">X</a>
</p>

<p align="center">
  &copy; 2025–2026 Mohd Shayan. All rights reserved.
</p>
