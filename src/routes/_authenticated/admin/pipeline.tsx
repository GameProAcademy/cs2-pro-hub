import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Trash2 } from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useI18n, useT } from "@/i18n";
import {
  adminCleanupDemos,
  adminRetryDemoJob,
  getAdminPipelineOverview,
} from "@/lib/pipeline-admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline de demos — Administração CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Monitoramento dos jobs de processamento de demos, qualidade da extração e retenção de arquivos.",
      },
      { property: "og:title", content: "Pipeline de demos — Administração CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Observabilidade do processamento de demos do CS2 PRO AI COACH.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPipelinePage,
});

function AdminPipelinePage() {
  const t = useT();
  const { intlTag } = useI18n();
  const queryClient = useQueryClient();
  const { adminSession } = Route.useRouteContext();
  const dateFormat = new Intl.DateTimeFormat(intlTag, { dateStyle: "short", timeStyle: "short" });

  const overview = useQuery({
    queryKey: ["admin", "pipeline"],
    queryFn: () => getAdminPipelineOverview(),
    refetchInterval: 10_000,
  });

  const retry = useMutation({
    mutationFn: (jobId: string) => adminRetryDemoJob({ data: { jobId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "pipeline"] }),
  });

  const cleanup = useMutation({
    mutationFn: () => adminCleanupDemos(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "pipeline"] }),
  });

  return (
    <AdminShell session={adminSession}>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("pipeline.admin.title")}
          title={t("pipeline.admin.title")}
          description={t("pipeline.admin.subtitle")}
        />

        {overview.isLoading ? (
          <LoadingState />
        ) : overview.isError || !overview.data ? (
          <ErrorState />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {t("pipeline.admin.parser")}:{" "}
                <span
                  className={cn(
                    "font-mono text-xs uppercase",
                    overview.data.parserAvailable ? "text-success" : "text-warning",
                  )}
                >
                  {overview.data.parserAvailable
                    ? t("pipeline.admin.available")
                    : t("pipeline.admin.unavailable")}
                </span>
              </p>
              <div className="flex flex-wrap gap-3 font-mono text-xs text-muted-foreground">
                <span>
                  {t("pipeline.status.pending")}: {overview.data.counts.pending}
                </span>
                <span>
                  {t("pipeline.status.processing")}: {overview.data.counts.processing}
                </span>
                <span>
                  {t("pipeline.status.processed")}: {overview.data.counts.processed}
                </span>
                <span>
                  {t("pipeline.status.failed")}: {overview.data.counts.failed}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => cleanup.mutate()}
                disabled={cleanup.isPending}
              >
                <Trash2 className="mr-1.5 size-3.5" aria-hidden />
                {t("pipeline.admin.cleanup")}
              </Button>
            </div>

            {overview.data.jobs.length === 0 ? (
              <EmptyState title={t("pipeline.admin.empty")} />
            ) : (
              <ul className="space-y-2">
                {overview.data.jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {job.fileName || job.uploadId}
                      </p>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        {job.status} · {job.stage} · {dateFormat.format(new Date(job.queuedAt))}
                        {job.durationMs != null ? ` · ${Math.round(job.durationMs / 1000)}s` : ""}
                        {job.parserVersion ? ` · ${job.parserVersion}` : ""}
                        {` · schema v${job.schemaVersion}`}
                        {job.roundsValid != null
                          ? ` · ${job.roundsValid}/${job.roundsDetected ?? "?"} ${t("pipeline.rounds")}`
                          : ""}
                        {job.extractionConfidence != null
                          ? ` · ${Math.round(job.extractionConfidence * 100)}%`
                          : ""}
                        {job.storageDeletedAt ? ` · ${t("pipeline.admin.retention")}` : ""}
                      </p>
                      {job.errorCode ? (
                        <p className="mt-1 font-mono text-xs text-destructive">{job.errorCode}</p>
                      ) : null}
                    </div>
                    <span className="font-mono text-[11px] uppercase text-muted-foreground">
                      {job.retryCount}/{job.maxRetries}
                    </span>
                    {job.status === "failed" && !job.storageDeletedAt ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retry.mutate(job.id)}
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
          </>
        )}
      </div>
    </AdminShell>
  );
}
