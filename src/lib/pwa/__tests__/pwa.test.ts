/** VGL 5.1 — Frente 1: installable app (pure rules, manifest, service worker guards, wiring). */
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  PWA_REMIND_AFTER_MS,
  detectPlatform,
  shouldShowInvite,
  type PwaEnv,
} from "@/lib/pwa/install";

const read = (p: string) => readFileSync(p, "utf8");
const env = (userAgent: string, over: Partial<PwaEnv> = {}): PwaEnv => ({
  userAgent,
  maxTouchPoints: 0,
  standalone: false,
  hasPrompt: false,
  ...over,
});

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
};

describe("platform detection", () => {
  it.each([
    ["chromeWin", {}, { os: "windows", browser: "chrome", device: "desktop", mode: "chromium" }],
    ["edgeWin", {}, { os: "windows", browser: "edge", device: "desktop", mode: "chromium" }],
    [
      "firefoxWin",
      {},
      { os: "windows", browser: "firefox", device: "desktop", mode: "unsupported" },
    ],
    ["safariMac", {}, { os: "macos", browser: "safari", device: "desktop", mode: "mac-safari" }],
    ["chromeMac", {}, { os: "macos", browser: "chrome", device: "desktop", mode: "chromium" }],
    [
      "chromeAndroid",
      {},
      { os: "android", browser: "chrome", device: "mobile", mode: "android-menu" },
    ],
    ["safariIphone", {}, { os: "ios", browser: "safari", device: "mobile", mode: "ios-share" }],
    ["chromeIphone", {}, { os: "ios", browser: "chrome", device: "mobile", mode: "ios-share" }],
    [
      "ipadDesktopMode",
      { maxTouchPoints: 5 },
      { os: "ipados", device: "mobile", mode: "ios-share" },
    ],
  ] as const)("%s", (key, over, expected) => {
    expect(detectPlatform(env(UA[key], over))).toMatchObject(expected);
  });

  it("a captured beforeinstallprompt wins on Chromium desktop and Android; never on iOS", () => {
    expect(detectPlatform(env(UA.chromeWin, { hasPrompt: true })).mode).toBe("prompt");
    expect(detectPlatform(env(UA.chromeAndroid, { hasPrompt: true })).mode).toBe("prompt");
    // iOS never fires the event; even a bogus flag would only be honoured if it existed.
    expect(detectPlatform(env(UA.safariIphone)).mode).toBe("ios-share");
  });
});

describe("invite frequency (48 h reminder)", () => {
  const now = Date.UTC(2026, 10, 28, 12);
  it("shown when never closed; hidden when installed or running as the app", () => {
    expect(shouldShowInvite({ now, dismissedAt: null, installed: false, standalone: false })).toBe(
      true,
    );
    expect(shouldShowInvite({ now, dismissedAt: null, installed: true, standalone: false })).toBe(
      false,
    );
    expect(shouldShowInvite({ now, dismissedAt: null, installed: false, standalone: true })).toBe(
      false,
    );
  });
  it("closed: hidden before 48 h, shown again at 48 h", () => {
    const at = (ms: number) => String(now - ms);
    expect(
      shouldShowInvite({
        now,
        dismissedAt: at(47 * 3600_000),
        installed: false,
        standalone: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInvite({
        now,
        dismissedAt: at(PWA_REMIND_AFTER_MS),
        installed: false,
        standalone: false,
      }),
    ).toBe(true);
    expect(PWA_REMIND_AFTER_MS).toBe(48 * 3600_000);
  });
  it("garbage or future timestamps count as never closed", () => {
    for (const v of ["abc", "-1", String(now + 1000)])
      expect(shouldShowInvite({ now, dismissedAt: v, installed: false, standalone: false })).toBe(
        true,
      );
  });
});

describe("manifest and icons", () => {
  const m = JSON.parse(read("public/manifest.webmanifest"));
  it("names, standalone display, start_url inside scope, brand colors", () => {
    expect(m.name).toBe("CS2 PRO AI Coach");
    expect(m.short_name).toBe("CS2 PRO");
    expect(m.display).toBe("standalone");
    expect(m.scope).toBe("/");
    expect(m.start_url.startsWith("/")).toBe(true);
    expect(m.theme_color).toBe("#0d1117");
  });
  it("192, 512 and a maskable icon exist on disk (made from the current logo)", () => {
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons) expect(statSync(`public${i.src}`).size).toBeGreaterThan(1000);
    expect(statSync("public/pwa/apple-touch-icon.png").size).toBeGreaterThan(1000);
  });
});

describe("service worker never caches private data", () => {
  const sw = read("public/sw.js");
  it("ignores non-GET and other origins (Supabase, server functions, AI Coach, auth)", () => {
    expect(sw).toContain('if (request.method !== "GET") return;');
    expect(sw).toContain("if (url.origin !== self.location.origin) return;");
  });
  it("navigations are network-first and never stored; only hashed assets and public art are cached", () => {
    const nav = sw.slice(
      sw.indexOf('if (request.mode === "navigate")'),
      sw.indexOf("if (!CACHEABLE"),
    );
    expect(nav).not.toContain("cache.put");
    expect(sw).toContain(
      "const CACHEABLE = [/^\\/assets\\//, /^\\/cs2\\//, /^\\/radars\\//, /^\\/pwa\\//];",
    );
    expect(sw).toContain("|| url.search) return;");
    expect(sw).not.toMatch(/_serverFn|supabase|\/api\//);
  });
  it("old caches are dropped on activation and new versions take over", () => {
    expect(sw).toContain("self.skipWaiting()");
    expect(sw).toContain("self.clients.claim()");
    expect(sw).toMatch(/keys\.filter\(\(k\) => !k\.startsWith\(VERSION\)\)/);
  });
});

describe("wiring", () => {
  it("head links the manifest and iOS metadata; the shell shows the invite and the menu entry", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain('{ rel: "manifest", href: "/manifest.webmanifest" }');
    expect(root).toContain('{ rel: "apple-touch-icon", href: "/pwa/apple-touch-icon.png" }');
    const shell = read("src/components/layout/AppShell.tsx");
    expect(shell).toContain("<InstallInvite />");
    expect(shell).toContain("<InstallAppButton />");
  });
  it("the prompt is only called from a click; the SW registers only in production over HTTPS", () => {
    const hook = read("src/lib/pwa/usePwaInstall.ts");
    expect(hook).toContain("e.preventDefault(); // we show our own, non-blocking invite");
    expect(hook).toContain("import.meta.env.PROD && window.isSecureContext");
    const ui = read("src/components/pwa/InstallApp.tsx");
    expect(ui).toMatch(/onClick=\{\(\) => void act\(\)\}/);
    expect(ui).not.toMatch(/useEffect\([^)]*promptInstall/);
  });
  it("texts exist in the five languages", () => {
    for (const l of ["pt-BR", "en", "es", "fr", "pt-PT"]) {
      const b = read(`src/i18n/locales/vgl5/${l}.ts`);
      for (const k of [
        "vgl51.pwa.button",
        "vgl51.pwa.invite.titleDesktop",
        "vgl51.pwa.invite.titleMobile",
        "vgl51.pwa.ios.1",
        "vgl51.pwa.macSafari.2",
        "vgl51.pwa.chromium.3",
        "vgl51.pwa.android.2",
        "vgl51.pwa.unsupported",
      ])
        expect(b).toContain(`"${k}"`);
    }
  });
});
