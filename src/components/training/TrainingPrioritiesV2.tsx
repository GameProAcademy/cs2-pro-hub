/**
 * UX-1.7 — the ONE training list (`cs2.training-priority.v2`, wireframes W9/W10). Each item says
 * its value, interval, fixed reference, sample in the signal's own unit and why it entered; the
 * rest is "in observation" with the reason and what is missing — never a judgement.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { Cs2Mask } from "@/components/cs2/Cs2Art";
import { DIMENSION_ART } from "@/lib/cs2/assets";
import { DataStateBadge } from "@/components/common/DataState";
import { ToneBadge } from "@/components/common/VisualBadges";
import { ErrorState, LoadingState } from "@/components/common/States";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import { signalLabel } from "@/lib/dnaSignalLabels";
import { fill, formatNumber } from "@/lib/format";
import { AREA_PAGE } from "@/lib/training/adaptive";
import type { SkillArea } from "@/lib/training/exercises";
import type { PriorityResultV2, PrioritySignal } from "@/lib/training/priorityV2";
import { getTrainingPriorities } from "@/lib/trainingPriority.functions";
import { cn } from "@/lib/utils";

export const TRAINING_PRIORITIES_KEY = ["player", "training", "priorities-v2"] as const;

export function TrainingPrioritiesV2() {
  const t = useT();
  const q = useQuery({ queryKey: TRAINING_PRIORITIES_KEY, queryFn: () => getTrainingPriorities() });
  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data)
    return (
      <ErrorState
        title={t("real.error.title")}
        description={t("real.error.description")}
        onRetry={() => void q.refetch()}
      />
    );
  return <TrainingPrioritiesBody r={q.data} />;
}

export function TrainingPrioritiesBody({ r }: { r: PriorityResultV2 }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <ChartCard
      showDemoTag={false}
      icon="target"
      title={t("training.v2.title")}
      subtitle={t("training.v2.subtitle")}
    >
      <div data-training-v2 data-priorities-count={r.priorities.length} className="space-y-4">
        {r.priorities.length ? (
          <ol className="space-y-3">
            {r.priorities.map((p, i) => (
              <li
                key={p.key}
                className="surface-panel relative overflow-hidden rounded-lg border border-primary/30 p-4 pl-5"
                data-priority-v2={p.key}
              >
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary/70" />
                <SignalLine s={p} rank={i + 1} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground" data-training-v2-none>
            {t("training.v2.none")}
          </p>
        )}
        {r.observing.length ? (
          <div>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="training-v2-observing"
              onClick={() => setOpen((o) => !o)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-medium text-foreground hover:text-primary"
            >
              <ChevronDown
                className={cn("size-4 transition-transform", open && "rotate-180")}
                aria-hidden
              />
              {fill(t("training.v2.observing"), { n: r.observing.length })}
            </button>
            {open ? (
              <ul
                id="training-v2-observing"
                className="mt-2 divide-y divide-border rounded-lg border border-dashed border-border-strong px-3"
              >
                {r.observing.map((s) => (
                  <li
                    key={s.key}
                    className="py-2"
                    data-observing={s.key}
                    data-reason={s.reason ?? "WAITING"}
                  >
                    <SignalLine s={s} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground" data-priority-legend>
          {t("vgl5.training.legend")}
        </p>
        <p className="text-xs text-muted-foreground">{t("training.v2.method")}</p>
      </div>
    </ChartCard>
  );
}

export function SignalLine({ s, rank }: { s: PrioritySignal; rank?: number }) {
  const t = useT();
  const { intlTag, locale } = useI18n();
  const pct = (v: number) => formatNumber(Math.max(0, Math.min(1, v)) * 100, intlTag, 1);
  const name = signalLabel(s.key.split(".")[1]!, locale);
  const unit = t(`training.v2.unit.${s.sampleUnit}` as TranslationKey);
  const missingParts = s.missing
    ? [
        s.missing.sample > 0
          ? fill(t("training.v2.missing.sample"), { n: s.missing.sample, unit })
          : null,
        s.missing.matches > 0
          ? fill(t("training.v2.missing.matches"), { n: s.missing.matches })
          : null,
      ].filter(Boolean)
    : [];
  const art = DIMENSION_ART[s.dimension];
  return (
    <div className="relative isolate space-y-2 text-sm">
      {/* VGL 2.0: the dimension's CS2 silhouette as a decorative watermark. */}
      {art ? (
        <Cs2Mask
          src={art}
          className="pointer-events-none absolute -top-1 right-0 -z-10 h-12 w-32 text-primary opacity-[0.07]"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {rank ? (
          <span
            className="num-display flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-xs font-semibold text-primary"
            aria-label={`#${rank}`}
            data-priority-rank={rank}
          >
            {rank}
          </span>
        ) : null}
        <span className="font-medium text-foreground">{name}</span>
        <ToneBadge tone="context">{t(dnaLabelKey(s.dimension))}</ToneBadge>
        <SignalStateBadge s={s} ranked={Boolean(rank)} />
      </div>
      {s.value !== null ? (
        <>
          <p className="font-mono text-xs text-foreground" data-signal-value>
            {s.interval
              ? fill(t("training.v2.value"), {
                  v: pct(s.value),
                  a: pct(s.interval[0]),
                  b: pct(s.interval[1]),
                  r: pct(s.reference),
                })
              : `${pct(s.value)}%`}
          </p>
          <PriorityBar s={s} />
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {fill(t("training.v2.sample"), { n: s.sample, unit, m: s.matches })}
        {s.status === "OBSERVE" && s.reason
          ? ` · ${t(`training.v2.reason.${s.reason}` as TranslationKey)}`
          : s.status === "RECOMMEND" && !rank
            ? ` · ${t("training.v2.waiting")}`
            : ""}
        {missingParts.length
          ? ` · ${fill(t("training.v2.missing"), { parts: missingParts.join(" · ") })}`
          : ""}
      </p>
      {rank ? (
        <Link
          to={AREA_PAGE[s.dimension as SkillArea] as "/analysis"}
          className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("training.v2.open")}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Visual phase: the measurement state of the signal, with the shared data-state words. A value
 * below the show minimum is "insufficient sample" (dashed neutral, never a zero); a shown value
 * is derived (a rate over the player's own events). Recommended items need no extra badge.
 */
function SignalStateBadge({ s, ranked }: { s: PrioritySignal; ranked: boolean }) {
  if (ranked) return null;
  if (s.value === null) return <DataStateBadge status="INSUFFICIENT_SAMPLE" />;
  return <DataStateBadge status="DERIVED" />;
}

/**
 * VGL 5.0 — the same numbers as the text line, as a labelled horizontal bar that answers at a
 * glance: what it is (your rate vs the fixed reference of this signal), what it means (how far
 * below or above, in percentage points), and — with the rank and the link — what to do. The
 * interval is a light band. Nothing is computed beyond placing the existing numbers.
 */
export function PriorityBar({ s }: { s: PrioritySignal }) {
  const t = useT();
  const { intlTag } = useI18n();
  if (s.value === null) return null;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const at = (v: number) => `${clamp(v) * 100}%`;
  const pct = (v: number) => formatNumber(clamp(v) * 100, intlTag, 1);
  const gap = (s.value - s.reference) * 100;
  const below = gap < 0;
  const gapText = fill(t(below ? "vgl5.training.below" : "vgl5.training.above"), {
    d: formatNumber(Math.abs(gap), intlTag, 1),
  });
  return (
    <figure
      className="w-full max-w-xl space-y-1.5"
      role="img"
      aria-label={`${t("vgl5.training.you")} ${pct(s.value)}% · ${t("vgl5.training.reference")} ${pct(s.reference)}% · ${gapText}`}
      data-priority-bar
      data-priority-gap={below ? "below" : "above"}
    >
      <div className="flex items-baseline justify-between gap-3 font-mono text-xs tabular-nums">
        <span className={cn("font-semibold", below ? "text-primary" : "text-context")}>
          {t("vgl5.training.you")} {pct(s.value)}%
        </span>
        <span className="text-muted-foreground">
          {t("vgl5.training.reference")} {pct(s.reference)}%
        </span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-secondary" aria-hidden>
        {s.interval ? (
          <span
            className="absolute inset-y-0 rounded-full bg-foreground/10"
            style={{
              left: at(s.interval[0]),
              width: `calc(${at(s.interval[1])} - ${at(s.interval[0])})`,
            }}
          />
        ) : null}
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            below ? "bg-primary" : "bg-context",
          )}
          style={{ width: at(s.value) }}
        />
        <span
          className="absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: at(s.reference) }}
        />
      </div>
      <figcaption
        className={cn("text-xs font-medium", below ? "text-primary" : "text-muted-foreground")}
      >
        {gapText}
      </figcaption>
    </figure>
  );
}
