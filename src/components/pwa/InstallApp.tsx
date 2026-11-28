/**
 * VGL 5.1 — Frente 1: installable app UI. A small, non-blocking invite (once per page load,
 * back after 48 h if closed), a discreet "Install app" entry in the menu, and per-platform
 * instructions where the browser has no programmatic prompt. Never a fake "native" button.
 */
import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

import gameproSymbol from "@/assets/gamepro-symbol.png";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT, type TranslationKey } from "@/i18n";
import type { PwaInstallMode } from "@/lib/pwa/install";
import { dismissInvite, promptInstall, startPwa, usePwaInstall } from "@/lib/pwa/usePwaInstall";
import { cn } from "@/lib/utils";

const STEPS: Record<Exclude<PwaInstallMode, "prompt" | "unsupported">, string> = {
  "ios-share": "vgl51.pwa.ios",
  "mac-safari": "vgl51.pwa.macSafari",
  chromium: "vgl51.pwa.chromium",
  "android-menu": "vgl51.pwa.android",
};

/** Opens the native dialog where it exists; otherwise the instructions for this browser. */
function useInstallAction() {
  const pwa = usePwaInstall();
  const [help, setHelp] = useState(false);
  const act = async () => {
    if (pwa.canPrompt) {
      const r = await promptInstall();
      if (r === "unavailable") setHelp(true);
      return;
    }
    setHelp(true);
  };
  return { pwa, act, help, setHelp };
}

export function InstallInstructions({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: PwaInstallMode;
}) {
  const t = useT();
  const steps = mode === "prompt" ? STEPS.chromium : mode === "unsupported" ? null : STEPS[mode];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-pwa-instructions={mode}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src={gameproSymbol} alt="" className="size-6" />
            {t("vgl51.pwa.dialog.title")}
          </DialogTitle>
          <DialogDescription>{t("vgl51.pwa.dialog.intro")}</DialogDescription>
        </DialogHeader>
        {steps ? (
          <ol className="space-y-3">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 font-mono text-xs text-primary">
                  {n}
                </span>
                <span className="leading-relaxed">
                  {n === 1 && mode === "ios-share" ? (
                    <Share
                      className="mr-1 inline size-4 align-text-bottom text-primary"
                      aria-hidden
                    />
                  ) : null}
                  {t(`${steps}.${n}` as TranslationKey)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground" data-pwa-unsupported>
            {t("vgl51.pwa.unsupported")}
          </p>
        )}
        {mode === "ios-share" ? (
          <p className="text-xs text-muted-foreground">{t("vgl51.pwa.ios.note")}</p>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("vgl51.pwa.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Discreet menu entry. Renders nothing once the app is installed or running as the app. */
export function InstallAppButton({ className }: { className?: string }) {
  const t = useT();
  const { pwa, act, help, setHelp } = useInstallAction();
  if (!pwa.ready || pwa.installed || pwa.standalone || !pwa.platform) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => void act()}
        className={cn(
          "flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm text-muted-foreground/80 opacity-80 transition-colors hover:bg-sidebar-accent/50 hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        data-pwa-install-button={pwa.platform.mode}
      >
        <Download className="size-4" aria-hidden />
        {t("vgl51.pwa.button")}
      </button>
      <InstallInstructions open={help} onOpenChange={setHelp} mode={pwa.platform.mode} />
    </>
  );
}

/**
 * Starts the PWA wiring and shows the invite when due. Mounted by the app shell; the decision
 * lives in a module store, so changing route never re-opens a closed or answered invite.
 */
export function InstallInvite() {
  const t = useT();
  const { pwa, act, help, setHelp } = useInstallAction();
  useEffect(() => startPwa(), []);
  if (!pwa.ready || !pwa.inviteOpen || pwa.installed || pwa.standalone || !pwa.platform)
    return (
      <InstallInstructions
        open={help}
        onOpenChange={setHelp}
        mode={pwa.platform?.mode ?? "chromium"}
      />
    );
  const mobile = pwa.platform.device === "mobile";
  return (
    <>
      <aside
        role="region"
        aria-label={t("vgl51.pwa.button")}
        className="vgl-grid fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] z-40 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-elevated)] sm:inset-x-auto sm:bottom-6 sm:right-4 sm:top-auto sm:w-96"
        data-pwa-invite={pwa.platform.device}
      >
        <button
          type="button"
          onClick={() => dismissInvite()}
          className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("vgl51.pwa.invite.close")}
          data-pwa-invite-close
        >
          <X className="size-4" aria-hidden />
        </button>
        <div className="flex gap-3 pr-6">
          <img src={gameproSymbol} alt="" className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold uppercase tracking-wide">
              {mobile ? t("vgl51.pwa.invite.titleMobile") : t("vgl51.pwa.invite.titleDesktop")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("vgl51.pwa.invite.body")}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => dismissInvite()}>
            {t("vgl51.pwa.invite.later")}
          </Button>
          <Button type="button" size="sm" onClick={() => void act()} data-pwa-invite-action>
            {pwa.canPrompt ? (
              <>
                <Download className="size-4" aria-hidden />
                {t("vgl51.pwa.invite.install")}
              </>
            ) : (
              t("vgl51.pwa.invite.how")
            )}
          </Button>
        </div>
      </aside>
      <InstallInstructions open={help} onOpenChange={setHelp} mode={pwa.platform.mode} />
    </>
  );
}
