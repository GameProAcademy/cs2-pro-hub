import { createFileRoute } from "@tanstack/react-router";
import { PlayCircle } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { DemoTag } from "@/components/common/DemoDataNotice";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgressBar } from "@/components/common/ProgressBar";
import { AppShell } from "@/components/layout/AppShell";
import { dnaLabelKey } from "@/lib/dna";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { getLessonsForHorizon, getTrainingPlans } from "@/services/playerService";
import type { TrainingPlan } from "@/types";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "Meu Treinamento — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Plano adaptativo de 30, 60 e 90 dias com aulas recomendadas do CS2 PRO para corrigir gargalos.",
      },
      { property: "og:title", content: "Meu Treinamento — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Correção, desenvolvimento e consolidação — com conteúdo recomendado por etapa.",
      },
    ],
  }),
  component: TrainingPage,
});

const horizonKeys: Record<number, TranslationKey> = {
  30: "training.horizon30",
  60: "training.horizon60",
  90: "training.horizon90",
};

function PlanPanel({ plan }: { plan: TrainingPlan }) {
  const t = useT();
  const lessons = getLessonsForHorizon(plan.horizon);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <ChartCard title={t(horizonKeys[plan.horizon] ?? "training.horizon30")}>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("training.objective")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.goal}</p>

          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("training.steps")}
          </p>
          <ul className="mt-3 space-y-3">
            {plan.tasks.map((task) => (
              <li key={task.title} className="rounded-lg border border-border bg-card/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{task.title}</h3>
                  <span className="rounded-sm bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {task.frequency}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{task.detail}</p>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title={t("training.lessons")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {lessons.map((lesson) => (
              <article
                key={lesson.lessonId}
                className="flex flex-col rounded-lg border border-border bg-card/50 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
                    {t("training.lessonModule")}: {lesson.module}
                  </p>
                  {lesson.isDemoLink ? <DemoTag /> : null}
                </div>
                <h3 className="mt-2 text-sm font-semibold text-foreground">{lesson.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {lesson.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {lesson.relatedSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      {t(dnaLabelKey(skill))}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  {lesson.duration ? (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {t("training.lessonDuration")}: {lesson.duration}
                    </span>
                  ) : (
                    <span />
                  )}
                  {/* Official lesson links are not published yet: keep disabled until real URLs exist. */}
                  {lesson.lessonUrl ? (
                    <Button asChild size="sm" variant="outline" className="gap-2">
                      <a href={lesson.lessonUrl} target="_blank" rel="noopener noreferrer">
                        <PlayCircle className="size-3.5" aria-hidden />
                        {t("training.watchLesson")}
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-2" disabled>
                      <PlayCircle className="size-3.5" aria-hidden />
                      {t("training.watchLesson")}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </ChartCard>
      </div>

      <ChartCard title={t("training.cycleSummary")}>
        <div className="num-display text-5xl font-bold text-foreground">
          {plan.horizon}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {t("training.days")}
          </span>
        </div>
        <ProgressBar
          className="mt-6"
          value={plan.progress}
          label={t("training.progress")}
          showValue
        />
        <p className="mt-6 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("training.focus")}
        </p>
        <div className="flex flex-wrap gap-2">
          {plan.focus.map((f) => (
            <span
              key={f}
              className="rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
            >
              {f}
            </span>
          ))}
        </div>
        <p className="mt-6 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("training.exercises")}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("training.exercisesSoon")}
        </p>
      </ChartCard>
    </div>
  );
}

function TrainingPage() {
  const t = useT();
  const plans = getTrainingPlans();

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("training.eyebrow")}
          title={t("training.title")}
          description={t("training.description")}
        />

        <DemoDataNotice context={t("training.notice")} />

        <Tabs defaultValue="30">
          <TabsList className="w-full sm:w-auto">
            {plans.map((p) => (
              <TabsTrigger key={p.horizon} value={String(p.horizon)} className="flex-1 sm:flex-none">
                {t("training.plan")} {p.horizon} {t("training.days")}
              </TabsTrigger>
            ))}
          </TabsList>
          {plans.map((p) => (
            <TabsContent key={p.horizon} value={String(p.horizon)} className="mt-5">
              <PlanPanel plan={p} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppShell>
  );
}
