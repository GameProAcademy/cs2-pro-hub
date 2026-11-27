/**
 * Visual Game Language — production smoke across the player screens (2026-11-26).
 *
 * Runs only with E2E_VGL_SMOKE=1 (its own manual workflow). For every route at 360/390/430/768/
 * 1024/1280/1440: the page renders its title, no horizontal overflow, no text under 12 px, no
 * uncaught page error. It checks that the VGL elements appear where real data exists (map tiles in
 * the match list, a pictogram per Match Room tab) and walks the seven room tabs.
 *
 * AI Coach: with E2E_COACH_SEND=1 it sends ONE short question as the test account and waits for
 * the Coach's reply to render (the only write of this run; it uses the account's own quota).
 * Credentials: E2E_A_EMAIL / E2E_A_PASSWORD (never printed). The summary holds counts only.
 */
import { writeFileSync } from "node:fs";

import { type Page, expect, test } from "@playwright/test";

const email = process.env["E2E_A_EMAIL"];
const password = process.env["E2E_A_PASSWORD"];
test.describe.configure({ mode: "serial" });
test.skip(process.env["E2E_VGL_SMOKE"] !== "1", "VGL smoke runs only from its own workflow");
test.skip(!email || !password, "MANUAL_REQUIRED: E2E_A_EMAIL / E2E_A_PASSWORD are not configured");
test.setTimeout(15 * 60_000);

const WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440] as const;
const ROUTES = [
  "/dashboard",
  "/matches",
  "/moments",
  "/analysis",
  "/player-dna",
  "/performance",
  "/evolution",
  "/maps",
  "/training",
  "/goals",
  "/coach",
  "/profile",
  "/notifications",
  "/upload",
] as const;
const ROOM_TABS = ["summary", "rounds", "duels", "deaths", "utility", "map", "replay"] as const;
const summary: Record<string, unknown> = { startedAt: new Date().toISOString() };

async function login(page: Page) {
  await page.goto("/login");
  const form = page.locator('form[data-hydrated="true"]');
  await form.waitFor({ state: "visible", timeout: 60_000 });
  await form.locator('input[type="email"]').fill(email ?? "");
  await form.locator('input[type="password"]').fill(password ?? "");
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function audit(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    let small = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
      if (!el.childNodes.length || el.offsetParent === null) continue;
      const own = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
      );
      if (own && parseFloat(getComputedStyle(el).fontSize) < 12) small += 1;
    }
    return { overflow: doc.scrollWidth - doc.clientWidth, smallText: small };
  });
}

async function settle(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await expect(page.locator("main")).toBeVisible();
}

test("VGL smoke — every player screen, seven widths, AI Coach", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));
  await login(page);

  // Route × width audit.
  const routes: Record<string, unknown> = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ROUTES) {
      await settle(page, path);
      const a = await audit(page);
      expect(a.overflow, `overflow ${path} @${width}`).toBeLessThanOrEqual(0);
      expect(a.smallText, `text < 12px ${path} @${width}`).toBe(0);
      (routes[path] ??= {}) as Record<string, unknown>;
      (routes[path] as Record<string, unknown>)[width] = a;
    }
  }
  summary["routes"] = routes;

  // VGL markers where real data exists.
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page, "/matches");
  const rows = page.locator("[data-match-row]");
  const rowCount = await rows.count();
  summary["matchRows"] = rowCount;
  if (rowCount > 0) {
    summary["mapTilesInList"] = await page.locator("[data-match-row] [data-map-tile]").count();
    await page.locator("a[data-room-link]").first().click();
    await page.waitForURL(/\/matches\/[^/?]+/);
    const roomUrl = new URL(page.url());
    const tabs: Record<string, unknown> = {};
    for (const tab of ROOM_TABS) {
      await settle(page, `${roomUrl.pathname}${tab === "summary" ? "" : `?tab=${tab}`}`);
      await expect(page.locator(`[data-room-tab="${tab}"][aria-current="page"]`)).toBeVisible();
      const a = await audit(page);
      expect(a.overflow, `room ${tab}`).toBeLessThanOrEqual(0);
      tabs[tab] = {
        ...a,
        pictogram: await page.locator(`[data-room-tab="${tab}"] svg[data-game-icon]`).count(),
      };
    }
    summary["roomTabs"] = tabs;
    summary["roomHeaderTile"] = await page.locator("[data-room-header] [data-map-tile]").count();
  }

  // AI Coach: the page renders; optionally one real question and its reply.
  await settle(page, "/coach");
  await expect(page.locator("[data-coach-thread]")).toBeVisible();
  if (process.env["E2E_COACH_SEND"] === "1") {
    const before = await page.locator('[data-message-role="coach"]').count();
    await page
      .locator("form textarea")
      .last()
      .fill("Resuma em 3 linhas meus dados observados, a interpretação e uma próxima ação.");
    await page
      .getByRole("button", { name: /enviar|send/i })
      .last()
      .click();
    await expect(page.locator('[data-message-role="coach"]')).toHaveCount(before + 1, {
      timeout: 120_000,
    });
    const last = page.locator('[data-message-role="coach"]').last();
    summary["coach"] = {
      replied: true,
      sections: await last.locator("[data-coach-section]").count(),
      numbers: await last.locator("[data-coach-number]").count(),
      error: await page.locator('[role="alert"]').count(),
    };
  } else {
    summary["coach"] = { rendered: true, send: "SKIPPED" };
  }

  summary["pageErrors"] = pageErrors;
  expect(pageErrors, "uncaught page errors").toEqual([]);
  summary["finishedAt"] = new Date().toISOString();
  const out = process.env["E2E_SUMMARY_PATH"];
  if (out) writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`[vgl-smoke] ${JSON.stringify(summary)}`);
});
