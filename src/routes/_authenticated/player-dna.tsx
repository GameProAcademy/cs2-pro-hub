import { createFileRoute } from "@tanstack/react-router";

import { DnaRadarChart } from "@/components/charts/DnaRadarChart";
import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgressBar } from "@/components/common/ProgressBar";
import { AppShell } from "@/components/layout/AppShell";
import { getPlayerDna } from "@/services/playerService";

export const Route = createFileRoute("/_authenticated/_authenticated/player-dna")({
  head: () => ({
    meta: [
      { title: "Player DNA — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Seu perfil competitivo em 10 dimensões: aim, duelos, sobrevivência, posicionamento, utilitário e mais.",
      },
      { property: "og:title", content: "Player DNA — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "O mapa completo do seu estilo de jogo em Counter-Strike 2.",
      },
    ],
  }),
  component: PlayerDnaPage,
});

function PlayerDnaPage() {
  const dna = getPlayerDna();

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Perfil competitivo"
          title="CS2 PRO Player DNA"
          description="Cada dimensão é comparada com a média esperada para o seu nível. O objetivo não é ter tudo alto, é conhecer o seu formato."
        />

        <DemoDataNotice />

        <div className="grid gap-5 lg:grid-cols-5">
          <ChartCard title="Radar do Player DNA" className="lg:col-span-3">
            <DnaRadarChart data={dna} height={420} />
          </ChartCard>

          <ChartCard
            title="Dimensões"
            subtitle="Valor atual vs média do nível"
            className="lg:col-span-2"
          >
            <ul className="space-y-4">
              {dna.map((d) => {
                const diff = d.value - d.average;
                return (
                  <li key={d.dimension}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{d.dimension}</span>
                      <span className="num-display text-sm">
                        {d.value}
                        <span
                          className={
                            diff >= 0 ? "ml-2 text-xs text-success" : "ml-2 text-xs text-destructive"
                          }
                        >
                          {diff >= 0 ? "+" : ""}
                          {diff}
                        </span>
                      </span>
                    </div>
                    <ProgressBar
                      value={d.value}
                      tone={d.value >= d.average ? "success" : "destructive"}
                    />
                  </li>
                );
              })}
            </ul>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
