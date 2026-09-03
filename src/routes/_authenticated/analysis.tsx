import { createFileRoute } from "@tanstack/react-router";
import { Quote } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgressBar } from "@/components/common/ProgressBar";
import { AppShell } from "@/components/layout/AppShell";
import { BottleneckList } from "@/components/panels/BottleneckList";
import { StrengthList } from "@/components/panels/StrengthList";
import { getAnalysis, getBottlenecks, getStrengths } from "@/services/playerService";

export const Route = createFileRoute("/_authenticated/_authenticated/analysis")({
  head: () => ({
    meta: [
      { title: "Meu Raio-X — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Diagnóstico completo da sua performance: pontos fortes, gargalos, evidências e prioridade #1.",
      },
      { property: "og:title", content: "Meu Raio-X — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "O diagnóstico que transforma métricas em plano de ação.",
      },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const analysis = getAnalysis();

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Diagnóstico"
          title="Seu Raio-X CS2 PRO"
          description="A leitura estruturada do seu jogo: onde você ganha rounds, onde perde e o que atacar primeiro."
        />

        <DemoDataNotice context="Este diagnóstico é um exemplo de formato. Nenhuma análise real foi executada — não existe engine de diagnóstico nesta etapa." />

        <ChartCard title="Performance geral">
          <p className="text-sm leading-relaxed text-muted-foreground">{analysis.overall}</p>
        </ChartCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Pontos fortes">
            <StrengthList items={getStrengths()} />
          </ChartCard>
          <ChartCard title="Principais gargalos">
            <BottleneckList items={getBottlenecks()} />
          </ChartCard>
        </div>

        <ChartCard title="Evidências" subtitle="Sinais usados para sustentar o diagnóstico">
          <ul className="space-y-3">
            {analysis.evidence.map((e) => (
              <li key={e} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
        </ChartCard>

        <div className="grid gap-5 lg:grid-cols-3">
          <ChartCard title="Prioridade #1" className="lg:col-span-2">
            <div className="flex gap-3">
              <Quote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="space-y-4">
                <p className="text-base leading-relaxed text-foreground">{analysis.priority}</p>
                <div>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Recomendação
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {analysis.recommendation}
                  </p>
                </div>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Confiança da análise">
            <div className="num-display text-5xl font-bold text-foreground">
              {analysis.confidence}
              <span className="text-2xl text-muted-foreground">%</span>
            </div>
            <ProgressBar className="mt-5" value={analysis.confidence} tone="accent" />
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              A confiança cresce conforme mais partidas são enviadas e o volume de rounds por lado e
              por mapa aumenta.
            </p>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
