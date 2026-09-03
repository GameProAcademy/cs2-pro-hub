import { EmptyState } from "@/components/common/States";
import { useT } from "@/i18n";
import type { SideSplit } from "@/types";

/**
 * CT vs T comparison. Renders an explicit empty state when there is not
 * enough data — the future real pipeline should pass `hasEnoughData={false}`
 * until a minimum sample of rounds per side exists.
 */
export function SideSplitChart({
  data,
  hasEnoughData = true,
}: {
  data: SideSplit[];
  hasEnoughData?: boolean | undefined;
}) {
  const t = useT();

  if (!hasEnoughData || data.length === 0) {
    return (
      <EmptyState
        title={t("performance.sidesEmptyTitle")}
        description={t("performance.sidesEmptyDesc")}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6 text-xs">
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full bg-accent" aria-hidden /> CT Side
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" aria-hidden /> T Side
        </span>
      </div>

      {data.map((row) => {
        const total = row.ct + row.t || 1;
        const ctPct = (row.ct / total) * 100;
        return (
          <div key={row.metric}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {row.metric}
              </span>
              <span className="num-display text-sm">
                <span className="text-accent">{row.ct}</span>
                <span className="mx-2 text-muted-foreground">vs</span>
                <span className="text-primary">{row.t}</span>
              </span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-accent" style={{ width: `${ctPct}%` }} />
              <div className="h-full bg-primary" style={{ width: `${100 - ctPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
