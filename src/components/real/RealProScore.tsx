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
import { InfoTip } from "@/components/common/InfoTip";
import { ScoreHero } from "@/components/score/ScoreHero";
import { Cs2Mask } from "@/components/cs2/Cs2Art";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useI18n, type TranslationKey } from "@/i18n";
import { fill } from "@/lib/format";
import {
  PRO_SCORE_MIN_COVERAGE,
  PRO_SCORE_MIN_MATCHES,
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

/** The three explanations of the Score, as tooltips (texts unchanged, 5 languages). */
export function ScoreTips({ withRating = false }: { withRating?: boolean }) {
  const { t, intlTag } = useI18n();
  return (
    <>
      <InfoTip id="method" label={t("vgl5.score.tip.method")} title={t("vgl5.score.tip.method")}>
        {fill(t("score.method"), {
          minimum: PRO_SCORE_MIN_MATCHES,
          minCoverage: pct(PRO_SCORE_MIN_COVERAGE, intlTag),
        })}
      </InfoTip>
      <InfoTip id="meaning" label={t("vgl5.score.tip.meaning")} title={t("vgl5.score.tip.meaning")}>
        {t("score.notPercentile")} {t("score.dnaDifference")}
      </InfoTip>
      {withRating ? (
        <InfoTip id="rating" label={t("vgl5.score.tip.rating")} title={t("vgl5.score.tip.rating")}>
          {t("real.proScoreContext.instead")}
        </InfoTip>
      ) : null}
    </>
  );
}

/** Dashboard card: the number (or the honest state) and the way to the details. */
/**
 * VGL 5.1 — the Home Score card in the same visual family as the Player DNA identity card
 * (`DnaIdentityCard`): tactical grid panel, faint CS2 art, badge, protagonist number, ranked
 * rows and the same footer action. Presentation only: the value, meter, confidence, matches,
 * rounds, coverage and tooltips are exactly what `ScoreHero` shows from `getProScore`; the
 * "largest contributions" rows read the components' own `contribution` (pro-score-v1).
 */
export function RealProScoreCard() {
  const { t, intlTag } = useI18n();
  const query = useProScore();
  const score = query.data;
  const top =
    score && score.state === "READY"
      ? [...score.components]
          .filter((c) => c.available && c.contribution > 0)
          .sort((a, b) => b.contribution - a.contribution || a.id.localeCompare(b.id))
          .slice(0, 3)
      : [];
  return (
    <section
      className="surface-panel vgl-grid relative isolate flex h-full flex-col overflow-hidden rounded-xl border border-border p-5 sm:p-6"
      aria-label={t("real.proScore.title")}
      data-score-identity
    >
      <Cs2Mask
        src={SCORE_ART}
        className="pointer-events-none absolute -right-6 -top-4 -z-10 h-40 w-72 text-primary opacity-[0.08]"
      />
      {query.isPending ? (
        <LoadingState label={t("score.loading")} />
      ) : query.isError || !score ? (
        <ErrorState
          title={t("real.error.title")}
          description={t("real.error.description")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <ScoreHero score={score} tips={<ScoreTips />} />
          {top.length ? (
            <div className="mt-5">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {t("vgl51.score.top")}
              </h3>
              <ol className="grid gap-2" data-score-top>
                {top.map((c, i) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-3 py-2"
                  >
                    <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t(`score.c.${c.id}` as TranslationKey)}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-primary">
                      +
                      {new Intl.NumberFormat(intlTag, { maximumFractionDigits: 1 }).format(
                        c.contribution,
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center justify-end gap-3 pt-5">
            <Link
              to="/performance"
              hash="cs2-pro-score"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-score-identity-cta
            >
              {t("score.details")}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

const SCORE_ART = "/cs2/weapons/ak47.svg";

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
    <div className="mt-4 space-y-4">
      <ScoreHero score={score} size="xl" tips={<ScoreTips withRating />} />
      {score.partialMatchesExcluded > 0 ? (
        <p className="text-xs text-muted-foreground">
          {fill(t("score.partialExcluded"), { n: score.partialMatchesExcluded })}
        </p>
      ) : null}
      {score.state !== "EMPTY" ? (
        <Accordion type="single" collapsible data-score-formation>
          <AccordionItem
            value="formation"
            className="overflow-hidden rounded-xl border border-border bg-background/40"
          >
            <AccordionTrigger className="min-h-12 gap-3 px-4 py-3 font-display text-sm font-semibold uppercase tracking-[0.12em] text-foreground hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&[data-state=open]]:border-b [&[data-state=open]]:border-border">
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-4 w-1 -skew-x-12 rounded-sm bg-primary" />
                {t("score.components.title")}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 px-4 pt-4">
              {score.state === "READY" ? <ContributionBar components={score.components} /> : null}
              <ComponentsTable score={score} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

/** The components of the Score with their samples, weights and points (unchanged content). */
function ComponentsTable({ score }: { score: ProScore }) {
  const { t, intlTag } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", STACK_TABLE)} data-pro-score-components>
        <caption className="sr-only">{t("score.components.title")}</caption>
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
                {c.matches === 0 ? "—" : fill(t(`score.sample.${c.sampleUnit}`), { n: c.sample })}
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
  );
}
