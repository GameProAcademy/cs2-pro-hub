import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, Square, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { UploadBox } from "@/components/common/UploadBox";
import { HistorySkeleton } from "@/components/common/AppLoaders";
import { EmptyState } from "@/components/common/States";
import { DemoProcessingStatus } from "@/components/pipeline/DemoProcessingStatus";
import { DemoPlayerIdentity } from "@/components/pipeline/DemoPlayerIdentity";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  cancelMyDemoJob,
  getPipelineStatus,
  listMyDemoJobs,
  retryMyDemoJob,
  type DemoJobView,
} from "@/lib/pipeline.functions";
import { DemoUploadError, submitDemo } from "@/lib/pipeline/client";
import {
  PIPELINE_ERROR_CODES,
  isPermanentError,
  type PipelineErrorCode,
} from "@/lib/pipeline/errors";
import { cn } from "@/lib/utils";

/** True only for failures where re-running the same bytes cannot help. */
function isPermanentCode(code: string | null): boolean {
  if (!code) return false;
  const candidate = code as PipelineErrorCode;
  return PIPELINE_ERROR_CODES.includes(candidate) && isPermanentError(candidate);
}

const STATUS_KEY: Record<DemoJobView["status"], TranslationKey> = {
  pending: "pipeline.status.pending",
  processing: "pipeline.status.processing",
  processed: "pipeline.status.processed",
  failed: "pipeline.status.failed",
  cancel_requested: "pipeline.status.cancelRequested",
  cancelled: "pipeline.status.cancelled",
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
    "pipeline.error.PARSER_CONFIG_ERROR",
    "pipeline.error.PARSER_UNAUTHORIZED",
    "pipeline.error.PARSER_FORBIDDEN",
    "pipeline.error.PARSER_CONTRACT_MISMATCH",
    "pipeline.error.PARSER_INVALID_RESPONSE",
    "pipeline.error.PARSER_DOWNLOAD_ERROR",
    "pipeline.error.PARSER_HASH_MISMATCH",
    "pipeline.error.PARSER_FILE_SIZE_MISMATCH",
    "pipeline.error.PARSER_IDENTITY_MISMATCH",
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
    "pipeline.error.DEMO_INSUFFICIENT_SAMPLE",
    "pipeline.error.JOB_DEADLINE_EXCEEDED",
    "pipeline.error.PARSER_PAYLOAD_TOO_LARGE",
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
  const [uploadPercent, setUploadPercent] = useState(0);
  const uploadRef = useRef<HTMLDivElement | null>(null);

  const focusUpload = () => {
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    uploadRef.current?.querySelector<HTMLElement>("input,button")?.focus();
  };

  const pipeline = useQuery({
    queryKey: ["pipeline", "status"],
    queryFn: () => getPipelineStatus(),
  });

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

  const upload = useMutation({
    mutationFn: (file: File) =>
      submitDemo(file, {
        onProgress: ({ state, percent }) => {
          if (state === "uploading" || state === "completed") setUploadPercent(percent);
        },
      }),
    onMutate: () => {
      setLocalError(null);
      setUploadPercent(0);
    },
    onError: (error) =>
      setLocalError(error instanceof DemoUploadError ? error.code : "PROCESSING_ERROR"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline", "jobs"] }),
  });

  const retry = useMutation({
    mutationFn: (jobId: string) => retryMyDemoJob({ data: { jobId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline", "jobs"] }),
  });

  const cancel = useMutation({
    mutationFn: (jobId: string) => cancelMyDemoJob({ data: { jobId } }),
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

      <div ref={uploadRef}>
        <UploadBox kind="demo" onFileSelected={(file) => upload.mutate(file)} />
      </div>

      {upload.isPending ? (
        <div
          className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-4"
          aria-live="polite"
        >
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            {t("pipeline.uploading")} {uploadPercent > 0 ? `${uploadPercent}%` : ""}
          </p>
          <progress
            className="h-1.5 w-full overflow-hidden rounded-full accent-primary"
            value={uploadPercent}
            max={100}
          />
        </div>
      ) : null}

      {upload.isSuccess ? (
        <div
          className="rounded-lg border border-success/30 bg-success/8 px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-success">{t("pipeline.upload.successTitle")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("pipeline.upload.successBody")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("pipeline.processing.continueBrowsing")}
          </p>
        </div>
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
          <HistorySkeleton />
        ) : (jobs.data ?? []).length === 0 ? (
          <EmptyState
            title={t("pipeline.history.emptyTitle")}
            description={t("pipeline.history.emptyBody")}
            action={<Button onClick={focusUpload}>{t("analyze.selectFile")}</Button>}
          />
        ) : (
          <ul className="space-y-3">
            {(jobs.data ?? []).map((job) => (
              <li
                key={job.jobId}
                className="min-w-0 rounded-lg border border-border bg-card/40 p-4 sm:p-5"
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-foreground">
                      {job.fileName || job.uploadId}
                    </p>
                    <p className="mt-1 break-words font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {job.roundsValid != null
                        ? ` · ${job.roundsValid} ${t("pipeline.rounds")}`
                        : ""}
                      {job.extractionConfidence != null
                        ? ` · ${Math.round(job.extractionConfidence * 100)}% ${t("pipeline.confidence")}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "w-fit shrink-0 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
                      job.status === "processed" && "border-success/30 bg-success/8 text-success",
                      job.status === "failed" &&
                        "border-destructive/30 bg-destructive/8 text-destructive",
                      (job.status === "pending" || job.status === "processing") &&
                        "border-primary/30 bg-primary/8 text-primary",
                      job.status === "cancel_requested" &&
                        "border-warning/30 bg-warning/8 text-warning",
                      job.status === "cancelled" &&
                        "border-border bg-secondary text-muted-foreground",
                    )}
                  >
                    {t(STATUS_KEY[job.status])}
                  </span>
                </div>

                <div className="min-w-0">
                  {job.status === "failed" && job.errorCode === "CORRUPTED_DEMO" ? (
                    <div className="mt-2 rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2.5">
                      <p className="text-sm font-semibold text-destructive">
                        {t("pipeline.corrupted.title")}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t("pipeline.corrupted.body")}
                      </p>
                      <Button size="sm" variant="outline" className="mt-2.5" onClick={focusUpload}>
                        <Upload className="mr-1.5 size-3.5" aria-hidden />
                        {t("pipeline.corrupted.cta")}
                      </Button>
                    </div>
                  ) : job.status === "failed" ? (
                    <p className="mt-1 text-xs text-destructive">{t(errorKey(job.errorCode))}</p>
                  ) : null}
                  {job.partialParse && job.status !== "failed" ? (
                    <p className="mt-1 text-xs text-warning">{t("pipeline.partial")}</p>
                  ) : null}
                  {job.status === "processed" && job.attachmentState !== "attached" ? (
                    <>
                      <p className="mt-1 text-xs text-warning">{t("pipeline.unattached")}</p>
                      <DemoPlayerIdentity jobId={job.jobId} />
                    </>
                  ) : null}
                  <DemoProcessingStatus job={job} />
                </div>

                {job.status === "failed" &&
                !isPermanentCode(job.errorCode) &&
                job.retryCount < job.maxRetries ? (
                  <div className="mt-4 border-t border-border/70 pt-4">
                    <Button
                      className="min-h-11 w-full sm:w-auto"
                      variant="outline"
                      onClick={() => retry.mutate(job.jobId)}
                      disabled={retry.isPending}
                    >
                      <RefreshCw
                        className={cn(
                          "mr-1.5 size-3.5",
                          retry.isPending && "animate-spin motion-reduce:animate-none",
                        )}
                        aria-hidden
                      />
                      {retry.isPending ? t("pipeline.retrying") : t("pipeline.retry")}
                    </Button>
                  </div>
                ) : null}

                {job.status === "pending" || job.status === "processing" ? (
                  <div className="mt-4 border-t border-border/70 pt-4">
                    <Button
                      className="min-h-11 w-full sm:w-auto"
                      variant="outline"
                      onClick={() => cancel.mutate(job.jobId)}
                      disabled={cancel.isPending}
                    >
                      {cancel.isPending ? (
                        <Loader2
                          className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                      ) : (
                        <Square className="mr-1.5 size-3.5" aria-hidden />
                      )}
                      {cancel.isPending ? t("pipeline.cancelling") : t("pipeline.cancel")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
