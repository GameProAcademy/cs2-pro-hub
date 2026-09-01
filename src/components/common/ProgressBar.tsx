import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  tone = "primary",
  className,
}: {
  value: number;
  max?: number | undefined;
  label?: string | undefined;
  showValue?: boolean | undefined;
  tone?: "primary" | "accent" | "success" | "warning" | "destructive" | undefined;
  className?: string | undefined;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const toneClass = {
    primary: "bg-primary",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  }[tone];

  return (
    <div className={cn("w-full", className)}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label ? (
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          ) : null}
          {showValue ? (
            <span className="num-display text-xs text-foreground">{Math.round(pct)}%</span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", toneClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
