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
      title={t("training.v2.title")}
      subtitle={t("training.v2.subtitle")}
    >
      <div data-training-v2 data-priorities-count={r.priorities.length} className="space-y-4">
        {r.priorities.length ? (
          <ol className="space-y-3">
            {r.priorities.map((p, i) => (
              <li
                key={p.key}
                className="rounded-lg border border-primary/30 p-3"
                data-priority-v2={p.key}
              >
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
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground"
            >
              <ChevronDown
                className={cn("size-4 transition-transform", open && "rotate-180")}
                aria-hidden
              />
              {fill(t("training.v2.observing"), { n: r.observing.length })}
            </button>
            {open ? (
              <ul id="training-v2-observing" className="mt-2 divide-y divide-border">
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
        <p className="text-xs text-muted-foreground">{t("training.v2.method")}</p>
      </div>
    </ChartCard>
  );
}

function SignalLine({ s, rank }: { s: PrioritySignal; rank?: number }) {
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
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        {rank ? <span className="font-mono text-xs text-muted-foreground">#{rank}</span> : null}
        <span className="font-medium text-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">{t(dnaLabelKey(s.dimension))}</span>
      </div>
      {s.value !== null ? (
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
