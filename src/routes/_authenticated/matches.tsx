import { Link, createFileRoute } from "@tanstack/react-router";

import { ChartCard } from "@/components/common/ChartCard";
import { DemoDataNotice } from "@/components/common/DemoDataNotice";
import { MetricCard } from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { MatchesTable } from "@/components/panels/MatchesTable";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { getMatches } from "@/services/playerService";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({
    meta: [
      { title: "Minhas Partidas — CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Histórico de partidas analisadas com mapa, resultado, ADR, KAST e rating.",
      },
      { property: "og:title", content: "Minhas Partidas — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Todo o seu histórico competitivo de CS2 em uma tabela consolidada.",
      },
    ],
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const t = useT();
  const rows = getMatches();
  const wins = rows.filter((r) => r.result === "V").length;
  const avgRating = (rows.reduce((a, r) => a + r.rating, 0) / rows.length).toFixed(2);
  const avgAdr = (rows.reduce((a, r) => a + r.adr, 0) / rows.length).toFixed(1);

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("matches.eyebrow")}
          title={t("matches.title")}
          description={t("matches.description")}
          actions={
            <Button asChild>
              <Link to="/upload">{t("matches.newDemo")}</Link>
            </Button>
          }
        />

        <DemoDataNotice context={t("matches.notice")} />

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={t("matches.total")} value={rows.length} />
          <MetricCard
            label={t("matches.winRate")}
            value={Math.round((wins / rows.length) * 100)}
            unit="%"
          />
          <MetricCard label={t("matches.avgRating")} value={avgRating} />
          <MetricCard label={t("matches.avgAdr")} value={avgAdr} />
        </div>

        <ChartCard title={t("matches.tableTitle")} subtitle={t("matches.tableSub")}>
          <MatchesTable rows={rows} />
        </ChartCard>
      </div>
    </AppShell>
  );
}
