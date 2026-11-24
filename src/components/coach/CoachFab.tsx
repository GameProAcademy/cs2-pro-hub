import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, Maximize2, X } from "lucide-react";
import { useState } from "react";

import { CoachChat } from "@/components/coach/CoachChat";
import { RealCoachChat } from "@/components/coach/RealCoachChat";
import { Button } from "@/components/ui/button";
import { DEMO_DATA, FEATURES } from "@/config/app";
import { useT } from "@/i18n";

/**
 * Floating access to the AI Coach at every width (UX-1 R-12 / M-10). A Radix dialog: Esc closes,
 * focus stays inside while open and returns to the button. Below `lg` it opens full width and the
 * button sits above the bottom navigation; the full page stays available at /coach (where the
 * button is hidden). In real mode (DEMO_DATA false) it is the real AI Coach; the demonstration
 * chat with fixed strings is only used by the demo build.
 */
export function CoachFab() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const onCoachPage = useRouterState({ select: (s) => s.location.pathname === "/coach" });
  if (onCoachPage) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t("coach.fabAria")}
          data-coach-fab
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex size-12 items-center justify-center gap-2.5 rounded-full border border-primary/30 bg-elevated text-xs font-semibold uppercase tracking-[0.14em] text-foreground shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5 hover:border-primary/60 lg:bottom-6 lg:right-6 lg:size-auto lg:px-4 lg:py-3"
        >
          <Bot className="size-5 text-primary lg:size-4" aria-hidden />
          <span className="hidden lg:inline">{t("coach.fab")}</span>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-coach-drawer
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-card)] focus:outline-none sm:w-[26rem]"
        >
          <header className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Bot className="size-4 text-primary" aria-hidden />
            <DialogPrimitive.Title className="flex-1 font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
              {t("coach.drawerTitle")}
            </DialogPrimitive.Title>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t("coach.openFullPage")}
            >
              <Link to="/coach" onClick={() => setOpen(false)}>
                <Maximize2 className="size-4" aria-hidden />
              </Link>
            </Button>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label={t("coach.close")}>
                <X className="size-4" aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </header>

          {DEMO_DATA && !FEATURES.aiCoachApi ? (
            <p className="border-b border-warning/20 bg-warning/8 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-warning">{t("coach.notConnectedTitle")}</span>{" "}
              {t("coach.notConnectedBody")}
            </p>
          ) : null}

          {DEMO_DATA ? (
            <CoachChat className="min-h-0 flex-1" />
          ) : (
            <RealCoachChat className="min-h-0 flex-1" />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
