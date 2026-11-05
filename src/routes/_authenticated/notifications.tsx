import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import {
  NotificationCenter,
  NotificationPreferences,
} from "@/components/notifications/NotificationComponents";
import { useT } from "@/i18n";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notificações — CS2 PRO AI COACH" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const t = useT();
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader title={t("notify.title")} description={t("notify.description")} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <NotificationCenter />
          <NotificationPreferences />
        </div>
      </div>
    </AppShell>
  );
}
