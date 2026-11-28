import { Link, createFileRoute } from "@tanstack/react-router";

import { DnaRadarChart } from "@/components/charts/DnaRadarChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { MetricCard } from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { MapPoolCard } from "@/components/real/MapPool";
import { BestMapHero } from "@/components/cs2/BestMap";
import { DnaIdentityCard } from "@/components/cs2/IdentityKit";
import { HomeCommandRow } from "@/components/cs2/HudKit";
import { PendingActionsBanner } from "@/components/pipeline/PendingActionsBanner";
import { BottleneckList } from "@/components/panels/BottleneckList";
import { MatchesTable } from "@/components/panels/MatchesTable";
import { ProScoreCard } from "@/components/panels/ProScoreCard";
import { RealProScoreCard } from "@/components/real/RealProScore";
import { StrengthList } from "@/components/panels/StrengthList";
import {
  NotAvailablePanel,
  OverviewStatePanel,
  RealAggregates,
  RealMatchesTable,
  RecentUploads,
  WithOverview,
} from "@/components/real/RealData";
import { Button } from "@/components/ui/button";
import { RealDnaSummary } from "@/components/real/RealDna";
import { DEMO_DATA } from "@/config/app";
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
import { CoachWordCard } from "@/components/coachWord/CoachWordCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Visão geral do seu CS2 PRO Score, Player DNA, pontos de melhoria, pontos fortes e últimas partidas.",
      },
      { property: "og:title", content: "Dashboard — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Score, DNA e diagnóstico de performance em Counter-Strike 2.",
      },
    ],
  }),
  component: DEMO_DATA ? DemoDashboardPage : RealDashboardPage,
});

/** Production: only the player's own persisted data, or an honest state. */
function RealDashboardPage() {
  const t = useT();
  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("dashboard.eyebrow")}
          title={t("dashboard.title")}
          description={t("real.dashboard.description")}
        />
        <PendingActionsBanner />
        <WithOverview>
          {(overview) => (
            <div className="space-y-8">
              <OverviewStatePanel overview={overview} />
              {/*
               * VGL 5.1 (Frente 6) — fixed order: 1) best map, 2) the five indicators
               * (matches, K/D, ADR, KAST, win rate), 3) Score and Player DNA side by side,
               * 4) the rest as before (Coach's Word, Training / AI Coach / Maps, last matches…).
               * The state panel above is a notice and renders nothing once the overview is READY.
               */}
              <BestMapHero matches={overview.matches} />
              <div data-home-indicators>
                <RealAggregates overview={overview} />
              </div>
              <div className="grid gap-5 lg:grid-cols-2" data-home-headline>
                <RealProScoreCard />
                <DnaIdentityCard fallback={<RealDnaSummary />} />
              </div>
              <CoachWordCard section="dashboard" />
              <HomeCommandRow matches={overview.matches} />
              {overview.matches.length ? (
                <ChartCard
                  showDemoTag={false}
                  icon="rounds"
                  title={t("dashboard.lastMatches")}
                  actions={
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/matches">{t("dashboard.viewAll")}</Link>
                    </Button>
                  }
                >
                  <RealMatchesTable rows={overview.matches.slice(0, 5)} />
                </ChartCard>
              ) : null}
              <MapPoolCard rows={overview.matches} />
              {overview.latestJobs.length ? (
                <ChartCard
                  showDemoTag={false}
                  icon="clock"
                  title={t("real.uploads.title")}
                  subtitle={t("real.uploads.subtitle")}
                >
                  <RecentUploads jobs={overview.latestJobs.slice(0, 5)} />
                </ChartCard>
              ) : null}
            </div>
          )}
        </WithOverview>
      </div>
    </AppShell>
  );
}

function DemoDashboardPage() {
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
          icon="rounds"
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
