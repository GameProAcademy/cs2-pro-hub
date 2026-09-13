import { AlertCircle, Ban, Check, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useRef } from "react";

import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import type { DemoJobView } from "@/lib/pipeline.functions";
import {
  VISIBLE_PROCESSING_STAGES,
  estimatedStageProgress,
  processingStageIndex,
  safeProcessingStage,
  type ProcessingStage,
} from "@/lib/pipeline/processingProgress";
import { cn } from "@/lib/utils";

const STAGE_KEYS: Record<
  ProcessingStage | "failed" | "cancel_requested" | "cancelled",
  { title: TranslationKey; body: TranslationKey }
> = {
  queued: {
    title: "pipeline.processing.queued.title",
    body: "pipeline.processing.queued.body",
  },
  validating: {
    title: "pipeline.processing.validating.title",
    body: "pipeline.processing.validating.body",
  },
  parsing: {
    title: "pipeline.processing.parsing.title",
    body: "pipeline.processing.parsing.body",
  },
  normalizing: {
    title: "pipeline.processing.normalizing.title",
    body: "pipeline.processing.normalizing.body",
  },
  metrics: {
    title: "pipeline.processing.metrics.title",
    body: "pipeline.processing.metrics.body",
  },
  persisting: {
    title: "pipeline.processing.persisting.title",
    body: "pipeline.processing.persisting.body",
  },
  cleanup: {
    title: "pipeline.processing.cleanup.title",
    body: "pipeline.processing.cleanup.body",
  },
  done: {
    title: "pipeline.processing.done.title",
    body: "pipeline.processing.done.body",
  },
  failed: {
    title: "pipeline.processing.failed.title",
    body: "pipeline.processing.failed.body",
  },
  cancel_requested: {
    title: "pipeline.processing.cancelRequested.title",
    body: "pipeline.processing.cancelRequested.body",
  },
  cancelled: {
    title: "pipeline.processing.cancelled.title",
    body: "pipeline.processing.cancelled.body",
  },
};

export function DemoProcessingStatus({ job }: { job: DemoJobView }) {
  const t = useT();
  const failed = job.status === "failed";
  const cancelling = job.status === "cancel_requested";
  const cancelled = job.status === "cancelled";
  const active = job.status === "pending" || job.status === "processing" || cancelling;
  const done = job.status === "processed";
  const stage = safeProcessingStage(job.stage, job.status);
  const lastActiveStage = useRef<ProcessingStage>(stage);
  const progress = estimatedStageProgress({ stage: job.stage, status: job.status });

  if (!failed) lastActiveStage.current = stage;

  const displayedStage = failed
    ? "failed"
    : cancelled
      ? "cancelled"
      : cancelling
        ? "cancel_requested"
        : stage;
  const currentIndex = processingStageIndex(lastActiveStage.current, job.status);

  return (
    <section className="mt-4 min-w-0 border-t border-border/80 pt-4">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t(STAGE_KEYS[displayedStage].title)}
      </p>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
            failed
              ? "border-destructive/35 bg-destructive/10 text-destructive"
              : cancelled || cancelling
                ? "border-warning/35 bg-warning/10 text-warning"
                : "border-primary/35 bg-primary/10 text-primary",
          )}
        >
          {failed ? (
            <AlertCircle className="size-4" aria-hidden />
          ) : cancelled ? (
            <Ban className="size-4" aria-hidden />
          ) : done ? (
            <CheckCircle2 className="size-4" aria-hidden />
          ) : (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
               "break-words font-display text-sm font-semibold uppercase tracking-[0.12em]",
              failed
                ? "text-destructive"
                : cancelled || cancelling
                  ? "text-warning"
                  : "text-foreground",
            )}
          >
            {t(STAGE_KEYS[displayedStage].title)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t(STAGE_KEYS[displayedStage].body)}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{t("pipeline.processing.progress")}</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={t("pipeline.processing.progressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="relative h-2 overflow-hidden rounded-full bg-secondary"
        >
          <div
            className={cn(
              "relative h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none",
              failed
                ? "bg-destructive"
                : cancelled || cancelling
                  ? "bg-warning"
                  : done
                    ? "bg-success"
                    : "bg-primary",
            )}
            style={{ width: `${progress}%` }}
          >
            {active ? (
              <span className="absolute inset-0 animate-pulse bg-foreground/15 motion-reduce:animate-none" />
            ) : null}
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("pipeline.processing.estimated")}
        </p>
      </div>

      <div className="mt-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {t("pipeline.processing.currentStage")}
        </p>
        <ol className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          {VISIBLE_PROCESSING_STAGES.map((item, index) => {
            const complete = !failed && index < currentIndex;
            const current = !done && index === currentIndex;
            return (
              <li
                key={item}
                className={cn(
                  "flex min-w-0 items-center gap-2 text-xs transition-colors",
                  current && !failed ? "font-medium text-primary" : "text-muted-foreground",
                  complete && "text-success",
                )}
              >
                {complete ? (
                  <Check className="size-3.5 shrink-0" aria-hidden />
                ) : current && !failed ? (
                  <span
                    className="relative flex size-3.5 shrink-0 items-center justify-center"
                    aria-hidden
                  >
                    <span className="absolute size-3 animate-ping rounded-full bg-primary/40 motion-reduce:animate-none" />
                    <Circle className="relative size-3 fill-primary text-primary" />
                  </span>
                ) : (
                  <Circle className="size-3.5 shrink-0" aria-hidden />
                )}
                 <span className="min-w-0 break-words">{t(STAGE_KEYS[item].title)}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {job.status === "pending" && stage === "queued" ? (
        <p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
          {t("pipeline.processing.continueBrowsing")}
        </p>
      ) : null}
    </section>
  );
}
