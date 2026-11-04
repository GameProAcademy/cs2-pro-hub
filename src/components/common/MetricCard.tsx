import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import type { ReactNode } from "react";

import { DemoTag } from "@/components/common/DemoDataNotice";
import { useT } from "@/i18n";
import { NOT_AVAILABLE_MARK, isNotAvailable } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DeltaBadge({
  delta,
  invert = false,
  suffix,
}: {
  delta?: number | undefined;
  /** When true, a negative delta is a good outcome (e.g. First Death Rate). */
  invert?: boolean | undefined;
  suffix?: string | undefined;
}) {
  if (delta === undefined) return null;
  const neutral = delta === 0;
  const good = invert ? delta < 0 : delta > 0;
  const Icon = neutral ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium",
        neutral && "bg-muted text-muted-foreground",
        !neutral && good && "bg-success/12 text-success",
        !neutral && !good && "bg-destructive/12 text-destructive",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {delta > 0 ? "+" : ""}
      {delta}
      {suffix}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  delta,
  invertDelta,
  hint,
  size = "md",
  showDemoTag = true,
}: {
  /** Text or a <MetricTerm> (name + definition). */
  label: ReactNode;
  /** null / undefined / "—" = not available: never shown as zero. */
  value: string | number | null | undefined;
  unit?: string | undefined;
  delta?: number | undefined;
  invertDelta?: boolean | undefined;
  hint?: string | undefined;
  size?: "md" | "lg" | undefined;
  showDemoTag?: boolean | undefined;
}) {
  const t = useT();
  const missing = isNotAvailable(value);
  const shownHint = hint ?? (missing ? t("common.notAvailableHint") : undefined);
  return (
    <div
      className="surface-panel rounded-lg border border-border p-4 transition-colors hover:border-primary/35"
      data-metric-missing={missing ? "true" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {showDemoTag ? <DemoTag /> : null}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span
          className={cn(
            "num-display font-semibold leading-none text-foreground",
            size === "lg" ? "text-4xl" : "text-3xl",
          )}
        >
          {missing ? (
            <>
              <span aria-hidden>{NOT_AVAILABLE_MARK}</span>
              <span className="sr-only">{t("common.notAvailable")}</span>
            </>
          ) : (
            value
          )}
        </span>
        {unit && !missing ? (
          <span className="pb-1 text-sm text-muted-foreground">{unit}</span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <DeltaBadge delta={delta} invert={invertDelta} />
        {shownHint ? <span className="text-xs text-muted-foreground">{shownHint}</span> : null}
      </div>
    </div>
  );
}
