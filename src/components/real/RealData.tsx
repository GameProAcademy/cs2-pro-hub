/**
 * Real-data surfaces. Everything rendered here comes from `getPlayerOverview`
 * (the signed-in player's own rows under RLS) or is an explicit, honest state.
 * No component in this file renders a demonstration value.
 */
import { MapTile } from "@/components/common/GameVisuals";
import { ToneBadge, type BadgeTone } from "@/components/common/VisualBadges";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  CircleDashed,
  CircleHelp,
  Clock3,
  Fingerprint,
  ShieldAlert,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { MetricCard } from "@/components/common/MetricCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricTerm } from "@/components/common/MetricTerm";
import { AdrPartialMark } from "@/components/real/AdrPartialMark";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { getPlayerOverview } from "@/lib/playerData.functions";
import { mapDisplayName } from "@/lib/cs2/maps";
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
export function NotAvailablePanel({
  title,
  reason,
  action,
}: {
  title: string;
  reason: string;
  /** Optional next step (e.g. where the capability is explained). */
  action?: ReactNode;
}) {
  return (
    <ChartCard title={title} showDemoTag={false}>
      <EmptyState
        icon={<CircleDashed className="size-5" aria-hidden />}
        title={title}
        description={reason}
        action={action}
      />
    </ChartCard>
  );
}

/** A table cell value: localized number, or "not available" announced to screen readers. */
function NumberCell({ value, digits }: { value: number | null; digits: number }) {
  const t = useT();
  const { intlTag } = useI18n();
  if (value === null || !Number.isFinite(value)) {
    return (
      <>
        <span aria-hidden>{NOT_AVAILABLE_MARK}</span>
        <span className="sr-only">{t("common.notAvailable")}</span>
      </>
    );
  }
  return <>{formatNumber(value, intlTag, digits)}</>;
}

export function RealAggregates({ overview }: { overview: PlayerOverview }) {
  const t = useT();
  const { intlTag } = useI18n();
  const a = overview.aggregates;
  if (!a) return null;
  const num = (value: number | null, digits: number) =>
    value === null ? null : formatNumber(value, intlTag, digits);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-5" data-aggregates>
      <MetricCard
        showDemoTag={false}
        icon="map"
        label={t("real.metric.matches")}
        value={a.matches}
      />
      <MetricCard
        showDemoTag={false}
        icon="crosshair"
        label={<MetricTerm id="kd" />}
        value={num(a.kd, 2)}
      />
      <MetricCard
        showDemoTag={false}
        icon="target"
        label={<MetricTerm id="adr" />}
        value={num(a.adr, 1)}
        hint={
          a.adr !== null && a.adrPartialMatches > 0
            ? fill(t("adr.partialMatches"), { n: a.adrPartialMatches })
            : undefined
        }
      />
      <MetricCard
        showDemoTag={false}
        icon="rounds"
        label={<MetricTerm id="kast" />}
        value={num(a.kast, 1)}
        unit="%"
      />
      <MetricCard
        showDemoTag={false}
        icon="trend"
        className="col-span-2 sm:col-span-1"
        label={<MetricTerm id="winRate" variant="label" />}
        value={a.decided ? num((a.wins / a.decided) * 100, 0) : null}
        unit="%"
        hint={
          a.decided
            ? fill(t("real.winRate.sample"), { wins: a.wins, decided: a.decided })
            : a.resultUnresolved
              ? fill(t("real.winRate.unresolved"), { n: a.resultUnresolved })
              : undefined
        }
      />
      {a.limited > 0 ? (
        <p
          className="col-span-2 flex flex-col items-start gap-2 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center xl:col-span-5"
          data-limited-note
        >
          <ToneBadge tone="attention" icon="alert" className="font-mono">
            {t("real.metric.limited")}: {a.limited}/{a.matches}
          </ToneBadge>
          <span className="min-w-0 flex-1">{t("real.admission.limitedNote")}</span>
        </p>
      ) : null}
    </div>
  );
}

/** How the match was admitted, with each declared limitation spelled out. */
export function AdmissionBadge({ row }: { row: OverviewMatch }) {
  const t = useT();
  if (!row.admission) return null;
  const limited = row.admission === "LIMITED";
  const detail = row.limitations
    .map((id) => t(`real.admission.${id}` as TranslationKey))
    .join(" · ");
  return (
    <ToneBadge
      tone={limited ? "attention" : "context"}
      icon={limited ? "alert" : "shield"}
      className="font-mono uppercase tracking-wider"
      data-admission={row.admission}
      {...(limited
        ? { title: detail, "aria-label": `${t("real.admission.limited")}: ${detail}` }
        : {})}
    >
      {t(limited ? "real.admission.limited" : "real.admission.certified")}
    </ToneBadge>
  );
}

const RESULT_KEY = {
  win: "matches.result.win",
  loss: "matches.result.loss",
  draw: "matches.result.draw",
} as const;

/**
 * VGL: a known result as a badge with its word (same convention as the demo table: loss in the
 * critical tone). The dashed neutral tone stays reserved for "no value".
 */
const RESULT_TONE: Record<keyof typeof RESULT_KEY, BadgeTone> = {
  win: "brand",
  loss: "critical",
  draw: "context",
};

function MatchColumnInfo({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={label}
            data-match-column-help={label}
          >
            <CircleHelp className="size-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 text-left normal-case tracking-normal" align="start">
          <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>
        </PopoverContent>
      </Popover>
    </span>
  );
}

export function RealMatchesTable({ rows }: { rows: OverviewMatch[] }) {
  const t = useT();
  const { intlTag } = useI18n();
  const columns: Array<TranslationKey | ReactNode> = [
    <MatchColumnInfo
      key="date"
      label={t("matches.col.date")}
      help={t("real.date.processedNote")}
    />,
    "matches.col.map",
    <MatchColumnInfo
      key="result"
      label={t("matches.col.result")}
      help={t("real.result.unresolvedNote")}
    />,
    "matches.col.kills",
    "matches.col.deaths",
    <MetricTerm key="adr" id="adr" />,
    <MetricTerm key="kast" id="kast" />,
    <MetricTerm key="rating" id="rating" />,
    "real.admission.column",
  ];
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {columns.map((column, index) => (
              <TableHead
                key={typeof column === "string" ? column : index}
                className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground"
              >
                {typeof column === "string" ? t(column as TranslationKey) : column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.matchId}
              className="cursor-pointer border-border hover:bg-secondary/40"
              data-match-row={row.matchId}
              // UX-1.5: the whole row opens the Match Room; the map link is the keyboard path.
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a,button")) return;
                e.currentTarget.querySelector<HTMLAnchorElement>("a[data-room-link]")?.click();
              }}
            >
              <TableCell className="whitespace-nowrap font-mono text-xs">
                {row.dateSource === "processed" ? (
                  <span className="sr-only">{t("real.date.processed")} </span>
                ) : null}
                <time dateTime={row.playedAt} data-date-source={row.dateSource}>
                  {formatDate(row.playedAt, intlTag)}
                </time>
                {row.dateSource === "processed" ? (
                  <span aria-hidden className="text-muted-foreground">
                    *
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <Link
                  to="/matches/$matchId"
                  params={{ matchId: row.matchId }}
                  data-room-link
                  className="inline-flex min-h-11 items-center gap-2 font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  {row.map ? <MapTile map={row.map} size="sm" /> : null}
                  <span aria-hidden={row.map ? true : undefined}>
                    {row.map ? mapDisplayName(row.map) : NOT_AVAILABLE_MARK}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                {row.result ? (
                  <ToneBadge tone={RESULT_TONE[row.result]} data-result={row.result}>
                    {t(RESULT_KEY[row.result])}
                  </ToneBadge>
                ) : (
                  <span
                    title={
                      row.resultStatus === "UNRESOLVED_BY_DEMO"
                        ? t("real.result.unresolved")
                        : undefined
                    }
                    data-result-status={row.resultStatus}
                  >
                    <span aria-hidden>{NOT_AVAILABLE_MARK}</span>
                    <span className="sr-only">
                      {row.resultStatus === "UNRESOLVED_BY_DEMO"
                        ? t("real.result.unresolved")
                        : t("common.notAvailable")}
                    </span>
                  </span>
                )}
                {row.scorePlayer !== null && row.scoreOpponent !== null ? (
                  <span className="ml-2 font-mono text-sm tabular-nums" data-score>
                    {row.scorePlayer}–{row.scoreOpponent}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="font-mono">
                <NumberCell value={row.kills} digits={0} />
              </TableCell>
              <TableCell className="font-mono">
                <NumberCell value={row.deaths} digits={0} />
              </TableCell>
              <TableCell className="font-mono">
                <NumberCell value={row.adr} digits={1} />
                {row.adr !== null && row.adrPartial ? <AdrPartialMark /> : null}
              </TableCell>
              <TableCell className="font-mono">
                <NumberCell value={row.kast} digits={1} />
              </TableCell>
              <TableCell className="font-mono">
                <NumberCell value={row.rating} digits={2} />
              </TableCell>
              <TableCell>
                <AdmissionBadge row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <MatchTableNotes rows={rows} />
    </div>
  );
}

/** Footnotes that explain why a date or a result is what it is (shown only when they apply). */
function MatchTableNotes({ rows }: { rows: OverviewMatch[] }) {
  const t = useT();
  const processed = rows.some((r) => r.dateSource === "processed");
  const unresolved = rows.some((r) => r.resultStatus === "UNRESOLVED_BY_DEMO");
  const partialAdr = rows.some((r) => r.adr !== null && r.adrPartial);
  if (!processed && !unresolved && !partialAdr) return null;
  return (
    <>
      {processed || unresolved ? (
        <div className="sr-only" data-match-notes>
          {processed ? <p>{t("real.date.processedNote")}</p> : null}
          {unresolved ? <p>{t("real.result.unresolvedNote")}</p> : null}
        </div>
      ) : null}
      {partialAdr ? (
        <div className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p data-adr-partial-note>{t("adr.partial.hint")}</p>
        </div>
      ) : null}
    </>
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

/** Job status → semantic tone (failures critical, blocked attention, in-flight context). */
const JOB_STATUS_TONE: Record<OverviewJob["status"], BadgeTone> = {
  pending: "neutral",
  processing: "context",
  cancel_requested: "context",
  processed: "brand",
  failed: "critical",
  cancelled: "neutral",
  blocked_raw_audit: "attention",
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
  const { intlTag } = useI18n();
  if (!jobs.length) return null;
  return (
    <ul className="divide-y divide-border">
      {jobs.map((job) => {
        const identity = IDENTITY_KEY[job.identity];
        return (
          <li key={job.jobId} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{job.fileName ?? job.uploadId}</p>
              <p className="font-mono text-xs text-muted-foreground">
                <time dateTime={job.queuedAt}>{formatDateTime(job.queuedAt, intlTag)}</time>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge
                tone={JOB_STATUS_TONE[job.status]}
                icon={
                  job.status === "failed" || job.status === "blocked_raw_audit"
                    ? "alert"
                    : undefined
                }
                className="font-mono uppercase tracking-wider"
                data-job-status={job.status}
              >
                {t(JOB_STATUS_KEY[job.status])}
              </ToneBadge>
              {identity ? (
                <ToneBadge
                  tone={job.identity === "CONFLICT" ? "attention" : "neutral"}
                  className="font-mono uppercase tracking-wider"
                  data-job-identity={job.identity}
                >
                  {t(identity)}
                </ToneBadge>
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
