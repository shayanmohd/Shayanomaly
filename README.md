<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/Node.js-ESM-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Solidity-%5E0.8.20-363636?style=for-the-badge&logo=solidity" />
  <img src="https://img.shields.io/badge/Ethers.js-v6-274BE5?style=for-the-badge&logo=ethereum&logoColor=white" />
  <img src="https://img.shields.io/badge/Prisma-7.x-2D3748?style=for-the-badge&logo=prisma&logoColor=white" />
  <img src="https://img.shields.io/badge/MEV-Flashbots-FFB800?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" />
</p>

<h1 align="center">⚡ Shayanomaly</h1>
<h3 align="center">Web3 Arbitrage & Trading Terminal</h3>

<p align="center">
  <strong>An institutional-grade, real-time quantitative trading dashboard and execution engine.</strong><br/>
  Aggregates live CEX & DEX order books, detects cross-exchange arbitrage anomalies with a dynamic gas oracle,<br/>
  and executes MEV-protected atomic flash loans via Flashbots — all from a single terminal UI.
</p>

<p align="center">
  <a href="https://mohdshayan.com">Website</a> · 
  <a href="https://github.com/shayanmohd">GitHub</a> · 
  <a href="https://linkedin.com/in/shayanmohd">LinkedIn</a> · 
  <a href="https://x.com/mohdshayanX">X / Twitter</a>
</p>

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         SHAYANOMALY TERMINAL                             │
├──────────────┬───────────────────────────────────┬───────────────────────┤
│  Frontend    │  Backend Engine                    │  Smart Contracts      │
│  Next.js 16  │  Node.js · Express · WebSocket     │  Hardhat · Solidity   │
│  Tailwind v4 │  ccxt · Uniswap V3 RPC             │  Aave V3 Flash Loans  │
│  Recharts    │  EIP-1559 Gas Oracle                │  FlashArb.sol         │
│  RainbowKit  │  Prisma · SQLite                    │  Mainnet Fork Tests   │
│  wagmi/viem  │  Flashbots Bundle Provider          │                       │
└──────────────┴───────────────────────────────────┴───────────────────────┘
         │                     │                              │
    Port 3000             Port 8080/8081                  Hardhat Node
    (App Router)       (WS + REST API)                 (Mainnet Fork)
```

The system bridges **off-chain quantitative analysis** with **on-chain atomic execution**, designed around three principles: low latency, MEV resistance, and data persistence.

| Layer | Responsibility | Stack |
|-------|---------------|-------|
| **Frontend** | High-density dark-mode terminal UI with real-time WebSocket streaming, interactive charting, order books, and secure Web3 wallet auth | Next.js 16, Tailwind CSS v4, Recharts, RainbowKit, wagmi, viem |
| **Arbitrage Engine** | Polls and normalizes order books from CEXs (Binance, Kraken, Coinbase) and DEXs (Uniswap V3 via RPC). Computes cross-exchange spreads in real time | Node.js ESM, ccxt, ethers v6, WebSocket |
| **Gas Oracle** | EIP-1559 aware fee estimation with cached refresh. Validates net profitability before any execution is permitted | ethers `getFeeData()`, 15s TTL cache |
| **Execution Layer** | Bypasses public mempool — bundles are simulated and submitted directly to block builders via Flashbots | `@flashbots/ethers-provider-bundle` |
| **Data Persistence** | Historical anomaly logs and trade executions stored for backtesting and ML model training | Prisma 7.x, SQLite, better-sqlite3 |
| **Smart Contracts** | Atomic flash loan arbitrage across DEX pools with zero upfront capital | Solidity ^0.8.20, Aave V3, Hardhat |

---

## Core Features

### Real-Time Multi-Exchange Aggregation
Normalizes order book data across REST APIs (CEX) and on-chain smart contracts (DEX) into a unified data model. Live price feeds stream over WebSocket at sub-second latency.

### Dynamic Gas Oracle with Profitability Guard
Every detected spread is passed through a mathematical profitability filter before execution. The oracle fetches real-time EIP-1559 base fees, estimates gas costs in USD, and **rejects any opportunity where net profit ≤ 0** — preventing wasted gas on unprofitable trades.

### Flashbots MEV Protection
Arbitrage transactions never touch the public Ethereum mempool. Bundles are:
1. **Constructed** with EIP-1559 gas parameters
2. **Signed** via `FlashbotsBundleProvider.signBundle()`
3. **Simulated** against the target block
4. **Submitted** directly to block builders via `sendRawBundle()`

This eliminates front-running and sandwich attack vectors entirely.

### Secure-by-Design Execution
Zero private keys are exposed to the browser. All signing and execution logic runs exclusively on the backend. The frontend uses RainbowKit/wagmi for read-only wallet state — no sensitive data ever leaves the server.

### 6 Specialized Dashboard Views
| View | Purpose |
|------|---------|
| **Dashboard** | Live price chart, order book, arbitrage table, anomaly feed |
| **Markets** | Aggregated market overview with 24h change tracking |
| **Scanner** | Historical + live anomaly detection with filtering and persistence |
| **Terminal** | Raw trade tape with real-time execution data |
| **Bots** | Bot deployment, status monitoring, activity logs with sparklines |
| **Settings** | Exchange API config, wallet status (wagmi), trading preferences |

---

## Tech Stack

```
Frontend        Next.js 16.1.6 · React 19 · Tailwind CSS v4 · Recharts 3.x
Auth            RainbowKit 2.x · wagmi 2.x · viem 2.x · @tanstack/react-query
Backend         Node.js ESM · Express 5 · WebSocket (ws)
Exchange Data   ccxt 4.x (Binance, Kraken, Coinbase) · Uniswap V3 RPC
Blockchain      ethers v6 · @flashbots/ethers-provider-bundle
Database        Prisma 7.x · SQLite · better-sqlite3
Smart Contracts Solidity ^0.8.20 · Hardhat 2.x · Aave V3 Flash Loans
Testing         Hardhat mainnet fork · 9/9 integration tests passing
```

---

## Getting Started

You need **three terminal sessions** — one each for the backend engine, frontend UI, and (optionally) the smart contract test suite.

### 1. Backend Engine

```bash
cd backend
npm install

# Configure environment
cp .env.example .env   # Then edit with your keys

# Initialize database
npx prisma db push
npx prisma generate

# Start engine (HTTP :8081 + WS :8080)
npm run dev
```

### 2. Frontend UI

```bash
# From project root
npm install
npm run dev
```

Open **http://localhost:3000** to access the terminal.

### 3. Smart Contract Tests (Optional)

Run the flash loan integration suite against a local Ethereum mainnet fork:

```bash
cd contracts
npm install
npx hardhat test
```

All 9 integration tests validate FlashArb.sol against real Uniswap V3 liquidity.

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Ethereum RPC — defaults to https://eth.llamarpc.com if omitted
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# Trading wallet private key (required for live Flashbots execution)
# Leave as placeholder for simulation-only mode
ETH_PRIVATE_KEY=your_private_key

# Deployed FlashArb.sol contract address
FLASH_ARB_ADDRESS=0x...

# SQLite database path
DATABASE_URL="file:./dev.db"
```

> **Note:** Without a valid `ETH_PRIVATE_KEY`, the execution endpoint gracefully falls back to simulation mode — no real transactions are submitted.

---

## Project Structure

```
shayanomaly/
├── src/                    # Next.js frontend (App Router)
│   ├── app/                # Route pages (dashboard, markets, scanner, terminal, bots, settings)
│   ├── components/         # Reusable UI components (sidebar, header, footer, charts, tables)
│   ├── hooks/              # WebSocket hooks (Binance, arbitrage engine)
│   └── lib/                # Types, mock data, utilities
├── backend/
│   ├── src/
│   │   ├── server.ts       # Express + WebSocket + Flashbots execution
│   │   ├── engine.ts       # Arbitrage detection engine + gas oracle
│   │   └── types.ts        # Shared type definitions
│   └── prisma/
│       └── schema.prisma   # AnomalyLog + TradeExecution models
├── contracts/
│   ├── contracts/
│   │   └── FlashArb.sol    # Aave V3 flash loan arbitrage contract
│   └── test/               # Mainnet fork integration tests
└── README.md
```

---

## Security Considerations

- **No private keys in the browser** — all signing happens server-side
- **Flashbots private transactions** — bundles never enter the public mempool
- **Gas profitability guard** — prevents execution of unprofitable trades
- **wagmi read-only wallet** — frontend only reads wallet state, never signs
- **Simulation fallback** — defaults to dry-run mode without configured keys

---

## Disclaimer

This software is for **educational and research purposes only**. Do not deploy smart contracts or connect wallets with real funds to Ethereum mainnet without a professional security audit. High-frequency trading and smart contract execution carry significant financial risk.

---

<p align="center">
  Made with 🩵 by <a href="https://mohdshayan.com"><strong>Mohd Shayan</strong></a>
</p>

<p align="center">
  <a href="https://mohdshayan.com">🌐 Website</a> · 
  <a href="https://github.com/shayanmohd">GitHub</a> · 
  <a href="https://linkedin.com/in/shayanmohd">LinkedIn</a> · 
  <a href="https://x.com/mohdshayanX">X</a>
</p>

<p align="center">
  &copy; 2025 Mohd Shayan. All rights reserved.
</p>
