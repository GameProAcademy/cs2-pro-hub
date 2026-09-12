import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  ProcessingStage | "failed",
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
};

export function DemoProcessingStatus({ job }: { job: DemoJobView }) {
  const t = useT();
  const failed = job.status === "failed";
  const active = job.status === "pending" || job.status === "processing";
  const stage = safeProcessingStage(job.stage, job.status);
  const lastActiveStage = useRef<ProcessingStage>(stage);
  const [progress, setProgress] = useState(() =>
    estimatedStageProgress({ stage: job.stage, status: job.status }),
  );

  if (!failed) lastActiveStage.current = stage;

  useEffect(() => {
    setProgress((current) =>
      estimatedStageProgress({ stage: job.stage, status: job.status, previousProgress: current }),
    );

    if (!active) return;
    const timer = window.setInterval(() => {
      setProgress((current) =>
        estimatedStageProgress({
          stage: job.stage,
          status: job.status,
          previousProgress: current,
          animationStep: 1,
        }),
      );
    }, 1800);
    return () => window.clearInterval(timer);
  }, [active, job.stage, job.status]);

  const displayedStage = failed ? "failed" : stage;
  const currentIndex = processingStageIndex(lastActiveStage.current, job.status);

  return (
    <section className="mt-4 border-t border-border/80 pt-4" aria-live="polite" aria-atomic="true">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
            failed
              ? "border-destructive/35 bg-destructive/10 text-destructive"
              : "border-primary/35 bg-primary/10 text-primary",
          )}
        >
          {failed ? (
            <AlertCircle className="size-4" aria-hidden />
          ) : (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-display text-sm font-semibold uppercase tracking-[0.12em]",
              failed ? "text-destructive" : "text-foreground",
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
              failed ? "bg-destructive" : "bg-primary",
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
        <ol className="grid gap-2 sm:grid-cols-2">
          {VISIBLE_PROCESSING_STAGES.map((item, index) => {
            const complete = !failed && index < currentIndex;
            const current = index === currentIndex;
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
                  <span className="relative flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
                    <span className="absolute size-3 animate-ping rounded-full bg-primary/40 motion-reduce:animate-none" />
                    <Circle className="relative size-3 fill-primary text-primary" />
                  </span>
                ) : (
                  <Circle className="size-3.5 shrink-0" aria-hidden />
                )}
                <span className="truncate">{t(STAGE_KEYS[item].title)}</span>
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