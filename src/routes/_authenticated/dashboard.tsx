import { Link, createFileRoute } from "@tanstack/react-router";

import { DnaRadarChart } from "@/components/charts/DnaRadarChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { MetricCard } from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { BottleneckList } from "@/components/panels/BottleneckList";
import { MatchesTable } from "@/components/panels/MatchesTable";
import { ProScoreCard } from "@/components/panels/ProScoreCard";
import { StrengthList } from "@/components/panels/StrengthList";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import {
  getBottlenecks,
  getMatches,
  getMetrics,
  getPlayerDna,
  getProScore,
  getStrengths,
  getTrends,
} from "@/services/playerService";
import type { TranslationKey } from "@/i18n";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Visão geral do seu CS2 PRO Score, Player DNA, gargalos, pontos fortes e últimas partidas.",
      },
      { property: "og:title", content: "Dashboard — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Score, DNA e diagnóstico de performance em Counter-Strike 2.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const t = useT();
  const score = getProScore();
  const dna = getPlayerDna();
  const metrics = getMetrics().slice(0, 4);
  const trends = getTrends();

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("dashboard.eyebrow")}
          title={t("dashboard.title")}
          description={t("dashboard.description")}
          actions={
            <Button asChild variant="outline">
              <Link to="/analysis">{t("dashboard.viewXray")}</Link>
            </Button>
          }
        />

        <DemoDataNotice />

        <div className="grid gap-5 lg:grid-cols-3">
          <ProScoreCard score={score} />
          <ChartCard
            title={t("dashboard.scoreTrend")}
            subtitle={t("dashboard.scoreTrendSub")}
            className="lg:col-span-2"
          >
            <TrendChart
              data={trends.score}
              series={[{ key: "score", label: "Score" }]}
              domain={[50, 100]}
              height={220}
            />
          </ChartCard>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              value={m.value}
              unit={m.unit}
              delta={m.delta}
              hint={m.hint ? t(m.hint as TranslationKey) : undefined}
            />
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title={t("dashboard.dna")}
            subtitle={t("dashboard.dnaSub")}
            actions={
              <Button asChild size="sm" variant="ghost">
                <Link to="/player-dna">{t("dashboard.detail")}</Link>
              </Button>
            }
          >
            <DnaRadarChart data={dna} height={340} />
          </ChartCard>

          <div className="space-y-5">
            <ChartCard title={t("dashboard.bottlenecks")} subtitle={t("dashboard.bottlenecksSub")}>
              <BottleneckList items={getBottlenecks()} />
            </ChartCard>
          </div>
        </div>

        <ChartCard title={t("dashboard.strengths")} subtitle={t("dashboard.strengthsSub")}>
          <div className="grid gap-4 lg:grid-cols-3">
            <StrengthList items={getStrengths()} />
          </div>
        </ChartCard>

        <ChartCard
          title={t("dashboard.lastMatches")}
          subtitle={t("dashboard.lastMatchesSub")}
          actions={
            <Button asChild size="sm" variant="ghost">
              <Link to="/matches">{t("dashboard.viewAll")}</Link>
            </Button>
          }
        >
          <MatchesTable rows={getMatches().slice(0, 5)} />
        </ChartCard>
      </div>
    </AppShell>
  );
}
