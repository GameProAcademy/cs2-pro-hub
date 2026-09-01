import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export function Brand({ className, compact = false }: { className?: string | undefined; compact?: boolean | undefined }) {
  return (
    <Link
      to="/dashboard"
      className={cn("group flex items-center gap-2.5", className)}
      aria-label="CS2 PRO AI COACH"
    >
      <span className="relative flex size-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
        <span className="num-display text-sm font-bold text-primary">C2</span>
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block font-display text-sm font-bold uppercase tracking-[0.18em] text-foreground">
            CS2 PRO
          </span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            AI Coach
          </span>
        </span>
      ) : null}
    </Link>
  );
}
