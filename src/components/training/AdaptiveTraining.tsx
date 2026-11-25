/**
 * PM5 module H — adaptive training plan (7 / 30 / 90 days). Shows why each priority exists (its
 * evidence and the parts of the documented score), the exercises with steps and completion
 * criteria, sessions the player marks explicitly, adherence, goals (process goals and tracked
 * metrics with their baseline — never a promised number) and the version history. A revision is
 * shown as a diff and saved only on acceptance.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, ExternalLink } from "lucide-react";
import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { ToneBadge, type BadgeTone } from "@/components/common/VisualBadges";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import {
  applyRevision,
  createAdaptivePlan,
  getAdaptiveTraining,
  logSession,
  proposeRevision,
  setPlanStatus,
  type PlanView,
  type SessionView,
  type TrainingView,
} from "@/lib/adaptiveTraining.functions";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import { HORIZONS, type Horizon, type PlanDiff, type Priority } from "@/lib/training/adaptive";
import { exerciseById } from "@/lib/training/exercises";

export const ADAPTIVE_TRAINING_KEY = ["player", "training", "adaptive"] as const;

export function AdaptiveTraining() {
  const t = useT();
  const q = useQuery({ queryKey: ADAPTIVE_TRAINING_KEY, queryFn: () => getAdaptiveTraining() });
  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data)
    return (
      <ErrorState
        title={t("real.error.title")}
        description={t("real.error.description")}
        onRetry={() => void q.refetch()}
      />
    );
  return <AdaptiveTrainingBody v={q.data} />;
}

export function AdaptiveTrainingBody({ v }: { v: TrainingView }) {
  const t = useT();
  return (
    <section
      className="space-y-6"
      data-adaptive-training
      data-evidence-state={v.evidence.state}
      data-plan-status={v.plan?.status ?? "NONE"}
    >
      {v.plan ? (
        <PlanPanel plan={v.plan} />
      ) : v.evidence.state === "READY" ? (
        <CreatePanel v={v} />
      ) : (
        <EmptyState
          icon={<CircleDashed className="size-5" aria-hidden />}
          title={t(`training.adaptive.state.${v.evidence.state}.title` as TranslationKey)}
          description={fill(
            t(`training.adaptive.state.${v.evidence.state}.body` as TranslationKey),
            { n: v.evidence.matches, min: 3 },
          )}
        />
      )}
      {v.history.length ? (
        <ChartCard
          title={t("training.adaptive.history")}
          subtitle={t("training.adaptive.history.subtitle")}
        >
          <ul className="space-y-1 text-sm" data-plan-history>
            {v.history.map((h) => (
              <li key={h.id}>
                {fill(t("training.adaptive.history.item"), { h: h.horizon, start: h.startDate })} ·{" "}
                {t(`training.adaptive.status.${h.status}` as TranslationKey)}
              </li>
            ))}
          </ul>
        </ChartCard>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("training.adaptive.noPromise")}</p>
    </section>
  );
}

/** Visual phase: plan and session states as tones (labels unchanged). */
const PLAN_STATUS_TONE: Record<"ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED", BadgeTone> = {
  ACTIVE: "brand",
  PAUSED: "attention",
  COMPLETED: "context",
  CANCELLED: "neutral",
};
const SESSION_TONE: Record<"PLANNED" | "DONE" | "SKIPPED", BadgeTone> = {
  PLANNED: "neutral",
  DONE: "brand",
  SKIPPED: "attention",
};

function Priorities({ priorities }: { priorities: Priority[] }) {
  const t = useT();
  const { intlTag } = useI18n();
  return (
    <ol className="space-y-3" data-priorities>
      {priorities.map((p, i) => (
        <li
          key={p.area}
          className="surface-panel rounded-lg border border-border p-3"
          data-priority={p.area}
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="num-display flex size-6 items-center justify-center rounded-md bg-primary/12 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <span className="font-medium">{t(`training.area.${p.area}` as TranslationKey)}</span>
            <span className="font-mono text-xs text-muted-foreground" data-score>
              {fill(t("training.adaptive.score"), {
                s: formatNumber(p.score, intlTag, 2),
                gap: formatNumber(p.parts.gap, intlTag, 2),
                trend: formatNumber(p.parts.trend, intlTag, 2),
                c: formatNumber(p.parts.confidence, intlTag, 2),
                g: formatNumber(p.parts.goal, intlTag, 2),
              })}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("training.adaptive.why")}</p>
          <ul className="mt-1 space-y-0.5 text-xs" data-evidence>
            {p.evidence.map((e) => (
              <li key={e.metricKey} data-evidence-kind={e.kind}>
                {e.kind === "DNA"
                  ? fill(t("training.adaptive.evidence.dna"), {
                      v: e.value === null ? NOT_AVAILABLE_MARK : formatNumber(e.value, intlTag, 0),
                      n: e.matches,
                    })
                  : fill(t("training.adaptive.evidence.trend"), {
                      metric: t(`evolution.metric.${e.metricKey}` as TranslationKey),
                      v: e.value === null ? NOT_AVAILABLE_MARK : formatNumber(e.value, intlTag, 2),
                      n: e.matches,
                      w: e.coverage?.window ?? NOT_AVAILABLE_MARK,
                      d:
                        e.deltaPercent === null || e.deltaPercent === undefined
                          ? t("training.adaptive.noComparison")
                          : `${formatNumber(e.deltaPercent, intlTag, 0)}%`,
                    })}{" "}
                <Link
                  to={e.page as "/evolution"}
                  className="text-primary underline-offset-2 hover:underline"
                  data-evidence-link
                >
                  {t("training.adaptive.openEvidence")}
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function CreatePanel({ v }: { v: TrainingView }) {
  const t = useT();
  const qc = useQueryClient();
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [sessions, setSessions] = useState(3);
  const [minutes, setMinutes] = useState(30);
  const [excluded, setExcluded] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: () =>
      createAdaptivePlan({
        data: {
          horizon,
          sessionsPerWeek: sessions,
          minutesPerSession: minutes,
          excludeAreas: excluded as never,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ADAPTIVE_TRAINING_KEY }),
  });
  return (
    <ChartCard
      title={t("training.adaptive.create.title")}
      subtitle={t("training.adaptive.create.subtitle")}
    >
      {/* UX-1.7: the priorities are the ONE list shown above (TrainingPrioritiesV2); the plan
          is built from it. A plan keeps showing the priorities it was created with. */}
      {v.evidence.excluded.length ? (
        <p className="mt-2 text-xs text-muted-foreground" data-excluded-areas>
          {t("training.adaptive.excluded")}{" "}
          {v.evidence.excluded
            .map(
              (x) =>
                `${t(`training.area.${x.area}` as TranslationKey)} (${t(`training.adaptive.exclusion.${x.reason}` as TranslationKey)})`,
            )
            .join(" · ")}
        </p>
      ) : null}
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>{t("training.adaptive.horizon")}</span>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value) as Horizon)}
          >
            {HORIZONS.map((h) => (
              <option key={h} value={h}>
                {fill(t("training.adaptive.horizonN"), { n: h })}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>{t("training.adaptive.sessionsPerWeek")}</span>
          <Input
            type="number"
            min={1}
            max={6}
            value={sessions}
            onChange={(e) => setSessions(Number(e.target.value))}
            className="h-9 w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>{t("training.adaptive.minutes")}</span>
          <Input
            type="number"
            min={10}
            max={90}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="h-9 w-24"
          />
        </label>
        <fieldset className="flex flex-wrap gap-2 text-xs">
          <legend className="mb-1 text-muted-foreground">{t("training.adaptive.dropAreas")}</legend>
          {v.evidence.priorities.map((p) => (
            <label key={p.area} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={excluded.includes(p.area)}
                onChange={(e) =>
                  setExcluded((x) =>
                    e.target.checked ? [...x, p.area] : x.filter((a) => a !== p.area),
                  )
                }
              />
              {t(`training.area.${p.area}` as TranslationKey)}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={create.isPending} data-create-plan>
          {t("training.adaptive.create")}
        </Button>
      </form>
      {create.data && create.data.status !== "OK" ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t(`training.adaptive.result.${create.data.status}` as TranslationKey)}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">{t("training.adaptive.method")}</p>
    </ChartCard>
  );
}

function PlanPanel({ plan }: { plan: PlanView }) {
  const t = useT();
  const { intlTag } = useI18n();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ADAPTIVE_TRAINING_KEY });
  const [diff, setDiff] = useState<PlanDiff | null>(null);
  const base = { planId: plan.id, basedOnVersion: plan.activeVersion, reason: "REVISION" as const };
  const propose = useMutation({
    mutationFn: () => proposeRevision({ data: base }),
    onSuccess: (r) => setDiff(r.status === "PROPOSAL" ? r.diff : null),
  });
  const apply = useMutation({
    mutationFn: () => applyRevision({ data: base }),
    onSuccess: () => {
      setDiff(null);
      refresh();
    },
  });
  const status = useMutation({
    mutationFn: (s: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED") =>
      setPlanStatus({ data: { planId: plan.id, status: s } }),
    onSuccess: refresh,
  });
  const weeks = new Map<number, SessionView[]>();
  for (const s of plan.sessions) {
    const w =
      Math.floor(
        (Date.parse(s.scheduledOn) - Date.parse(plan.startDate)) / (7 * 24 * 3600 * 1000),
      ) + 1;
    weeks.set(w, [...(weeks.get(w) ?? []), s]);
  }
  return (
    <div className="space-y-6" data-plan={plan.id}>
      <ChartCard
        title={fill(t("training.adaptive.plan.title"), { n: plan.horizon })}
        subtitle={fill(t("training.adaptive.plan.subtitle"), {
          start: formatDate(plan.startDate, intlTag),
          end: formatDate(plan.endDate, intlTag),
          v: plan.activeVersion,
        })}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <ToneBadge
            tone={PLAN_STATUS_TONE[plan.status as keyof typeof PLAN_STATUS_TONE] ?? "neutral"}
            data-plan-state={plan.status}
          >
            {t(`training.adaptive.status.${plan.status}` as TranslationKey)}
          </ToneBadge>
          <span data-adherence={plan.adherence.rate === null ? "NO_SAMPLE" : "OK"}>
            {plan.adherence.rate === null
              ? t("training.adaptive.adherence.none")
              : fill(t("training.adaptive.adherence"), {
                  done: plan.adherence.done,
                  due: plan.adherence.due,
                  p: formatNumber(plan.adherence.rate * 100, intlTag, 0),
                })}
          </span>
          {plan.nextReview ? (
            <span>
              {fill(t("training.adaptive.nextReview"), { d: formatDate(plan.nextReview, intlTag) })}
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {plan.status === "ACTIVE" ? (
              <Button size="sm" variant="outline" onClick={() => status.mutate("PAUSED")}>
                {t("training.adaptive.pause")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => status.mutate("ACTIVE")}>
                {t("training.adaptive.resume")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => propose.mutate()}
              disabled={propose.isPending}
              data-review-plan
            >
              {t("training.adaptive.review")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => status.mutate("COMPLETED")}>
              {t("training.adaptive.complete")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => status.mutate("CANCELLED")}>
              {t("training.adaptive.cancel")}
            </Button>
          </div>
        </div>
        {propose.data && propose.data.status !== "PROPOSAL" ? (
          <p role="alert" className="mt-2 text-sm text-muted-foreground">
            {t(`training.adaptive.result.${propose.data.status}` as TranslationKey)}
          </p>
        ) : null}
        {diff ? (
          <DiffBox
            diff={diff}
            onAccept={() => apply.mutate()}
            onKeep={() => setDiff(null)}
            pending={apply.isPending}
          />
        ) : null}
      </ChartCard>

      {/* UX-1.7 (R-13): the current list is the one above. What the plan stored when it was
          created is history: kept intact, shown closed and labelled with its method, never as a
          second list of priorities. */}
      <details className="rounded-lg border border-border px-4 py-3" data-plan-origin>
        <summary className="cursor-pointer select-none text-sm text-muted-foreground">
          {fill(t("training.plan.origin"), { version: plan.content.priorityVersion })}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">{t("training.plan.origin.hint")}</p>
        <div className="mt-3">
          <Priorities priorities={plan.content.priorities} />
        </div>
      </details>

      <ChartCard
        title={t("training.adaptive.goals")}
        subtitle={t("training.adaptive.goals.subtitle")}
      >
        <ul className="space-y-1 text-sm" data-goals>
          {plan.content.goals.map((g, i) => (
            <li key={i} data-goal={g.kind}>
              {g.kind === "TRACK_METRIC"
                ? fill(t("training.adaptive.goal.TRACK_METRIC"), {
                    metric: t(`evolution.metric.${g.metricKey}` as TranslationKey),
                    v:
                      g.baseline?.value === null || g.baseline?.value === undefined
                        ? NOT_AVAILABLE_MARK
                        : formatNumber(g.baseline.value, intlTag, 2),
                    n: g.baseline?.matches ?? 0,
                  })
                : fill(t(`training.adaptive.goal.${g.kind}` as TranslationKey), {
                    n: g.count ?? 0,
                  })}
            </li>
          ))}
        </ul>
      </ChartCard>

      <ChartCard
        title={t("training.adaptive.sessions")}
        subtitle={t("training.adaptive.sessions.subtitle")}
      >
        <div className="space-y-4" data-sessions>
          {[...weeks.entries()].map(([w, list]) => (
            <div key={w}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {fill(t("training.adaptive.week"), { n: w })}
              </h4>
              <ul className="space-y-2">
                {list.map((s) => (
                  <SessionItem
                    key={s.id}
                    s={s}
                    active={plan.status === "ACTIVE"}
                    onChange={refresh}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard
        title={t("training.adaptive.versions")}
        subtitle={t("training.adaptive.versions.subtitle")}
      >
        <ul className="space-y-1 text-sm" data-versions>
          {plan.versions.map((v) => (
            <li key={v.version}>
              {fill(t("training.adaptive.versionItem"), {
                v: v.version,
                d: formatDate(v.createdAt, intlTag),
              })}{" "}
              · {t(`training.adaptive.reason.${v.reason}` as TranslationKey)}
              {v.diff ? ` · ${diffText(t, v.diff)}` : ""}
            </li>
          ))}
        </ul>
      </ChartCard>
    </div>
  );
}

function diffText(t: (k: TranslationKey) => string, d: PlanDiff): string {
  if (!d.changed) return t("training.adaptive.diff.none");
  const area = (a: string) => t(`training.area.${a}` as TranslationKey);
  return [
    d.added.length ? `+ ${d.added.map(area).join(", ")}` : "",
    d.removed.length ? `− ${d.removed.map(area).join(", ")}` : "",
    d.reordered ? t("training.adaptive.diff.reordered") : "",
    d.evidenceChanged.length ? t("training.adaptive.diff.evidence") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function DiffBox({
  diff,
  onAccept,
  onKeep,
  pending,
}: {
  diff: PlanDiff;
  onAccept: () => void;
  onKeep: () => void;
  pending: boolean;
}) {
  const t = useT();
  return (
    <div
      className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm"
      role="region"
      aria-label={t("training.adaptive.diff.title")}
      data-diff={diff.changed ? "CHANGED" : "SAME"}
    >
      <p className="font-medium">{t("training.adaptive.diff.title")}</p>
      <p className="mt-1">{diffText(t, diff)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("training.adaptive.diff.explain")}</p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          onClick={onAccept}
          disabled={pending || !diff.changed}
          data-accept-revision
        >
          {t("training.adaptive.diff.accept")}
        </Button>
        <Button size="sm" variant="outline" onClick={onKeep}>
          {t("training.adaptive.diff.keep")}
        </Button>
      </div>
    </div>
  );
}

function SessionItem({
  s,
  active,
  onChange,
}: {
  s: SessionView;
  active: boolean;
  onChange: () => void;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  const ex = exerciseById(s.exerciseId);
  const [duration, setDuration] = useState(s.minutes);
  const log = useMutation({
    mutationFn: (status: "DONE" | "SKIPPED" | "PLANNED") =>
      logSession({
        data: {
          sessionId: s.id,
          status,
          ...(status === "DONE" ? { durationMinutes: duration } : {}),
        },
      }),
    onSuccess: onChange,
  });
  return (
    <li
      className="rounded-md border border-border bg-elevated/30 p-3 text-sm"
      data-session={s.id}
      data-session-status={s.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {formatDate(s.scheduledOn, intlTag)}
        </span>
        <span className="font-medium">
          {ex
            ? t(`exercise.${ex.id}.name` as TranslationKey)
            : t("training.adaptive.exerciseUnavailable")}
        </span>
        <span className="text-xs text-muted-foreground">
          {t(`training.area.${s.area}` as TranslationKey)} ·{" "}
          {fill(t("training.adaptive.minutesN"), { n: s.minutes })}
        </span>
        <ToneBadge
          tone={SESSION_TONE[s.status as keyof typeof SESSION_TONE] ?? "neutral"}
          className="ml-auto"
          data-session-badge={s.status}
        >
          {t(`training.adaptive.session.${s.status}` as TranslationKey)}
        </ToneBadge>
      </div>
      {ex ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-primary">
            {t("training.adaptive.howTo")}
          </summary>
          <p className="mt-1 text-xs">{t(`exercise.${ex.id}.goal` as TranslationKey)}</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs">
            {Array.from({ length: ex.steps }, (_, i) => (
              <li key={i}>{t(`exercise.${ex.id}.step${i + 1}` as TranslationKey)}</li>
            ))}
          </ol>
          {ex.commands.length ? (
            <pre
              className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-xs"
              aria-label={t("training.adaptive.commands")}
            >
              {ex.commands.join("\n")}
            </pre>
          ) : null}
          <p className="mt-1 text-xs">
            <strong>{t("training.adaptive.done")}</strong>{" "}
            {t(`exercise.${ex.id}.criteria` as TranslationKey)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fill(t("training.adaptive.tracks"), {
              m: t(`training.track.${ex.tracks}` as TranslationKey),
            })}
          </p>
          {ex.page ? (
            <Link
              to={ex.page as "/rounds"}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              {t("training.adaptive.openPage")}
            </Link>
          ) : null}
          {ex.equipment === "CS2PRO_REVIEW" ? (
            <Link
              to="/moments"
              className="ml-3 text-xs text-primary underline-offset-2 hover:underline"
              data-session-moments
            >
              {t("training.adaptive.openMoments")}
            </Link>
          ) : null}
          {ex.reference ? (
            <a
              href={ex.reference}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-3 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              {t("training.adaptive.reference")} <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
          {ex.reference ? (
            <p className="text-xs text-muted-foreground">{t("training.adaptive.referenceNote")}</p>
          ) : null}
        </details>
      ) : null}
      {active && s.status !== "SUPERSEDED" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {s.status === "PLANNED" ? (
            <>
              <label className="flex items-center gap-1">
                {t("training.adaptive.durationDone")}
                <Input
                  type="number"
                  min={1}
                  max={300}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-7 w-16"
                />
              </label>
              <Button
                size="sm"
                className="h-7"
                onClick={() => log.mutate("DONE")}
                disabled={log.isPending}
                data-session-done
              >
                {t("training.adaptive.markDone")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => log.mutate("SKIPPED")}
                disabled={log.isPending}
              >
                {t("training.adaptive.markSkipped")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => log.mutate("PLANNED")}
              disabled={log.isPending}
            >
              {t("training.adaptive.undo")}
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}
