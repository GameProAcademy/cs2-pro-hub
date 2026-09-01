import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, Upload, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { DEMO_DATA } from "@/config/app";
import { navItems, uploadNavItem } from "@/config/navigation";
import { demoProfile } from "@/data/demoPlayer";
import { cn } from "@/lib/utils";

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <nav className="space-y-1" aria-label="Navegação principal">
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
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand className="px-1 py-2" />
      <Button asChild variant="default" className="w-full justify-start gap-2">
        <Link to={uploadNavItem.to} onClick={onNavigate}>
          <Upload className="size-4" aria-hidden />
          {uploadNavItem.label}
        </Link>
      </Button>
      <div className="flex-1 overflow-y-auto">
        <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
          Análise
        </p>
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 p-3">
        <p className="truncate text-sm font-medium text-foreground">{demoProfile.name}</p>
        <p className="truncate text-xs text-muted-foreground">{demoProfile.level}</p>
        {DEMO_DATA ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-warning">
            Sessão de demonstração
          </p>
        ) : null}
        <Button asChild variant="ghost" size="sm" className="mt-2 w-full justify-start gap-2 px-2">
          <Link to="/login" onClick={onNavigate}>
            <LogOut className="size-3.5" aria-hidden />
            Sair
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current =
    [...navItems, uploadNavItem].find((i) => i.to === pathname)?.label ?? "CS2 PRO";

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
            aria-label="Fechar menu"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar">
            <button
              aria-label="Fechar menu"
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
            aria-label="Abrir menu"
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
              Modo demonstração
            </span>
          ) : null}
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link to="/upload">
              <Upload className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Enviar demo</span>
            </Link>
          </Button>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Navegação rápida"
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
            <span className="truncate">{item.label.split(" ").at(-1)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
