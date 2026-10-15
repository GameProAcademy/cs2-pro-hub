/**
 * Real-data surfaces. Everything rendered here comes from `getPlayerOverview`
 * (the signed-in player's own rows under RLS) or is an explicit, honest state.
 * No component in this file renders a demonstration value.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Ban, CircleDashed, Clock3, Fingerprint, ShieldAlert, Upload } from "lucide-react";
import type { ReactNode } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { MetricCard } from "@/components/common/MetricCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT, type TranslationKey } from "@/i18n";
import { getPlayerOverview } from "@/lib/playerData.functions";
import type {
  OverviewJob,
  OverviewMatch,
  OverviewState,
  PlayerOverview,
} from "@/lib/playerOverview";

export const PLAYER_OVERVIEW_QUERY_KEY = ["player", "overview"] as const;

export function usePlayerOverview() {
  return useQuery({
    queryKey: PLAYER_OVERVIEW_QUERY_KEY,
    queryFn: () => getPlayerOverview(),
    refetchInterval: (query) => (query.state.data?.state === "PROCESSING" ? 5000 : false),
  });
}

const STATE_ICON: Record<Exclude<OverviewState, "READY">, ReactNode> = {
  EMPTY: <Upload className="size-5" aria-hidden />,
  PROCESSING: <Clock3 className="size-5" aria-hidden />,
  IDENTITY_PENDING: <Fingerprint className="size-5" aria-hidden />,
  BLOCKED: <ShieldAlert className="size-5" aria-hidden />,
  FAILED: <Ban className="size-5" aria-hidden />,
};

/** The honest state of the player's data when there is no real match yet. */
export function OverviewStatePanel({ overview }: { overview: PlayerOverview }) {
  const t = useT();
  if (overview.state === "READY") return null;
  const state = overview.state;
  return (
    <EmptyState
      icon={STATE_ICON[state]}
      title={t(`real.state.${state}.title` as TranslationKey)}
      description={t(`real.state.${state}.description` as TranslationKey)}
      action={
        <Button asChild variant={state === "EMPTY" ? "default" : "outline"}>
          <Link to="/upload">
            {t(state === "EMPTY" ? "real.action.upload" : "real.action.history")}
          </Link>
        </Button>
      }
    />
  );
}

/** Wraps a page body: loading, error with retry, or the overview. */
export function WithOverview({ children }: { children: (overview: PlayerOverview) => ReactNode }) {
  const t = useT();
  const query = usePlayerOverview();
  if (query.isPending) return <LoadingState />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        title={t("real.error.title")}
        description={t("real.error.description")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <>{children(query.data)}</>;
}

/** A capability with no real data source yet. Says so instead of showing a value. */
export function NotAvailablePanel({ title, reason }: { title: string; reason: string }) {
  return (
    <ChartCard title={title} showDemoTag={false}>
      <EmptyState
        icon={<CircleDashed className="size-5" aria-hidden />}
        title={title}
        description={reason}
      />
    </ChartCard>
  );
}

function fixed(value: number | null, digits: number): string {
  return value === null ? "—" : value.toFixed(digits);
}

export function RealAggregates({ overview }: { overview: PlayerOverview }) {
  const t = useT();
  const a = overview.aggregates;
  if (!a) return null;
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard showDemoTag={false} label={t("real.metric.matches")} value={a.matches} />
      <MetricCard showDemoTag={false} label={t("real.metric.kd")} value={fixed(a.kd, 2)} />
      <MetricCard showDemoTag={false} label={t("real.metric.adr")} value={fixed(a.adr, 1)} />
      <MetricCard
        showDemoTag={false}
        label={t("real.metric.kast")}
        value={fixed(a.kast, 1)}
        unit={a.kast === null ? undefined : "%"}
      />
      <MetricCard
        showDemoTag={false}
        label={t("real.metric.winRate")}
        value={a.decided ? Math.round((a.wins / a.decided) * 100) : "—"}
        unit={a.decided ? "%" : undefined}
      />
    </div>
  );
}

const RESULT_KEY = {
  win: "matches.result.win",
  loss: "matches.result.loss",
  draw: "matches.result.draw",
} as const;

export function RealMatchesTable({ rows }: { rows: OverviewMatch[] }) {
  const t = useT();
  const columns: TranslationKey[] = [
    "matches.col.date",
    "matches.col.map",
    "matches.col.result",
    "matches.col.kills",
    "matches.col.deaths",
    "matches.col.adr",
    "matches.col.kast",
    "matches.col.rating",
  ];
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {columns.map((key) => (
              <TableHead
                key={key}
                className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                {t(key)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.matchId} className="border-border">
              <TableCell className="font-mono text-xs">{row.playedAt.slice(0, 10)}</TableCell>
              <TableCell>{row.map ?? "—"}</TableCell>
              <TableCell>
                {row.result ? t(RESULT_KEY[row.result]) : "—"}
                {row.scorePlayer !== null && row.scoreOpponent !== null
                  ? ` ${row.scorePlayer}–${row.scoreOpponent}`
                  : ""}
              </TableCell>
              <TableCell className="font-mono">{row.kills ?? "—"}</TableCell>
              <TableCell className="font-mono">{row.deaths ?? "—"}</TableCell>
              <TableCell className="font-mono">{fixed(row.adr, 1)}</TableCell>
              <TableCell className="font-mono">{fixed(row.kast, 1)}</TableCell>
              <TableCell className="font-mono">{fixed(row.rating, 2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const JOB_STATUS_KEY: Record<OverviewJob["status"], TranslationKey> = {
  pending: "real.job.pending",
  processing: "real.job.processing",
  cancel_requested: "real.job.processing",
  processed: "real.job.processed",
  failed: "real.job.failed",
  cancelled: "real.job.cancelled",
  blocked_raw_audit: "real.job.blocked",
};

const IDENTITY_KEY: Record<OverviewJob["identity"], TranslationKey | null> = {
  CONFIRMED: "real.identity.confirmed",
  PENDING: "real.identity.pending",
  UNATTACHED: "real.identity.unattached",
  CONFLICT: "real.identity.conflict",
  NOT_APPLICABLE: null,
};

export function RecentUploads({ jobs }: { jobs: OverviewJob[] }) {
  const t = useT();
  if (!jobs.length) return null;
  return (
    <ul className="divide-y divide-border">
      {jobs.map((job) => {
        const identity = IDENTITY_KEY[job.identity];
        return (
          <li key={job.jobId} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{job.fileName ?? job.uploadId}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {job.queuedAt.slice(0, 16).replace("T", " ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
              <span className="rounded-sm border border-border px-1.5 py-0.5">
                {t(JOB_STATUS_KEY[job.status])}
              </span>
              {identity ? (
                <span className="rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground">
                  {t(identity)}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A page whose engine has no real data source yet (Player DNA, AI Coach, X-ray,
 * performance trends, training plan). It shows the player's real data state and
 * says plainly that the capability is not available; it never renders a sample.
 */
export function RealCapabilityPage({
  eyebrow,
  title,
  description,
  reason,
}: {
  eyebrow: string;
  title: string;
  description: string;
  reason: string;
}) {
  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader eyebrow={eyebrow} title={title} description={description} />
        <NotAvailablePanel title={title} reason={reason} />
        <WithOverview>{(overview) => <OverviewStatePanel overview={overview} />}</WithOverview>
      </div>
    </AppShell>
  );
}
