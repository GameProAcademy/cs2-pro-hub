import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { useI18n, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import type { Recommendation } from "@/lib/catalog/catalogSelect";
import { dnaLabelKey } from "@/lib/dna";
import type { DnaDimension } from "@/types";
import { getTrainingPlan } from "@/lib/training.functions";
import type { TrainingPlanModel } from "@/lib/training/trainingPlan";

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const DIMENSIONS = new Set([
  "aim",
  "dueling",
  "survivability",
  "positioning",
  "utility",
  "decision_making",
  "teamplay",
  "economy",
  "clutch",
  "consistency",
]);

/**
 * Meu Treinamento: the player's plan from their own data and the central catalog.
 * Titles and URLs are rendered exactly as the catalog stores them; links open the GamePro
 * hub in a new tab. Nothing here is a sample: every state is the real one.
 */
export function RealTrainingPlan() {
  const t = useT();
  const { locale } = useI18n();
  const query = useQuery({
    queryKey: ["training-plan", locale],
    queryFn: () => getTrainingPlan({ data: { locale } }),
  });

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("training.eyebrow")}
          title={t("training.title")}
          description={t("training.description")}
        />
        {query.isLoading ? (
          <LoadingState label={t("common.loading")} />
        ) : query.isError || !query.data ? (
          <ErrorState
            title={t("common.errorTitle")}
            description={t("common.errorTitle")}
            onRetry={() => void query.refetch()}
          />
        ) : query.data.player !== "OK" || !query.data.plan ? (
          <EmptyState title={t("training.title")} description={t("training.real.noPlayer")} />
        ) : (
          <PlanView
            plan={query.data.plan}
            matches={query.data.matches}
            catalogUnavailable={query.data.catalogUnavailable}
          />
        )}
      </div>
    </AppShell>
  );
}

function PlanView({
  plan,
  matches,
  catalogUnavailable,
}: {
  plan: TrainingPlanModel;
  matches: number;
  catalogUnavailable: boolean;
}) {
  const t = useT();
  const dimLabel = (code: string) =>
    DIMENSIONS.has(code) ? t(dnaLabelKey(code as DnaDimension)) : code;
  const goalLabel = (code: string) => t(`goal.${code}` as TranslationKey);

  if (plan.state === "NO_DATA")
    return <EmptyState title={t("training.title")} description={t("training.real.noData")} />;

  const why = (r: Recommendation) => {
    const index = plan.priorities.find((p) => p.dimension === r.need.detail)?.index;
    if (r.need.source === "dna")
      return fill(t("training.real.why.dna"), {
        dimension: dimLabel(r.need.detail),
        value: index === undefined ? "—" : `${index} / 100`,
      });
    if (r.need.source === "goal")
      return fill(t("training.real.why.goal"), { goal: goalLabel(r.need.detail) });
    if (r.need.source === "map") return fill(t("training.real.why.map"), { map: r.need.detail });
    return "";
  };

  return (
    <div className="space-y-6">
      {plan.provisional ? (
        <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {fill(t("training.real.provisional"), { matches })}
        </p>
      ) : null}
      {catalogUnavailable ? (
        <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {t("training.real.catalogUnavailable")}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {t("training.real.goals")}
          </h2>
          <p className="mt-2 text-sm text-foreground">
            {plan.goals.length ? plan.goals.map(goalLabel).join(" · ") : t("training.real.noGoals")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {t("training.real.priorities")}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {plan.priorities.map((p) => (
              <li key={p.dimension} className="flex justify-between gap-2">
                <span>{dimLabel(p.dimension)}</span>
                <span className="font-mono text-muted-foreground">{`${p.index} / 100`}</span>
              </li>
            ))}
            {!plan.priorities.length ? <li className="text-muted-foreground">—</li> : null}
          </ul>
        </div>
      </section>

      {plan.state === "NO_PRIORITY" ? (
        <EmptyState title={t("training.title")} description={t("training.real.noPriority")} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("training.real.frequency")}</p>
          <ol className="space-y-4">
            {plan.weeks.map((w) => (
              <li key={w.week} className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  {`${t("training.real.week")} ${w.week} — ${
                    w.focus === "consolidation"
                      ? t("training.real.focusConsolidation")
                      : DIMENSIONS.has(w.focus)
                        ? dimLabel(w.focus)
                        : goalLabel(w.focus)
                  }`}
                </h3>
                {w.practice.length ? (
                  <div className="mt-3">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {t("training.real.practice")}
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {w.practice.map((code) => (
                        <li key={code}>{t(`training.practice.${code}` as TranslationKey)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-3">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("training.real.lessons")}
                  </p>
                  {w.items.length ? (
                    <ul className="mt-1 space-y-2">
                      {w.items.map((r) => (
                        <CatalogItem key={r.id} item={r} why={why(r)} />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("training.real.noLesson")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {plan.complementary.length ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">
                {t("training.real.complementary")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("training.real.complementaryHint")}
              </p>
              <ul className="mt-3 space-y-2">
                {plan.complementary.map((r) => (
                  <CatalogItem key={r.id} item={r} why={why(r)} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function CatalogItem({ item, why }: { item: Recommendation; why: string }) {
  const t = useT();
  return (
    <li className="rounded-md border border-border/60 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-foreground">{item.title}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
            {t(`catalog.track.${item.track}` as TranslationKey)}
          </p>
          {why ? <p className="text-xs text-muted-foreground">{why}</p> : null}
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-secondary"
        >
          {item.kind === "course" ? t("training.real.openCourse") : t("training.real.open")}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </li>
  );
}
