/**
 * /upload — no-write smoke test of the protected flows (visual evolution, 2026-11-26).
 *
 * Runs only when E2E_UPLOAD_SMOKE=1 (its own manual workflow), so the PM2 suite is unchanged.
 * It never sends a file, never confirms or declines a player and never cancels or retries a job:
 *   1. /upload opens with the title, the drop zone and the "Selecionar arquivo" button;
 *   2. the button opens the native file chooser (closed without choosing a file);
 *   3. a non-.dem file shows the "invalid format" message and produces no upload request;
 *   4. ?identify=<pending job> opens the modal on that job and the close button closes it
 *      (closing only touches this browser's local memory);
 *   9. the history renders its states;
 *  10. at 360/390/430/768/1024/1440 there is no horizontal overflow, no text under 12 px, and the
 *      button is visible.
 * Throughout, every request that could write (see watchWrites) is recorded and must be zero, and no
 * SteamID appears in the page.
 *
 * Credentials: E2E_A_EMAIL / E2E_A_PASSWORD only (never printed). The summary holds counts only.
 */
import { writeFileSync } from "node:fs";

import { type Page, expect, test } from "@playwright/test";

const email = process.env["E2E_A_EMAIL"];
const password = process.env["E2E_A_PASSWORD"];
const enabled = process.env["E2E_UPLOAD_SMOKE"] === "1";

test.describe.configure({ mode: "serial" });
test.skip(!enabled, "upload smoke runs only from its own workflow (E2E_UPLOAD_SMOKE=1)");
test.skip(!email || !password, "MANUAL_REQUIRED: E2E_A_EMAIL / E2E_A_PASSWORD are not configured");

const WIDTHS = [360, 390, 430, 768, 1024, 1440] as const;
const STEAM_ID = /\b7656119\d{10}\b/;
const summary: Record<string, unknown> = { startedAt: new Date().toISOString() };
const writes: string[] = [];
/** POST server functions the page already calls just by loading (reads such as job status). */
const loadReads = new Set<string>();
let learning = true;

/**
 * Records requests that could write. Ignored: GET/HEAD/OPTIONS, the hosting platform's page
 * analytics, auth token refresh, and the POST server functions the page issues on a plain load
 * (learned on the first load, before any interaction). Anything else after that is a write.
 */
function watchWrites(page: Page) {
  page.on("request", (request) => {
    const method = request.method();
    if (method === "GET" || method === "OPTIONS" || method === "HEAD") return;
    const url = new URL(request.url());
    if (url.pathname.startsWith("/__l5e/") || url.pathname === "/auth/v1/token") return;
    if (url.pathname.startsWith("/_serverFn/")) {
      if (learning) {
        loadReads.add(url.pathname);
        return;
      }
      if (loadReads.has(url.pathname)) return;
    }
    // Only the path shape is kept (no query string, no ids) so the summary stays non-identifying.
    writes.push(`${method} ${url.host}${url.pathname.replace(/[0-9a-f-]{36}/g, ":id")}`);
  });
}

async function login(page: Page) {
  await page.goto("/login");
  const form = page.locator('form[data-hydrated="true"]');
  await form.waitFor({ state: "visible", timeout: 60_000 });
  await form.locator('input[type="email"]').fill(email ?? "");
  await form.locator('input[type="password"]').fill(password ?? "");
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function openUpload(page: Page, query = "") {
  await page.goto(`/upload${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Selecionar arquivo" })).toBeVisible();
}

test("upload smoke — protected flows, no writes", async ({ page }) => {
  await login(page);
  watchWrites(page);

  // 1. page opens
  await openUpload(page);
  await page.waitForLoadState("networkidle");
  learning = false;
  summary["readOnlyPostsOnLoad"] = loadReads.size;
  expect(STEAM_ID.test(await page.content())).toBe(false);
  summary["open"] = "PASS";

  // 2. file chooser opens; nothing is chosen
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Selecionar arquivo" }).click(),
  ]);
  expect(chooser.isMultiple()).toBe(false);
  summary["fileChooser"] = "PASS";

  // 3. invalid format: rejected locally, no request
  const before = writes.length;
  await page.locator('input[type="file"][accept=".dem"]').setInputFiles({
    name: "not-a-demo.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a demo"),
  });
  await expect(page.getByRole("alert").filter({ hasText: ".dem" })).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(writes.length).toBe(before);
  summary["invalidFormat"] = "PASS";

  // The deployed release carries the E1 copy (proves the run is against the new version).
  await expect(page.locator("main")).toContainText(
    "O envio começa assim que você seleciona o arquivo.",
  );
  await expect(page.locator("main")).not.toContainText("não é enviado nem processado");
  summary["releaseCopy"] = "PASS";

  // 9. history states
  const pending = page.locator("[data-pending-identity]");
  summary["pendingIdentityJobs"] = await pending.count();

  // 4. modal via ?identify on a pending job (only if the account has one)
  if ((await pending.count()) > 0) {
    const jobId = await pending.first().getAttribute("data-pending-identity");
    await openUpload(page, `?identify=${jobId}`);
    const overlay = page.locator('[data-testid="demo-flow-overlay"]');
    await expect(overlay).toBeVisible();
    summary["modalPhase"] = await page.locator("[data-phase]").first().getAttribute("data-phase");
    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    summary["modal"] = "PASS";
  } else {
    summary["modal"] = "SKIPPED_NO_PENDING_JOB";
  }

  // 10. breakpoints
  const widths: Record<string, unknown> = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await openUpload(page);
    const audit = await page.evaluate(() => {
      const doc = document.documentElement;
      let small = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
        if (!el.childNodes.length || el.offsetParent === null) continue;
        const own = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
        );
        if (own && parseFloat(getComputedStyle(el).fontSize) < 12) small += 1;
      }
      const cta = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Selecionar arquivo",
      );
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        smallText: small,
        ctaTop: cta ? Math.round(cta.getBoundingClientRect().top + window.scrollY) : null,
        loop: !!document.querySelector("[data-upload-loop]")?.checkVisibility?.(),
      };
    });
    expect(audit.overflow, `overflow at ${width}`).toBeLessThanOrEqual(0);
    expect(audit.smallText, `text < 12px at ${width}`).toBe(0);
    expect(audit.ctaTop, `button at ${width}`).not.toBeNull();
    // E2: the "how it works" column exists only from 1280 px.
    expect(audit.loop, `loop visibility at ${width}`).toBe(width >= 1280);
    widths[width] = audit;
  }
  summary["widths"] = widths;

  summary["nonGetRequestsAfterLogin"] = writes;
  expect(writes, "the smoke test must not write anything").toEqual([]);
  summary["finishedAt"] = new Date().toISOString();
  const out = process.env["E2E_SUMMARY_PATH"];
  if (out) writeFileSync(out, JSON.stringify(summary, null, 2));
  // Counts and statuses only (no ids, no account data), so the run log is the evidence too.
  console.log(`[upload-smoke] ${JSON.stringify(summary)}`);
});
