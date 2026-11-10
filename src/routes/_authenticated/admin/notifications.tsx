import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  AudienceManager,
  CampaignManager,
  NotificationDashboard,
} from "@/components/admin/NotificationAdmin";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, LoadingState } from "@/components/common/States";
import { useT } from "@/i18n";
import { getNotificationAdminContext } from "@/lib/notifications/campaigns.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notificações — Administração CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Central de notificações e campanhas in-app do CS2 PRO AI COACH.",
      },
    ],
  }),
  component: AdminNotificationsPage,
});

const TABS = ["dashboard", "campaigns", "audiences"] as const;
type Tab = (typeof TABS)[number];

function AdminNotificationsPage() {
  const t = useT();
  const { adminSession } = Route.useRouteContext();
  const [tab, setTab] = useState<Tab>("dashboard");
  // Role level from the database (0 none, 1 admin, 2 admin_master): what the UI offers.
  // The RPCs check it again on every call.
  const ctx = useQuery({
    queryKey: ["admin", "notifications", "context"],
    queryFn: () => getNotificationAdminContext(),
  });
  return (
    <AdminShell session={adminSession}>
      <PageHeader
        eyebrow={t("admin.area")}
        title={t("adminNotify.title")}
        description={t("adminNotify.subtitle")}
      />
      {ctx.isPending ? (
        <LoadingState label={t("common.loading")} />
      ) : ctx.isError || !ctx.data.available ? (
        <ErrorState title={t("common.errorTitle")} description={t("adminNotify.unavailable")} />
      ) : ctx.data.level < 1 ? (
        <ErrorState
          title={t("common.errorTitle")}
          description={t("adminNotify.error.NOTIFICATION_ADMIN_FORBIDDEN")}
        />
      ) : (
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label={t("adminNotify.title")}
            className="flex flex-wrap gap-1 border-b border-border"
          >
            {TABS.map((id) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                type="button"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm",
                  tab === id
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`adminNotify.tab.${id}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === "dashboard" ? <NotificationDashboard /> : null}
            {tab === "campaigns" ? <CampaignManager level={ctx.data.level} /> : null}
            {tab === "audiences" ? <AudienceManager /> : null}
          </div>
          <p className="text-xs text-muted-foreground">{t("adminNotify.channels")}</p>
        </div>
      )}
    </AdminShell>
  );
}
