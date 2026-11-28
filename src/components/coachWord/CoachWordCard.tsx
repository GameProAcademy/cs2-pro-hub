/**
 * VGL 5.0 — "Palavra do Treinador" card. Pre-written guidance (i18n bank `cw.*`) chosen by the
 * deterministic rules of `coach-word-v1`; nothing here calls an AI provider. The data comes from
 * queries the pages already use (same query keys, so they are shared from the cache).
 * "Talk to the Coach" opens the AI Coach drawer on the current page, so the existing screen
 * context (area, own match, tab) goes with the question — the Coach's prompts are unchanged.
 */
import { useQuery } from "@tanstack/react-query";
import { Megaphone, MessageSquare } from "lucide-react";
import { useMemo } from "react";

import { latestSpecialties } from "@/components/cs2/IdentityKit";
import { useMapRanking } from "@/components/cs2/BestMap";
import { ToneBadge, type BadgeTone } from "@/components/common/VisualBadges";
import { usePlayerOverview } from "@/components/real/RealData";
import { PRO_SCORE_QUERY_KEY } from "@/components/real/RealProScore";
import { TRAINING_PRIORITIES_KEY } from "@/components/training/TrainingPrioritiesV2";
import { Button } from "@/components/ui/button";
import { useI18n, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { dnaLabelKey } from "@/lib/dna";
import { fill } from "@/lib/format";
import { COACH_DNA_HISTORY_KEY, openCoachWith } from "@/lib/coachWord/coachWordBridge";
import {
  COACH_WORD_VERSION,
  coachWordFor,
  type CoachWord,
  type CoachWordContext,
  type CoachWordMatch,
  type CoachWordSection,
} from "@/lib/coachWord/coachWord";
import { listGoals } from "@/lib/notifications/notifications.functions";
import { getProScore } from "@/lib/proScore.functions";
import { getTrainingPriorities } from "@/lib/trainingPriority.functions";
import { DNA_VERSION_V3 } from "@/lib/playerDnaV3";
import { getDnaHistory } from "@/lib/xray.functions";
import type { DnaDimension } from "@/types";
import { cn } from "@/lib/utils";

const NEEDS: Record<
  CoachWordSection,
  { overview?: true; dna?: true; score?: true; training?: true; goals?: true }
> = {
  dashboard: { overview: true, training: true },
  analysis: { overview: true, dna: true },
  playerDna: { dna: true },
  performance: { overview: true, score: true },
  evolution: { overview: true },
  maps: { overview: true },
  training: { overview: true, training: true },
  goals: { goals: true },
  match: {},
};

const TONE: Record<CoachWord["tone"], BadgeTone> = {
  negative: "attention",
  positive: "brand",
  neutral: "context",
  insufficient: "neutral",
};

/** Gathers the context a section needs from the shared queries. */
function useCoachWordContext(section: CoachWordSection, match?: CoachWordMatch | null) {
  const need = NEEDS[section];
  const overview = usePlayerOverview();
  const matches =
    need.overview && overview.data && overview.data.state === "READY"
      ? overview.data.matches
      : need.overview
        ? []
        : null;
  const ranking = useMapRanking(section === "maps" ? matches : null);
  const dna = useQuery({
    queryKey: COACH_DNA_HISTORY_KEY,
    queryFn: () => getDnaHistory(),
    enabled: Boolean(need.dna),
  });
  const score = useQuery({
    queryKey: PRO_SCORE_QUERY_KEY,
    queryFn: () => getProScore(),
    enabled: Boolean(need.score),
  });
  const training = useQuery({
    queryKey: TRAINING_PRIORITIES_KEY,
    queryFn: () => getTrainingPriorities(),
    enabled: Boolean(need.training),
  });
  const goals = useQuery({
    queryKey: ["goals"],
    queryFn: () => listGoals(),
    enabled: Boolean(need.goals),
  });
  const loading =
    (need.overview && overview.isPending) ||
    (need.dna && dna.isPending) ||
    (need.score && score.isPending) ||
    (need.training && training.isPending) ||
    (need.goals && goals.isPending);
  const ctx = useMemo<CoachWordContext>(() => {
    const spec = dna.data ? latestSpecialties(dna.data, DNA_VERSION_V3) : null;
    const snap = dna.data?.filter((e) => e.dnaVersion === DNA_VERSION_V3).at(-1) ?? null;
    const dims = snap
      ? Object.entries(snap.dimensions).flatMap(([dimension, v]) =>
          typeof v === "number" ? [{ dimension, value: v }] : [],
        )
      : null;
    const g = goals.data?.goals ?? null;
    return {
      matches,
      mapRanking: ranking,
      dna: spec ? dims : null,
      scoreState: score.data?.state ?? null,
      trainingTop: training.data?.priorities[0]?.dimension ?? null,
      goals: g
        ? {
            total: g.length,
            reached: g.filter((x) => x.progress.status === "REACHED").length,
            inProgress: g.filter((x) => x.progress.status === "IN_PROGRESS").length,
            waiting: g.filter(
              (x) => x.progress.status === "NO_DATA" || x.progress.status === "INSUFFICIENT_SAMPLE",
            ).length,
          }
        : null,
      match: match ?? null,
    };
  }, [matches, ranking, dna.data, score.data, training.data, goals.data, match]);
  return { ctx, loading: Boolean(loading) };
}

export function CoachWordCard({
  section,
  match,
  className,
}: {
  section: CoachWordSection;
  /** Match Room summary: the match itself (its own values only). */
  match?: CoachWordMatch | null;
  className?: string;
}) {
  const { t } = useI18n();
  const { ctx, loading } = useCoachWordContext(section, match);
  if (loading) return null;
  const w = coachWordFor(section, ctx);
  const vars: Record<string, string | number> = { ...w.vars };
  if (typeof vars["map"] === "string") vars["map"] = mapDisplayName(vars["map"]);
  if (typeof vars["dimension"] === "string")
    vars["dimension"] = t(dnaLabelKey(vars["dimension"] as DnaDimension));
  const text = fill(t(`cw.${w.id}.text` as TranslationKey), vars);
  const tip = fill(t(`cw.${w.id}.tip` as TranslationKey), vars);
  return (
    <section
      className={cn(
        "surface-panel vgl-grid relative isolate overflow-hidden rounded-xl border p-4 sm:p-5",
        w.tone === "negative" ? "border-warning/35" : "border-primary/30",
        className,
      )}
      aria-labelledby={`coach-word-${section}`}
      data-coach-word={w.id}
      data-coach-word-section={section}
      data-coach-word-tone={w.tone}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          w.tone === "negative" ? "bg-warning" : "bg-primary",
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`coach-word-${section}`}
          className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.16em] text-foreground"
        >
          <span className="flex size-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <Megaphone className="size-4" aria-hidden />
          </span>
          {t("cw.title")}
        </h2>
        <ToneBadge tone={TONE[w.tone]} data-coach-word-priority={w.priority}>
          {t(`cw.priority.${w.priority}` as TranslationKey)}
        </ToneBadge>
      </div>
      <p className="mt-3 text-base leading-relaxed text-foreground" data-coach-word-text>
        {text}
      </p>
      <div className="mt-3 rounded-lg border border-border bg-background/50 px-3 py-2.5">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
          {t("cw.practice")}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground" data-coach-word-tip>
          {tip}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-muted-foreground">
          {fill(t("cw.source"), { version: COACH_WORD_VERSION })}
        </p>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => openCoachWith(fill(t("cw.ask"), { text }))}
          data-coach-word-talk
        >
          <MessageSquare className="size-4" aria-hidden />
          {t("cw.talk")}
        </Button>
      </div>
    </section>
  );
}
