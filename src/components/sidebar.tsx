"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Activity,
  Radar,
  Terminal,
  Zap,
  Settings,
  Radio,
} from "lucide-react";

const NAV_ITEMS = [
  { icon: BarChart3, label: "Dashboard", href: "/" },
  { icon: Activity, label: "Markets", href: "/markets" },
  { icon: Radar, label: "Scanner", href: "/scanner" },
  { icon: Terminal, label: "Terminal", href: "/terminal" },
  { icon: Zap, label: "Bots", href: "/bots" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-16 lg:w-56 h-screen flex flex-col bg-surface border-r border-border shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
        <Radio className="w-5 h-5 text-neon-green shrink-0" />
        <span className="hidden lg:block text-sm font-bold text-foreground tracking-wider">
          SHAY<span className="text-neon-green">ANOMALY</span>
        </span>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-neon-green/10 text-neon-green font-semibold shadow-[inset_0_0_12px_rgba(0,255,157,0.06)]"
                  : "text-muted hover:text-foreground hover:bg-surface-hover"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? "drop-shadow-[0_0_4px_rgba(0,255,157,0.5)]" : ""}`} />
              <span className="hidden lg:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse-neon" />
          <span className="hidden lg:block text-xs text-muted">
            14 feeds active
          </span>
        </div>
      </div>
    </aside>
  );
}
