import { Link } from "@tanstack/react-router";
import { ArrowLeft, Cpu, FileLock2, FlaskConical, LayoutDashboard, ScrollText, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { AdminSession } from "@/lib/admin.functions";

const adminNav = [
  { to: "/admin", labelKey: "admin.nav.overview", icon: LayoutDashboard },
  { to: "/admin/users", labelKey: "admin.nav.users", icon: Users },
  { to: "/admin/pipeline", labelKey: "pipeline.admin.title", icon: Cpu },
  { to: "/admin/demo-e2e", labelKey: "admin.nav.demoE2E", icon: FlaskConical },
  { to: "/admin/r5-forensic", labelKey: "admin.nav.r5Forensic", icon: FileLock2 },
  { to: "/admin/audit", labelKey: "admin.nav.audit", icon: ScrollText },
] as const;

export function AdminShell({ session, children }: { session: AdminSession; children: ReactNode }) {
  const t = useT();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Brand />
            <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              {t("admin.area")}
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              {t(session.isMaster ? "admin.role.admin_master" : "admin.role.admin")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <nav
              aria-label={t("admin.area")}
              className="flex flex-1 items-center gap-1 overflow-x-auto"
            >
              {adminNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/admin" }}
                  activeProps={{
                    className:
                      "border-primary/40 bg-secondary text-foreground [&_svg]:text-primary",
                  }}
                  className="flex shrink-0 items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <item.icon className="size-4" aria-hidden />
                  <span>{t(item.labelKey)}</span>
                </Link>
              ))}
            </nav>
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-2">
              <Link to="/dashboard">
                <ArrowLeft className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t("admin.nav.backToApp")}</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
