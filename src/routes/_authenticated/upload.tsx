import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { DemoIngestPanel } from "@/components/pipeline/DemoIngestPanel";
import { GamersClubPanel } from "@/components/integrations/GamersClubPanel";
import { PlayerIdentityPanel } from "@/components/integrations/PlayerIdentityPanel";
import { SourcesPanel } from "@/components/pipeline/SourcesPanel";
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
          "Envie sua demo .dem ou seus prints e relatórios de estatísticas de CS2 para análise de performance.",
      },
      { property: "og:title", content: "Analisar meu jogo — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Dois caminhos de entrada: demo .dem ou dados e relatórios de estatísticas.",
      },
    ],
  }),
  component: AnalyzePage,
});

/** Both paths converge into the same future normalization pipeline. */
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
        <div className="grid gap-5">
          <div ref={intakeRef} tabIndex={-1} className="scroll-mt-24 outline-none">
            <ChartCard
              title={t("pipeline.title")}
              subtitle={t("pipeline.subtitle")}
              showDemoTag={false}
            >
              <DemoIngestPanel identifyJobId={identify} />
            </ChartCard>
          </div>

          <div className="lg:col-span-3">
            <ChartCard
              title={t("sources.title")}
              subtitle={t("sources.subtitle")}
              showDemoTag={false}
            >
              <SourcesPanel />
              <GamersClubPanel />
              <PlayerIdentityPanel />
            </ChartCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
