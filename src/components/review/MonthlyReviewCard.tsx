/**
 * PM5 — monthly review draft (`cs2.monthly-review.v1`). A preview the player reads on the page;
 * it is never sent (no consent mechanism exists), and the card says so.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { formatMetric } from "@/components/real/RealEvolution";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { NOT_AVAILABLE_MARK, fill } from "@/lib/format";
import { getMonthlyReview } from "@/lib/monthlyReview.functions";
import { previousMonth, type MonthlyReview } from "@/lib/review/monthlyReview";

export function MonthlyReviewBody({ r }: { r: MonthlyReview }) {
  const t = useT();
  const { intlTag } = useI18n();
  return (
    <div className="space-y-3 text-sm" data-review-state={r.state}>
      <p>
        {r.state === "NO_MATCHES"
          ? t("review.noMatches")
          : fill(t(r.state === "READY" ? "review.matches" : "review.lowSample"), {
              n: r.matches,
              min: 3,
            })}
        {r.dateBasis === "processed" && r.matches ? ` ${t("review.processedDates")}` : ""}
      </p>
      {r.metrics.length ? (
        <ul className="grid gap-1 sm:grid-cols-2">
          {r.metrics.map((m) => (
            <li key={m.key} data-review-metric={m.key}>
              <span className="text-muted-foreground">
                {t(`evolution.metric.${m.key}` as TranslationKey)}:{" "}
              </span>
              <span className="font-medium">{formatMetric(m.value, m.unit, intlTag)}</span>
              {m.value !== null ? ` (${fill(t("review.nMatches"), { n: m.matches })})` : ""}
              {" · "}
              {m.comparison.status === "OK"
                ? fill(t("review.vsPrevious"), {
                    v: formatMetric(m.comparison.previous, m.unit, intlTag),
                    n: m.comparison.previousMatches,
                  })
                : t(`review.comparison.${m.comparison.status}` as TranslationKey)}
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        {r.training
          ? fill(t("review.training"), {
              done: r.training.done,
              skipped: r.training.skipped,
              due: r.training.due,
            })
          : t("review.noPlan")}
        {" · "}
        {fill(t("review.moments"), { n: r.momentsSaved })}
      </p>
      <p className="text-xs text-muted-foreground" data-review-delivery={r.delivery.status}>
        {t("review.notSent")}
      </p>
    </div>
  );
}

export function MonthlyReviewCard() {
  const t = useT();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const q = useQuery({
    queryKey: ["player", "review", month],
    queryFn: () => getMonthlyReview({ data: { month } }),
  });
  return (
    <ChartCard title={t("review.title")} subtitle={t("review.subtitle")}>
      <div className="mb-3 flex gap-2 text-xs">
        {[thisMonth, previousMonth(thisMonth)].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMonth(m)}
            aria-pressed={m === month}
            className={`rounded-md border px-2 py-1 ${m === month ? "border-primary text-primary" : "border-border"}`}
          >
            {m}
          </button>
        ))}
      </div>
      {q.data ? <MonthlyReviewBody r={q.data} /> : <p className="text-sm">{NOT_AVAILABLE_MARK}</p>}
    </ChartCard>
  );
}
