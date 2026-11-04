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
import { MetricTerm } from "@/components/common/MetricTerm";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { OverviewStatePanel, WithOverview } from "@/components/real/RealData";
import { Button } from "@/components/ui/button";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import type { XRayDiagnosis, XRayObservation } from "@/lib/diagnostics/xray";
import { dnaLabelKey } from "@/lib/dna";
import { NOT_AVAILABLE_MARK, fill, formatNumber } from "@/lib/format";
import { METRIC_IDS, type MetricId } from "@/lib/glossary";
import { canonicalMetric } from "@/lib/metrics/canonicalMetrics";
import { getXRay } from "@/lib/xray.functions";

export const XRAY_QUERY_KEY = ["player", "xray"] as const;

const DIGITS: Record<string, number> = {
  kd: 2,
  adr: 1,
  kast: 1,
  hsPercent: 1,
  rating: 2,
  ctRating: 2,
  tRating: 2,
  utilityDamage: 0,
};

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
      <span className="text-muted-foreground" data-observation-status={o.status}>
        <span aria-hidden>{NOT_AVAILABLE_MARK} </span>
        {t(`xray.status.${o.status}` as TranslationKey)}
      </span>
    );
  const unit = canonicalMetric(o.metric).unit === "percent" ? "%" : "";
  return (
    <span data-observation-status="MEASURED">
      <span className="font-mono text-foreground">
        {formatNumber(o.value, intlTag, DIGITS[o.metric] ?? 0)}
        {unit}
      </span>
      {o.numerator !== null && o.denominator !== null ? (
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
          ({o.numerator}/{o.denominator})
        </span>
      ) : null}
      <span className="ml-2 text-[11px] text-muted-foreground">
        {fill(t("xray.inMatches"), { n: o.matches })}
      </span>
    </span>
  );
}

function Layer({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export function XRayBody({ x }: { x: XRayDiagnosis }) {
  const t = useT();
  const { intlTag } = useI18n();
  return (
    <div className="space-y-8" data-xray-version={x.version} data-xray-state={x.state}>
      <p className="rounded-lg border border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        {fill(t("xray.sample"), {
          matches: x.sample.matches,
          rounds: x.sample.rounds ?? NOT_AVAILABLE_MARK,
          decided: x.sample.decided,
        })}
      </p>
      {x.state === "IN_FORMATION" ? (
        <p className="rounded-lg border border-warning/25 bg-warning/8 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          {fill(t("xray.inFormation"), {
            matches: x.sample.dnaMatches,
            minimum: x.sample.dnaMinimumMatches,
          })}
        </p>
      ) : null}

      <Layer title={t("xray.layer.observed")} hint={t("xray.layer.observedHint")}>
        <div className="grid gap-5 lg:grid-cols-2">
          {x.dimensions.map((d) => (
            <ChartCard
              key={d.id}
              showDemoTag={false}
              title={t(`xray.dim.${d.id}` as TranslationKey)}
            >
              {d.status === "NOT_OBSERVED" ? (
                <p className="text-sm text-muted-foreground">{t("xray.dim.notObserved")}</p>
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
                    {r.index === null ? (
                      <span className="text-muted-foreground">{t("real.dna.notObserved")}</span>
                    ) : x.state === "READY" ? (
                      <span className="font-mono">{r.index} / 100</span>
                    ) : (
                      <span className="text-muted-foreground">{t("real.dna.inFormation")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </ChartCard>
          ))}
        </div>
        <ChartCard
          showDemoTag={false}
          title={t("xray.sides.title")}
          subtitle={t("xray.sides.description")}
        >
          <dl className="grid gap-4 sm:grid-cols-2" data-xray-sides>
            {(["ct", "t"] as const).map((side) => (
              <div key={side} className="rounded-md border border-border p-3">
                <dt className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {t(`xray.sides.${side}` as TranslationKey)}
                  {" · "}
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
              </div>
            ))}
          </dl>
        </ChartCard>
      </Layer>

      <Layer
        title={t("xray.layer.inference")}
        hint={fill(t("xray.layer.inferenceHint"), { ceiling: x.inferenceCeiling })}
      >
        {x.inferences.length ? (
          <ol className="space-y-2" data-xray-inferences>
            {x.inferences.map((i) => (
              <li key={i.dimension} className="rounded-md border border-border px-4 py-3 text-sm">
                {fill(t("xray.inference.item"), {
                  dimension: t(dnaLabelKey(i.dimension)),
                  index: i.index,
                  ceiling: i.ceiling,
                })}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground" data-xray-inference-blocked>
            {fill(t(`xray.inference.${x.inferenceBlockedBy ?? "NO_DATA"}` as TranslationKey), {
              matches: x.sample.dnaMatches,
              minimum: x.sample.dnaMinimumMatches,
              ceiling: x.inferenceCeiling,
            })}
          </p>
        )}
      </Layer>

      <Layer title={t("xray.layer.recommendation")} hint={t("xray.layer.recommendationHint")}>
        {x.recommendations.length ? (
          <div className="space-y-3">
            <ul className="space-y-2" data-xray-recommendations>
              {x.recommendations.map((r) => (
                <li key={r.dimension} className="text-sm">
                  {fill(t("xray.recommendation.item"), { dimension: t(dnaLabelKey(r.dimension)) })}
                </li>
              ))}
            </ul>
            <Button asChild size="sm" variant="outline">
              <Link to="/training">{t("xray.recommendation.open")}</Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("xray.recommendation.none")}</p>
        )}
      </Layer>

      <ChartCard showDemoTag={false} title={t("xray.unsupported.title")}>
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
