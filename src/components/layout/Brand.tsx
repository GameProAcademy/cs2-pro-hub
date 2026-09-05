import { Link } from "@tanstack/react-router";

import gameproSymbol from "@/assets/gamepro-symbol.png";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Product brand: GamePro symbol + "CS2 PRO" (primary) / "AI COACH" (descriptor).
 * Brand words are intentionally never translated.
 */
export function Brand({
  className,
  compact = false,
}: {
  className?: string | undefined;
  compact?: boolean | undefined;
}) {
  const t = useT();
  return (
    <Link
      to="/dashboard"
      className={cn("group flex items-center gap-3", className)}
      aria-label={t("brand.ariaLabel")}
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated shadow-[var(--shadow-card)] transition-colors group-hover:border-primary/40">
        <img
          src={gameproSymbol}
          alt="GamePro"
          width={28}
          height={28}
          className="size-7 object-contain"
        />
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block font-display text-base font-bold uppercase tracking-[0.14em] text-foreground">
            CS2 PRO
          </span>
          <span className="-mt-px block font-mono text-[9px] uppercase leading-none tracking-[0.24em] text-primary">
            AI COACH
          </span>
        </span>
      ) : null}
    </Link>
  );
}
