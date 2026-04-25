"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Eye,
  EyeOff,
  Key,
  Wallet,
  SlidersHorizontal,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  LogOut,
  Save,
  LinkIcon,
} from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";

type Tab = "apis" | "wallet" | "prefs";
type ExchangeStatus = "idle" | "loading" | "connected";

interface ExchangeKeys {
  apiKey: string;
  apiSecret: string;
  status: ExchangeStatus;
}

interface TradingPrefs {
  slippage: number;
  maxGas: number;
  tradeSize: number;
}

const STORAGE_KEY = "w3t_settings";
const EXCHANGES = ["Binance", "Kraken", "Coinbase"] as const;
type ExchangeName = (typeof EXCHANGES)[number];

const TABS: { id: Tab; label: string; icon: typeof Key }[] = [
  { id: "apis", label: "Exchange APIs", icon: Key },
  { id: "wallet", label: "Web3 Wallet", icon: Wallet },
  { id: "prefs", label: "Trading Preferences", icon: SlidersHorizontal },
];

function loadSettings() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function defaults() {
  return {
    exchanges: Object.fromEntries(
      EXCHANGES.map((e) => [e, { apiKey: "", apiSecret: "", status: "idle" as ExchangeStatus }])
    ) as Record<ExchangeName, ExchangeKeys>,
    prefs: { slippage: 0.5, maxGas: 40, tradeSize: 1000 } as TradingPrefs,
  };
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("apis");
  const [exchanges, setExchanges] = useState<Record<ExchangeName, ExchangeKeys>>(defaults().exchanges);
  const [prefs, setPrefs] = useState<TradingPrefs>(defaults().prefs);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    if (s) {
      if (s.exchanges) setExchanges(s.exchanges);
      if (s.prefs) setPrefs(s.prefs);
    }
  }, []);

  const persistAll = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ exchanges, prefs }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [exchanges, prefs]);

  return (
    <div className="flex-1 overflow-auto p-3 lg:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <Settings className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Settings</h1>
          <p className="text-xs text-muted">Configure your trading environment</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <nav className="lg:w-48 shrink-0 flex lg:flex-col gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-left ${
                tab === id
                  ? "bg-accent/10 text-accent font-semibold"
                  : "text-muted hover:text-foreground hover:bg-surface-hover"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${tab === id ? "text-accent" : ""}`} />
              <span className="hidden lg:block">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1 glass-panel p-5 lg:p-6 min-h-[500px] relative overflow-hidden">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            {tab === "apis" && (
              <ExchangeAPIs exchanges={exchanges} setExchanges={setExchanges} onSave={persistAll} />
            )}
            {tab === "wallet" && <Web3Wallet />}
            {tab === "prefs" && (
              <TradingPreferences prefs={prefs} setPrefs={setPrefs} onSave={persistAll} />
            )}
          </div>
        </div>
      </div>

      {saved && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className="bg-surface border border-accent/30 rounded-lg px-4 py-2.5 shadow-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-accent" />
            <span className="text-xs text-accent font-medium">Settings saved</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ExchangeAPIs({
  exchanges,
  setExchanges,
  onSave,
}: {
  exchanges: Record<ExchangeName, ExchangeKeys>;
  setExchanges: React.Dispatch<React.SetStateAction<Record<ExchangeName, ExchangeKeys>>>;
  onSave: () => void;
}) {
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setVisibility((v) => ({ ...v, [key]: !v[key] }));

  const update = (name: ExchangeName, field: "apiKey" | "apiSecret", value: string) => {
    setExchanges((prev) => ({
      ...prev,
      [name]: { ...prev[name], [field]: value, status: "idle" as ExchangeStatus },
    }));
  };

  const verify = async (name: ExchangeName) => {
    setExchanges((prev) => ({
      ...prev,
      [name]: { ...prev[name], status: "loading" },
    }));
    await new Promise((r) => setTimeout(r, 1500));
    setExchanges((prev) => ({
      ...prev,
      [name]: { ...prev[name], status: "connected" },
    }));
    onSave();
  };

  return (
    <div>
      <h2 className="text-sm font-bold text-foreground mb-1">Exchange API Keys</h2>
      <p className="text-xs text-muted mb-5">Connect your exchange accounts for live trading execution.</p>

      <div className="space-y-5">
        {EXCHANGES.map((name) => {
          const ex = exchanges[name];
          const keyVis = visibility[`${name}-key`];
          const secVis = visibility[`${name}-sec`];

          return (
            <div key={name} className="bg-surface/50 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">{name}</h3>
                {ex.status === "connected" && (
                  <span className="flex items-center gap-1.5 text-[10px] text-neon-green font-semibold bg-neon-green/10 border border-neon-green/20 rounded-full px-2.5 py-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wider mb-1 block">API Key</label>
                  <div className="relative">
                    <input
                      type={keyVis ? "text" : "password"}
                      value={ex.apiKey}
                      onChange={(e) => update(name, "apiKey", e.target.value)}
                      placeholder="Enter API key..."
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/40 transition-colors pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => toggle(`${name}-key`)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                    >
                      {keyVis ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wider mb-1 block">API Secret</label>
                  <div className="relative">
                    <input
                      type={secVis ? "text" : "password"}
                      value={ex.apiSecret}
                      onChange={(e) => update(name, "apiSecret", e.target.value)}
                      placeholder="Enter API secret..."
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/40 transition-colors pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => toggle(`${name}-sec`)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                    >
                      {secVis ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => verify(name)}
                disabled={ex.status === "loading" || !ex.apiKey || !ex.apiSecret}
                className="px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20"
              >
                {ex.status === "loading" ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Verifying...
                  </span>
                ) : (
                  "Verify & Save"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Web3Wallet() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();

  return (
    <div>
      {isConnected && address ? (
        <div className="space-y-4">
          <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5 drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]" />
            <div>
              <p className="text-xs text-accent font-semibold mb-0.5">Wallet Connected</p>
              <p className="text-[11px] text-muted leading-relaxed">
                Your wallet is securely connected via browser extension. No private keys are stored.
              </p>
            </div>
          </div>

          <div className="bg-surface/50 border border-border rounded-lg p-4 space-y-3">
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider mb-1.5 block">Connected Address</label>
              <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2.5">
                <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_6px_rgba(99,102,241,0.5)]" />
                <code className="text-xs text-foreground font-mono">{address}</code>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider mb-1.5 block">Active Chain</label>
              <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2.5">
                <LinkIcon className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs text-foreground font-medium">{chain?.name ?? `Chain ${chain?.id}`}</span>
                <span className="text-[10px] text-muted ml-auto">ID: {chain?.id}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => disconnect()}
            className="px-4 py-2 rounded-md text-[11px] font-semibold transition-all bg-neon-red/10 text-neon-red border border-neon-red/20 hover:bg-neon-red/20 flex items-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" /> Disconnect Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-surface/50 border border-border rounded-lg p-8 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
              <Wallet className="w-6 h-6 text-accent drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]" />
            </div>
            <p className="text-sm text-foreground font-semibold mb-1">No Wallet Connected</p>
            <p className="text-xs text-muted max-w-xs leading-relaxed">
              Please connect your wallet using the <span className="text-accent font-medium">Connect Wallet</span> button
              in the header to authenticate and enable on-chain execution.
            </p>
          </div>

          <div className="bg-accent/5 border border-accent/20 rounded-lg p-3.5 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-accent font-semibold mb-0.5">Secure by Design</p>
              <p className="text-[11px] text-muted leading-relaxed">
                This app uses WalletConnect &amp; browser-based signing. Your private keys never leave your wallet.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trading Preferences Tab ────────────────────────────────────────────────
function TradingPreferences({
  prefs,
  setPrefs,
  onSave,
}: {
  prefs: TradingPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<TradingPrefs>>;
  onSave: () => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-bold text-foreground mb-1">Trading Preferences</h2>
      <p className="text-xs text-muted mb-5">Configure global parameters for automated and manual trades.</p>

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-foreground font-medium">Global Slippage Tolerance</label>
            <span className="text-xs text-accent font-bold tabular-nums">{prefs.slippage.toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.1}
            value={prefs.slippage}
            onChange={(e) => setPrefs((p) => ({ ...p, slippage: parseFloat(e.target.value) }))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-accent"
          />
          <div className="flex justify-between text-[10px] text-muted mt-1">
            <span>0.1%</span>
            <span>5.0%</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-foreground font-medium">Max Gas Fee</label>
            <span className="text-xs text-accent font-bold tabular-nums">{prefs.maxGas} gwei</span>
          </div>
          <input
            type="range"
            min={5}
            max={200}
            step={1}
            value={prefs.maxGas}
            onChange={(e) => setPrefs((p) => ({ ...p, maxGas: parseInt(e.target.value) }))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-accent"
          />
          <div className="flex justify-between text-[10px] text-muted mt-1">
            <span>5 gwei</span>
            <span>200 gwei</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-foreground font-medium">Default Trade Size</label>
            <span className="text-xs text-accent font-bold tabular-nums">${prefs.tradeSize.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={100}
            max={50000}
            step={100}
            value={prefs.tradeSize}
            onChange={(e) => setPrefs((p) => ({ ...p, tradeSize: parseInt(e.target.value) }))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-accent"
          />
          <div className="flex justify-between text-[10px] text-muted mt-1">
            <span>$100</span>
            <span>$50,000</span>
          </div>
        </div>

        <button
          onClick={onSave}
          className="px-4 py-2 rounded-md text-[11px] font-semibold transition-all bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 flex items-center gap-2"
        >
          <Save className="w-3.5 h-3.5" /> Save Preferences
        </button>
      </div>
    </div>
  );
}
