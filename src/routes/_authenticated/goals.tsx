import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { GoalsPanel } from "@/components/notifications/GoalsPanel";
import { useT } from "@/i18n";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({ meta: [{ title: "Objetivos — CS2 PRO AI COACH" }] }),
  component: GoalsPage,
});

function GoalsPage() {
  const t = useT();
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader title={t("goals.title")} description={t("goals.description")} />
        <GoalsPanel />
      </div>
    </AppShell>
  );
}
