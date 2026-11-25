/**
 * Real Raio-X (X-ray). Renders the `xray-v1` diagnosis contract (src/lib/diagnostics/xray.ts)
 * and nothing else: observations with their sample, inferences only from the documented
 * weakest-dimension rule, recommendations only as training priorities. No score, no
 * comparison with other players, no estimated value.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed } from "lucide-react";
import type { ReactNode } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { ProgressBar } from "@/components/common/ProgressBar";
import { SideBadge, ToneBadge } from "@/components/common/VisualBadges";
import { MetricTerm } from "@/components/common/MetricTerm";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { OverviewStatePanel, WithOverview } from "@/components/real/RealData";
import { Button } from "@/components/ui/button";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import type { XRayDiagnosis, XRayObservation } from "@/lib/diagnostics/xray";
import { dnaLabelKey } from "@/lib/dna";
import { NOT_AVAILABLE_MARK, fill, formatNumber, formatPooledPart } from "@/lib/format";
import { METRIC_IDS, type MetricId } from "@/lib/glossary";
import { canonicalMetric } from "@/lib/metrics/canonicalMetrics";
import type { SideSummary } from "@/lib/roundContext";
import { getXRay } from "@/lib/xray.functions";
import { cn } from "@/lib/utils";

export const XRAY_QUERY_KEY = ["player", "xray"] as const;

function MetricName({ metric }: { metric: string }) {
  const t = useT();
  const glossary = canonicalMetric(metric).glossary;
  if (glossary && (METRIC_IDS as readonly string[]).includes(metric))
    return <MetricTerm id={glossary as MetricId} variant="label" />;
  return <>{t(`xray.metric.${metric}` as TranslationKey)}</>;
}

function ObservationValue({ o }: { o: XRayObservation }) {
  const t = useT();
  const { intlTag } = useI18n();
  if (o.status !== "MEASURED" || o.value === null)
    return (
      <ToneBadge tone="neutral" data-observation-status={o.status}>
        <span aria-hidden>{NOT_AVAILABLE_MARK}</span>
        {t(`xray.status.${o.status}` as TranslationKey)}
      </ToneBadge>
    );
  const unit = canonicalMetric(o.metric).unit === "percent" ? "%" : "";
  return (
    <span data-observation-status="MEASURED">
      <span className="font-mono text-foreground">
        {formatNumber(o.value, intlTag, canonicalMetric(o.metric).digits.display)}
        {unit}
      </span>
      {o.numerator !== null && o.denominator !== null ? (
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          ({formatPooledPart(o.numerator, intlTag)}/{formatPooledPart(o.denominator, intlTag)})
        </span>
      ) : null}
      <span className="ml-2 text-xs text-muted-foreground">
        {fill(t("xray.inMatches"), { n: o.matches })}
      </span>
      {o.partialMatches ? (
        <span className="mt-1 flex items-center gap-1 text-xs text-warning" data-adr-partial="true">
          <GameIcon name="alert" className="size-3" />
          {fill(t("adr.partialMatches"), { n: o.partialMatches })}
        </span>
      ) : null}
    </span>
  );
}

/** Visual phase: the three layers read as steps (observed → inference → recommendation). */
function Layer({
  title,
  hint,
  step,
  icon,
  children,
}: {
  title: string;
  hint: string;
  step: number;
  icon: GameIconName;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4" aria-label={title} data-xray-layer={step}>
      <div className="flex items-start gap-3 border-b border-border pb-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"
          aria-hidden
        >
          <GameIcon name={icon} className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {String(step).padStart(2, "0")}
          </p>
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Decorative icon per X-ray dimension (the title carries the meaning). */
const DIMENSION_ICON: Record<string, GameIconName> = {
  aim_duels: "crosshair",
  survival_positioning: "shield",
  utility: "grenade",
  impact: "target",
  consistency: "trend",
  decision: "dna",
};

export function XRayBody({ x }: { x: XRayDiagnosis }) {
  const t = useT();
  const { intlTag } = useI18n();
  return (
    <div className="space-y-8" data-xray-version={x.version} data-xray-state={x.state}>
      <p className="surface-panel flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        <GameIcon name="rounds" className="mt-0.5 size-4 shrink-0 text-context" />
        {fill(t("xray.sample"), {
          matches: x.sample.matches,
          rounds: x.sample.rounds ?? NOT_AVAILABLE_MARK,
          decided: x.sample.decided,
        })}
      </p>
      {x.state === "IN_FORMATION" ? (
        <p className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/8 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          <GameIcon name="alert" className="mt-0.5 size-4 shrink-0 text-warning" />
          {fill(t("xray.inFormation"), {
            matches: x.sample.dnaMatches,
            minimum: x.sample.dnaMinimumMatches,
          })}
        </p>
      ) : null}

      <Layer
        step={1}
        icon="crosshair"
        title={t("xray.layer.observed")}
        hint={t("xray.layer.observedHint")}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          {x.dimensions.map((d) => (
            <ChartCard
              key={d.id}
              showDemoTag={false}
              icon={DIMENSION_ICON[d.id]}
              title={t(`xray.dim.${d.id}` as TranslationKey)}
            >
              {d.status === "NOT_OBSERVED" ? (
                <p className="rounded-md border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground">
                  {t("xray.dim.notObserved")}
                </p>
              ) : null}
              <ul className="divide-y divide-border" data-xray-dimension={d.id}>
                {d.observations.map((o) => (
                  <li
                    key={o.metric}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="text-xs text-muted-foreground">
                      <MetricName metric={o.metric} />
                    </span>
                    <ObservationValue o={o} />
                  </li>
                ))}
                {d.dna.map((r) => (
                  <li
                    key={r.dimension}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="text-xs text-muted-foreground">
                      {t("xray.dnaIndex")} · {t(dnaLabelKey(r.dimension))}
                    </span>
                    {r.indexStatus === "READY" && r.index !== null ? (
                      <span
                        className="flex min-w-36 items-center gap-2"
                        data-dna-index-status="READY"
                      >
                        {/* Decorative: the row already names the index and states the number. */}
                        <span aria-hidden className="w-20">
                          <ProgressBar value={r.index} max={100} />
                        </span>
                        <span className="font-mono">{r.index} / 100</span>
                      </span>
                    ) : r.indexStatus === "IN_FORMATION" ? (
                      <ToneBadge tone="attention" data-dna-index-status="IN_FORMATION">
                        {t("real.dna.inFormation")}
                      </ToneBadge>
                    ) : r.indexStatus === "NOT_MEASURED" || r.indexStatus === "NO_SAMPLE" ? (
                      // UX-1.7c: same words as the Player DNA page.
                      <ToneBadge tone="neutral" data-dna-index-status={r.indexStatus}>
                        {t(`real.dna.status.${r.indexStatus}` as TranslationKey)}
                      </ToneBadge>
                    ) : (
                      <ToneBadge tone="neutral" data-dna-index-status="NOT_OBSERVED">
                        {t("real.dna.notObserved")}
                      </ToneBadge>
                    )}
                  </li>
                ))}
              </ul>
            </ChartCard>
          ))}
        </div>
        <ChartCard
          showDemoTag={false}
          icon="shield"
          title={t("xray.sides.title")}
          subtitle={t("xray.sides.description")}
        >
          <dl className="grid gap-4 sm:grid-cols-2" data-xray-sides>
            {(["ct", "t"] as const).map((side) => (
              <div
                key={side}
                className={cn(
                  "rounded-md border bg-elevated/30 p-3",
                  side === "ct" ? "border-side-ct/30" : "border-side-t/30",
                )}
              >
                <dt className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  <SideBadge side={side === "ct" ? "CT" : "T"} />
                  {/* The badge shows the side; the localized name stays for screen readers. */}
                  <span className="sr-only">{t(`xray.sides.${side}` as TranslationKey)} · </span>
                  {x.sides[side].rounds === null
                    ? NOT_AVAILABLE_MARK
                    : fill(t("xray.sides.rounds"), {
                        n: formatNumber(x.sides[side].rounds, intlTag, 0),
                      })}
                </dt>
                <dd className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {t(`xray.metric.${side === "ct" ? "ctRating" : "tRating"}` as TranslationKey)}
                  </span>
                  <ObservationValue o={x.sides[side].rating} />
                </dd>
                {x.roundContext && x.roundContext.status === "OBSERVED" ? (
                  <SideRoundContext
                    s={x.roundContext[side]}
                    min={x.roundContext.minRoundsForRates}
                  />
                ) : null}
              </div>
            ))}
          </dl>
          {x.roundContext && x.roundContext.status === "OBSERVED" ? (
            <p className="mt-3 text-xs text-muted-foreground" data-xray-round-context-note>
              {fill(t("xray.roundContext.note"), { version: x.roundContext.version })}
            </p>
          ) : null}
        </ChartCard>
      </Layer>

      <Layer
        step={2}
        icon="dna"
        title={t("xray.layer.inference")}
        hint={fill(t("xray.layer.inferenceHint"), { ceiling: x.inferenceCeiling })}
      >
        {x.inferences.length ? (
          <ol className="space-y-2" data-xray-inferences>
            {x.inferences.map((i) => (
              <li
                key={i.dimension}
                className="surface-panel flex items-start gap-3 rounded-lg border border-context/30 px-4 py-3 text-sm"
              >
                <GameIcon name="dna" className="mt-0.5 size-4 shrink-0 text-context" />
                {fill(t("xray.inference.item"), {
                  dimension: t(dnaLabelKey(i.dimension)),
                  index: i.index,
                  ceiling: i.ceiling,
                })}
              </li>
            ))}
          </ol>
        ) : (
          <p
            className="rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground"
            data-xray-inference-blocked
          >
            {fill(t(`xray.inference.${x.inferenceBlockedBy ?? "NO_DATA"}` as TranslationKey), {
              matches: x.sample.dnaMatches,
              minimum: x.sample.dnaMinimumMatches,
              ceiling: x.inferenceCeiling,
            })}
          </p>
        )}
      </Layer>

      <Layer
        step={3}
        icon="target"
        title={t("xray.layer.recommendation")}
        hint={t("xray.layer.recommendationHint")}
      >
        {x.recommendations.length ? (
          <div className="space-y-3">
            <ul className="space-y-2" data-xray-recommendations>
              {x.recommendations.map((r) => (
                <li
                  key={r.dimension}
                  className="surface-panel relative overflow-hidden rounded-lg border border-primary/30 py-3 pl-5 pr-4 text-sm"
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary/70" />
                  {fill(t("xray.recommendation.item"), { dimension: t(dnaLabelKey(r.dimension)) })}
                </li>
              ))}
            </ul>
            <Button asChild size="sm" variant="outline">
              <Link to="/training">{t("xray.recommendation.open")}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-xray-recommendations-none>
              {x.trainingVersion
                ? t("xray.recommendation.noneTraining")
                : t("xray.recommendation.none")}
            </p>
            {x.trainingVersion ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/training">{t("xray.recommendation.open")}</Link>
              </Button>
            ) : null}
          </div>
        )}
      </Layer>

      <ChartCard showDemoTag={false} icon="alert" title={t("xray.unsupported.title")}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {x.unsupported.map((u) => (
            <li key={u}>{t(`xray.unsupported.${u}` as TranslationKey)}</li>
          ))}
        </ul>
      </ChartCard>
    </div>
  );
}

export function RealXRayPage() {
  const t = useT();
  const query = useQuery({ queryKey: XRAY_QUERY_KEY, queryFn: () => getXRay() });
  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("analysis.eyebrow")}
          title={t("analysis.title")}
          description={t("analysis.description")}
        />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState
            title={t("real.error.title")}
            description={t("real.error.description")}
            onRetry={() => void query.refetch()}
          />
        ) : query.data.state === "EMPTY" ? (
          <>
            <EmptyState
              icon={<CircleDashed className="size-5" aria-hidden />}
              title={t("analysis.title")}
              description={t("xray.empty")}
            />
            <WithOverview>{(overview) => <OverviewStatePanel overview={overview} />}</WithOverview>
          </>
        ) : (
          <XRayBody x={query.data} />
        )}
      </div>
    </AppShell>
  );
}

/** Marco 1: own round outcome and own kills/damage on one side (`round-context-v2`). */
function SideRoundContext({ s, min }: { s: SideSummary; min: number }) {
  const { t, intlTag } = useI18n();
  const n = (v: number, d = 0) => formatNumber(v, intlTag, d);
  return (
    <dl
      className="mt-3 space-y-1 border-t border-border pt-2 text-xs"
      data-xray-side-context={s.side}
    >
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">{t("xray.roundContext.outcome")}</dt>
        <dd className="font-mono">
          {fill(t("xray.roundContext.outcomeValue"), {
            won: n(s.roundsWon),
            lost: n(s.roundsLost),
          })}
          {s.roundsOutcomeUnknown
            ? ` · ${fill(t("xray.roundContext.outcomeUnknown"), { n: n(s.roundsOutcomeUnknown) })}`
            : ""}
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">{t("xray.roundContext.killsDeaths")}</dt>
        <dd className="font-mono">{`${n(s.kills)} / ${n(s.deaths)}`}</dd>
      </div>
      {s.rateStatus === "DERIVED" ? (
        <>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("xray.roundContext.winRate")}</dt>
            <dd className="font-mono">
              {s.roundWinRate === null ? NOT_AVAILABLE_MARK : `${n(s.roundWinRate, 1)}%`}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("xray.roundContext.kpr")}</dt>
            <dd className="font-mono">
              {s.killsPerRound === null ? NOT_AVAILABLE_MARK : n(s.killsPerRound, 2)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("xray.roundContext.adr")}</dt>
            <dd className="font-mono">
              {s.damagePerRound === null ? NOT_AVAILABLE_MARK : n(s.damagePerRound, 1)}
              {s.damagePerRound !== null && s.damagePartialRounds > 0 ? (
                <span className="block text-xs text-warning" data-adr-partial="true">
                  {fill(t("adr.partialRounds"), { n: s.damagePartialRounds })}
                </span>
              ) : null}
            </dd>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">
          {fill(t("xray.roundContext.insufficient"), { n: n(s.rounds), min: n(min) })}
        </p>
      )}
    </dl>
  );
}
