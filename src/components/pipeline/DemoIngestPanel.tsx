import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { UploadBox } from "@/components/common/UploadBox";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  getPipelineStatus,
  listMyDemoJobs,
  retryMyDemoJob,
  type DemoJobView,
} from "@/lib/pipeline.functions";
import { DemoUploadError, submitDemo } from "@/lib/pipeline/client";
import { cn } from "@/lib/utils";

const STATUS_KEY: Record<DemoJobView["status"], TranslationKey> = {
  pending: "pipeline.status.pending",
  processing: "pipeline.status.processing",
  processed: "pipeline.status.processed",
  failed: "pipeline.status.failed",
};

function errorKey(code: string | null): TranslationKey {
  const known: TranslationKey[] = [
    "pipeline.error.DEMO_TOO_LARGE",
    "pipeline.error.DEMO_TOO_SMALL",
    "pipeline.error.DEMO_EMPTY",
    "pipeline.error.INVALID_DEMO_FORMAT",
    "pipeline.error.CORRUPTED_DEMO",
    "pipeline.error.UNSUPPORTED_DEMO",
    "pipeline.error.DEMO_NOT_FOUND",
    "pipeline.error.PARSER_UNAVAILABLE",
    "pipeline.error.PARSER_ERROR",
    "pipeline.error.PARSER_TIMEOUT",
    "pipeline.error.VALIDATION_ERROR",
    "pipeline.error.PLAYER_IDENTITY_UNRESOLVED",
    "pipeline.error.IDENTITY_RESOLUTION_ERROR",
    "pipeline.error.CANONICAL_RESOLUTION_CONFLICT",
    "pipeline.error.CANONICAL_PERSISTENCE_ERROR",
    "pipeline.error.METRICS_ERROR",
    "pipeline.error.FEATURES_ERROR",
    "pipeline.error.JOB_TIMEOUT",
    "pipeline.error.JOB_STALE",
    "pipeline.error.RESOURCE_LIMIT",
    "pipeline.error.STORAGE_ERROR",
    "pipeline.error.PROCESSING_ERROR",
  ];
  const candidate = `pipeline.error.${code ?? "PROCESSING_ERROR"}` as TranslationKey;
  return known.includes(candidate) ? candidate : "pipeline.error.PROCESSING_ERROR";
}

/**
 * Real demo ingestion surface: upload -> queued job -> server-side processing.
 * When the parser worker is not configured the panel says so plainly instead of
 * pretending a demo was analysed.
 */
export function DemoIngestPanel() {
  const t = useT();
  const queryClient = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);

  const pipeline = useQuery({
    queryKey: ["pipeline", "status"],
    queryFn: () => getPipelineStatus(),
  });

  const jobs = useQuery({
    queryKey: ["pipeline", "jobs"],
    queryFn: () => listMyDemoJobs(),
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (job) => job.status === "pending" || job.status === "processing",
      )
        ? 4000
        : false,
  });

  const upload = useMutation({
    mutationFn: (file: File) => submitDemo(file),
    onMutate: () => setLocalError(null),
    onError: (error) =>
      setLocalError(error instanceof DemoUploadError ? error.code : "PROCESSING_ERROR"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline", "jobs"] }),
  });

  const retry = useMutation({
    mutationFn: (jobId: string) => retryMyDemoJob({ data: { jobId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline", "jobs"] }),
  });

  const parserAvailable = pipeline.data?.parserAvailable ?? false;

  return (
    <div className="space-y-5">
      {pipeline.isSuccess && !parserAvailable ? (
        <p className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            <span className="font-medium text-warning">{t("pipeline.workerOfflineTitle")}</span>{" "}
            {t("pipeline.workerOfflineBody")}
          </span>
        </p>
      ) : null}

      <UploadBox kind="demo" onFileSelected={(file) => upload.mutate(file)} />

      {upload.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("pipeline.uploading")}
        </p>
      ) : null}

      {localError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm"
        >
          {t(errorKey(localError))}
        </p>
      ) : null}

      <div className="space-y-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
          {t("pipeline.historyTitle")}
        </h3>

        {jobs.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (jobs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pipeline.historyEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {(jobs.data ?? []).map((job) => (
              <li
                key={job.jobId}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {job.fileName || job.uploadId}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t(STATUS_KEY[job.status])} · {job.stage}
                    {job.roundsValid != null ? ` · ${job.roundsValid} ${t("pipeline.rounds")}` : ""}
                    {job.extractionConfidence != null
                      ? ` · ${Math.round(job.extractionConfidence * 100)}% ${t("pipeline.confidence")}`
                      : ""}
                  </p>
                  {job.status === "failed" ? (
                    <p className="mt-1 text-xs text-destructive">{t(errorKey(job.errorCode))}</p>
                  ) : null}
                  {job.partialParse ? (
                    <p className="mt-1 text-xs text-warning">{t("pipeline.partial")}</p>
                  ) : null}
                </div>

                <span
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-wider",
                    job.status === "processed" && "text-success",
                    job.status === "failed" && "text-destructive",
                    (job.status === "pending" || job.status === "processing") && "text-primary",
                  )}
                >
                  {t(STATUS_KEY[job.status])}
                </span>

                {job.status === "failed" && job.retryCount < job.maxRetries ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry.mutate(job.jobId)}
                    disabled={retry.isPending}
                  >
                    <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
                    {t("pipeline.retry")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
