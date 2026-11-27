/**
 * CS2 PRO Score (pro-score-v1) — real, read-only. Every number comes from `getProScore`
 * (the caller's own features under RLS). Below the minimum sample or coverage there is no
 * number at all: the state and what is missing are shown instead. Never a percentile.
 */
import {
  STACK_BODY,
  STACK_CELL,
  STACK_HEAD,
  STACK_ROW,
  STACK_TABLE,
  STACK_WIDE,
} from "@/lib/ui/stackedTable";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { ChartCard } from "@/components/common/ChartCard";
import { GameIcon } from "@/components/common/GameIcon";
import { RadialGauge } from "@/components/cs2/Cs2Art";
import { ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useI18n, type TranslationKey } from "@/i18n";
import { fill } from "@/lib/format";
import {
  PRO_SCORE_CONFIDENCE_ROUNDS,
  PRO_SCORE_MIN_COVERAGE,
  PRO_SCORE_MIN_EVENT_SAMPLE,
  type ProScore,
} from "@/lib/proScore";
import { getProScore } from "@/lib/proScore.functions";

export const PRO_SCORE_QUERY_KEY = ["player", "pro-score"] as const;

function useProScore() {
  return useQuery({ queryKey: PRO_SCORE_QUERY_KEY, queryFn: () => getProScore() });
}

const pct = (v: number, tag: string, digits = 0) =>
  new Intl.NumberFormat(tag, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(v * 100);

/** The state sentence when there is no number (never a placeholder value). */
function stateText(score: ProScore, t: (k: TranslationKey) => string, tag: string): string {
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

function ScoreValue({ score }: { score: ProScore }) {
  const { t, intlTag } = useI18n();
  if (score.state !== "READY" || score.score === null)
    return (
      <p
        className="text-sm leading-relaxed text-muted-foreground"
        data-pro-score-state={score.state}
      >
        {stateText(score, t, intlTag)}
      </p>
    );
  const shown = new Intl.NumberFormat(intlTag, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score.score);
  return (
    <div className="space-y-2" data-pro-score-state="READY">
      <div className="flex items-center gap-4">
        {/* VGL 2.0: the same READY score as a ring (decorative; the number is written next to it). */}
        <RadialGauge
          value={score.score / 100}
          size={64}
          label={<GameIcon name="target" className="size-5 text-primary" />}
        />
        <p className="font-display text-4xl font-semibold tabular-nums text-foreground">
          {fill(t("score.of100"), { score: shown })}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("score.confidence.label")}:</span>{" "}
        {fill(t(`score.confidence.${score.confidence ?? "PROVISIONAL"}`), {
          moderate: PRO_SCORE_CONFIDENCE_ROUNDS.moderate,
          high: PRO_SCORE_CONFIDENCE_ROUNDS.high,
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {fill(t("score.basis"), {
          matches: score.matches,
          rounds: score.rounds,
          version: score.version,
        })}{" "}
        {fill(t("score.coverage"), { coverage: pct(score.coverage, intlTag) })}
      </p>
    </div>
  );
}

/** Dashboard card: the number (or the honest state) and the way to the details. */
export function RealProScoreCard() {
  const { t } = useI18n();
  const query = useProScore();
  return (
    <ChartCard showDemoTag={false} icon="target" title={t("real.proScore.title")}>
      {query.isPending ? (
        <LoadingState label={t("score.loading")} />
      ) : query.isError || !query.data ? (
        <ErrorState
          title={t("real.error.title")}
          description={t("real.error.description")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="space-y-3">
          <ScoreValue score={query.data} />
          <p className="text-xs text-muted-foreground">{t("score.notPercentile")}</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/performance" hash="cs2-pro-score">
              {t("score.details")}
            </Link>
          </Button>
        </div>
      )}
    </ChartCard>
  );
}

/**
 * VGL: the points column of the table drawn as one segmented bar. Decorative (the table holds the
 * numbers): each segment is a component's own contribution, unavailable components are left out
 * and nothing is redistributed. Only for a READY score.
 */
export function ContributionBar({
  components,
}: {
  components: ReadonlyArray<{ id: string; available: boolean; contribution: number }>;
}) {
  const { t } = useI18n();
  const parts = components.filter((c) => c.available && c.contribution > 0);
  const total = parts.reduce((sum, c) => sum + c.contribution, 0);
  if (!parts.length || total <= 0) return null;
  return (
    <div aria-hidden className="space-y-2" data-contribution-bar>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((c, i) => (
          <span
            key={c.id}
            className="h-full border-r border-background last:border-r-0"
            style={{
              width: `${(c.contribution / total) * 100}%`,
              backgroundColor: `color-mix(in oklab, var(--primary) ${100 - i * 11}%, var(--card))`,
            }}
            title={t(`score.c.${c.id}` as TranslationKey)}
            data-segment={c.id}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((c, i) => (
          <li key={c.id} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{
                backgroundColor: `color-mix(in oklab, var(--primary) ${100 - i * 11}%, var(--card))`,
              }}
            />
            {t(`score.c.${c.id}` as TranslationKey)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Performance section body: the number, every component with its sample, and the method. */
export function RealProScoreDetails() {
  const { t, intlTag } = useI18n();
  const query = useProScore();
  if (query.isPending) return <LoadingState label={t("score.loading")} />;
  if (query.isError || !query.data)
    return (
      <ErrorState
        title={t("real.error.title")}
        description={t("real.error.description")}
        onRetry={() => void query.refetch()}
      />
    );
  const score = query.data;
  return (
    <div className="mt-3 space-y-4">
      <ScoreValue score={score} />
      {score.partialMatchesExcluded > 0 ? (
        <p className="text-xs text-muted-foreground">
          {fill(t("score.partialExcluded"), { n: score.partialMatchesExcluded })}
        </p>
      ) : null}
      {score.state === "READY" ? <ContributionBar components={score.components} /> : null}
      {score.state !== "EMPTY" ? (
        <div className="overflow-x-auto">
          <table className={cn("w-full text-sm", STACK_TABLE)} data-pro-score-components>
            <caption className="pb-2 text-left text-xs font-medium text-foreground">
              {t("score.components.title")}
            </caption>
            <thead className={STACK_HEAD}>
              <tr className="text-left font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-normal">
                  {t("score.col.component")}
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  {t("score.col.value")}
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  {t("score.col.sample")}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  {t("score.col.weight")}
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  {t("score.col.points")}
                </th>
              </tr>
            </thead>
            <tbody className={cn("divide-y divide-border", STACK_BODY, "max-md:divide-y-0")}>
              {score.components.map((c) => (
                <tr key={c.id} className={STACK_ROW}>
                  <th
                    scope="row"
                    className={cn(
                      "py-2 pr-4 text-left font-normal text-muted-foreground",
                      STACK_WIDE,
                      "max-md:p-0 max-md:font-medium max-md:text-foreground",
                    )}
                  >
                    {t(`score.c.${c.id}` as TranslationKey)}
                  </th>
                  <td
                    className={cn("py-2 pr-4 font-mono", STACK_CELL)}
                    data-label={t("score.col.value")}
                  >
                    {c.value === null ? "—" : `${pct(c.value, intlTag, 1)}%`}
                    {!c.available && c.unavailableReason ? (
                      <span className="block font-sans text-xs text-muted-foreground">
                        {fill(t(`score.unavailable.${c.unavailableReason}`), {
                          min: PRO_SCORE_MIN_EVENT_SAMPLE,
                        })}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={cn("py-2 pr-4 font-mono text-xs", STACK_CELL)}
                    data-label={t("score.col.sample")}
                  >
                    {c.matches === 0
                      ? "—"
                      : fill(t(`score.sample.${c.sampleUnit}`), { n: c.sample })}
                  </td>
                  <td
                    className={cn("py-2 pr-4 text-right font-mono", STACK_CELL)}
                    data-label={t("score.col.weight")}
                  >
                    {pct(c.weight, intlTag)}%
                  </td>
                  <td
                    className={cn("py-2 text-right font-mono", STACK_CELL)}
                    data-label={t("score.col.points")}
                  >
                    {score.state === "READY" && c.available
                      ? new Intl.NumberFormat(intlTag, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        }).format(c.contribution)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {fill(t("score.method"), {
          minimum: score.minimumMatches,
          minCoverage: pct(PRO_SCORE_MIN_COVERAGE, intlTag),
        })}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("score.notPercentile")} {t("score.dnaDifference")}
      </p>
    </div>
  );
}
