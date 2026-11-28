/**
 * VGL 5.1 — Frente 1: browser side of the installable app. One module-level store, so the state
 * survives route changes (pages remount <AppShell>) and the `beforeinstallprompt` event — which
 * fires once, early — is captured as soon as the app's client bundle runs.
 */
import { useSyncExternalStore } from "react";

import {
  PWA_DISMISSED_KEY,
  PWA_INSTALLED_KEY,
  detectPlatform,
  shouldShowInvite,
  type PwaPlatform,
} from "./install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

interface PwaState {
  ready: boolean;
  installed: boolean;
  standalone: boolean;
  canPrompt: boolean;
  /** The invite decision for this page load (computed once, not per route). */
  inviteOpen: boolean;
  platform: PwaPlatform | null;
}

let state: PwaState = {
  ready: false,
  installed: false,
  standalone: false,
  canPrompt: false,
  inviteOpen: false,
  platform: null,
};
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const set = (next: Partial<PwaState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

const read = (k: string) => {
  try {
    return globalThis.localStorage?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    globalThis.localStorage?.setItem(k, v);
  } catch {
    /* storage unavailable (private mode): the invite simply follows the session */
  }
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = (q: string) => window.matchMedia?.(q).matches === true;
  return (
    mq("(display-mode: standalone)") ||
    mq("(display-mode: window-controls-overlay)") ||
    mq("(display-mode: minimal-ui)") ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function platformNow(): PwaPlatform {
  return detectPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: state.standalone,
    hasPrompt: deferred !== null,
  });
}

let started = false;
/** Idempotent: wires the listeners and registers the service worker (production only). */
export function startPwa(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const standalone = isStandalone();
  // Running as the app proves it is installed; remember it for this browser.
  if (standalone) write(PWA_INSTALLED_KEY, "1");
  const installed = read(PWA_INSTALLED_KEY) === "1" || standalone;
  set({
    ready: true,
    standalone,
    installed,
    inviteOpen: shouldShowInvite({
      now: Date.now(),
      dismissedAt: read(PWA_DISMISSED_KEY),
      installed,
      standalone,
    }),
  });
  set({ platform: platformNow() });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own, non-blocking invite
    deferred = e as BeforeInstallPromptEvent;
    // The browser offering installation means it is NOT installed in this browser profile
    // (e.g. the app was uninstalled): clear a stale flag.
    if (read(PWA_INSTALLED_KEY) === "1" && !isStandalone()) write(PWA_INSTALLED_KEY, "0");
    set({ canPrompt: true, installed: false, platform: platformNow() });
  });
  window.addEventListener("appinstalled", () => {
    write(PWA_INSTALLED_KEY, "1");
    deferred = null;
    set({ installed: true, canPrompt: false, inviteOpen: false, platform: platformNow() });
  });

  if ("serviceWorker" in navigator && import.meta.env.PROD && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* the app works without it; installability does not depend on it */
    });
  }
}

/** Opens the native dialog (only after a real click, only where the browser supports it). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  try {
    await e.prompt();
    const choice = await e.userChoice;
    deferred = null; // a prompt can be used once
    set({ canPrompt: false, platform: platformNow() });
    if (choice.outcome === "accepted") {
      write(PWA_INSTALLED_KEY, "1");
      set({ installed: true, inviteOpen: false });
    }
    return choice.outcome;
  } catch {
    deferred = null;
    set({ canPrompt: false, platform: platformNow() });
    return "unavailable";
  }
}

/** Closing the invite: remembered per browser for 48 h. */
export function dismissInvite(now: number = Date.now()): void {
  write(PWA_DISMISSED_KEY, String(now));
  set({ inviteOpen: false });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: PwaState = { ...state };

export function usePwaInstall(): PwaState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}
