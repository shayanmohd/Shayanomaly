import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { JsonRpcProvider, Wallet, parseUnits, formatEther, Contract } from "ethers";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { startEngine, onUpdate, getLatestOpportunities } from "./engine.js";
import type { ArbitrageOpportunity, AnomalyEvent, WSMessage } from "./types.js";
import prisma from "./lib/prisma.js";

// ── Flashbots / Ethers Setup ────────────────────────────────────────────────
const ETH_RPC_URL = process.env.ETH_RPC_URL || "https://eth.llamarpc.com";
const FLASHBOTS_RELAY = "https://relay.flashbots.net";

// FlashArb contract ABI (the function we call on-chain)
const FLASH_ARB_ABI = [
  "function requestFlashLoan(address asset, uint256 amount, address intermediateToken, uint24 feeA, uint24 feeB, uint256 minProfit) external",
];

// Token addresses on Ethereum Mainnet
const TOKEN_ADDRESSES: Record<string, string> = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
};

let mainnetProvider: JsonRpcProvider | null = null;
let tradingWallet: Wallet | null = null;
let flashbotsProvider: FlashbotsBundleProvider | null = null;

/** Lazy-init Flashbots provider + wallets. Returns true if ready. */
async function ensureFlashbotsReady(): Promise<boolean> {
  if (flashbotsProvider) return true;

  const privKey = process.env.ETH_PRIVATE_KEY;
  if (!privKey || privKey === "your_eth_private_key_here") {
    console.warn("[flashbots] ETH_PRIVATE_KEY not configured — bundle submission disabled");
    return false;
  }

  try {
    mainnetProvider = new JsonRpcProvider(ETH_RPC_URL, 1, { staticNetwork: true });
    tradingWallet = new Wallet(privKey, mainnetProvider);

    // Auth signer for Flashbots reputation — random wallet, doesn't need funds
    const authSigner = Wallet.createRandom(mainnetProvider);

    flashbotsProvider = await FlashbotsBundleProvider.create(
      mainnetProvider,
      authSigner,
      FLASHBOTS_RELAY
    );

    console.log("[flashbots] ✓ Provider initialized");
    console.log(`[flashbots]   RPC:     ${ETH_RPC_URL}`);
    console.log(`[flashbots]   Relay:   ${FLASHBOTS_RELAY}`);
    console.log(`[flashbots]   Wallet:  ${tradingWallet.address}`);
    console.log(`[flashbots]   Auth:    ${authSigner.address}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[flashbots] Init failed: ${msg}`);
    flashbotsProvider = null;
    return false;
  }
}

// ── HTTP Server (health check + CORS + JSON) ───────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Execution endpoint ──────────────────────────────────────────────────────

interface ExecuteRequest {
  asset: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
}

const ALLOWED_ASSETS = new Set([
  "ETH/USDT",
  "BTC/USDT",
  "SOL/USDT",
  "ETH/USDC",
]);

function validateExecutePayload(
  body: unknown
): { ok: true; data: ExecuteRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.asset !== "string" || !ALLOWED_ASSETS.has(b.asset)) {
    return { ok: false, error: `Invalid asset. Allowed: ${[...ALLOWED_ASSETS].join(", ")}` };
  }
  if (typeof b.buyExchange !== "string" || b.buyExchange.length === 0 || b.buyExchange.length > 50) {
    return { ok: false, error: "Invalid buyExchange" };
  }
  if (typeof b.sellExchange !== "string" || b.sellExchange.length === 0 || b.sellExchange.length > 50) {
    return { ok: false, error: "Invalid sellExchange" };
  }
  if (typeof b.buyPrice !== "number" || !isFinite(b.buyPrice) || b.buyPrice <= 0) {
    return { ok: false, error: "Invalid buyPrice" };
  }
  if (typeof b.sellPrice !== "number" || !isFinite(b.sellPrice) || b.sellPrice <= 0) {
    return { ok: false, error: "Invalid sellPrice" };
  }
  if (typeof b.spreadPercent !== "number" || !isFinite(b.spreadPercent)) {
    return { ok: false, error: "Invalid spreadPercent" };
  }

  return {
    ok: true,
    data: {
      asset: b.asset,
      buyExchange: b.buyExchange,
      sellExchange: b.sellExchange,
      buyPrice: b.buyPrice,
      sellPrice: b.sellPrice,
      spreadPercent: b.spreadPercent,
    },
  };
}

const STALE_SPREAD_TOLERANCE = 0.5; // percent drift allowed from latest data

/** Build a mock FlashArb.sol calldata for the bundle transaction */
function buildFlashArbTx(
  req: ExecuteRequest,
  match: ArbitrageOpportunity
): { to: string; data: string; value: string } {
  const flashArbAddress = process.env.FLASH_ARB_ADDRESS || "0x0000000000000000000000000000000000000000";
  const flashArb = new Contract(flashArbAddress, FLASH_ARB_ABI);

  // Determine base asset (the stablecoin being borrowed)
  const baseSymbol = req.asset.split("/")[1]; // e.g. "USDT" from "ETH/USDT"
  const baseToken = TOKEN_ADDRESSES[baseSymbol] || TOKEN_ADDRESSES.USDC;
  const intermediateToken = TOKEN_ADDRESSES.WETH;

  // Borrow $10,000 worth — scaled to the token's decimals (6 for USDC/USDT)
  const borrowAmount = parseUnits("10000", 6);
  // Min profit: require at least $1 net after gas
  const minProfit = parseUnits("1", 6);

  const data = flashArb.interface.encodeFunctionData("requestFlashLoan", [
    baseToken,        // asset to flash-borrow
    borrowAmount,     // borrow amount
    intermediateToken,// swap through WETH
    500,              // fee tier A (0.05%)
    3000,             // fee tier B (0.30%)
    minProfit,        // revert if profit < this
  ]);

  return {
    to: flashArbAddress,
    data,
    value: "0",
  };
}

app.post("/api/execute", async (req, res) => {
  const validation = validateExecutePayload(req.body);

  if (!validation.ok) {
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  const execReq = validation.data;
  const orderId = `W3T-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const steps: string[] = [];

  console.log(
    `\n[exec] ═══════════════════════════════════════════════════════════`
  );
  console.log(
    `[exec] Execution request: ${execReq.asset} | ${execReq.buyExchange}→${execReq.sellExchange} | ${execReq.spreadPercent.toFixed(3)}%`
  );

  try {
    // ── Step 1: Validate spread is still live ────────────────────────────
    steps.push(`[${orderId}] Validating spread for ${execReq.asset}...`);
    console.log(`[exec] Step 1: Validating spread against live engine data...`);

    const latestOpps = getLatestOpportunities();
    const match = latestOpps.find(
      (o) =>
        o.asset === execReq.asset &&
        o.buyExchange === execReq.buyExchange &&
        o.sellExchange === execReq.sellExchange
    );

    if (!match) {
      steps.push(`[${orderId}] ✗ Opportunity no longer found in live data`);
      console.log(`[exec] ✗ ABORTED — spread no longer exists in live data`);

      persistTradeExecution(execReq.asset, orderId, 0, "FAILED");
      res.status(409).json({
        success: false,
        orderId,
        error: "Spread no longer found",
        steps,
      });
      return;
    }

    const drift = Math.abs(match.spreadPercent - execReq.spreadPercent);
    if (drift > STALE_SPREAD_TOLERANCE) {
      steps.push(
        `[${orderId}] ✗ Spread drifted too far: requested ${execReq.spreadPercent.toFixed(3)}%, current ${match.spreadPercent.toFixed(3)}%`
      );
      console.log(
        `[exec] ✗ ABORTED — spread drift ${drift.toFixed(3)}% exceeds tolerance ${STALE_SPREAD_TOLERANCE}%`
      );

      persistTradeExecution(execReq.asset, orderId, match.spreadPercent, "FAILED");
      res.status(409).json({
        success: false,
        orderId,
        error: `Spread drifted: now ${match.spreadPercent.toFixed(3)}%`,
        steps,
      });
      return;
    }

    steps.push(`[${orderId}] ✓ Spread confirmed: ${match.spreadPercent.toFixed(3)}%`);
    console.log(`[exec] ✓ Spread confirmed at ${match.spreadPercent.toFixed(3)}%`);

    // ── Step 2: Initialize Flashbots ─────────────────────────────────────
    console.log(`[exec] Step 2: Initializing Flashbots provider...`);
    const fbReady = await ensureFlashbotsReady();

    if (!fbReady || !flashbotsProvider || !tradingWallet || !mainnetProvider) {
      steps.push(`[${orderId}] ✗ Flashbots provider not available (ETH_PRIVATE_KEY not set)`);
      console.log(`[exec] ✗ Flashbots not available — falling back to simulation`);

      // Graceful fallback: simulate execution for demo purposes
      steps.push(`[${orderId}] ⚡ Running in simulation mode (no real tx)`);
      await new Promise((r) => setTimeout(r, 300));
      const profit = match.sellPrice - match.buyPrice;
      steps.push(
        `[${orderId}] ✓ Simulated execution | Spread: ${match.spreadPercent.toFixed(3)}% | Est. profit: $${profit.toFixed(2)}/unit`
      );

      persistTradeExecution(execReq.asset, orderId, match.spreadPercent, "SIMULATED");

      res.json({
        success: true,
        orderId,
        steps,
        executedSpread: match.spreadPercent,
        mode: "simulation",
      });
      return;
    }

    steps.push(`[${orderId}] ✓ Flashbots provider ready`);
    console.log(`[exec] ✓ Flashbots provider ready — wallet ${tradingWallet.address}`);

    // ── Step 3: Build the FlashArb transaction ───────────────────────────
    console.log(`[exec] Step 3: Building FlashArb transaction...`);
    const txPayload = buildFlashArbTx(execReq, match);

    const blockNumber = await mainnetProvider.getBlockNumber();
    const targetBlock = blockNumber + 1;
    console.log(`[exec]   Current block: ${blockNumber} → targeting block ${targetBlock}`);

    // Build the signed transaction with EIP-1559 gas params
    const feeData = await mainnetProvider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas ?? parseUnits("50", "gwei");
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? parseUnits("3", "gwei");

    const nonce = await tradingWallet.getNonce();

    const signedTx = {
      signer: tradingWallet,
      transaction: {
        to: txPayload.to,
        data: txPayload.data,
        value: 0,
        gasLimit: 400000,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce,
        chainId: 1,
        type: 2,
      },
    };

    const bundle = [signedTx];
    steps.push(`[${orderId}] ✓ Bundle built (1 tx, target block ${targetBlock})`);
    console.log(`[exec]   Gas: maxFee=${formatEther(maxFeePerGas)} ETH/gas, priority=${formatEther(maxPriorityFeePerGas)} ETH/gas`);

    // ── Step 4: Simulate the bundle ──────────────────────────────────────
    console.log(`[exec] Step 4: Signing & simulating bundle against block ${targetBlock}...`);
    steps.push(`[${orderId}] Simulating bundle on Flashbots relay...`);

    const signedBundle = await flashbotsProvider.signBundle(bundle);
    const simulation = await flashbotsProvider.simulate(signedBundle, targetBlock);

    if ("error" in simulation) {
      const simError = (simulation as { error: { message: string } }).error.message;
      steps.push(`[${orderId}] ✗ Simulation FAILED: ${simError}`);
      console.log(`[exec] ✗ SIMULATION FAILED: ${simError}`);
      console.log(`[exec] ═══════════════════════════════════════════════════════════\n`);

      persistTradeExecution(execReq.asset, orderId, match.spreadPercent, "SIM_FAILED");

      res.status(400).json({
        success: false,
        orderId,
        error: `Bundle simulation failed: ${simError}`,
        steps,
      });
      return;
    }

    // Check if any tx in the bundle reverted
    const simResult = simulation as {
      totalGasUsed: number;
      bundleGasPrice: bigint;
      results: Array<{ txHash: string; gasUsed: number; error?: string }>;
      firstRevert?: { txHash: string; revert: string };
    };

    if (simResult.firstRevert) {
      steps.push(`[${orderId}] ✗ Bundle reverted: ${simResult.firstRevert.revert}`);
      console.log(`[exec] ✗ BUNDLE REVERTED: ${simResult.firstRevert.revert}`);
      console.log(`[exec]   Reverted tx: ${simResult.firstRevert.txHash}`);
      console.log(`[exec] ═══════════════════════════════════════════════════════════\n`);

      persistTradeExecution(execReq.asset, orderId, match.spreadPercent, "REVERTED");

      res.status(400).json({
        success: false,
        orderId,
        error: `Contract reverted: ${simResult.firstRevert.revert}`,
        steps,
      });
      return;
    }

    steps.push(`[${orderId}] ✓ Simulation passed — gasUsed: ${simResult.totalGasUsed}`);
    console.log(`[exec] ✓ Simulation PASSED`);
    console.log(`[exec]   Total gas used: ${simResult.totalGasUsed}`);
    console.log(`[exec]   Bundle gas price: ${simResult.bundleGasPrice}`);
    for (const r of simResult.results) {
      console.log(`[exec]   Tx ${r.txHash}: gas=${r.gasUsed}${r.error ? ` error=${r.error}` : ""}`);
    }

    // ── Step 5: Submit the bundle ────────────────────────────────────────
    console.log(`[exec] Step 5: Submitting bundle to Flashbots relay for block ${targetBlock}...`);
    steps.push(`[${orderId}] Submitting private bundle to Flashbots relay...`);

    const submission = await flashbotsProvider.sendRawBundle(
      signedBundle,
      targetBlock
    );

    if ("error" in submission) {
      const subError = (submission as { error: { message: string } }).error.message;
      steps.push(`[${orderId}] ✗ Submission failed: ${subError}`);
      console.log(`[exec] ✗ SUBMISSION FAILED: ${subError}`);

      persistTradeExecution(execReq.asset, orderId, match.spreadPercent, "SUBMIT_FAILED");

      res.status(500).json({
        success: false,
        orderId,
        error: `Bundle submission failed: ${subError}`,
        steps,
      });
      return;
    }

    const bundleHash = (submission as { bundleHash: string }).bundleHash;
    steps.push(`[${orderId}] ✓ Bundle submitted — hash: ${bundleHash}`);
    console.log(`[exec] ✓ BUNDLE SUBMITTED`);
    console.log(`[exec]   Bundle hash: ${bundleHash}`);
    console.log(`[exec]   Target block: ${targetBlock}`);
    console.log(`[exec] ═══════════════════════════════════════════════════════════\n`);

    persistTradeExecution(execReq.asset, orderId, match.spreadPercent, "SUBMITTED", bundleHash);

    res.json({
      success: true,
      orderId,
      bundleHash,
      targetBlock,
      steps,
      executedSpread: match.spreadPercent,
      mode: "flashbots",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[exec] Execution error: ${msg}`);
    console.log(`[exec] ═══════════════════════════════════════════════════════════\n`);

    persistTradeExecution(execReq.asset, orderId, 0, "ERROR");
    res.status(500).json({ success: false, error: "Internal execution error" });
  }
});

/** Fire-and-forget DB persistence for trade executions */
function persistTradeExecution(
  pair: string,
  orderId: string,
  spread: number,
  status: string,
  txHash?: string
) {
  prisma.tradeExecution
    .create({
      data: {
        botName: "flashbots",
        pair,
        profit: spread,
        status,
        txHash: txHash ?? orderId,
      },
    })
    .catch((err) => {
      console.warn("[db] Failed to persist trade execution:", err instanceof Error ? err.message : err);
    });
}

// ── Historical anomaly endpoint ─────────────────────────────────────────────
app.get("/api/history/anomalies", async (_req, res) => {
  try {
    const logs = await prisma.anomalyLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    res.json({ ok: true, count: logs.length, data: logs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api] /api/history/anomalies error:", msg);
    res.status(500).json({ ok: false, error: "Database query failed" });
  }
});

// ── Historical trade executions endpoint ────────────────────────────────────
app.get("/api/history/trades", async (_req, res) => {
  try {
    const trades = await prisma.tradeExecution.findMany({
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    res.json({ ok: true, count: trades.length, data: trades });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api] /api/history/trades error:", msg);
    res.status(500).json({ ok: false, error: "Database query failed" });
  }
});

const HTTP_PORT = 8081;
app.listen(HTTP_PORT, () => {
  console.log(`[server] HTTP API on http://localhost:${HTTP_PORT}`);
  console.log(`[server]   GET  /health`);
  console.log(`[server]   GET  /api/history/anomalies`);
  console.log(`[server]   GET  /api/history/trades`);
  console.log(`[server]   POST /api/execute`);
});

// ── WebSocket Server ────────────────────────────────────────────────────────
const WS_PORT = 8080;
const wss = new WebSocketServer({ port: WS_PORT });

const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[ws] Client connected (total: ${clients.size})`);

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[ws] Client disconnected (total: ${clients.size})`);
  });

  ws.on("error", (err) => {
    console.warn("[ws] Client error:", err.message);
    clients.delete(ws);
  });
});

function broadcastToClients(message: WSMessage) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

console.log(`[ws] WebSocket server listening on ws://localhost:${WS_PORT}`);

// ── Wire engine updates → WebSocket broadcasts ─────────────────────────────
onUpdate((opportunities: ArbitrageOpportunity[], anomalies: AnomalyEvent[]) => {
  // Always send the arbitrage table update
  broadcastToClients({
    type: "arbitrage_update",
    data: opportunities,
  });

  // Send each anomaly individually for the feed
  for (const anomaly of anomalies) {
    broadcastToClients({
      type: "anomaly",
      data: anomaly,
    });
  }

  if (opportunities.length > 0) {
    const best = opportunities[0];
    const sign = best.spreadPercent >= 0 ? "+" : "";
    console.log(
      `[engine] ${opportunities.length} opps | Best: ${best.asset} ${sign}${best.spreadPercent.toFixed(3)}% (${best.buyExchange}→${best.sellExchange}) | ${anomalies.length} alerts | ${clients.size} clients`
    );
  }
});

// ── Start ───────────────────────────────────────────────────────────────────
startEngine().catch((err) => {
  console.error("[server] Failed to start engine:", err);
  process.exit(1);
});
