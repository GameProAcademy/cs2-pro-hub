import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Shield, Upload, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CoachFab } from "@/components/coach/CoachFab";
import { RouteTransitionBar } from "@/components/common/AppLoaders";
import { LanguageSelector } from "@/components/common/LanguageSelector";
import { Brand } from "@/components/layout/Brand";
import { PendingActionsBadge } from "@/components/pipeline/PendingActionsBanner";
import { UserAvatar } from "@/components/common/UserAvatar";
import { Button } from "@/components/ui/button";
import { DEMO_DATA } from "@/config/app";
import { NotificationBell } from "@/components/notifications/NotificationComponents";
import { areaOf, navAreas, navItems, uploadNavItem } from "@/config/navigation";
import { useT } from "@/i18n";
import { useAdminSession } from "@/hooks/useAdminSession";
import { useAccount } from "@/hooks/useAccount";
import { signOutEverywhere } from "@/lib/auth";
import { fill } from "@/lib/format";
import { cn } from "@/lib/utils";

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const t = useT();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const active = areaOf(pathname);
  return (
    <nav className="space-y-1" aria-label={t("nav.mainLabel")}>
      {navAreas.map((area) => {
        const isActive = active?.id === area.id;
        return (
          <div key={area.id} data-nav-area={area.id}>
            <Link
              to={area.to}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive &&
                  "relative border-primary/30 bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_0_var(--primary)] [&_svg]:text-primary",
              )}
            >
              <area.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t(area.labelKey)}</span>
            </Link>
            {isActive && area.sections ? (
              <ul className="mb-1 ml-7 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                {area.sections.map((sec) => (
                  <li key={sec.to}>
                    <Link
                      to={sec.to}
                      onClick={onNavigate}
                      activeOptions={{ exact: false }}
                      activeProps={{ className: "text-foreground", "aria-current": "page" }}
                      className="flex min-h-9 items-center rounded px-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {t(sec.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * The sections of the current area as a bar on top of the page (mobile: the second tap; the
 * sidebar lists them on desktop). Absent for one-page areas and account pages.
 */
function AreaSections() {
  const t = useT();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const area = areaOf(pathname);
  if (!area?.sections) return null;
  return (
    <nav
      aria-label={fill(t("nav.areaSections"), { area: t(area.labelKey) })}
      className="-mx-3 mb-4 overflow-x-auto px-3 sm:-mx-6 sm:px-6 lg:hidden"
      data-area-sections={area.id}
    >
      <ul className="flex min-w-max gap-1">
        {area.sections.map((sec) => (
          <li key={sec.to}>
            <Link
              to={sec.to}
              activeOptions={{ exact: false }}
              activeProps={{
                className: "border-primary/50 bg-primary/10 text-foreground",
                "aria-current": "page",
              }}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground"
            >
              {t(sec.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: adminSession } = useAdminSession();
  const { data: account } = useAccount();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand className="px-1 py-2" />
      <Button asChild variant="default" className="w-full justify-start gap-2">
        <Link to={uploadNavItem.to} onClick={onNavigate}>
          <Upload className="size-4" aria-hidden />
          {t(uploadNavItem.labelKey)}
          <PendingActionsBadge className="ml-auto" />
        </Link>
      </Button>
      <div className="flex-1 overflow-y-auto">
        <p className="mb-2 px-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
          {t("nav.section.analysis")}
        </p>
        <NavLinks onNavigate={onNavigate} />
      </div>
      {adminSession ? (
        <Button asChild variant="outline" className="w-full justify-start gap-2">
          <Link to="/admin" onClick={onNavigate}>
            <Shield className="size-4" aria-hidden />
            {t("admin.area")}
          </Link>
        </Button>
      ) : null}
      <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 p-3">
        <Link
          to="/profile"
          onClick={onNavigate}
          aria-label={t("nav.openProfile")}
          className="flex items-center gap-3 rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserAvatar
            source={account?.avatar_url ?? null}
            name={account?.display_name ?? account?.nickname ?? null}
            size={36}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {account?.display_name || account?.nickname || account?.email || "—"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{account?.email ?? "—"}</p>
          </div>
        </Link>
        {DEMO_DATA ? (
          <p className="mt-2 font-mono text-xs uppercase tracking-wider text-warning">
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
  const navigating = useRouterState({ select: (s) => s.status === "pending" });
  const currentItem = [...navItems, uploadNavItem].find((i) => i.to === pathname);
  const currentArea = areaOf(pathname);
  const current = currentItem
    ? t(currentItem.labelKey)
    : currentArea
      ? t(currentArea.labelKey)
      : "CS2 PRO";

  return (
    <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className="min-h-screen min-w-0 overflow-x-clip bg-background bg-[radial-gradient(1200px_600px_at_80%_-10%,color-mix(in_oklch,var(--primary)_6%,transparent),transparent)]">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
          <SidebarContent />
        </aside>

        {/* Mobile drawer — Radix Dialog: Esc closes, focus is trapped while open and returns to
          the menu button on close (UX-1 M-4 / R-20). */}
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            data-mobile-menu
            className="fixed inset-y-0 left-0 z-50 w-[min(18rem,calc(100vw-2rem))] border-r border-sidebar-border bg-sidebar focus:outline-none lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">{t("nav.mainLabel")}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("nav.closeMenu")}
                className="absolute right-2 top-2.5 size-11 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </DialogPrimitive.Close>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>

        <div className="lg:pl-64">
          {/* Header */}
          <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:gap-3 sm:px-6">
            <RouteTransitionBar active={navigating} />
            <DialogPrimitive.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground hover:text-foreground lg:hidden"
                aria-label={t("nav.openMenu")}
                aria-expanded={mobileOpen}
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </DialogPrimitive.Trigger>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
                {current}
              </p>
            </div>
            {DEMO_DATA ? (
              <span className="hidden rounded-sm border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-xs uppercase tracking-wider text-warning sm:inline">
                {t("nav.demoMode")}
              </span>
            ) : null}
            {DEMO_DATA ? null : <NotificationBell />}
            <LanguageSelector compact />
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link to="/upload">
                <Upload className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t("nav.analyze")}</span>
                <PendingActionsBadge />
              </Link>
            </Button>
          </header>

          <main className="mx-auto w-full min-w-0 max-w-[1400px] px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-6 lg:pb-12">
            {children}
          </main>
        </div>

        {/* Mobile bottom navigation — four primary destinations; Coach remains available via CoachFab. */}
        <nav
          aria-label={t("nav.quickLabel")}
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
          data-mobile-bottom-nav
        >
          {navAreas.filter((area) => area.id !== "coach").map((area) => {
            const isActive = areaOf(pathname)?.id === area.id;
            return (
              <Link
                key={area.id}
                to={area.to}
                aria-current={isActive ? "page" : undefined}
                data-bottom-area={area.id}
                className={cn(
                  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-0.5 py-2 text-center text-xs font-medium leading-tight text-muted-foreground transition-colors",
                  isActive && "text-primary",
                )}
              >
                <area.icon className="size-5" aria-hidden />
                <span className="break-words">{t(area.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Floating Coach access at every width (UX-1 R-12 / M-10). */}
        <CoachFab />
      </div>
    </DialogPrimitive.Root>
  );
}
