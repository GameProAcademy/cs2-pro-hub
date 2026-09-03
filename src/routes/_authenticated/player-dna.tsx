import { createFileRoute } from "@tanstack/react-router";

import { DnaRadarChart } from "@/components/charts/DnaRadarChart";
import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgressBar } from "@/components/common/ProgressBar";
import { AppShell } from "@/components/layout/AppShell";
import { useT } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import { getPlayerDna } from "@/services/playerService";

export const Route = createFileRoute("/_authenticated/player-dna")({
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
  const t = useT();
  const dna = getPlayerDna();

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("dna.eyebrow")}
          title={t("dna.title")}
          description={t("dna.description")}
        />

        <DemoDataNotice />

        <div className="grid gap-5 lg:grid-cols-5">
          <ChartCard title={t("dna.radarTitle")} className="lg:col-span-3">
            <DnaRadarChart data={dna} height={420} />
          </ChartCard>

          <ChartCard
            title={t("dna.dimensions")}
            subtitle={t("dna.dimensionsSubtitle")}
            className="lg:col-span-2"
          >
            <ul className="space-y-4">
              {dna.map((d) => {
                const diff = d.value - d.average;
                return (
                  <li key={d.dimension}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {t(dnaLabelKey(d.dimension))}
                      </span>
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
