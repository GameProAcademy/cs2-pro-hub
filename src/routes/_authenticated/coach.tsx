import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, ClipboardList, Stethoscope, Target } from "lucide-react";

import { CoachChat } from "@/components/coach/CoachChat";
import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { FEATURES } from "@/config/app";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { getAnalysis, getProScore } from "@/services/playerService";

export const Route = createFileRoute("/_authenticated/_authenticated/coach")({
  head: () => ({
    meta: [
      { title: "AI Coach — CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Converse com o AI Coach sobre seus gargalos, decisões de round e plano de treino.",
      },
      { property: "og:title", content: "AI Coach — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Interface de conversa com o coach de performance de CS2.",
      },
    ],
  }),
  component: CoachPage,
});

const contextItems: { icon: typeof Target; labelKey: TranslationKey }[] = [
  { icon: BarChart3, labelKey: "coach.context.performance" },
  { icon: Stethoscope, labelKey: "coach.context.analysis" },
  { icon: Target, labelKey: "coach.context.training" },
  { icon: ClipboardList, labelKey: "coach.context.plan" },
];

function CoachPage() {
  const t = useT();
  const score = getProScore();
  const analysis = getAnalysis();

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("coach.eyebrow")}
          title={t("coach.title")}
          description={t("coach.description")}
        />

        {!FEATURES.aiCoachApi ? (
          <p className="rounded-lg border border-warning/25 bg-warning/8 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-warning">{t("coach.notConnectedTitle")}</span>{" "}
            {t("coach.notConnectedBody")}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <section className="surface-panel flex h-[62vh] min-h-[420px] flex-col rounded-lg border border-border">
            <header className="border-b border-border px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {t("coach.historyTitle")}
              </p>
            </header>
            <CoachChat className="flex-1" />
          </section>

          <ChartCard title={t("coach.contextTitle")}>
            <div className="num-display text-4xl font-bold text-foreground">
              {score.value}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                /{score.max}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{score.tier}</p>
            <ul className="mt-5 space-y-2.5">
              {contextItems.map((item) => (
                <li
                  key={item.labelKey}
                  className="flex items-center gap-3 rounded-md border border-border bg-card/50 px-3 py-2.5"
                >
                  <item.icon className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="text-sm font-medium text-foreground">{t(item.labelKey)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{analysis.priority}</p>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
