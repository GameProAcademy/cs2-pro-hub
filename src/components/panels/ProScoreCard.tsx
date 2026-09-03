import { TrendingUp } from "lucide-react";

import { DemoTag } from "@/components/common/DemoDataNotice";
import { ProgressBar } from "@/components/common/ProgressBar";
import { useT } from "@/i18n";
import type { ProScore } from "@/types";

export function ProScoreCard({ score }: { score: ProScore }) {
  const t = useT();

  return (
    <section className="surface-panel relative overflow-hidden rounded-lg border border-border p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/12 blur-2xl"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            CS2 PRO Score
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{score.tier}</p>
        </div>
        <DemoTag />
      </div>

      <div className="relative mt-6 flex items-end gap-3">
        <span className="num-display text-6xl font-bold leading-none text-foreground sm:text-7xl">
          {score.value}
        </span>
        <span className="num-display pb-2 text-xl text-muted-foreground">/ {score.max}</span>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-success/12 px-2 py-1 font-mono text-xs font-medium text-success">
          <TrendingUp className="size-3.5" aria-hidden />+{score.deltaSinceFirstAnalysis}{" "}
          {t("score.sinceFirst")}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("score.top")} {100 - score.percentile}% {t("score.ofYourLevel")}
        </span>
      </div>

      <ProgressBar value={score.value} max={score.max} className="relative mt-6" />
    </section>
  );
}
