import { randomUUID } from "node:crypto";
import ccxt, { type Exchange, type OrderBook } from "ccxt";
import { JsonRpcProvider, Contract, parseUnits, formatUnits } from "ethers";
import type { ArbitrageOpportunity, AnomalyEvent } from "./types.js";
import prisma from "./lib/prisma.js";

// ── Configuration ───────────────────────────────────────────────────────────
const PAIRS = ["ETH/USDT", "BTC/USDT", "SOL/USDT"];
const DEX_PAIR = "ETH/USDT"; // The pair we compare DEX against CEXs
const SPREAD_ALERT_THRESHOLD = 0.001; // percent (lowered for dev visibility)
const POLL_INTERVAL_MS = 3000;

// ── Uniswap V3 Quoter V2 (Ethereum Mainnet) ────────────────────────────────
const ETH_RPC_URLS = [
  "https://cloudflare-eth.com",
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
];

// Uniswap V3 QuoterV2 on Ethereum Mainnet
const QUOTER_V2_ADDRESS = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

// Minimal ABI for quoteExactInputSingle
const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Token addresses on Ethereum Mainnet
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const UNISWAP_FEE_TIER = 500; // 0.05% pool (most liquid ETH/USDC pool)

let provider: JsonRpcProvider | null = null;
let quoterContract: Contract | null = null;
let currentRpcIndex = 0;
let lastDexPrice: number | null = null;
let dexConsecutiveFailures = 0;
const MAX_DEX_FAILURES_BEFORE_WARN = 3;

// ── Gas Oracle Config ───────────────────────────────────────────────────────
const FLASH_LOAN_GAS_LIMIT = BigInt(350_000); // conservative estimate for a DEX-to-DEX flash arb
const ETH_PRICE_USD = 3000;              // prototype hardcode; replace with live feed later
const STANDARD_TRADE_SIZE_USD = 10_000;  // notional trade size for profit calc
let cachedGasCostUsd: number | null = null;
let gasCacheTimestamp = 0;
const GAS_CACHE_TTL_MS = 15_000;         // refresh every 15 s

// ── Exchange initialization (public endpoints, no API keys needed) ──────────
const EXCHANGE_CONFIGS: Array<{ id: string; class: new (config?: object) => Exchange }> = [
  { id: "binance", class: ccxt.binance },
  { id: "kraken", class: ccxt.kraken },
  { id: "coinbase", class: ccxt.coinbase },
];

let exchanges: Array<{ id: string; name: string; instance: Exchange }> = [];

let anomalyCounter = 0;

type Listener = (
  opportunities: ArbitrageOpportunity[],
  anomalies: AnomalyEvent[]
) => void;

const listeners: Set<Listener> = new Set();

export function onUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function broadcast(
  opportunities: ArbitrageOpportunity[],
  anomalies: AnomalyEvent[]
) {
  for (const listener of listeners) {
    listener(opportunities, anomalies);
  }
}

// ── Fetch order book with timeout & error handling ──────────────────────────
async function safelyFetchOrderBook(
  exchange: Exchange,
  pair: string
): Promise<OrderBook | null> {
  try {
    const book = await exchange.fetchOrderBook(pair, 5);
    return book;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[engine] Failed to fetch ${pair} from ${exchange.id}: ${msg}`
    );
    return null;
  }
}

// ── Uniswap V3 DEX price fetching ───────────────────────────────────────────
function initProvider(): boolean {
  try {
    const url = ETH_RPC_URLS[currentRpcIndex % ETH_RPC_URLS.length];
    provider = new JsonRpcProvider(url, 1, { staticNetwork: true });
    quoterContract = new Contract(QUOTER_V2_ADDRESS, QUOTER_V2_ABI, provider);
    console.log(`[dex] Provider initialized: ${url}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[dex] Failed to init provider: ${msg}`);
    return false;
  }
}

function rotateRpc() {
  currentRpcIndex = (currentRpcIndex + 1) % ETH_RPC_URLS.length;
  initProvider();
  console.log(
    `[dex] Rotated to RPC: ${ETH_RPC_URLS[currentRpcIndex % ETH_RPC_URLS.length]}`
  );
}

async function fetchUniswapPrice(): Promise<number | null> {
  if (!quoterContract) {
    if (!initProvider()) return lastDexPrice;
  }

  try {
    // Quote: how much USDC for 1 WETH?
    const amountIn = parseUnits("1", 18); // 1 WETH (18 decimals)

    const result = await quoterContract!.quoteExactInputSingle.staticCall({
      tokenIn: WETH,
      tokenOut: USDC,
      amountIn,
      fee: UNISWAP_FEE_TIER,
      sqrtPriceLimitX96: 0,
    });

    // result[0] = amountOut in USDC (6 decimals)
    const amountOut = result[0];
    const price = parseFloat(formatUnits(amountOut, 6));

    if (price > 0) {
      lastDexPrice = price;
      dexConsecutiveFailures = 0;
      return price;
    }

    return lastDexPrice;
  } catch (err) {
    dexConsecutiveFailures++;
    const msg = err instanceof Error ? err.message : String(err);

    if (dexConsecutiveFailures === 1 || dexConsecutiveFailures % 5 === 0) {
      console.warn(
        `[dex] Uniswap quote failed (attempt ${dexConsecutiveFailures}): ${msg}`
      );
    }

    // Rotate RPC after consecutive failures
    if (dexConsecutiveFailures >= MAX_DEX_FAILURES_BEFORE_WARN) {
      rotateRpc();
    }

    // Return cached price so CEX-DEX arb rows remain visible (stale-marked)
    return lastDexPrice;
  }
}

// ── Gas Oracle ──────────────────────────────────────────────────────────────

/**
 * Fetches current gas price from the provider and converts to a USD cost
 * estimate for our flash-loan gas limit.  Result is cached for GAS_CACHE_TTL_MS
 * so we never spam the RPC on every poll tick.
 */
async function refreshGasCostUsd(): Promise<number | null> {
  const now = Date.now();
  if (cachedGasCostUsd !== null && now - gasCacheTimestamp < GAS_CACHE_TTL_MS) {
    return cachedGasCostUsd;
  }

  if (!provider) return cachedGasCostUsd;

  try {
    const feeData = await provider.getFeeData();
    // Use maxFeePerGas (EIP-1559) falling back to gasPrice (legacy)
    const gasPriceWei = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (!gasPriceWei) return cachedGasCostUsd;

    // cost in Wei → ETH → USD
    const costWei = gasPriceWei * FLASH_LOAN_GAS_LIMIT;
    const costEth = Number(costWei) / 1e18;
    cachedGasCostUsd = costEth * ETH_PRICE_USD;
    gasCacheTimestamp = now;
    return cachedGasCostUsd;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!cachedGasCostUsd) console.warn(`[gas] Fee data fetch failed: ${msg}`);
    return cachedGasCostUsd; // stale cache is better than nothing
  }
}

/**
 * Given a raw spread, computes net profit after estimated gas for a standard
 * trade size. Returns { netProfit, estimatedGas } or null if gas is unknown.
 */
interface GasCheckResult {
  netProfit: number;     // USD
  estimatedGas: number;  // USD
}

async function estimateNetProfit(
  _buyPrice: number,
  _sellPrice: number,
  spreadPercent: number
): Promise<GasCheckResult | null> {
  const gasCostUsd = await refreshGasCostUsd();
  if (gasCostUsd === null) return null;

  const grossProfit = STANDARD_TRADE_SIZE_USD * (spreadPercent / 100);
  const netProfit = grossProfit - gasCostUsd;
  return {
    netProfit: parseFloat(netProfit.toFixed(4)),
    estimatedGas: parseFloat(gasCostUsd.toFixed(4)),
  };
}

// ── Core: compute arbitrage for one pair across all exchanges ───────────────

/** A normalized venue with best bid/ask, used for both CEX and DEX */
interface Venue {
  id: string;
  name: string;
  bestAsk: number;
  bestBid: number;
  askVolume: number;
  bidVolume: number;
}

async function computeArbitrage(
  pair: string,
  extraVenues: Venue[] = []
): Promise<{
  opportunities: ArbitrageOpportunity[];
  anomalies: AnomalyEvent[];
}> {
  const opportunities: ArbitrageOpportunity[] = [];
  const anomalies: AnomalyEvent[] = [];

  // Fetch all order books concurrently
  const results = await Promise.all(
    exchanges.map(async ({ id, name, instance }) => {
      const book = await safelyFetchOrderBook(instance, pair);
      if (!book) return null;

      const bestAsk =
        book.asks && book.asks.length > 0 ? book.asks[0][0] : null;
      const bestBid =
        book.bids && book.bids.length > 0 ? book.bids[0][0] : null;
      const askVolume =
        book.asks && book.asks.length > 0 ? (book.asks[0][1] ?? 0) : 0;
      const bidVolume =
        book.bids && book.bids.length > 0 ? (book.bids[0][1] ?? 0) : 0;

      return { id, name, bestAsk, bestBid, askVolume, bidVolume };
    })
  );

  const valid = results.filter(
    (r): r is NonNullable<typeof r> =>
      r !== null && r.bestAsk !== null && r.bestBid !== null
  ) as Venue[];

  // Inject any extra venues (DEX) into the comparison set
  valid.push(...extraVenues);

  if (valid.length < 2) return { opportunities, anomalies };

  // Compare every pair of exchanges
  for (let i = 0; i < valid.length; i++) {
    for (let j = 0; j < valid.length; j++) {
      if (i === j) continue;

      const buyFrom = valid[i]; // buy at ask
      const sellTo = valid[j]; // sell at bid

      if (!buyFrom.bestAsk || !sellTo.bestBid) continue;

      // S = ((P_bid_B - P_ask_A) / P_ask_A) * 100
      const spread =
        ((sellTo.bestBid - buyFrom.bestAsk) / buyFrom.bestAsk) * 100;

      if (spread > -0.5) {
        // Only show realistic-ish spreads (including small negatives for context)
        const id = `${pair}-${buyFrom.id}-${sellTo.id}-${Date.now()}`;
        const opp: ArbitrageOpportunity = {
          id,
          asset: pair,
          buyExchange: buyFrom.name,
          buyPrice: buyFrom.bestAsk,
          sellExchange: sellTo.name,
          sellPrice: sellTo.bestBid,
          spreadPercent: parseFloat(spread.toFixed(4)),
          volume: Math.min(buyFrom.askVolume, sellTo.bidVolume),
          timestamp: Date.now(),
        };

        // ── Gas guardrail: only promote to anomaly if net-profitable ────
        if (spread >= SPREAD_ALERT_THRESHOLD) {
          const gasCheck = await estimateNetProfit(
            buyFrom.bestAsk,
            sellTo.bestBid,
            spread
          );

          if (gasCheck && gasCheck.netProfit <= 0) {
            // Spread exists but gas eats the profit → skip anomaly
            console.log(
              `[GAS CHECK FAILED] ${pair} ${buyFrom.name}→${sellTo.name} spread ${spread.toFixed(3)}% but net profit is -$${Math.abs(gasCheck.netProfit).toFixed(2)}`
            );
          } else {
            // Attach gas data to the opportunity payload
            if (gasCheck) {
              opp.netProfit = gasCheck.netProfit;
              opp.estimatedGas = gasCheck.estimatedGas;
            }
            anomalies.push({
              id: randomUUID(),
              severity: spread >= 0.5 ? "critical" : "warning",
              message: `[ALERT] ${pair} spread ${spread.toFixed(3)}% — Buy ${buyFrom.name} @ $${buyFrom.bestAsk.toFixed(2)}, Sell ${sellTo.name} @ $${sellTo.bestBid.toFixed(2)}${gasCheck ? ` | Net $${gasCheck.netProfit.toFixed(2)} (gas $${gasCheck.estimatedGas.toFixed(2)})` : ""}`,
              asset: pair,
              exchange: `${buyFrom.name}→${sellTo.name}`,
              timestamp: Date.now(),
              netProfit: gasCheck?.netProfit,
              estimatedGas: gasCheck?.estimatedGas,
            });
          }
        }

        opportunities.push(opp);
      }
    }
  }

  return { opportunities, anomalies };
}

// ── Main polling loop ───────────────────────────────────────────────────────
let running = false;
let latestOpportunities: ArbitrageOpportunity[] = [];

export function getLatestOpportunities(): ArbitrageOpportunity[] {
  return latestOpportunities;
}

async function pollOnce() {
  const allOpportunities: ArbitrageOpportunity[] = [];
  const allAnomalies: AnomalyEvent[] = [];

  // Fetch Uniswap price concurrently with CEX data (non-blocking)
  const [uniswapPrice] = await Promise.all([fetchUniswapPrice()]);

  // Build the DEX venue if we have a price
  const dexVenue: Venue | null = uniswapPrice
    ? {
        id: "uniswapv3",
        name: "Uniswap V3",
        // For a DEX AMM, best ask ≈ best bid ≈ spot price (no spread at quote level)
        bestAsk: uniswapPrice,
        bestBid: uniswapPrice,
        askVolume: 100, // Uniswap has deep liquidity; nominal placeholder
        bidVolume: 100,
      }
    : null;

  // Run all pairs concurrently, injecting DEX venue for the ETH pair
  const results = await Promise.all(
    PAIRS.map((pair) => {
      const extras =
        pair === DEX_PAIR && dexVenue ? [dexVenue] : [];
      return computeArbitrage(pair, extras);
    })
  );

  for (const { opportunities, anomalies } of results) {
    allOpportunities.push(...opportunities);
    allAnomalies.push(...anomalies);
  }

  // Sort by spread descending
  allOpportunities.sort((a, b) => b.spreadPercent - a.spreadPercent);

  // Store latest for execution validation
  latestOpportunities = allOpportunities;

  // ── Non-blocking DB persistence (fire-and-forget queue) ────────────────
  if (allAnomalies.length > 0) {
    persistAnomalies(allAnomalies);
  }

  broadcast(allOpportunities, allAnomalies);
}

async function loop() {
  while (running) {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[engine] Poll error:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// ── Async write queue — never blocks the polling loop ────────────────────────
let writeQueue: Promise<void> = Promise.resolve();

function persistAnomalies(anomalies: AnomalyEvent[]) {
  // Chain onto the queue so writes are sequential but non-blocking
  writeQueue = writeQueue
    .then(async () => {
      const records = anomalies.map((a) => ({
        id: a.id,
        timestamp: new Date(a.timestamp),
        asset: a.asset,
        buyEx: a.exchange.split("\u2192")[0] ?? a.exchange,
        sellEx: a.exchange.split("\u2192")[1] ?? a.exchange,
        spread: 0, // will be enriched below if we find a matching opp
        severity: a.severity,
        netProfit: a.netProfit ?? null,
        estimatedGas: a.estimatedGas ?? null,
      }));

      // Enrich spread from latest opportunities
      for (const rec of records) {
        const match = latestOpportunities.find(
          (o) =>
            o.asset === rec.asset &&
            o.buyExchange === rec.buyEx &&
            o.sellExchange === rec.sellEx
        );
        if (match) rec.spread = match.spreadPercent;
      }

      await prisma.anomalyLog.createMany({ data: records }).catch((err) => {
        console.warn("[db] Failed to persist anomalies:", err instanceof Error ? err.message : err);
      });
    })
    .catch(() => {}); // swallow so queue never rejects
}

export async function startEngine() {
  console.log("[engine] Initializing exchanges...");

  // Initialize Ethereum RPC provider for DEX quotes (non-blocking for CEX flow)
  initProvider();

  exchanges = [];
  for (const cfg of EXCHANGE_CONFIGS) {
    try {
      const instance = new cfg.class({
        enableRateLimit: true,
        timeout: 10000,
      });
      await instance.loadMarkets();
      exchanges.push({
        id: cfg.id,
        name: instance.name || cfg.id,
        instance,
      });
      console.log(`[engine] ✓ ${instance.name} loaded (${Object.keys(instance.markets).length} markets)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[engine] ✗ Failed to load ${cfg.id}: ${msg}`);
    }
  }

  if (exchanges.length < 2) {
    console.error("[engine] Need at least 2 exchanges. Only loaded:", exchanges.map((e) => e.name));
    console.log("[engine] Will retry in 10s...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
    return startEngine();
  }

  console.log(
    `[engine] Tracking ${PAIRS.length} pairs across ${exchanges.length} CEXs + Uniswap V3 DEX`
  );
  console.log(`[engine] Polling every ${POLL_INTERVAL_MS}ms`);
  console.log(`[engine] Alert threshold: ${SPREAD_ALERT_THRESHOLD}% spread`);

  running = true;

  // Emit a startup anomaly so the frontend feed populates immediately
  broadcast([], [
    {
      id: randomUUID(),
      severity: "info",
      message: `[SYSTEM] Arbitrage engine online — tracking ${PAIRS.length} pairs across ${exchanges.length} CEXs + Uniswap V3`,
      asset: "SYSTEM",
      exchange: "all",
      timestamp: Date.now(),
    },
  ]);

  loop();
}

export function stopEngine() {
  running = false;
}

// ── Flash Loan Execution Skeleton ───────────────────────────────────────────
// To execute on-chain arbitrage via the FlashArb contract, uncomment and
// configure the following. Requires ETH_PRIVATE_KEY and a deployed FlashArb
// contract address in .env.
//
// import { Wallet } from "ethers";
//
// const FLASH_ARB_ABI = [
//   "function requestFlashLoan(address asset, uint256 amount, address intermediateToken, uint24 feeA, uint24 feeB, uint256 minProfit) external",
// ];
//
// async function executeFlashArb(opts: {
//   asset: string;         // e.g. USDC address
//   amount: bigint;        // borrow amount in token decimals
//   intermediate: string;  // e.g. WETH address
//   feeA: number;          // Uniswap fee tier for leg A (e.g. 500)
//   feeB: number;          // fee tier for leg B (e.g. 3000)
//   minProfit: bigint;     // minimum profit in asset decimals
// }) {
//   const provider = new JsonRpcProvider(ETH_RPC_URLS[0]);
//   const signer = new Wallet(process.env.ETH_PRIVATE_KEY!, provider);
//   const flashArb = new Contract(
//     process.env.FLASH_ARB_ADDRESS!,
//     FLASH_ARB_ABI,
//     signer,
//   );
//
//   const tx = await flashArb.requestFlashLoan(
//     opts.asset,
//     opts.amount,
//     opts.intermediate,
//     opts.feeA,
//     opts.feeB,
//     opts.minProfit,
//   );
//   console.log("[flash-arb] tx sent:", tx.hash);
//   const receipt = await tx.wait();
//   console.log("[flash-arb] confirmed in block", receipt.blockNumber);
//   return receipt;
// }
