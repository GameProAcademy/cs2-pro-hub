/**
 * Security regression — authentication forms must never send credentials through a URL.
 *
 * A form without `method="post"` submitted natively (JavaScript disabled, or before React hydrates)
 * becomes a GET whose query string carries every named field: email and password then land in the
 * address bar, history, Referer and server/CDN logs. Run 44035115612 showed exactly that on /login.
 *
 * Scenarios per public auth form (login, forgot-password mode, register, reset-password):
 *   1. JavaScript disabled: try to fill and submit → no request/navigation may carry the probe values
 *      in a URL, and the page must not leave its route through a native submission.
 *   2. Delayed hydration: scripts are held back, the user types and submits before React is ready →
 *      same assertions.
 *   3. After hydration (`form[data-hydrated="true"]`): submit → the app's own handler runs (Supabase
 *      auth request is a POST, aborted here so nothing reaches the backend), and no URL carries the
 *      probe values.
 *
 * Only fake probe values are used; every request to Supabase Auth is aborted, so no account is
 * created, no e-mail is sent and no real credential exists in this file or its output.
 */
import { type Page, type Request, expect, test } from "@playwright/test";

const PROBE_EMAIL = "probe-e2e-no-account@example.invalid";
const PROBE_PASSWORD = "Probe-Not-A-Password-7391";
const PROBES = [PROBE_EMAIL, encodeURIComponent(PROBE_EMAIL), PROBE_PASSWORD];

type Form = { route: string; name: string; forgot?: boolean; ssrForm: boolean };
const FORMS: Form[] = [
  { route: "/login", name: "login", ssrForm: true },
  { route: "/login", name: "login-forgot", forgot: true, ssrForm: false },
  { route: "/register", name: "register", ssrForm: true },
  { route: "/reset-password", name: "reset-password", ssrForm: false },
];

/** Records every request URL; aborts Supabase Auth so the backend is never reached. */
async function guard(page: Page) {
  const urls: { method: string; url: string }[] = [];
  const authCalls: { method: string; url: string }[] = [];
  page.on("request", (r: Request) => urls.push({ method: r.method(), url: r.url() }));
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) urls.push({ method: "NAV", url: f.url() });
  });
  await page.route("**/auth/v1/**", async (route) => {
    authCalls.push({ method: route.request().method(), url: route.request().url() });
    await route.abort();
  });
  return {
    leaks: () => urls.filter((u) => PROBES.some((p) => u.url.includes(p))),
    credentialGets: () =>
      urls.filter(
        (u) =>
          (u.method === "GET" || u.method === "NAV") &&
          /[?&](email|password|confirm)=/i.test(u.url),
      ),
    authCalls,
  };
}

/** Types the probes into every enabled email/password input and tries every way to submit. */
async function tryToSubmit(page: Page) {
  const inputs = page.locator(
    'form input[type="email"], form input[type="password"], form input[type="text"]',
  );
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    const type = await el.getAttribute("type");
    if (await el.isEnabled().catch(() => false)) {
      await el.fill(type === "email" ? PROBE_EMAIL : PROBE_PASSWORD).catch(() => undefined);
    }
  }
  if (n > 0)
    await inputs
      .first()
      .press("Enter")
      .catch(() => undefined);
  await page
    .locator('form button[type="submit"]')
    .first()
    .click({ force: true, timeout: 2_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1_500);
}

test.describe("auth forms never put credentials in a URL", () => {
  for (const form of FORMS.filter((f) => f.ssrForm)) {
    test(`${form.name}: JavaScript disabled`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      const g = await guard(page);
      await page.goto(form.route);
      await expect(page.locator("form").first()).toBeVisible();
      await tryToSubmit(page);
      expect(g.leaks(), "probe values in a URL").toEqual([]);
      expect(g.credentialGets(), "credential fields in a GET query").toEqual([]);
      expect(new URL(page.url()).search).toBe("");
      await context.close();
    });

    test(`${form.name}: submit before hydration`, async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const g = await guard(page);
      // Hold every script back so the server-rendered form is interactive before React is.
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      await page.route(
        /\.(m?js|tsx?|jsx)(\?|$)|\/@vite\/|\/@id\/|\/node_modules\//,
        async (route) => {
          await gate;
          await route.continue().catch(() => undefined);
        },
      );
      await page.goto(form.route, { waitUntil: "commit" });
      await expect(page.locator("form").first()).toBeVisible();
      expect(await page.locator('form[data-hydrated="true"]').count()).toBe(0);
      await tryToSubmit(page);
      release();
      expect(g.leaks(), "probe values in a URL").toEqual([]);
      expect(g.credentialGets(), "credential fields in a GET query").toEqual([]);
      await context.close();
    });
  }

  for (const form of FORMS) {
    test(`${form.name}: after hydration the app handles the submit`, async ({ page }) => {
      const g = await guard(page);
      await page.goto(form.route);
      if (form.forgot) {
        await page.locator('form[data-hydrated="true"]').first().waitFor();
        await page.locator('form button[type="button"]').last().click();
      }
      const hydrated = page.locator('form[data-hydrated="true"]').first();
      if (form.route === "/reset-password") {
        // Without a recovery session the page shows "invalid link" instead of a form: nothing to submit.
        await page.waitForTimeout(3_000);
        if ((await page.locator("form").count()) === 0) {
          expect(g.leaks()).toEqual([]);
          return;
        }
      }
      await hydrated.waitFor();
      await tryToSubmit(page);
      expect(g.leaks(), "probe values in a URL").toEqual([]);
      expect(g.credentialGets(), "credential fields in a GET query").toEqual([]);
      expect(new URL(page.url()).pathname).toBe(form.route);
      // Any call the handler made to Supabase Auth went as POST/PUT, never GET with credentials.
      for (const c of g.authCalls) expect(c.method).not.toBe("GET");
    });
  }
});
