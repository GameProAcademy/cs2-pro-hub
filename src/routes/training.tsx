import { createFileRoute } from "@tanstack/react-router";

import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgressBar } from "@/components/common/ProgressBar";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTrainingPlans } from "@/services/playerService";
import type { TrainingPlan } from "@/types";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Meu Treinamento — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Plano adaptativo de 30, 60 e 90 dias para corrigir gargalos e consolidar evolução no CS2.",
      },
      { property: "og:title", content: "Meu Treinamento — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Estrutura de treino em três horizontes: correção, desenvolvimento e consolidação.",
      },
    ],
  }),
  component: TrainingPage,
});

function PlanPanel({ plan }: { plan: TrainingPlan }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <ChartCard title={plan.title} className="lg:col-span-2">
        <p className="text-sm leading-relaxed text-muted-foreground">{plan.goal}</p>
        <ul className="mt-5 space-y-3">
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

      <ChartCard title="Resumo do ciclo">
        <div className="num-display text-5xl font-bold text-foreground">
          {plan.horizon}
          <span className="ml-2 text-base font-normal text-muted-foreground">dias</span>
        </div>
        <ProgressBar
          className="mt-6"
          value={plan.progress}
          label="Progresso do plano"
          showValue
        />
        <p className="mt-6 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Foco
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
      </ChartCard>
    </div>
  );
}

function TrainingPage() {
  const plans = getTrainingPlans();

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Plano adaptativo"
          title="Meu Treinamento"
          description="Três horizontes encadeados: corrigir o que custa rounds, desenvolver a habilidade e consolidar em ambiente competitivo."
        />

        <DemoDataNotice context="Os planos abaixo são exemplos de estrutura. O algoritmo adaptativo de treinamento ainda não foi implementado." />

        <Tabs defaultValue="30">
          <TabsList className="w-full sm:w-auto">
            {plans.map((p) => (
              <TabsTrigger key={p.horizon} value={String(p.horizon)} className="flex-1 sm:flex-none">
                Plano {p.horizon} dias
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
