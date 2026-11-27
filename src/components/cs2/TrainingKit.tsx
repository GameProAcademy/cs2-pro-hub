/**
 * VGL 4.0 — Training Command Center.
 *
 * - `TrainingOverview`: the top of the training page in one panel — the current priorities
 *   (cs2.training-priority.v2, same order), the plan (status, period, adherence as segments, next
 *   review) and its sessions by status. Reads the same queries the sections below read.
 * - `TrainingAreas`: the real catalog's areas (`cs2.exercises.v1`, available exercises only) as
 *   cards with the area's CS2 silhouette, marking the areas that are a priority or in the plan.
 * Nothing is recomputed: counts are counts of existing items.
 */
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";

import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { ToneBadge } from "@/components/common/VisualBadges";
import { Cs2Mask } from "@/components/cs2/Cs2Art";
import { DNA_ICON } from "@/components/cs2/DnaVisuals";
import { SegmentedCount } from "@/components/cs2/HudKit";
import { ADAPTIVE_TRAINING_KEY } from "@/components/training/AdaptiveTraining";
import { TRAINING_PRIORITIES_KEY } from "@/components/training/TrainingPrioritiesV2";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { getAdaptiveTraining, type PlanView } from "@/lib/adaptiveTraining.functions";
import { DIMENSION_ART } from "@/lib/cs2/assets";
import { dnaLabelKey } from "@/lib/dna";
import { signalLabel } from "@/lib/dnaSignalLabels";
import { NOT_AVAILABLE_MARK, fill, formatDate } from "@/lib/format";
import { EXERCISES, type SkillArea } from "@/lib/training/exercises";
import type { PrioritySignal } from "@/lib/training/priorityV2";
import { getTrainingPriorities } from "@/lib/trainingPriority.functions";
import { cn } from "@/lib/utils";
import type { DnaDimension } from "@/types";

const dimIcon = (d: string): GameIconName =>
  (DNA_ICON as Record<string, GameIconName>)[d] ?? "target";

/** Sessions of the plan by status (superseded ones are history, not counted). Pure. */
export function sessionCounts(plan: Pick<PlanView, "sessions">) {
  const out = { PLANNED: 0, DONE: 0, SKIPPED: 0 };
  for (const s of plan.sessions) if (s.status !== "SUPERSEDED") out[s.status] += 1;
  return out;
}

/** Available catalog exercises per area, in catalog order. Pure. */
export function catalogAreas(): { area: SkillArea; exercises: number }[] {
  const out = new Map<SkillArea, number>();
  for (const e of EXERCISES)
    if (e.available) for (const a of e.areas) out.set(a, (out.get(a) ?? 0) + 1);
  return [...out].map(([area, exercises]) => ({ area, exercises }));
}

export function TrainingOverview() {
  const t = useT();
  const { intlTag, locale } = useI18n();
  const pq = useQuery({
    queryKey: TRAINING_PRIORITIES_KEY,
    queryFn: () => getTrainingPriorities(),
  });
  const aq = useQuery({ queryKey: ADAPTIVE_TRAINING_KEY, queryFn: () => getAdaptiveTraining() });
  if (!pq.data && !aq.data) return null;
  const priorities: PrioritySignal[] = pq.data?.priorities ?? [];
  const plan = aq.data?.plan ?? null;
  const counts = plan ? sessionCounts(plan) : null;
  return (
    <section
      className="surface-panel vgl-grid relative overflow-hidden rounded-2xl border border-border p-4 sm:p-6"
      aria-labelledby="training-overview-title"
      data-training-overview
    >
      <h2
        id="training-overview-title"
        className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground"
      >
        <GameIcon name="target" className="size-4 text-primary" />
        {t("vgl4.training.title")}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div
          className="rounded-xl border border-border bg-background/50 p-4"
          data-overview-priorities
        >
          <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("vgl4.training.priorities")}
          </h3>
          {priorities.length ? (
            <ol className="space-y-2">
              {priorities.map((p, i) => (
                <li
                  key={p.key}
                  className="flex items-center gap-2 text-sm"
                  data-overview-priority={p.key}
                >
                  <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                    <GameIcon name={dimIcon(p.dimension)} className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">
                      {signalLabel(p.key.split(".")[1]!, locale)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t(dnaLabelKey(p.dimension))}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{t("training.v2.none")}</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-background/50 p-4" data-overview-plan>
          <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("vgl4.training.plan")}
          </h3>
          {plan ? (
            <div className="space-y-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <ToneBadge
                  tone={
                    plan.status === "ACTIVE"
                      ? "brand"
                      : plan.status === "PAUSED"
                        ? "attention"
                        : plan.status === "COMPLETED"
                          ? "context"
                          : "neutral"
                  }
                >
                  {t(`training.adaptive.status.${plan.status}` as TranslationKey)}
                </ToneBadge>
                <span className="font-display font-semibold text-foreground">
                  {fill(t("vgl4.training.horizon"), { n: plan.horizon })}
                </span>
              </p>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatDate(plan.startDate, intlTag)} → {formatDate(plan.endDate, intlTag)}
              </p>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {fill(t("vgl4.training.adherence"), {
                    done: plan.adherence.done,
                    due: plan.adherence.due,
                  })}
                </p>
                <SegmentedCount done={plan.adherence.done} due={plan.adherence.due} />
              </div>
              <p className="text-xs text-muted-foreground">
                {plan.nextReview
                  ? fill(t("training.adaptive.nextReview"), {
                      d: formatDate(plan.nextReview, intlTag),
                    })
                  : NOT_AVAILABLE_MARK}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("vgl4.training.noPlan")}</p>
          )}
        </div>
        <div
          className="rounded-xl border border-border bg-background/50 p-4"
          data-overview-sessions
        >
          <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("vgl4.training.sessions")}
          </h3>
          {counts ? (
            <dl className="grid grid-cols-3 gap-2 text-center">
              {(["PLANNED", "DONE", "SKIPPED"] as const).map((k) => (
                <div
                  key={k}
                  className={cn(
                    "rounded-lg border p-2",
                    k === "DONE"
                      ? "border-primary/40"
                      : k === "SKIPPED"
                        ? "border-warning/40"
                        : "border-border",
                  )}
                  data-session-count={k}
                >
                  <dd className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {counts[k]}
                  </dd>
                  <dt className="text-xs text-muted-foreground">
                    {t(`vgl4.training.session.${k}` as TranslationKey)}
                  </dt>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{NOT_AVAILABLE_MARK}</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function TrainingAreas() {
  const t = useT();
  const pq = useQuery({
    queryKey: TRAINING_PRIORITIES_KEY,
    queryFn: () => getTrainingPriorities(),
  });
  const aq = useQuery({ queryKey: ADAPTIVE_TRAINING_KEY, queryFn: () => getAdaptiveTraining() });
  const priority = new Set<string>((pq.data?.priorities ?? []).map((p) => p.dimension));
  const inPlan = new Set<string>(
    (aq.data?.plan?.sessions ?? []).filter((s) => s.status !== "SUPERSEDED").map((s) => s.area),
  );
  const areas = catalogAreas();
  return (
    <section aria-labelledby="training-areas-title" data-training-areas>
      <h2
        id="training-areas-title"
        className="mb-1 flex items-center gap-2 font-display text-lg font-semibold text-foreground"
      >
        <GameIcon name="crosshair" className="size-4 text-primary" />
        {t("vgl4.training.areas")}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("vgl4.training.areasSub")}</p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {areas.map(({ area, exercises }, i) => {
          const art = DIMENSION_ART[area];
          const hot = priority.has(area);
          return (
            <li
              key={area}
              className={cn(
                "vgl-rise vgl-lift surface-panel relative isolate overflow-hidden rounded-xl border p-4",
                hot ? "border-primary/50" : "border-border",
              )}
              style={{ "--vgl-i": i } as CSSProperties}
              data-training-area={area}
              data-area-priority={hot ? "true" : "false"}
            >
              {art ? (
                <Cs2Mask
                  src={art}
                  className="pointer-events-none absolute -right-3 bottom-2 -z-10 h-12 w-28 text-primary opacity-[0.1]"
                />
              ) : null}
              <span className="flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <GameIcon name={dimIcon(area)} className="size-4" />
              </span>
              <p className="mt-3 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                {t(dnaLabelKey(area as DnaDimension))}
              </p>
              <p className="text-xs text-muted-foreground">
                {fill(t("vgl4.training.exercises"), { n: exercises })}
              </p>
              <p className="mt-2 flex flex-wrap gap-1">
                {hot ? <ToneBadge tone="brand">{t("vgl4.training.tagPriority")}</ToneBadge> : null}
                {inPlan.has(area) ? (
                  <ToneBadge tone="context">{t("vgl4.training.tagPlan")}</ToneBadge>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
