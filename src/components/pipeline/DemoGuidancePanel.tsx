/**
 * Shared guidance block — the SAME component and the SAME classifier in the upload modal and
 * in the history card, so the two can never give different instructions for one job.
 *
 * Colours follow the visual contract: green = success, amber = attention / action / review,
 * red = definitive failure, blue (primary) = information. A technical review is never red.
 */
import { RefreshCw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  guidanceCopyKeys,
  type DemoGuidance,
  type GuidanceSeverity,
} from "@/lib/pipeline/errorGuidance";
import { cn } from "@/lib/utils";

function severityTone(severity: GuidanceSeverity): {
  box: string;
  text: string;
} {
  switch (severity) {
    case "success":
      return { box: "border-success/35 bg-success/8", text: "text-success" };
    case "info":
      return { box: "border-primary/30 bg-primary/5", text: "text-primary" };
    case "attention":
    case "review":
      return { box: "border-warning/35 bg-warning/8", text: "text-warning" };
    case "error":
      return { box: "border-destructive/35 bg-destructive/8", text: "text-destructive" };
  }
}

export interface DemoGuidancePanelProps {
  guidance: DemoGuidance;
  /** Hide title and "what happened" when the container already shows them (modal header). */
  hideHeader?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  retryBusy?: boolean | undefined;
  onChooseAnother?: (() => void) | undefined;
  /** Extra actions (e.g. report a problem) rendered after the guided ones. */
  children?: React.ReactNode;
  className?: string | undefined;
}

export function DemoGuidancePanel(props: DemoGuidancePanelProps) {
  const t = useT();
  const { guidance } = props;
  const keys = guidanceCopyKeys(guidance.category);
  const tone = severityTone(guidance.severity);
  const ref = guidance.technicalReference;
  const reference = [ref.errorCode, ref.stage].filter(Boolean).join(" · ");
  const showRetry = guidance.retryAllowed && Boolean(props.onRetry);
  const showChooseAnother =
    guidance.recommendedAction === "choose_another_demo" && Boolean(props.onChooseAnother);

  return (
    <div
      className={cn("mt-2 rounded-lg border px-3 py-2.5", tone.box, props.className)}
      data-guidance-category={guidance.category}
      data-guidance-severity={guidance.severity}
      data-retry-allowed={guidance.retryAllowed ? "true" : "false"}
      role={guidance.severity === "error" ? "alert" : "status"}
    >
      {props.hideHeader ? null : (
        <>
          <p className={cn("text-sm font-semibold", tone.text)}>
            {t(keys.title as TranslationKey)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t(keys.body as TranslationKey)}
          </p>
        </>
      )}
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider text-foreground",
          props.hideHeader ? null : "mt-2.5",
        )}
      >
        {t("guidance.whatToDo")}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {t(keys.todo as TranslationKey)}
      </p>
      {reference ? (
        <p className="mt-2 break-all font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
          {t("guidance.reference")}: {reference}
        </p>
      ) : null}
      {showRetry || showChooseAnother || props.children ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {showRetry ? (
            <Button size="sm" variant="outline" onClick={props.onRetry} disabled={props.retryBusy}>
              <RefreshCw
                className={cn(
                  "mr-1.5 size-3.5",
                  props.retryBusy && "animate-spin motion-reduce:animate-none",
                )}
                aria-hidden
              />
              {t("guidance.action.retry")}
            </Button>
          ) : null}
          {showChooseAnother ? (
            <Button size="sm" variant="outline" onClick={props.onChooseAnother}>
              <Upload className="mr-1.5 size-3.5" aria-hidden />
              {t("guidance.action.chooseAnother")}
            </Button>
          ) : null}
          {props.children}
        </div>
      ) : null}
    </div>
  );
}
