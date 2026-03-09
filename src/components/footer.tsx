import { ExternalLink } from "lucide-react";

const LINKS = [
  { label: "Website", href: "https://mohdshayan.com" },
  { label: "GitHub", href: "https://github.com/shayanmohd" },
  { label: "LinkedIn", href: "https://linkedin.com/in/shayanmohd" },
  { label: "X", href: "https://x.com/mohdshayanX" },
];

export default function Footer() {
  return (
    <footer className="shrink-0 flex items-center justify-between px-4 lg:px-6 py-2 border-t border-border bg-surface text-[10px] text-muted">
      <span>
        Made with 🩵 by{" "}
        <a
          href="https://mohdshayan.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neon-green hover:underline"
        >
          Mohd Shayan
        </a>
      </span>

      <div className="hidden sm:flex items-center gap-3">
        {LINKS.map(({ label, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {label}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        ))}
      </div>

      <span className="tabular-nums">
        &copy; {new Date().getFullYear()} Mohd Shayan. All rights reserved.
      </span>
    </footer>
  );
}
