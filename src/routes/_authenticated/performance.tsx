import { createFileRoute } from "@tanstack/react-router";

import { MapPerformanceChart } from "@/components/charts/MapPerformanceChart";
import { SideSplitChart } from "@/components/charts/SideSplitChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { MetricCard } from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { useT, type TranslationKey } from "@/i18n";
import { getMapPerformance, getMetrics, getSideSplit, getTrends } from "@/services/playerService";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "Performance — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "K/D, ADR, KAST, HS%, opening duels, clutches e desempenho por mapa em uma única visão.",
      },
      { property: "og:title", content: "Performance — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Métricas detalhadas de performance competitiva em CS2.",
      },
    ],
  }),
  component: PerformancePage,
});

function PerformancePage() {
  const t = useT();
  const metrics = getMetrics();
  const trends = getTrends();
  const maps = getMapPerformance();

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("performance.eyebrow")}
          title={t("performance.title")}
          description={t("performance.description")}
        />

        <DemoDataNotice />

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              value={m.value}
              unit={m.unit}
              delta={m.delta}
              hint={m.hint ? t(m.hint as TranslationKey) : undefined}
              invertDelta={m.key === "fdr"}
            />
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title={t("performance.kdTrend")}>
            <TrendChart data={trends.kd} series={[{ key: "kd", label: "K/D" }]} variant="line" />
          </ChartCard>
          <ChartCard title={t("performance.adrTrend")}>
            <TrendChart data={trends.adr} series={[{ key: "adr", label: "ADR" }]} />
          </ChartCard>
          <ChartCard title={t("performance.kastTrend")}>
            <TrendChart
              data={trends.kast}
              series={[{ key: "kast", label: "KAST", color: "var(--chart-3)" }]}
              unit="%"
            />
          </ChartCard>
          <ChartCard title={t("performance.hsTrend")}>
            <TrendChart
              data={trends.hs}
              series={[{ key: "hs", label: "HS%", color: "var(--chart-4)" }]}
              unit="%"
            />
          </ChartCard>
          <ChartCard
            title={t("performance.opening")}
            subtitle={t("performance.openingSub")}
            className="lg:col-span-2"
          >
            <TrendChart
              data={trends.opening}
              variant="line"
              unit="%"
              series={[
                { key: "firstKill", label: "First Kill Rate", color: "var(--chart-3)" },
                { key: "firstDeath", label: "First Death Rate", color: "var(--chart-5)" },
              ]}
            />
          </ChartCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-5">
          <ChartCard
            title={t("performance.maps")}
            subtitle={t("performance.mapsSub")}
            className="lg:col-span-3"
          >
            <MapPerformanceChart data={maps} />
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {maps.map((m) => (
                <div
                  key={m.map}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{m.map}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.matches} {t("performance.games")} · {t("performance.rating")}{" "}
                    {m.rating.toFixed(2)} · ADR {m.adr}
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard
            title={t("performance.sides")}
            subtitle={t("performance.sidesSub")}
            className="lg:col-span-2"
          >
            <SideSplitChart data={getSideSplit()} hasEnoughData />
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
