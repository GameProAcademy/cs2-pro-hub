/**
 * VGL 5.1 — Frente 1: installable app (PWA). Pure logic: platform detection and the
 * reminder rule. No DOM access here (tested with plain inputs).
 */

export const PWA_DISMISSED_KEY = "cs2pro.pwa.inviteDismissedAt";
export const PWA_INSTALLED_KEY = "cs2pro.pwa.installed";
/** A closed invite comes back after 48 hours — a reminder, never a nag. */
export const PWA_REMIND_AFTER_MS = 48 * 60 * 60 * 1000;

export type PwaOs =
  "windows" | "macos" | "android" | "ios" | "ipados" | "linux" | "chromeos" | "other";
export type PwaBrowser = "edge" | "chrome" | "samsung" | "opera" | "firefox" | "safari" | "other";
/**
 * How this device installs the app:
 *  - prompt:      the browser fired `beforeinstallprompt`; our button opens the native dialog.
 *  - ios-share:   iPhone / iPad — Share → Add to Home Screen (iOS 16.4+ in Safari, Chrome, Edge,
 *                 Firefox and Orion; older iOS only in Safari).
 *  - mac-safari:  Safari on macOS 14+ — File → Add to Dock.
 *  - chromium:    Chromium without a captured prompt — the install icon in the address bar /
 *                 browser menu → Install app.
 *  - android-menu: Android browsers without a prompt — browser menu → Install app / Add to Home.
 *  - unsupported: e.g. Firefox desktop (no web app install) — suggest Chrome or Edge.
 */
export type PwaInstallMode =
  "prompt" | "ios-share" | "mac-safari" | "chromium" | "android-menu" | "unsupported";

export interface PwaEnv {
  userAgent: string;
  /** navigator.maxTouchPoints (iPadOS reports a Mac user agent with touch points). */
  maxTouchPoints: number;
  /** `display-mode: standalone` / `window-controls-overlay` or navigator.standalone (iOS). */
  standalone: boolean;
  /** A `beforeinstallprompt` event was captured and not used yet. */
  hasPrompt: boolean;
}

export interface PwaPlatform {
  os: PwaOs;
  browser: PwaBrowser;
  device: "desktop" | "mobile";
  mode: PwaInstallMode;
}

export function detectOs(ua: string, maxTouchPoints: number): PwaOs {
  if (/iPhone|iPod/i.test(ua)) return "ios";
  if (/iPad/i.test(ua)) return "ipados";
  // iPadOS 13+ asks for the desktop site and reports "Macintosh" — touch points give it away.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ipados";
  if (/Android/i.test(ua)) return "android";
  if (/CrOS/i.test(ua)) return "chromeos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
}

export function detectBrowser(ua: string): PwaBrowser {
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "edge";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/OPR\/|Opera/i.test(ua)) return "opera";
  if (/Firefox\/|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome\/|CriOS|Chromium/i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}

export function detectPlatform(env: PwaEnv): PwaPlatform {
  const os = detectOs(env.userAgent, env.maxTouchPoints);
  const browser = detectBrowser(env.userAgent);
  const device: PwaPlatform["device"] =
    os === "ios" || os === "ipados" || os === "android" ? "mobile" : "desktop";
  let mode: PwaInstallMode;
  if (env.hasPrompt) mode = "prompt";
  else if (os === "ios" || os === "ipados") mode = "ios-share";
  else if (os === "android") mode = "android-menu";
  else if (os === "macos" && browser === "safari") mode = "mac-safari";
  else if (browser === "chrome" || browser === "edge" || browser === "opera") mode = "chromium";
  else mode = "unsupported";
  return { os, browser, device, mode };
}

/**
 * Whether the invite may appear now. Never when installed / running as the app; after a close,
 * only once PWA_REMIND_AFTER_MS have passed. Invalid stored values count as "never closed".
 */
export function shouldShowInvite(args: {
  now: number;
  dismissedAt: string | null;
  installed: boolean;
  standalone: boolean;
}): boolean {
  if (args.installed || args.standalone) return false;
  if (!args.dismissedAt) return true;
  const at = Number(args.dismissedAt);
  if (!Number.isFinite(at) || at <= 0 || at > args.now) return true;
  return args.now - at >= PWA_REMIND_AFTER_MS;
}
