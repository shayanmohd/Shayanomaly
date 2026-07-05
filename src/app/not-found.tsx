import Link from "next/link";
import { Radar } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
        <Radar className="w-7 h-7 text-accent" />
      </div>
      <h1 className="text-2xl font-bold text-foreground tracking-tight">404 — Signal lost</h1>
      <p className="text-sm text-muted max-w-sm leading-relaxed">
        No anomaly detected at this address. The route you requested doesn&apos;t exist
        or has been moved.
      </p>
      <Link
        href="/"
        className="mt-2 px-4 py-2 rounded-lg text-xs font-semibold bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
      >
        Back to Dashboard
      </Link>
    </main>
  );
}
