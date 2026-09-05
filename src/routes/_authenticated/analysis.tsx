import { createFileRoute } from "@tanstack/react-router";
import { Quote } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgressBar } from "@/components/common/ProgressBar";
import { FaceitPanel } from "@/components/integrations/FaceitPanel";
import { AppShell } from "@/components/layout/AppShell";
import { BottleneckList } from "@/components/panels/BottleneckList";
import { StrengthList } from "@/components/panels/StrengthList";
import { useT } from "@/i18n";
import { getAnalysis, getBottlenecks, getStrengths } from "@/services/playerService";

interface AnalysisSearch {
  connection?: "faceit_success" | "faceit_error";
  reason?: string;
}

export const Route = createFileRoute("/_authenticated/analysis")({
  validateSearch: (search: Record<string, unknown>): AnalysisSearch => {
    const connection = search["connection"];
    const reason = search["reason"];
    return {
      ...(connection === "faceit_success" || connection === "faceit_error" ? { connection } : {}),
      ...(typeof reason === "string" && /^[a-z_]{1,40}$/.test(reason) ? { reason } : {}),
    };
  },
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
  const t = useT();
  const analysis = getAnalysis();
  const search = Route.useSearch();

  const callback = search.connection
    ? {
        status: search.connection === "faceit_success" ? ("success" as const) : ("error" as const),
        ...(search.reason ? { reason: search.reason } : {}),
      }
    : undefined;

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("analysis.eyebrow")}
          title={t("analysis.title")}
          description={t("analysis.description")}
        />

        <DemoDataNotice context={t("analysis.notice")} />

        <FaceitPanel callback={callback} />

        <ChartCard title={t("analysis.overall")}>
          <p className="text-sm leading-relaxed text-muted-foreground">{analysis.overall}</p>
        </ChartCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title={t("analysis.strengths")}>
            <StrengthList items={getStrengths()} />
          </ChartCard>
          <ChartCard title={t("analysis.bottlenecks")}>
            <BottleneckList items={getBottlenecks()} />
          </ChartCard>
        </div>

        <ChartCard title={t("analysis.evidence")} subtitle={t("analysis.evidenceSub")}>
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
          <ChartCard title={t("analysis.priority")} className="lg:col-span-2">
            <div className="flex gap-3">
              <Quote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="space-y-4">
                <p className="text-base leading-relaxed text-foreground">{analysis.priority}</p>
                <div>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {t("analysis.recommendation")}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {analysis.recommendation}
                  </p>
                </div>
              </div>
            </div>
          </ChartCard>

          <ChartCard title={t("analysis.confidence")}>
            <div className="num-display text-5xl font-bold text-foreground">
              {analysis.confidence}
              <span className="text-2xl text-muted-foreground">%</span>
            </div>
            <ProgressBar className="mt-5" value={analysis.confidence} tone="accent" />
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {t("analysis.confidenceHint")}
            </p>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
