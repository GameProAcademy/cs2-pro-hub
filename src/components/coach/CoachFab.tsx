import { Link } from "@tanstack/react-router";
import { Bot, Maximize2, X } from "lucide-react";
import { useState } from "react";

import { CoachChat } from "@/components/coach/CoachChat";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/config/app";
import { useT } from "@/i18n";

/**
 * Desktop-only floating access to the AI Coach. Opens a side drawer so the
 * page context is never lost; the full page stays available at /coach.
 * Hidden on mobile — the Coach is reachable there via the bottom navigation.
 */
export function CoachFab() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          aria-label={t("coach.fabAria")}
          className="fixed bottom-6 right-6 z-40 hidden items-center gap-2.5 rounded-full border border-primary/30 bg-elevated px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-foreground shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5 hover:border-primary/60 lg:flex"
        >
          <Bot className="size-4 text-primary" aria-hidden />
          {t("coach.fab")}
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 hidden lg:block">
          <button
            aria-label={t("coach.close")}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-[26rem] flex-col border-l border-border bg-card shadow-[var(--shadow-card)]">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Bot className="size-4 text-primary" aria-hidden />
              <p className="flex-1 font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                {t("coach.drawerTitle")}
              </p>
              <Button asChild variant="ghost" size="icon" aria-label={t("coach.openFullPage")}>
                <Link to="/coach" onClick={() => setOpen(false)}>
                  <Maximize2 className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("coach.close")}
                onClick={() => setOpen(false)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </header>

            {!FEATURES.aiCoachApi ? (
              <p className="border-b border-warning/20 bg-warning/8 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-warning">{t("coach.notConnectedTitle")}</span>{" "}
                {t("coach.notConnectedBody")}
              </p>
            ) : null}

            <CoachChat className="flex-1" />
          </aside>
        </div>
      ) : null}
    </>
  );
}
