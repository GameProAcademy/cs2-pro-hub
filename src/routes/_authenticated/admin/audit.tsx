import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useI18n, useT } from "@/i18n";
import { listAuditLogs } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — Administração CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Histórico das ações administrativas realizadas na plataforma CS2 PRO AI COACH.",
      },
      { property: "og:title", content: "Audit Log — Administração CS2 PRO AI COACH" },
      { property: "og:description", content: "Rastreabilidade das operações administrativas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminAuditPage,
});

const PAGE_SIZE = 20;

function AdminAuditPage() {
  const t = useT();
  const { intlTag } = useI18n();
  const { adminSession } = Route.useRouteContext();
  const dateFormat = new Intl.DateTimeFormat(intlTag, { dateStyle: "short", timeStyle: "short" });
  const [page, setPage] = useState(1);
  const dash = t("admin.value.none");

  const logs = useQuery({
    queryKey: ["admin", "audit", page],
    queryFn: () => listAuditLogs({ data: { page, pageSize: PAGE_SIZE } }),
  });

  const total = logs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell session={adminSession}>
      <PageHeader
        eyebrow={t("admin.area")}
        title={t("admin.audit.title")}
        description={t("admin.audit.subtitle")}
      />

      {logs.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : logs.isError ? (
        <ErrorState
          title={t("common.errorTitle")}
          description={t("admin.error.generic")}
          onRetry={() => void logs.refetch()}
        />
      ) : (logs.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title={t("common.emptyTitle")} description={t("admin.empty.audit")} />
      ) : (
        <>
          <ul className="space-y-3">
            {logs.data?.rows.map((log) => (
              <li key={log.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                    {log.action}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {dateFormat.format(new Date(log.created_at))}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-mono uppercase tracking-wider text-muted-foreground">
                      {t("admin.audit.admin")}
                    </dt>
                    <dd className="text-foreground">
                      {logs.data?.names[log.admin_user_id] ?? dash}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono uppercase tracking-wider text-muted-foreground">
                      {t("admin.audit.target")}
                    </dt>
                    <dd className="text-foreground">
                      {(log.target_user_id ? logs.data?.names[log.target_user_id] : null) ?? dash}
                    </dd>
                  </div>
                </dl>
                {log.metadata ? (
                  <p className="mt-3 break-words font-mono text-[11px] text-muted-foreground">
                    {t("admin.audit.metadata")}: {JSON.stringify(log.metadata)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {`${t("admin.pagination.page")} ${page} ${t("admin.pagination.of")} ${pages} · ${total}`}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("admin.pagination.prev")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("admin.pagination.next")}
              </Button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
