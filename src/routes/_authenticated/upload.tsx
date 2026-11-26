import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { DemoIngestPanel } from "@/components/pipeline/DemoIngestPanel";
import { GamersClubPanel } from "@/components/integrations/GamersClubPanel";
import { PlayerIdentityPanel } from "@/components/integrations/PlayerIdentityPanel";
import { SourcesPanel } from "@/components/pipeline/SourcesPanel";
import { UploadLoop } from "@/components/pipeline/UploadLoop";
import { useT } from "@/i18n";

interface UploadSearch {
  /** PR5: open the upload modal on the identification step for this job. */
  identify?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/upload")({
  validateSearch: (search: Record<string, unknown>): UploadSearch => {
    const identify = search["identify"];
    return typeof identify === "string" && UUID.test(identify) ? { identify } : {};
  },
  head: () => ({
    meta: [
      { title: "Analisar meu jogo — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Envie a demo .dem de uma partida sua de CS2 para gerar diagnóstico e plano de treino.",
      },
      { property: "og:title", content: "Analisar meu jogo — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Envie a demo .dem de uma partida sua para análise de performance.",
      },
    ],
  }),
  component: AnalyzePage,
});

/** One path: the real demo ingestion (UX-1 R-19). */
function AnalyzePage() {
  const t = useT();
  const { identify } = Route.useSearch();
  const intakeRef = useRef<HTMLDivElement>(null);

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("analyze.eyebrow")}
          title={t("analyze.title")}
          description={t("analyze.description")}
        />

        {/* UX-1 R-19: one path — the real demo ingestion. The interface-only "no demo" intake and
            the engineering status card are gone; nothing the player could use was removed. */}
        {/* Visual evolution E2: ≥1280 px adds a "how it works" column next to the intake; below
            that width the aside is display:none and the page is the same single column. */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
          <div ref={intakeRef} tabIndex={-1} className="scroll-mt-24 outline-none">
            <ChartCard
              title={t("analyze.intake.title")}
              subtitle={t("analyze.intake.subtitle")}
              icon="rounds"
              showDemoTag={false}
            >
              <DemoIngestPanel identifyJobId={identify} />
            </ChartCard>
          </div>

          {/* The aside stretches over the intake row only (self-stretch) and is the containing
              block of the sticky wrapper, so the column follows the scroll while the intake row is
              on screen and stops at the end of it, never over "Fontes de dados". */}
          <aside className="hidden xl:block xl:self-stretch" data-upload-loop-rail>
            <div className="xl:sticky xl:top-24">
              <UploadLoop />
            </div>
          </aside>

          {/* lg:col-span-3 is kept as it was (it is what sizes the cards between 1024 and 1279 px
              today); from 1280 px the explicit two-column grid takes over. */}
          <div className="lg:col-span-3 xl:col-span-2">
            <ChartCard
              title={t("sources.title")}
              subtitle={t("sources.subtitle")}
              icon="shield"
              showDemoTag={false}
            >
              {/* E3: the three panels touched each other (no gap); now 20 px apart. From 1280 px
                  the source list and Gamers Club sit side by side; PlayerIdentityPanel (protected
                  in this stage) keeps its full width and its own markup. */}
              <div className="space-y-5">
                <div className="space-y-5 xl:grid xl:grid-cols-2 xl:items-start xl:gap-5 xl:space-y-0">
                  <SourcesPanel />
                  <GamersClubPanel />
                </div>
                <PlayerIdentityPanel />
              </div>
            </ChartCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
