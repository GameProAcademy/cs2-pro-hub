import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Upload, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CoachFab } from "@/components/coach/CoachFab";
import { LanguageSelector } from "@/components/common/LanguageSelector";
import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { DEMO_DATA } from "@/config/app";
import { navItems, uploadNavItem } from "@/config/navigation";
import { demoProfile } from "@/data/demoPlayer";
import { useT } from "@/i18n";
import { signOutEverywhere } from "@/lib/auth";
import { cn } from "@/lib/utils";

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const t = useT();
  return (
    <nav className="space-y-1" aria-label={t("nav.mainLabel")}>
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          activeProps={{
            className:
              "border-primary/40 bg-sidebar-accent text-sidebar-accent-foreground [&_svg]:text-primary",
          }}
          className="flex items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <item.icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{t(item.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand className="px-1 py-2" />
      <Button asChild variant="default" className="w-full justify-start gap-2">
        <Link to={uploadNavItem.to} onClick={onNavigate}>
          <Upload className="size-4" aria-hidden />
          {t(uploadNavItem.labelKey)}
        </Link>
      </Button>
      <div className="flex-1 overflow-y-auto">
        <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
          {t("nav.section.analysis")}
        </p>
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 p-3">
        <p className="truncate text-sm font-medium text-foreground">{demoProfile.name}</p>
        <p className="truncate text-xs text-muted-foreground">{demoProfile.level}</p>
        {DEMO_DATA ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-warning">
            {t("nav.demoSession")}
          </p>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start gap-2 px-2"
          onClick={async () => {
            onNavigate?.();
            await queryClient.cancelQueries();
            queryClient.clear();
            await signOutEverywhere();
            navigate({ to: "/login", replace: true });
          }}
        >
          <LogOut className="size-3.5" aria-hidden />
          {t("nav.logout")}
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentItem = [...navItems, uploadNavItem].find((i) => i.to === pathname);
  const current = currentItem ? t(currentItem.labelKey) : "CS2 PRO";

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={t("nav.closeMenu")}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar">
            <button
              aria-label={t("nav.closeMenu")}
              className="absolute right-3 top-4 rounded-md p-2 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-4" aria-hidden />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <button
            className="rounded-md p-2 text-muted-foreground hover:text-foreground lg:hidden"
            aria-label={t("nav.openMenu")}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
              {current}
            </p>
          </div>
          {DEMO_DATA ? (
            <span className="hidden rounded-sm border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-warning sm:inline">
              {t("nav.demoMode")}
            </span>
          ) : null}
          <LanguageSelector compact className="hidden sm:flex" />
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link to="/upload">
              <Upload className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t("nav.analyze")}</span>
            </Link>
          </Button>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation — the Coach stays reachable here. */}
      <nav
        aria-label={t("nav.quickLabel")}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
      >
        {[...navItems.filter((i) => i.primary), uploadNavItem].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeProps={{ className: "text-primary" }}
            className={cn(
              "flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium text-muted-foreground transition-colors",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            <span className="truncate">{t(item.labelKey).split(" ").at(-1)}</span>
          </Link>
        ))}
      </nav>

      {/* Desktop-only floating Coach access */}
      <CoachFab />
    </div>
  );
}
