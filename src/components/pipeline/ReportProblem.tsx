/**
 * PR4 — "Reportar problema" (modal and card). Inline, never a second stacked dialog.
 *
 * The browser sends only the job id, its locale, the page path and an optional note; the
 * server builds the report from the job row and sends it from the backend (never a mail link), no
 * credential in the frontend. The UI says "sent" ONLY when the server reports that the email
 * provider accepted the message; otherwise it says the report was recorded and can be sent
 * again.
 */
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { reportDemoProblem } from "@/lib/pipeline.functions";
import { emitDemoFlowEvent } from "@/lib/pipeline/flowEvents";
import { reportErrorKey, reportViewFor, type ReportView } from "@/lib/support/reportView";
import { MAX_REPORT_DETAILS } from "@/lib/support/problemReport";
import { cn } from "@/lib/utils";

export function ReportProblem({ jobId, className }: { jobId: string; className?: string }) {
  const { t, locale } = useI18n();
  const [view, setView] = useState<ReportView>({ kind: "idle" });
  const [details, setDetails] = useState("");
  const fieldId = useId();

  const send = useMutation({
    mutationFn: () =>
      reportDemoProblem({
        data: {
          jobId,
          locale,
          ...(details.trim() ? { details: details.slice(0, MAX_REPORT_DETAILS) } : {}),
          ...(typeof window !== "undefined" ? { page: window.location.pathname } : {}),
        },
      }),
    onSuccess: (result) => {
      emitDemoFlowEvent("report_created", { jobId, protocol: result.protocol });
      emitDemoFlowEvent(result.email === "sent" ? "report_email_sent" : "report_email_failed", {
        jobId,
        protocol: result.protocol,
      });
      setView(reportViewFor(result));
    },
    onError: (error) => setView({ kind: "error", key: reportErrorKey(error) }),
  });

  if (view.kind === "idle") {
    return (
      <Button
        size="sm"
        variant="ghost"
        className={className}
        onClick={() => setView({ kind: "form" })}
        data-report-job={jobId}
      >
        <Flag className="mr-1.5 size-3.5" aria-hidden />
        {t("guidance.action.report")}
      </Button>
    );
  }

  if (view.kind === "sent" || view.kind === "recorded") {
    const sent = view.kind === "sent";
    return (
      <div
        role="status"
        className={cn(
          "w-full rounded-md border px-3 py-2.5 text-xs leading-relaxed",
          sent
            ? "border-success/35 bg-success/8 text-success"
            : "border-warning/35 bg-warning/8 text-warning",
          className,
        )}
      >
        <p className="flex items-start gap-2 font-semibold">
          {sent ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
          {t(sent ? "report.sent" : "report.recorded")}
        </p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {t("report.protocol")}: {view.protocol}
        </p>
        {!sent ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => send.mutate()}
            disabled={send.isPending}
          >
            {send.isPending ? (
              <Loader2
                className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : null}
            {t("report.sendAgain")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("w-full space-y-2", className)}>
      <label htmlFor={fieldId} className="block text-xs font-medium text-foreground">
        {t("report.detailsLabel")}
      </label>
      <Textarea
        id={fieldId}
        value={details}
        maxLength={MAX_REPORT_DETAILS}
        rows={3}
        onChange={(event) => setDetails(event.target.value.slice(0, MAX_REPORT_DETAILS))}
        placeholder={t("report.detailsPlaceholder")}
        className="text-sm"
      />
      <p className="text-[11px] text-muted-foreground">
        {t("report.privacy")} · {details.length}/{MAX_REPORT_DETAILS}
      </p>
      {view.kind === "error" ? (
        <p role="alert" className="text-xs text-destructive">
          {t(view.key)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => send.mutate()} disabled={send.isPending}>
          {send.isPending ? (
            <Loader2
              className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Flag className="mr-1.5 size-3.5" aria-hidden />
          )}
          {send.isPending ? t("report.sending") : t("report.send")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setView({ kind: "idle" })}
          disabled={send.isPending}
        >
          {t("report.cancel")}
        </Button>
      </div>
    </div>
  );
}
