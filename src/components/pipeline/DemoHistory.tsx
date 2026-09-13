import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileQuestion, Map, Trophy } from "lucide-react";

import { DemoProcessingStatus } from "@/components/pipeline/DemoProcessingStatus";
import { HistorySkeleton } from "@/components/common/AppLoaders";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useI18n, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { listMyDemoJobs, type DemoJobView } from "@/lib/pipeline.functions";
import { cn } from "@/lib/utils";

function statusKey(job: DemoJobView): TranslationKey {
  if (job.status === "failed") return "pipeline.processing.failed.title";
  if (job.status === "cancel_requested") return "pipeline.processing.cancelRequested.title";
  if (job.status === "cancelled") return "pipeline.processing.cancelled.title";
  if (job.status === "processed") return "pipeline.processing.done.title";
  const stage = [
    "queued",
    "validating",
    "parsing",
    "normalizing",
    "metrics",
    "persisting",
    "cleanup",
  ].includes(job.stage)
    ? job.stage
    : "queued";
  return `pipeline.processing.${stage}.title` as TranslationKey;
}

function DemoHistoryItem({ job }: { job: DemoJobView }) {
  const t = useT();
  const { intlTag } = useI18n();
  const unavailable = t("pipeline.history.unavailable");
  const score =
    job.scorePlayer !== null && job.scoreOpponent !== null
      ? `${job.scorePlayer} : ${job.scoreOpponent}`
      : unavailable;

  return (
    <li className="min-w-0 border-b border-border py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-foreground">
            {job.fileName || unavailable}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden />
            {new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(
              new Date(job.queuedAt),
            )}
          </p>
        </div>
        <span
          className={cn(
            "font-mono text-[11px] uppercase tracking-wider",
            job.status === "processed" && "text-success",
            job.status === "failed" && "text-destructive",
            job.status === "cancel_requested" && "text-warning",
            job.status === "cancelled" && "text-muted-foreground",
            (job.status === "pending" || job.status === "processing") && "text-primary",
          )}
        >
          {t(statusKey(job))}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <Map className="mt-0.5 size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-muted-foreground">{t("pipeline.history.map")}</dt>
            <dd className="text-foreground">{job.map ?? unavailable}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Trophy className="mt-0.5 size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-muted-foreground">{t("pipeline.history.result")}</dt>
            <dd className="text-foreground">
              {job.result
                ? `${t(`pipeline.history.result.${job.result as "win" | "loss" | "draw"}`)} · ${score}`
                : unavailable}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <FileQuestion className="mt-0.5 size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-muted-foreground">{t("pipeline.history.rounds")}</dt>
            <dd className="text-foreground">
              {job.roundsValid !== null ? String(job.roundsValid) : unavailable}
            </dd>
          </div>
        </div>
      </dl>
      {job.status === "pending" ||
      job.status === "processing" ||
      job.status === "cancel_requested" ||
      job.status === "cancelled" ? (
        <DemoProcessingStatus job={job} />
      ) : null}
    </li>
  );
}

export function DemoHistory() {
  const t = useT();
  const jobs = useQuery({
    queryKey: ["pipeline", "jobs"],
    queryFn: () => listMyDemoJobs(),
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (job) =>
          job.status === "pending" ||
          job.status === "processing" ||
          job.status === "cancel_requested",
      )
        ? 4000
        : false,
  });

  if (jobs.isLoading) return <HistorySkeleton />;
  if (jobs.isError)
    return <p className="text-sm text-destructive">{t("common.errorDescription")}</p>;
  if (!jobs.data?.length)
    return (
      <EmptyState
        title={t("pipeline.history.emptyTitle")}
        description={t("pipeline.history.emptyBody")}
        action={
          <Button asChild>
            <Link to="/upload">{t("analyze.selectFile")}</Link>
          </Button>
        }
      />
    );

  return (
    <ul>
      {jobs.data.map((job) => (
        <DemoHistoryItem key={job.jobId} job={job} />
      ))}
    </ul>
  );
}
