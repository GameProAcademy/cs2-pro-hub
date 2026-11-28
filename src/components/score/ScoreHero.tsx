/**
 * VGL 5.0 — CS2 PRO Score as a competitive rating display. Pure presentation of `ProScore`:
 * the value is the one `getProScore` returned (pro-score-v1), formatted exactly as before (one
 * decimal). The number is the protagonist; "/100" is a quiet unit. The meter is a plain
 * proportion of 0–100 in one colour — no bands, tiers or colours that would read as a rank or
 * percentile. No evolution arrow: the Score is not persisted over time (no history to compare).
 */
import type { ReactNode } from "react";

import { GameIcon } from "@/components/common/GameIcon";
import { useI18n, type TranslationKey } from "@/i18n";
import { NOT_AVAILABLE_MARK, fill } from "@/lib/format";
import { PRO_SCORE_MIN_COVERAGE, type ProScore } from "@/lib/proScore";
import { cn } from "@/lib/utils";

export const SCORE_METER_TICKS = 20;

/** The Score as shown to players (unchanged formatting: one decimal). Pure. */
export function formatScore(score: number, intlTag: string): string {
  return new Intl.NumberFormat(intlTag, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score);
}

const pct = (v: number, tag: string) =>
  new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(v * 100);

/** The state sentence when there is no number (never a placeholder value). */
export function scoreStateText(score: ProScore, t: (k: TranslationKey) => string, tag: string) {
  if (score.state === "INSUFFICIENT_SAMPLE")
    return fill(t("score.state.INSUFFICIENT_SAMPLE"), {
      matches: score.matches,
      minimum: score.minimumMatches,
    });
  if (score.state === "INSUFFICIENT_COVERAGE")
    return fill(t("score.state.INSUFFICIENT_COVERAGE"), {
      coverage: pct(score.coverage, tag),
      min: pct(PRO_SCORE_MIN_COVERAGE, tag),
    });
  return t("score.state.EMPTY");
}

function Meter({ value }: { value: number | null }) {
  const filled = value === null ? 0 : Math.round((value / 100) * SCORE_METER_TICKS);
  return (
    <div
      aria-hidden
      className="flex h-2.5 w-full max-w-sm gap-1"
      data-score-meter={value === null ? "none" : filled}
    >
      {Array.from({ length: SCORE_METER_TICKS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-full flex-1 -skew-x-12 rounded-[2px]",
            value === null
              ? "border border-dashed border-border-strong"
              : i < filled
                ? "bg-primary shadow-[0_0_8px_-2px_var(--primary)]"
                : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-background/60 px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

export function ScoreHero({
  score,
  tips,
  size = "lg",
}: {
  score: ProScore;
  /** Explanation buttons shown next to the label (InfoTip elements). */
  tips?: ReactNode;
  size?: "lg" | "xl";
}) {
  const { t, intlTag } = useI18n();
  const ready = score.state === "READY" && score.score !== null;
  return (
    <div className="space-y-3" data-pro-score-state={score.state} data-score-hero>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          <GameIcon name="target" className="size-3.5" />
          {t("vgl5.score.badge")}
        </span>
        {tips}
      </div>
      {ready ? (
        <p className="flex items-baseline gap-2" data-pro-score-value>
          <span
            className={cn(
              "font-display font-semibold leading-none tabular-nums text-foreground drop-shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_35%,transparent)]",
              size === "xl" ? "text-7xl sm:text-8xl" : "text-6xl sm:text-7xl",
            )}
          >
            {formatScore(score.score!, intlTag)}
          </span>
          <span className="font-mono text-base text-muted-foreground sm:text-lg">/100</span>
        </p>
      ) : (
        <div className="space-y-2">
          <p
            className="font-display text-6xl font-semibold leading-none text-muted-foreground/60"
            aria-hidden
          >
            {NOT_AVAILABLE_MARK}
          </p>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {scoreStateText(score, t, intlTag)}
          </p>
        </div>
      )}
      <Meter value={ready ? score.score : null} />
      {ready ? (
        <div className="flex flex-wrap gap-1.5" data-score-coverage>
          <Chip>
            {t("score.confidence.label")}:{" "}
            {t(`vgl5.score.conf.${score.confidence ?? "PROVISIONAL"}` as TranslationKey)}
          </Chip>
          <Chip>{fill(t("vgl5.score.matches"), { n: score.matches })}</Chip>
          <Chip>{fill(t("vgl5.score.rounds"), { n: score.rounds })}</Chip>
          <Chip>{fill(t("vgl5.score.coverage"), { v: pct(score.coverage, intlTag) })}</Chip>
        </div>
      ) : null}
    </div>
  );
}
