import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BarChart3, ClipboardList, Stethoscope, Target } from "lucide-react";
import { DEMO_DATA } from "@/config/app";

import { CoachChat } from "@/components/coach/CoachChat";
import { RealCoachChat } from "@/components/coach/RealCoachChat";
import { ChartCard } from "@/components/common/ChartCard";
import { InfoTip } from "@/components/common/InfoTip";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { FEATURES } from "@/config/app";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { getAnalysis, getProScore } from "@/services/playerService";

/** VGL 5.0: the floating chat opens /coach on the conversation it was showing. */
const conversationParam = z.string().uuid();

export const Route = createFileRoute("/_authenticated/coach")({
  validateSearch: (search: Record<string, unknown>): { conversation?: string } => {
    const parsed = conversationParam.safeParse(search["conversation"]);
    return parsed.success ? { conversation: parsed.data } : {};
  },
  head: () => ({
    meta: [
      { title: "AI Coach — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Converse com o AI Coach sobre seus pontos de melhoria, decisões de round e plano de treino.",
      },
      { property: "og:title", content: "AI Coach — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Interface de conversa com o coach de performance de CS2.",
      },
    ],
  }),
  component: DEMO_DATA ? CoachPage : RealCoachPage,
});

function RealCoachPage() {
  const t = useT();
  const { conversation } = Route.useSearch();
  return (
    <AppShell>
      <div className="space-y-4 lg:space-y-6">
        {/* VGL 5.1 (Frente 10): one title ("Treinador CS2 PRO") with its explanation in a
            tooltip; the chat below carries no second title, so it gets the reading space. */}
        <PageHeader
          eyebrow={t("coach.eyebrow")}
          title={t("vgl51.coach.title")}
          titleAddon={
            <InfoTip
              id="coach-what"
              label={t("vgl51.coach.tipLabel")}
              title={t("vgl51.coach.title")}
            >
              {t("vgl51.coach.tip")}
            </InfoTip>
          }
        />
        {/* Below lg the composer stays above the fixed bottom navigation (3.5 rem + safe area). */}
        <section
          className="surface-panel flex h-[calc(100dvh-12.5rem)] min-h-[520px] flex-col overflow-hidden rounded-lg border border-border max-lg:h-[calc(100dvh-14rem-env(safe-area-inset-bottom))] max-lg:min-h-[420px]"
          data-coach-page-chat
        >
          <RealCoachChat className="flex-1" layout="page" initialConversationId={conversation} />
        </section>
      </div>
    </AppShell>
  );
}

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
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {t("coach.historyTitle")}
              </p>
            </header>
            <CoachChat className="flex-1" />
          </section>

          <ChartCard title={t("coach.contextTitle")}>
            <div className="num-display text-4xl font-bold text-foreground">
              {score.value}
              <span className="ml-1 text-base font-normal text-muted-foreground">/{score.max}</span>
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
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              {analysis.priority}
            </p>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
