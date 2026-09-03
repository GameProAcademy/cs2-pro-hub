import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { useI18n, useT } from "@/i18n";
import { getAdminOverview } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Administração — CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Painel administrativo do CS2 PRO AI COACH: usuários, roles, status e auditoria.",
      },
      { property: "og:title", content: "Administração — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Gestão segura de usuários e permissões da plataforma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminOverviewPage,
});

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function AdminOverviewPage() {
  const t = useT();
  const { intlTag } = useI18n();
  const { adminSession } = Route.useRouteContext();
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => getAdminOverview() });

  const dateFormat = new Intl.DateTimeFormat(intlTag, { dateStyle: "short", timeStyle: "short" });

  return (
    <AdminShell session={adminSession}>
      <PageHeader
        eyebrow={t("admin.area")}
        title={t("admin.overview.title")}
        description={t("admin.overview.subtitle")}
      />

      {overview.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : overview.isError || !overview.data ? (
        <ErrorState
          title={t("common.errorTitle")}
          description={t("admin.error.generic")}
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label={t("admin.metric.totalUsers")} value={overview.data.totalUsers} />
            <StatCard label={t("admin.metric.activePlayers")} value={overview.data.activePlayers} />
            <StatCard label={t("admin.metric.inactiveUsers")} value={overview.data.inactiveUsers} />
            <StatCard label={t("admin.metric.admins")} value={overview.data.admins} />
            <StatCard label={t("admin.metric.newUsers")} value={overview.data.newUsers} />
          </div>

          <section className="rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("admin.overview.lastLogins")}
            </h2>
            {overview.data.lastLogins.length === 0 ? (
              <EmptyState className="m-4" title={t("common.emptyTitle")} />
            ) : (
              <ul className="divide-y divide-border">
                {overview.data.lastLogins.map((user) => (
                  <li
                    key={user.id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {user.display_name || user.nickname || user.email}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {user.last_login_at
                        ? dateFormat.format(new Date(user.last_login_at))
                        : t("admin.value.never")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}
