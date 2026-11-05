/**
 * Fase 4 — player-defined goals with progress derived from official metrics, and the
 * achievements recorded when a goal is reached with a complete sample. Null is never zero:
 * matches without the metric measured do not count, and a short sample says so.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { fill, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { GOAL_METRICS, type GoalMetric } from "@/lib/notifications/notificationEvents";
import {
  deleteGoal,
  listGoals,
  saveGoal,
  type GoalView,
} from "@/lib/notifications/notifications.functions";
import { cn } from "@/lib/utils";

const GOALS_KEY = ["goals"] as const;
const DIGITS: Record<GoalMetric, number> = {
  rating: 2,
  adr: 1,
  kast: 1,
  hsPercent: 1,
  kd: 2,
  openingSuccess: 1,
};

interface Draft {
  id: string | null;
  metric: GoalMetric;
  direction: "AT_LEAST" | "AT_MOST";
  target: string;
  windowMatches: number;
  deadline: string;
  reminder: "OFF" | "WEEKLY";
  reminderWeekday: number;
}

const EMPTY: Draft = {
  id: null,
  metric: "adr",
  direction: "AT_LEAST",
  target: "",
  windowMatches: 5,
  deadline: "",
  reminder: "OFF",
  reminderWeekday: 1,
};

export function GoalsPanel() {
  const t = useT();
  const { intlTag } = useI18n();
  const goals = useQuery({ queryKey: GOALS_KEY, queryFn: () => listGoals() });
  const [draft, setDraft] = useState<Draft | null>(null);
  if (goals.isPending)
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("notify.loading")}
      </p>
    );
  if (goals.isError)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">
          {t("goals.loadError")}
        </p>
        <Button size="sm" variant="outline" onClick={() => goals.refetch()}>
          {t("notify.retry")}
        </Button>
      </div>
    );
  const data = goals.data;
  if (!data.available)
    return <p className="text-sm text-muted-foreground">{t("goals.unavailable")}</p>;
  if (!data.hasPlayer)
    return <p className="text-sm text-muted-foreground">{t("goals.noPlayer")}</p>;
  return (
    <div className="space-y-6" data-goals>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {fill(t("goals.updated"), { date: formatDateTime(data.updatedAt, intlTag) })}
        </p>
        {!draft ? (
          <Button size="sm" onClick={() => setDraft(EMPTY)} disabled={data.goals.length >= 10}>
            {t("goals.new")}
          </Button>
        ) : null}
      </div>
      {data.goals.length >= 10 ? (
        <p className="text-xs text-muted-foreground">{t("goals.limit")}</p>
      ) : null}
      {draft ? <GoalForm draft={draft} onDone={() => setDraft(null)} /> : null}
      {!data.goals.length && !draft ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("goals.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {data.goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={() =>
                setDraft({
                  id: g.id,
                  metric: g.metric,
                  direction: g.direction,
                  target: String(g.target),
                  windowMatches: g.windowMatches,
                  deadline: g.deadline ?? "",
                  reminder: g.reminder,
                  reminderWeekday: g.reminderWeekday ?? 1,
                })
              }
            />
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">{t("goals.progress.source")}</p>
      <section aria-label={t("goals.achievements")} className="space-y-2">
        <h2 className="text-sm font-semibold">{t("goals.achievements")}</h2>
        {!data.achievements.length ? (
          <p className="text-xs text-muted-foreground">{t("goals.achievements.empty")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.achievements.map((a) => (
              <li key={a.id}>
                {fill(t("goals.achievement.line"), {
                  metric: t(`notify.metric.${a.metric}` as TranslationKey),
                  direction: t(`goals.direction.${a.direction}` as TranslationKey).toLowerCase(),
                  target: formatNumber(a.target, intlTag, DIGITS[a.metric as GoalMetric] ?? 1),
                  value: formatNumber(
                    a.achievedValue,
                    intlTag,
                    DIGITS[a.metric as GoalMetric] ?? 1,
                  ),
                  sample: a.sampleMatches,
                  from: formatDate(a.periodFrom, intlTag),
                  to: formatDate(a.periodTo, intlTag),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GoalCard({ goal, onEdit }: { goal: GoalView; onEdit: () => void }) {
  const t = useT();
  const { intlTag } = useI18n();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const p = goal.progress;
  const digits = DIGITS[goal.metric];
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {t(`notify.metric.${goal.metric}` as TranslationKey)} ·{" "}
            {t(`goals.direction.${goal.direction}` as TranslationKey)}{" "}
            {formatNumber(goal.target, intlTag, digits)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("goals.window")}: {goal.windowMatches}
            {goal.deadline
              ? ` · ${t("goals.deadline")}: ${formatDate(goal.deadline, intlTag)}`
              : ""}
            {goal.reminder === "WEEKLY"
              ? ` · ${t("goals.reminder.WEEKLY")} (${t(`goals.weekday.${goal.reminderWeekday ?? 1}` as TranslationKey)})`
              : ""}
          </p>
        </div>
        <span
          className={cn(
            "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase",
            p.status === "REACHED"
              ? "border-success/40 text-success"
              : "border-border text-muted-foreground",
          )}
        >
          {p.status === "REACHED" || p.status === "IN_PROGRESS"
            ? t(`goals.progress.${p.status}` as TranslationKey)
            : "—"}
        </span>
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {p.status === "NO_DATA" ? <p>{t("goals.progress.NO_DATA")}</p> : null}
        {p.status === "INSUFFICIENT_SAMPLE" ? (
          <p>
            {fill(t("goals.progress.INSUFFICIENT_SAMPLE"), { sample: p.sample, window: p.window })}
          </p>
        ) : null}
        {p.value !== null ? (
          <p>
            {fill(t("goals.progress.value"), {
              value: formatNumber(p.value, intlTag, digits),
              sample: p.sample,
            })}
          </p>
        ) : null}
        {p.periodFrom && p.periodTo ? (
          <p>
            {fill(t("goals.progress.period"), {
              from: formatDate(p.periodFrom, intlTag),
              to: formatDate(p.periodTo, intlTag),
            })}
          </p>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden />
          {t("goals.edit")}
        </Button>
        {!confirming ? (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            <Trash2 className="size-3.5" aria-hidden />
            {t("goals.delete")}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                setFailed(false);
                try {
                  const r = await deleteGoal({ data: { id: goal.id } });
                  if (!r.ok) throw new Error("not deleted");
                  await queryClient.invalidateQueries({ queryKey: GOALS_KEY });
                } catch {
                  setFailed(true);
                }
              }}
            >
              {t("goals.deleteConfirm")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t("goals.cancel")}
            </Button>
          </>
        )}
        {failed ? (
          <span role="alert" className="text-[11px] text-destructive">
            {t("goals.error")}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function GoalForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [d, setD] = useState(draft);
  const [status, setStatus] = useState<"idle" | "busy" | "invalid" | "limit" | "error">("idle");
  const input =
    "mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  return (
    <form
      className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2"
      data-goal-form
      onSubmit={async (e) => {
        e.preventDefault();
        const target = Number(d.target.replace(",", "."));
        if (!d.target || !Number.isFinite(target)) return setStatus("invalid");
        setStatus("busy");
        try {
          const r = await saveGoal({
            data: {
              id: d.id,
              metric: d.metric,
              direction: d.direction,
              target,
              windowMatches: d.windowMatches,
              deadline: d.deadline || null,
              reminder: d.reminder,
              reminderWeekday: d.reminder === "WEEKLY" ? d.reminderWeekday : null,
            },
          });
          if (!r.ok) return setStatus(r.error === "LIMIT" ? "limit" : "invalid");
          await queryClient.invalidateQueries({ queryKey: GOALS_KEY });
          onDone();
        } catch {
          setStatus("error");
        }
      }}
    >
      <label className="text-xs font-medium">
        {t("goals.metric")}
        <select
          className={input}
          value={d.metric}
          onChange={(e) => setD({ ...d, metric: e.target.value as GoalMetric })}
        >
          {GOAL_METRICS.map((m) => (
            <option key={m} value={m}>
              {t(`notify.metric.${m}` as TranslationKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium">
        {t("goals.direction")}
        <select
          className={input}
          value={d.direction}
          onChange={(e) => setD({ ...d, direction: e.target.value as Draft["direction"] })}
        >
          <option value="AT_LEAST">{t("goals.direction.AT_LEAST")}</option>
          <option value="AT_MOST">{t("goals.direction.AT_MOST")}</option>
        </select>
      </label>
      <label className="text-xs font-medium">
        {t("goals.target")}
        <input
          className={input}
          inputMode="decimal"
          required
          value={d.target}
          onChange={(e) => setD({ ...d, target: e.target.value })}
        />
      </label>
      <label className="text-xs font-medium">
        {t("goals.window")}
        <input
          className={input}
          type="number"
          min={3}
          max={20}
          value={d.windowMatches}
          onChange={(e) =>
            setD({ ...d, windowMatches: Math.max(3, Math.min(20, Number(e.target.value) || 3)) })
          }
        />
      </label>
      <label className="text-xs font-medium">
        {t("goals.deadline")}
        <input
          className={input}
          type="date"
          value={d.deadline}
          onChange={(e) => setD({ ...d, deadline: e.target.value })}
        />
      </label>
      <label className="text-xs font-medium">
        {t("goals.reminder")}
        <select
          className={input}
          value={d.reminder}
          onChange={(e) => setD({ ...d, reminder: e.target.value as Draft["reminder"] })}
        >
          <option value="OFF">{t("goals.reminder.OFF")}</option>
          <option value="WEEKLY">{t("goals.reminder.WEEKLY")}</option>
        </select>
      </label>
      {d.reminder === "WEEKLY" ? (
        <label className="text-xs font-medium">
          {t("goals.weekday")}
          <select
            className={input}
            value={d.reminderWeekday}
            onChange={(e) => setD({ ...d, reminderWeekday: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <option key={i} value={i}>
                {t(`goals.weekday.${i}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button size="sm" type="submit" disabled={status === "busy"}>
          {t("goals.save")}
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={onDone}>
          {t("goals.cancel")}
        </Button>
        <span role="status" className="text-xs text-destructive">
          {status === "invalid"
            ? t("goals.invalid")
            : status === "limit"
              ? t("goals.limit")
              : status === "error"
                ? t("goals.error")
                : ""}
        </span>
      </div>
    </form>
  );
}
