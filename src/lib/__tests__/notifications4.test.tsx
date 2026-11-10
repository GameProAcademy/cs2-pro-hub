/**
 * Fase 4 — notification events (real, persisted sources only), evolution with sample and
 * noise rules, goals (null is never zero), input validation, server wiring (identity from the
 * session, writes only through the atomic ingestion), UI texts and 5 locales.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { notifyPtBR } from "@/i18n/locales/notify/pt-BR";
import {
  buildNotificationEvents,
  evolutionOf,
  goalProgress,
  isoWeek,
  metricValue,
  type Goal,
  type JobRow,
  type MatchPoint,
} from "@/lib/notifications/notificationEvents";
import {
  cursorFrom,
  goalInputFrom,
  listInputFrom,
  markInputFrom,
  prefsInputFrom,
} from "@/lib/notifications/notifications.functions";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { PreferencesForm, notificationText } =
  await import("@/components/notifications/NotificationComponents");
const { GoalForm } = await import("@/components/notifications/GoalsPanel");

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const NOW = new Date("2026-11-05T12:00:00Z"); // a Thursday
const read = (p: string) => readFileSync(resolve(p), "utf8");
const render = (node: React.ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );

const job = (over: Partial<JobRow>): JobRow => ({
  id: "j1",
  status: "processed",
  match_id: "m1",
  finished_at: "2026-11-04T10:00:00Z",
  updated_at: "2026-11-04T10:00:00Z",
  superseded_by_job_id: null,
  identity_status: "resolved",
  attachment_state: "attached",
  error_code: null,
  ...over,
});
let seq = 0;
const match = (over: Partial<MatchPoint>): MatchPoint => ({
  matchId: `m${++seq}`,
  map: "de_nuke",
  playedAt: `2026-10-${String(10 + seq).padStart(2, "0")}T00:00:00Z`,
  kills: 20,
  deaths: 15,
  adr: 80,
  kast: 70,
  hsPercent: 40,
  rating: 1,
  firstKills: 3,
  firstDeaths: 2,
  ...over,
});
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g1",
  playerId: "p1",
  metric: "adr",
  direction: "AT_LEAST",
  target: 80,
  windowMatches: 3,
  deadline: null,
  reminder: "OFF",
  reminderWeekday: null,
  ...over,
});

describe("A/B. demo triggers come only from final, persisted states", () => {
  const m1 = match({ matchId: "m1" });
  const build = (jobs: JobRow[], matches = [m1]) =>
    buildNotificationEvents({ now: NOW, jobs, matches, goals: [] });

  it("a processed, attached, resolved job whose match has metrics → one analysis_ready", () => {
    const evs = build([job({})]);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      type: "analysis_ready",
      version: 1,
      category: "analysis_ready",
      idempotency_key: "demo_job:j1:processed",
      link: "/analysis",
      params: { map: "de_nuke" },
    });
  });

  it("never for superseded attempts, unresolved identity, unattached, missing metrics, old or held jobs", () => {
    expect(build([job({ superseded_by_job_id: "j2" })])).toEqual([]);
    expect(build([job({ identity_status: "unresolved" })])).toEqual([]);
    expect(build([job({ attachment_state: "unattached" })])).toEqual([]);
    expect(build([job({})], [])).toEqual([]); // match not in the player's metrics
    expect(
      build([job({ finished_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" })]),
    ).toEqual([]);
    expect(build([job({ status: "blocked_raw_audit" })])).toEqual([]);
    expect(build([job({ status: "processing" })])).toEqual([]);
  });

  it("a final failure (not superseded) → one demo_failed; a retried one → nothing", () => {
    expect(
      build([job({ status: "failed", match_id: null, error_code: "PARSE_TIMEOUT" })]),
    ).toMatchObject([
      {
        type: "demo_failed",
        category: "demo_processing",
        idempotency_key: "demo_job:j1:failed",
        link: "/upload",
      },
    ]);
    expect(build([job({ status: "failed", superseded_by_job_id: "j9" })])).toEqual([]);
  });

  it("the same input always yields the same idempotency keys (dedup across syncs)", () => {
    expect(build([job({})]).map((e) => e.idempotency_key)).toEqual(
      build([job({})]).map((e) => e.idempotency_key),
    );
  });
});

describe("C. evolution needs equivalent windows, full samples and more than noise", () => {
  const series = (values: Array<number | null>) => {
    seq = 0;
    return values.map((rating) => match({ rating }));
  };

  it("insufficient sample (fewer than 2×5 matches) → no claim", () => {
    expect(evolutionOf(series([1, 1, 1, 1, 1, 2, 2, 2, 2]), "rating")).toBeNull();
  });

  it("a null in either window → no claim (null is not zero)", () => {
    expect(evolutionOf(series([1, 1, 1, null, 1, 2, 2, 2, 2, 2]), "rating")).toBeNull();
  });

  it("a difference within noise → no claim", () => {
    expect(
      evolutionOf(series([0.6, 1.4, 0.7, 1.3, 1.0, 1.4, 0.7, 1.3, 0.8, 1.1]), "rating"),
    ).toBeNull();
  });

  it("a clear difference → UP with explicit windows and period", () => {
    const evo = evolutionOf(
      series([0.8, 0.85, 0.9, 0.82, 0.88, 1.2, 1.25, 1.18, 1.22, 1.3]),
      "rating",
    )!;
    expect(evo.direction).toBe("UP");
    expect(evo.window).toBe(5);
    expect(evo.previous).toBeCloseTo(0.85, 2);
    expect(evo.recent).toBeCloseTo(1.23, 2);
  });
});

describe("D/F. goals and achievements", () => {
  it("progress uses only matches where the metric was measured", () => {
    seq = 0;
    const ms = [match({ adr: 90 }), match({ adr: null }), match({ adr: 70 })];
    expect(goalProgress(goal(), ms)).toMatchObject({
      status: "INSUFFICIENT_SAMPLE",
      sample: 2,
      value: 80,
    });
    expect(goalProgress(goal(), [])).toMatchObject({ status: "NO_DATA", value: null, sample: 0 });
  });

  it("derived metrics are null (never 0) when their inputs are missing", () => {
    expect(metricValue(match({ deaths: 0 }), "kd")).toBeNull();
    expect(metricValue(match({ firstKills: null }), "openingSuccess")).toBeNull();
    expect(metricValue(match({ firstKills: 0, firstDeaths: 0 }), "openingSuccess")).toBeNull();
    expect(metricValue(match({ firstKills: 3, firstDeaths: 1 }), "openingSuccess")).toBe(75);
  });

  it("a reached goal produces one event with its achievement; not reached → none", () => {
    seq = 0;
    const ms = [match({ adr: 85 }), match({ adr: 82 }), match({ adr: 90 })];
    const evs = buildNotificationEvents({ now: NOW, jobs: [], matches: ms, goals: [goal()] });
    expect(evs).toHaveLength(1);
    expect(evs[0]!.achievement).toMatchObject({
      dedupe_key: "adr:AT_LEAST:80:3",
      sample_matches: 3,
      window_matches: 3,
    });
    expect(
      buildNotificationEvents({ now: NOW, jobs: [], matches: ms, goals: [goal({ target: 95 })] }),
    ).toEqual([]);
  });

  it("weekly reminders only on the chosen weekday, once per ISO week, never once reached", () => {
    seq = 0;
    const ms = [match({ adr: 60 }), match({ adr: 60 }), match({ adr: 60 })];
    const thursday = goal({ reminder: "WEEKLY", reminderWeekday: 4 });
    const evs = buildNotificationEvents({ now: NOW, jobs: [], matches: ms, goals: [thursday] });
    expect(evs).toMatchObject([
      { type: "goal_reminder", idempotency_key: `goal_reminder:g1:${isoWeek(NOW)}` },
    ]);
    expect(
      buildNotificationEvents({
        now: NOW,
        jobs: [],
        matches: ms,
        goals: [goal({ reminder: "WEEKLY", reminderWeekday: 1 })],
      }),
    ).toEqual([]);
    expect(isoWeek(new Date("2026-11-05T00:00:00Z"))).toBe("2026-W45");
  });

  it("a burst of sources never produces more than 50 events per sync", () => {
    const jobs = Array.from({ length: 80 }, (_, i) =>
      job({ id: `j${i}`, status: "failed", match_id: null }),
    );
    expect(buildNotificationEvents({ now: NOW, jobs, matches: [], goals: [] })).toHaveLength(50);
  });
});

describe("input validation (nothing about identity comes from the client)", () => {
  it("cursor, list, mark, preferences and goals accept only well-formed input", () => {
    expect(cursorFrom("2026-11-05T00:00:00Z|8f1c2d3e-0000-4000-8000-000000000001")).not.toBeNull();
    expect(cursorFrom("x|y")).toBeNull();
    // Fase 4.1 (intentional): the reader's locale picks the campaign text (default pt-BR);
    // the identity still never comes from the client (userId ignored).
    expect(listInputFrom({ category: "evolution", userId: "someone" })).toEqual({
      category: "evolution",
      locale: "pt-BR",
      cursor: null,
      unreadOnly: false,
    });
    expect(markInputFrom({ all: true, read: true })).toEqual({ ok: true, ids: "ALL", read: true });
    expect(markInputFrom({ ids: ["x"], read: true })).toEqual({ ok: false });
    expect(
      markInputFrom({ ids: Array(101).fill("8f1c2d3e-0000-4000-8000-000000000001"), read: true }),
    ).toEqual({ ok: false });
    const cats = {
      demo_processing: true,
      analysis_ready: true,
      evolution: false,
      training: true,
      coach: true,
      operational: true,
    };
    expect(prefsInputFrom({ categories: cats, pauseHours: 24, maxPerDay: 10 })).toMatchObject({
      ok: true,
      pauseHours: 24,
    });
    expect(
      prefsInputFrom({
        categories: { ...cats, account_security: false },
        pauseHours: 5,
        maxPerDay: 10,
      }),
    ).toEqual({ ok: false });
    expect(prefsInputFrom({ categories: cats, pauseHours: null, maxPerDay: 99 })).toEqual({
      ok: false,
    });
    expect(
      goalInputFrom({ metric: "adr", direction: "AT_LEAST", target: 80, windowMatches: 5 }),
    ).toMatchObject({ ok: true, reminder: "OFF" });
    expect(
      goalInputFrom({
        metric: "adr",
        direction: "AT_LEAST",
        target: 80,
        windowMatches: 5,
        reminder: "WEEKLY",
      }),
    ).toEqual({ ok: false });
    expect(
      goalInputFrom({ metric: "elo", direction: "AT_LEAST", target: 80, windowMatches: 5 }),
    ).toEqual({ ok: false });
    expect(
      goalInputFrom({ metric: "adr", direction: "AT_LEAST", target: 80, windowMatches: 50 }),
    ).toEqual({ ok: false });
  });
});

describe("server wiring", () => {
  const src = read("src/lib/notifications/notifications.functions.ts");
  const sql = read("supabase/migrations/20261105120000_notifications_goals.sql");

  it("every server function is authenticated; identity comes from the session", () => {
    const fns = [...src.matchAll(/export const (\w+) = createServerFn/g)].map((m) => m[1]);
    expect(fns).toHaveLength(9);
    expect((src.match(/\.middleware\(\[requireSupabaseAuth\]\)/g) ?? []).length).toBe(9);
    expect(src).not.toMatch(/data\.(userId|user_id|playerId|player_id)/);
    expect(src).toContain("p_user_id: context.userId");
  });

  it("events, notifications and achievements are written only by the atomic ingestion", () => {
    expect(src).not.toMatch(
      /from\("(notifications|notification_events|player_achievements)"\)\s*\.(insert|upsert)/,
    );
    expect(src).toMatch(/\.rpc\(\s*"notification_ingest"/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.notification_ingest\(uuid, jsonb\) TO service_role;/,
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.notification_ingest(uuid, jsonb) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain("GRANT UPDATE (read_at) ON public.notifications TO authenticated;");
  });

  it("external channels stay off; pagination is keyset (no duplicates or gaps)", () => {
    expect(src).toContain("email_enabled: false");
    expect(sql).toMatch(/email_enabled boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/marketing_consent boolean NOT NULL DEFAULT false/);
    expect(src).toMatch(
      /created_at\.lt\.\$\{data\.cursor\.at\},and\(created_at\.eq\.\$\{data\.cursor\.at\},id\.lt\.\$\{data\.cursor\.id\}\)/,
    );
  });

  it("links are internal; the destination routes are authenticated", () => {
    expect(sql).toContain("CHECK (link ~ '^/[a-z0-9/_-]{1,60}$')");
    for (const route of ["analysis", "upload", "performance", "goals", "notifications"])
      expect(read(`src/routes/_authenticated/${route}.tsx`)).toContain(
        `createFileRoute("/_authenticated/${route}")`,
      );
  });
});

describe("UI texts in 5 locales", () => {
  const n = (type: string, params: Record<string, string | number> = {}) => ({
    id: "x",
    category: "evolution" as const,
    type,
    params,
    link: "/performance",
    createdAt: "2026-11-05T00:00:00Z",
    readAt: null,
  });

  it("every notification type renders a title and body in every locale", () => {
    for (const l of LOCALES) {
      const dict = dictionaries[l] as Record<string, string>;
      const t = (k: string) => dict[k] ?? k;
      for (const [type, params] of [
        ["analysis_ready", { map: "de_nuke" }],
        ["demo_failed", {}],
        [
          "evolution",
          { metric: "rating", direction: "UP", previous: 0.85, recent: 1.23, window: 5 },
        ],
        ["goal_reached", { metric: "adr", target: 80, value: 85.67, window: 3 }],
        ["goal_reminder", { metric: "kast", target: 70 }],
      ] as const) {
        const text = notificationText(n(type, params), t as never);
        expect(text.title, `${l}:${type}`).not.toMatch(/notify\.|\{\w+\}/);
        expect(text.body, `${l}:${type}`).not.toMatch(/notify\.|\{\w+\}/);
      }
    }
  });

  it("preferences: security is locked on, email is off without presumed consent", () => {
    const html = render(
      <PreferencesForm
        initial={{
          available: true,
          categories: {
            demo_processing: true,
            analysis_ready: true,
            evolution: true,
            training: true,
            coach: true,
            operational: true,
            announcements: true,
          },
          pausedUntil: null,
          maxPerDay: 10,
          emailEnabled: false,
          marketingConsent: false,
        }}
      />,
    );
    expect(html).toMatch(
      /<input type="checkbox"[^>]*disabled=""[^>]*aria-describedby="security-locked"/,
    );
    expect(html).toContain("nenhum consentimento é presumido");
    // Fase 4.1 (intentional): + "announcements" switch and the explicit, unchecked marketing
    // opt-in (6 + 1 + security + marketing = 9).
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(9);
    expect(html).toMatch(
      /<input type="checkbox" class="mt-1"(?![^>]*checked)[^>]*data-marketing-consent/,
    );
  });

  it("the goal form offers only catalogued metrics", () => {
    const html = render(
      <GoalForm
        draft={{
          id: null,
          metric: "adr",
          direction: "AT_LEAST",
          target: "",
          windowMatches: 5,
          deadline: "",
          reminder: "OFF",
          reminderWeekday: 1,
        }}
        onDone={() => {}}
      />,
      "en",
    );
    for (const m of ["rating", "adr", "kast", "hsPercent", "kd", "openingSuccess"])
      expect(html).toContain(`value="${m}"`);
  });

  it("every Fase 4 key exists in the 5 locales with the same placeholders", () => {
    for (const l of LOCALES) {
      const dict = dictionaries[l] as Record<string, string>;
      for (const [key, pt] of Object.entries(notifyPtBR)) {
        expect(dict[key]?.trim().length, `${l}:${key}`).toBeGreaterThan(0);
        const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
        expect(vars(dict[key]!), `${l}:${key}`).toEqual(vars(pt));
      }
    }
  });
});
