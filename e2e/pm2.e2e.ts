/**
 * PM2 closure — browser E2E against a real deployment, with two real accounts (A and B).
 *
 * Covers, for each account that has a processed match with a replay:
 *   login → own matches → /deaths → death review → deep link to /replay (round + tick) → round navigation →
 *   time navigation → play/pause → feedback (persisted, then restored) → empty/unavailable states →
 *   PM3 /duels and /utility on the same match (provenance, NOT_MEASURED aim limits, replay deep link).
 *   PM4 /rounds on the same match (team vs player, replay links) and /evolution (real N).
 *   PM5 /moments (a bookmark on the own match, created under RLS, listed with its replay deep link),
 *   /training (adaptive plan state; no browser write to plan tables) and the BENCHMARK_UNAVAILABLE card.
 * Then cross-user isolation in BOTH directions (A→B and B→A):
 *   /deaths, /replay, /duels and /utility by id, deep links, the feedback server function replayed with the other user's
 *   session and the victim's event ref, an injected owner field, direct REST reads/writes under RLS, and
 *   STEAM: one derived link state per platform on the identities card, no alias/diagnostics access,
 *   client cache isolation after logout/login in the same browser context, and (PM5) the victim's
 *   bookmark and training plan unreadable/unwritable through REST and absent from /moments.
 *
 * Credentials come only from E2E_A_EMAIL/E2E_A_PASSWORD/E2E_B_EMAIL/E2E_B_PASSWORD. Nothing secret, no
 * token and no account data is printed: the summary (E2E_SUMMARY_PATH) holds statuses and counts only.
 */
import { writeFileSync } from "node:fs";

import { type Browser, type Page, expect, test } from "@playwright/test";

type Creds = { email: string; password: string };
type Recorded = { url: string; headers: Record<string, string>; body: string };
type OwnData = {
  matchId: string;
  round: number;
  tick: number;
  feedback: Recorded | null;
  supabaseUrl: string | null;
  apikey: string | null;
  momentId: string | null;
};

const RANDOM_MATCH = "00000000-0000-4000-8000-000000000000";
const summary: Record<string, unknown> = { startedAt: new Date().toISOString() };

function creds(prefix: "A" | "B"): Creds | null {
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}

const A = creds("A");
const B = creds("B");

test.describe.configure({ mode: "serial" });
test.skip(!A || !B, "MANUAL_REQUIRED: E2E_A_* and E2E_B_* credentials are not configured");

const own: Partial<Record<"A" | "B", OwnData>> = {};

/** The signed-in user's access token, read inside the page (never printed). */
async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return k
      ? ((JSON.parse(localStorage.getItem(k) ?? "{}") as { access_token?: string }).access_token ??
          null)
      : null;
  });
  if (!token) throw new Error("session token not found in the page");
  return token;
}

/** One PostgREST call with the page's own session; returns status and row count only. */
async function rest(
  page: Page,
  base: { url: string; key: string },
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; rows: number; first: Record<string, unknown> | null }> {
  return page.evaluate(
    async ({ base, token, method, path, body }) => {
      const res = await fetch(`${base.url}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: base.key,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as unknown;
      const rows = Array.isArray(json) ? json : [];
      return {
        status: res.status,
        rows: Array.isArray(json) ? rows.length : -1,
        first: (rows[0] as Record<string, unknown> | undefined) ?? null,
      };
    },
    { base, token, method, path, body },
  );
}

const e2eTitle = (who: "A" | "B") => `E2E PM5 ${who}`;

/** Record the Supabase origin/apikey (public publishable key) and the feedback server-fn request. */
function watch(
  page: Page,
  sink: { feedback: Recorded | null; supabaseUrl: string | null; apikey: string | null },
) {
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes(".supabase.co/") && !sink.apikey) {
      const key = req.headers()["apikey"];
      if (key) {
        sink.apikey = key;
        sink.supabaseUrl = new URL(url).origin;
      }
    }
    const body = req.postData();
    if (req.method() === "POST" && url.includes("_serverFn") && body?.includes("roundEventId")) {
      const headers = { ...req.headers() };
      delete headers["authorization"];
      delete headers["cookie"];
      sink.feedback = { url, headers, body };
    }
  });
}

/**
 * Credential guard: every request of the page passes through it. A request whose URL carries an
 * `email=`/`password=` field or any configured credential value is ABORTED before it leaves the browser
 * (so a regression can never leak to the server) and recorded by path only — never the query, never a
 * value. Run 44035115612 showed why: a submit before hydration became GET /login?email=…&password=….
 */
const blocked = new WeakMap<Page, string[]>();
const SECRET_VALUES = [A?.email, A?.password, B?.email, B?.password]
  .filter((v): v is string => Boolean(v))
  .flatMap((v) => [v, encodeURIComponent(v)]);

async function armCredentialGuard(page: Page) {
  const hits: string[] = [];
  blocked.set(page, hits);
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (/[?&](email|password)=/i.test(url) || SECRET_VALUES.some((v) => url.includes(v))) {
      hits.push(`${route.request().method()} ${new URL(url).pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  });
}

function assertNoCredentialInUrl(page: Page, where: string) {
  const hits = blocked.get(page) ?? [];
  expect(hits, `CREDENTIALS_IN_URL at ${where}: blocked ${hits.join(", ")}`).toEqual([]);
}

/**
 * Signs in through the real login form, only once the app is hydrated and interactive
 * (`form[data-hydrated="true"]`, set by SafeForm after React mounts — no fixed sleep).
 * `reload: false` keeps the single-page app (and its cache) alive.
 */
async function login(page: Page, c: Creds, reload = true) {
  if (reload) await page.goto("/login");
  const form = page.locator('form[data-hydrated="true"]');
  await form.waitFor({ state: "visible", timeout: 60_000 });
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
  await form.locator('input[type="email"]').fill(c.email);
  await form.locator('input[type="password"]').fill(c.password);
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  assertNoCredentialInUrl(page, "login");
}

/** The app's own sign-out button (cancels and clears the query cache, then navigates to /login). */
async function logout(page: Page) {
  await page.locator("button:has(svg.lucide-log-out)").first().click();
  await page.waitForURL(/\/login/);
}

/** In-app navigation to the replay page (no reload, so the client cache is what is being tested). */
async function openReplayInApp(page: Page) {
  await page.locator('a[href="/replay"]').first().click();
  await page.waitForURL(/\/replay/);
  await expect(page.locator("[data-replay-status], select").first()).toBeVisible();
}

async function replayStatus(page: Page) {
  const el = page.locator("[data-replay-status]").first();
  await expect(el).toBeVisible();
  return el.getAttribute("data-replay-status");
}

async function deathsStatus(page: Page) {
  const el = page.locator("[data-death-review-status]").first();
  await expect(el).toBeVisible();
  return el.getAttribute("data-death-review-status");
}

/** PM3: status of the duels (module C) and utility (module D) pages. */
async function pm3Status(
  page: Page,
  attr:
    "data-combat-status" | "data-utility-status" | "data-rounds-status" | "data-evolution-status",
) {
  const el = page.locator(`[${attr}]`).first();
  await expect(el).toBeVisible();
  return el.getAttribute(attr);
}

async function ownFlow(browser: Browser, who: "A" | "B", c: Creds) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await armCredentialGuard(page);
  const sink = {
    feedback: null as Recorded | null,
    supabaseUrl: null as string | null,
    apikey: null as string | null,
  };
  watch(page, sink);
  const steps: Record<string, string> = {};

  await login(page, c);
  steps["1_login"] = "PASS";

  await page.goto("/matches");
  const rows = page.locator("[data-result-status]");
  await expect(rows.first()).toBeVisible();
  steps["2_own_matches"] = `PASS rows=${await rows.count()}`;

  await page.goto("/deaths");
  expect(await deathsStatus(page)).toBe("OK");
  const deaths = page.locator("[data-death-kind]");
  await expect(deaths.first()).toBeVisible();
  steps["3_deaths_open"] = `PASS deaths=${await deaths.count()}`;
  steps["4_death_review"] = (await page.locator("[data-provenance]").count()) > 0 ? "PASS" : "FAIL";

  // Feedback on the first death (whole-review verdict): change, verify persisted, then restore.
  const box = page.locator('[data-feedback="REVIEW"]').first();
  const before = (await box.getAttribute("data-feedback-current")) ?? "";
  const target = before === "USEFUL" ? "NOT_USEFUL" : "USEFUL";
  const order = ["USEFUL", "NOT_USEFUL", "INCORRECT"];
  await box.locator("button").nth(order.indexOf(target)).click();
  await expect(box).toHaveAttribute("data-feedback-current", target);
  await page.reload();
  expect(await deathsStatus(page)).toBe("OK");
  await expect(page.locator('[data-feedback="REVIEW"]').first()).toHaveAttribute(
    "data-feedback-current",
    target,
  );
  if (before) {
    const again = page.locator('[data-feedback="REVIEW"]').first();
    await again.locator("button").nth(order.indexOf(before)).click();
    await expect(again).toHaveAttribute("data-feedback-current", before);
  }
  steps["10_feedback"] =
    `PASS persisted_after_reload; restored=${before ? "yes" : "no_previous_value"}`;

  // Deep link from the death review to the replay at the death tick.
  const link = page.locator("[data-replay-link]").first();
  const href = await link.getAttribute("href");
  const u = new URL(href ?? "", "https://x.invalid");
  const matchId = u.searchParams.get("matchId") ?? "";
  const round = Number(u.searchParams.get("round"));
  const tick = Number(u.searchParams.get("tick"));
  await link.click();
  await page.waitForURL(/\/replay\?/);
  expect(page.url()).toContain(`tick=${tick}`);
  expect(await replayStatus(page)).toBe("OK");
  await expect(page.locator("[data-replay-svg]")).toBeVisible();
  steps["5_replay_open"] = "PASS";
  steps["8_deep_link"] = `PASS round=${round}`;

  // Round navigation: another AVAILABLE round.
  const other = page
    .locator('nav button[data-availability="AVAILABLE"]:not([aria-current])')
    .first();
  const otherRound = Number((await other.innerText()).trim());
  await other.click();
  await expect(page.locator('nav button[aria-current="true"]')).toHaveText(String(otherRound));
  expect(await replayStatus(page)).toBe("OK");
  await expect(page.locator("[data-replay-svg]")).toBeVisible();
  steps["6_round_navigation"] = "PASS";

  // Time navigation: the timeline slider moves the clock.
  const clock = page.locator("[data-replay-time]");
  const t0 = await clock.innerText();
  const slider = page.locator('input[type="range"]').first();
  await slider.focus();
  await page.keyboard.press("End");
  await expect(clock).not.toHaveText(t0);
  await page.keyboard.press("Home");
  steps["7_time_navigation"] = "PASS";

  // Play / pause.
  const play = page.locator("[data-replay-status] button[aria-pressed]").first();
  const t1 = await clock.innerText();
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(clock).not.toHaveText(t1, { timeout: 10_000 });
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  const paused = await clock.innerText();
  await page.waitForTimeout(1500);
  await expect(clock).toHaveText(paused);
  steps["9_play_pause"] = "PASS";

  // Empty / unavailable states.
  await page.goto(`/replay?matchId=${RANDOM_MATCH}`);
  expect(await replayStatus(page)).toBe("NOT_FOUND");
  await page.goto(`/deaths?matchId=${RANDOM_MATCH}`);
  expect(await deathsStatus(page)).toBe("NOT_FOUND");
  steps["11_unavailable_states"] = "PASS NOT_FOUND (replay, deaths)";

  // No SteamID64 anywhere in the replay DOM.
  await page.goto(`/replay?matchId=${matchId}&round=${round}`);
  expect(await replayStatus(page)).toBe("OK");
  expect(/7656119\d{10}/.test(await page.content())).toBe(false);
  steps["privacy_no_steamid_in_dom"] = "PASS";

  // PM3 module C — duels page on the same match: provenance attributes, aim limits NOT_MEASURED,
  // replay deep link per duel, no SteamID64 in the DOM, unknown match NOT_FOUND.
  await page.goto(`/duels?matchId=${matchId}`);
  const duels = await pm3Status(page, "data-combat-status");
  expect(["OK", "NO_PARTICIPANT"]).toContain(duels);
  if (duels === "OK") {
    for (const k of ["crosshair_placement", "counter_strafe", "recoil_control"])
      await expect(
        page.locator(`[data-metric="${k}"][data-metric-status="NOT_MEASURED"]`),
      ).toHaveCount(1);
    await expect(page.locator("[data-provenance-method]").first()).toBeAttached();
    expect(/7656119\d{10}/.test(await page.content())).toBe(false);
    const duelLink = page.locator("[data-duel-list] [data-replay-link]").first();
    if (await duelLink.count()) {
      await duelLink.click();
      await page.waitForURL(/\/replay\?/);
      expect(await replayStatus(page)).toBe("OK");
    }
  }
  await page.goto(`/duels?matchId=${RANDOM_MATCH}`);
  expect(await pm3Status(page, "data-combat-status")).toBe("NOT_FOUND");
  steps["pm3_duels"] = `PASS ${duels}`;

  // PM3 module D — utility page on the same match.
  await page.goto(`/utility?matchId=${matchId}`);
  const utility = await pm3Status(page, "data-utility-status");
  expect(["OK", "NO_PARTICIPANT"]).toContain(utility);
  if (utility === "OK") {
    await expect(page.locator('[data-metric="utility.flashes_detonated"]')).toHaveCount(1);
    await expect(page.locator("[data-grenade]")).toHaveCount(5);
    expect(/7656119\d{10}/.test(await page.content())).toBe(false);
  }
  await page.goto(`/utility?matchId=${RANDOM_MATCH}`);
  expect(await pm3Status(page, "data-utility-status")).toBe("NOT_FOUND");
  steps["pm3_utility"] = `PASS ${utility}`;

  // PM4 modules E/F — round review on the same match: team and player sections apart, round list,
  // replay deep links per event carry the same match, no SteamID64, unknown match NOT_FOUND.
  await page.goto(`/rounds?matchId=${matchId}`);
  const roundsStatus = await pm3Status(page, "data-rounds-status");
  expect(["OK", "NO_PARTICIPANT"]).toContain(roundsStatus);
  if (roundsStatus === "OK") {
    await expect(page.locator('[data-rounds-section="team"]')).toHaveCount(1);
    await expect(page.locator('[data-rounds-section="me"]')).toHaveCount(1);
    await expect(page.locator('[data-rounds-note="COVERAGE"]')).toHaveCount(1);
    expect(await page.locator("[data-round]").count()).toBeGreaterThan(0);
    const href = await page.locator("[data-replay-link]").first().getAttribute("href");
    expect(href ?? "").toContain(matchId);
    expect(/7656119\d{10}/.test(await page.content())).toBe(false);
  }
  await page.goto(`/rounds?matchId=${RANDOM_MATCH}`);
  expect(await pm3Status(page, "data-rounds-status")).toBe("NOT_FOUND");
  steps["pm4_rounds"] = `PASS ${roundsStatus}`;

  // PM4 module G — evolution: real N, window status, every drill-down is the caller's own match.
  await page.goto("/evolution?window=5");
  expect(await pm3Status(page, "data-evolution-status")).toBe("OK");
  const windowStatus = await page
    .locator("[data-window-status]")
    .first()
    .getAttribute("data-window-status");
  expect(["COMPLETE", "PARTIAL", "INSUFFICIENT_SAMPLE"]).toContain(windowStatus);
  expect(/7656119\d{10}/.test(await page.content())).toBe(false);
  steps["pm4_evolution"] = `PASS ${windowStatus}`;

  // PM5 module J — no licensed benchmark: the card states it, without any number.
  await expect(page.locator('[data-benchmark-state="BENCHMARK_UNAVAILABLE"]')).toHaveCount(1);
  steps["pm5_benchmark"] = "PASS BENCHMARK_UNAVAILABLE";

  // PM5 module I — a bookmark on the OWN match, written under RLS with the own session (the same
  // policy the save dialog uses), listed on /moments with a replay deep link to that match.
  let momentId: string | null = null;
  if (!sink.apikey || !sink.supabaseUrl) throw new Error("supabase apikey not observed");
  const base = { url: sink.supabaseUrl, key: sink.apikey };
  const token = await sessionToken(page);
  const title = encodeURIComponent(e2eTitle(who));
  await rest(page, base, token, "DELETE", `moment_bookmarks?title=eq.${title}`);
  const created = await rest(page, base, token, "POST", "moment_bookmarks", {
    match_id: matchId,
    round_number: round,
    tick_start: Math.max(0, tick - 320),
    tick_end: tick + 192,
    kind: "DEATH",
    title: e2eTitle(who),
    source: "REPLAY",
  });
  expect(created.status).toBe(201);
  momentId = (created.first?.["id"] as string | undefined) ?? null;
  expect(momentId).toBeTruthy();
  await page.goto("/moments");
  await expect(page.locator("[data-moments-status]")).toHaveAttribute("data-moments-status", "OK");
  const momentLink = await page.locator("[data-moment-replay]").first().getAttribute("href");
  expect(momentLink ?? "").toContain(matchId);
  expect(/7656119\d{10}/.test(await page.content())).toBe(false);
  steps["pm5_moments"] = "PASS own bookmark listed with replay link";

  // PM5 module H — the training page renders its evidence state; the browser cannot write plans.
  await page.goto("/training");
  const evidence = await page
    .locator("[data-adaptive-training]")
    .getAttribute("data-evidence-state", { timeout: 30_000 });
  expect(["READY", "NO_EVIDENCE", "INSUFFICIENT_SAMPLE"]).toContain(evidence);
  const forged = await rest(page, base, token, "POST", "adaptive_training_plans", {
    horizon: 7,
    status: "COMPLETED",
  });
  expect(forged.status).toBeGreaterThanOrEqual(400);
  steps["pm5_training"] = `PASS ${evidence}; browser plan write refused (http ${forged.status})`;

  // STEAM — the identities card renders ONE derived link state per platform (the same rule as the
  // FACEIT and Steam cards), no SteamID64 reaches the DOM, and the browser can neither write Steam
  // aliases, nor call the alias RPC, nor read the Steam failure diagnostics.
  await page.goto("/profile");
  const linkStates = page.locator('[data-testid="identities-card"] [data-link-state]');
  await expect(linkStates.first()).toBeAttached({ timeout: 30_000 });
  const states = await linkStates.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-link-state") ?? ""),
  );
  const validStates = [
    "NOT_LINKED",
    "PENDING",
    "VERIFIED",
    "SYNCED",
    "SYNC_PENDING",
    "ERROR",
    "UNAVAILABLE",
  ];
  expect(states.length).toBeGreaterThanOrEqual(2);
  expect(
    states.every((s) => validStates.includes(s)),
    states.join(","),
  ).toBe(true);
  expect(/7656119\d{10}/.test(await page.content())).toBe(false);
  const aliasRpc = await rest(page, base, token, "POST", "rpc/record_steam_alias", {
    _player_id: crypto.randomUUID(),
    _nickname: "e2e",
    _steam_id: "76561198000000001",
  });
  expect(aliasRpc.status).toBeGreaterThanOrEqual(400);
  const aliasInsert = await rest(page, base, token, "POST", "player_nickname_history", {
    player_id: crypto.randomUUID(),
    nickname: "e2e",
    normalized_nickname: "e2e",
    source: "steam_profile",
  });
  expect(aliasInsert.status).toBeGreaterThanOrEqual(400);
  const failures = await rest(page, base, token, "GET", "steam_link_failures?select=id");
  expect(failures.status >= 400 || failures.rows <= 0).toBe(true);
  steps["steam_identities"] =
    `PASS states=${states.join(",")}; alias rpc ${aliasRpc.status}, alias insert ${aliasInsert.status}, diagnostics ${failures.status}`;

  if (!sink.feedback) throw new Error("feedback request was not observed");
  own[who] = {
    matchId,
    round,
    tick,
    feedback: sink.feedback,
    supabaseUrl: sink.supabaseUrl,
    apikey: sink.apikey,
    momentId,
  };
  assertNoCredentialInUrl(page, `flow_${who}`);
  steps["credential_guard"] = "PASS 0 requests with credentials in the URL";
  summary[`flow_${who}`] = steps;
  await context.close();
}

async function isolation(browser: Browser, attacker: "A" | "B", victim: "A" | "B") {
  const c = attacker === "A" ? A! : B!;
  const v = own[victim]!;
  const context = await browser.newContext();
  const page = await context.newPage();
  await armCredentialGuard(page);
  const sink = {
    feedback: null as Recorded | null,
    supabaseUrl: null as string | null,
    apikey: null as string | null,
  };
  watch(page, sink);
  const r: Record<string, string> = {};
  await login(page, c);

  // 1. The victim's match never appears in the attacker's lists.
  await page.goto("/replay");
  const listed = await page
    .locator("option")
    .evaluateAll((opts, id) => opts.some((o) => (o as HTMLOptionElement).value === id), v.matchId);
  r["1_listing"] = listed ? "FAIL victim match listed" : "PASS";

  // 2-5. Direct ids and deep links.
  await page.goto(`/replay?matchId=${v.matchId}`);
  r["2_4_replay_by_id"] = (await replayStatus(page)) === "NOT_FOUND" ? "PASS NOT_FOUND" : "FAIL";
  await page.goto(`/replay?matchId=${v.matchId}&round=${v.round}&tick=${v.tick}`);
  r["5_replay_deep_link"] = (await replayStatus(page)) === "NOT_FOUND" ? "PASS NOT_FOUND" : "FAIL";
  await page.goto(`/deaths?matchId=${v.matchId}`);
  r["3_deaths_by_id"] = (await deathsStatus(page)) === "NOT_FOUND" ? "PASS NOT_FOUND" : "FAIL";
  r["svg_not_drawn"] = (await page.locator("[data-replay-svg]").count()) === 0 ? "PASS" : "FAIL";

  // PM3: duels and utility of the victim's match, by id and by listing.
  await page.goto("/duels");
  const duelsListed = await page
    .locator("option")
    .evaluateAll((opts, id) => opts.some((o) => (o as HTMLOptionElement).value === id), v.matchId);
  r["pm3_duels_listing"] = duelsListed ? "FAIL victim match listed" : "PASS";
  await page.goto(`/duels?matchId=${v.matchId}`);
  r["pm3_duels_by_id"] =
    (await pm3Status(page, "data-combat-status")) === "NOT_FOUND" ? "PASS NOT_FOUND" : "FAIL";
  await page.goto(`/utility?matchId=${v.matchId}`);
  r["pm3_utility_by_id"] =
    (await pm3Status(page, "data-utility-status")) === "NOT_FOUND" ? "PASS NOT_FOUND" : "FAIL";
  r["pm3_no_metrics_drawn"] = (await page.locator("[data-metric]").count()) === 0 ? "PASS" : "FAIL";

  // PM4: rounds of the victim's match (listing and by id) and the evolution drill-downs.
  await page.goto("/rounds");
  const roundsListed = await page
    .locator("option")
    .evaluateAll((opts, id) => opts.some((o) => (o as HTMLOptionElement).value === id), v.matchId);
  r["pm4_rounds_listing"] = roundsListed ? "FAIL victim match listed" : "PASS";
  await page.goto(`/rounds?matchId=${v.matchId}`);
  r["pm4_rounds_by_id"] =
    (await pm3Status(page, "data-rounds-status")) === "NOT_FOUND" ? "PASS NOT_FOUND" : "FAIL";
  r["pm4_rounds_nothing_drawn"] =
    (await page.locator("[data-round]").count()) === 0 ? "PASS" : "FAIL";
  await page.goto("/evolution?window=50");
  await pm3Status(page, "data-evolution-status");
  r["pm4_evolution_no_victim_match"] = (await page.content()).includes(v.matchId) ? "FAIL" : "PASS";

  // 6, 8, 9. The victim's feedback request (their event ref) replayed with the ATTACKER's session.
  const token = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return k
      ? ((JSON.parse(localStorage.getItem(k) ?? "{}") as { access_token?: string }).access_token ??
          null)
      : null;
  });
  if (!token) throw new Error("attacker session token not found in the page");
  const fb = v.feedback!;
  const replay = await page.evaluate(
    async ({ fb, token }) => {
      const res = await fetch(fb.url, {
        method: "POST",
        headers: { ...fb.headers, authorization: `Bearer ${token}` },
        body: fb.body,
      });
      const text = await res.text();
      return {
        status: res.status,
        refused: text.includes("REFUSED"),
        saved: text.includes("SAVED"),
      };
    },
    { fb, token },
  );
  // 9. The ids are the victim's, the session is the attacker's: the server derives the owner from the
  // session (RLS on round_events), so the write must be REFUSED, never SAVED. An injected owner field is
  // rejected by the strict input schema (unit test deathReviewUi.test.tsx); it is not replayed here
  // because the server-fn body is a framework serialization that cannot be edited safely.
  r["6_8_9_feedback_with_victim_ids"] = replay.saved
    ? `FAIL saved (http ${replay.status})`
    : replay.refused || replay.status >= 400
      ? `PASS refused (http ${replay.status})`
      : `FAIL unexpected (http ${replay.status})`;

  // 7. Direct REST reads/writes under RLS with the attacker's session.
  const rest0 =
    sink.apikey && sink.supabaseUrl ? { url: sink.supabaseUrl, key: sink.apikey } : null;
  if (rest0) {
    const out = await page.evaluate(
      async ({ rest, token, v }) => {
        const h = {
          apikey: rest.key,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        };
        const get = async (q: string) => {
          const res = await fetch(`${rest.url}/rest/v1/${q}`, { headers: h });
          const body = (await res.json().catch(() => null)) as unknown;
          return { status: res.status, rows: Array.isArray(body) ? body.length : -1 };
        };
        const m = v.matchId;
        const reads = {
          round_trajectories: await get(`round_trajectories?select=round_number&match_id=eq.${m}`),
          match_trajectories: await get(`match_trajectories?select=status&match_id=eq.${m}`),
          round_events: await get(`round_events?select=id&match_id=eq.${m}&limit=5`),
          death_feedback: await get(`death_feedback?select=id&match_id=eq.${m}`),
          match_metrics: await get(`match_metrics?select=match_id&match_id=eq.${m}`),
        };
        const ins = await fetch(`${rest.url}/rest/v1/death_feedback`, {
          method: "POST",
          headers: { ...h, prefer: "return=minimal" },
          body: JSON.stringify({
            match_id: m,
            round_number: v.round,
            death_tick: v.tick,
            verdict: "USEFUL",
            rules_version: "cs2.death-rules.v1",
          }),
        });
        const upd = await fetch(`${rest.url}/rest/v1/death_feedback?match_id=eq.${m}`, {
          method: "PATCH",
          headers: { ...h, prefer: "return=representation" },
          body: JSON.stringify({ verdict: "INCORRECT" }),
        });
        const updBody = (await upd.json().catch(() => null)) as unknown;
        return {
          reads,
          insert: ins.status,
          update: { status: upd.status, rows: Array.isArray(updBody) ? updBody.length : -1 },
        };
      },
      { rest: rest0, token, v: { matchId: v.matchId, round: v.round, tick: v.tick } },
    );
    const leaked = Object.entries(out.reads)
      .filter(([, x]) => x.rows > 0)
      .map(([k]) => k);
    r["7_rest_reads_under_rls"] = leaked.length
      ? `FAIL leaked=${leaked.join(",")}`
      : "PASS 0 rows on 5 tables";
    r["8_rest_insert_foreign_feedback"] =
      out.insert >= 400 ? `PASS refused (http ${out.insert})` : `FAIL http ${out.insert}`;
    r["8_rest_update_foreign_feedback"] =
      out.update.rows <= 0 ? `PASS 0 rows (http ${out.update.status})` : "FAIL rows updated";
  } else {
    r["7_rest"] = "NOT_RUN supabase apikey not observed";
  }

  // PM5 — the victim's bookmark and training plan through REST with the attacker's session, and
  // the attacker's /moments page.
  if (rest0) {
    const m = v.momentId!;
    const readMoment = await rest(
      page,
      rest0,
      token,
      "GET",
      `moment_bookmarks?select=id&id=eq.${m}`,
    );
    const readByMatch = await rest(
      page,
      rest0,
      token,
      "GET",
      `moment_bookmarks?select=id&match_id=eq.${v.matchId}`,
    );
    const insertOnVictim = await rest(page, rest0, token, "POST", "moment_bookmarks", {
      match_id: v.matchId,
      tick_start: 0,
      tick_end: 64,
      kind: "TICK_RANGE",
      title: "x",
    });
    const patch = await rest(page, rest0, token, "PATCH", `moment_bookmarks?id=eq.${m}`, {
      title: "hijacked",
    });
    const del = await rest(page, rest0, token, "DELETE", `moment_bookmarks?id=eq.${m}`);
    const sub = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as {
      sub: string;
    };
    const plans = await rest(page, rest0, token, "GET", "adaptive_training_plans?select=user_id");
    const foreignPlans = await rest(
      page,
      rest0,
      token,
      "GET",
      `adaptive_training_plans?select=id&user_id=neq.${sub.sub}`,
    );
    r["pm5_rest_moment_read"] =
      readMoment.rows === 0 && readByMatch.rows === 0 ? "PASS 0 rows" : "FAIL victim bookmark read";
    r["pm5_rest_moment_insert_on_victim_match"] =
      insertOnVictim.status >= 400
        ? `PASS refused (http ${insertOnVictim.status})`
        : "FAIL inserted";
    r["pm5_rest_moment_update"] = patch.rows <= 0 ? "PASS 0 rows" : "FAIL updated";
    r["pm5_rest_moment_delete"] = del.rows <= 0 ? "PASS 0 rows" : "FAIL deleted";
    r["pm5_rest_training_plans"] =
      plans.status < 400 && foreignPlans.rows === 0
        ? "PASS own rows only"
        : "FAIL foreign plan read";
    await page.goto("/moments");
    await page.locator("[data-moments-status]").waitFor({ timeout: 30_000 });
    const html = await page.content();
    r["pm5_moments_page"] =
      html.includes(m) || html.includes(e2eTitle(victim)) ? "FAIL victim moment shown" : "PASS";
  }

  // 10. Client cache isolation inside ONE single-page session: the victim signs in and opens their replay
  // (filling the query cache), signs out with the app's button, the attacker signs in WITHOUT a reload and
  // opens the replay page in-app. The victim's match must not be listed or drawn from the cache.
  await logout(page);
  await login(page, victim === "A" ? A! : B!, false);
  await openReplayInApp(page);
  await page.locator("select").first().selectOption(v.matchId);
  expect(await replayStatus(page)).toBe("OK");
  await logout(page);
  await login(page, c, false);
  await openReplayInApp(page);
  const cached = await page
    .locator("option")
    .evaluateAll((opts, id) => opts.some((o) => (o as HTMLOptionElement).value === id), v.matchId);
  const selected = await page.locator("select").first().inputValue();
  r["10_cache_isolation_spa"] =
    !cached && selected !== v.matchId ? "PASS victim match absent after in-app re-login" : "FAIL";

  assertNoCredentialInUrl(page, `isolation_${attacker}_to_${victim}`);
  r["credential_guard"] = "PASS 0 requests with credentials in the URL";
  summary[`isolation_${attacker}_to_${victim}`] = r;
  await context.close();
  const failed = Object.entries(r).filter(([, x]) => x.startsWith("FAIL"));
  expect(failed, JSON.stringify(failed)).toEqual([]);
}

test("account A: own flow", async ({ browser }) => {
  await ownFlow(browser, "A", A!);
});

test("account B: own flow", async ({ browser }) => {
  await ownFlow(browser, "B", B!);
});

test("isolation A → B", async ({ browser }) => {
  test.skip(!own.B, "account B flow did not complete");
  await isolation(browser, "A", "B");
});

test("isolation B → A", async ({ browser }) => {
  test.skip(!own.A, "account A flow did not complete");
  await isolation(browser, "B", "A");
});

test.afterAll(() => {
  summary["finishedAt"] = new Date().toISOString();
  const path = process.env["E2E_SUMMARY_PATH"];
  if (path) writeFileSync(path, JSON.stringify(summary, null, 2));
});
