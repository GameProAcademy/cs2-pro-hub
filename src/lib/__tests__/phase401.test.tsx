/**
 * Fase 4.0.1 — per-match flash-assist provenance (how the count was obtained, never mixed
 * silently, never null → 0), Steam account & security notifications (committed links only,
 * deduplicated), unread counter plural forms in 5 locales, and the wiring that keeps the
 * ingestion best-effort and history untouched.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { dictionaries, type Locale } from "@/i18n/config";
import type { TranslationKey } from "@/i18n";
import {
  buildNotificationEvents,
  type ConnectionRow,
} from "@/lib/notifications/notificationEvents";
import {
  computeMetrics,
  flashAssistProvenance,
  FLASH_PROVENANCE_VERSION,
} from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserOutput } from "@/lib/pipeline/types";
import { buildCoachFacts, coachSystemPrompt } from "@/lib/coach/coachContext";
import type { RealPlayerDna } from "@/lib/playerDna";
import { aggregate, type OverviewMatch, type PlayerOverview } from "@/lib/playerOverview";

import { ENEMY_A, ENEMY_B, MATE, ME, syntheticParserOutput } from "../pipeline/__tests__/fixture";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { unreadLabel, notificationText } =
  await import("@/components/notifications/NotificationComponents");

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const tFor = (locale: Locale) => (key: TranslationKey) =>
  (dictionaries[locale] as Record<string, string>)[key] ?? key;

// ------------------------------------------------------------------ flash provenance
const round = {
  number: 1,
  winner_side: "CT",
  start_tick: 0,
  end_tick: 5000,
  duration_seconds: 60,
  sides: { [ME]: "CT", [MATE]: "CT", [ENEMY_A]: "T", [ENEMY_B]: "T" },
} as unknown as RawParserOutput["rounds"][number];
const build = (events: unknown[]) =>
  normalizeParserOutput({
    ...syntheticParserOutput,
    rounds: [round],
    events: events as RawParserOutput["events"],
  });
const blind = (t: number | undefined, victim = ENEMY_A) => ({
  type: "player_blind",
  round: 1,
  ...(t === undefined ? {} : { time_seconds: t }),
  attacker: MATE,
  victim,
});
const death = (t: number, victim: string, extra: Record<string, unknown> = {}) => ({
  type: "player_death",
  round: 1,
  time_seconds: t,
  attacker: ME,
  victim,
  ...extra,
});
const provenanceOf = (events: unknown[], who = MATE) => {
  const match = build(events);
  const metrics = computeMetrics(match, who);
  return { metrics, provenance: flashAssistProvenance(match, who, metrics) };
};

describe("flash-assist provenance per match", () => {
  it("temporal attribution only → TIMED_ATTRIBUTION, counts add up to the metric", () => {
    const { metrics, provenance } = provenanceOf([blind(10), death(11, ENEMY_A)]);
    expect(provenance).toMatchObject({
      version: FLASH_PROVENANCE_VERSION,
      method: "TIMED_ATTRIBUTION",
      credited: 1,
      creditedByFlag: 0,
      creditedByTiming: 1,
    });
    expect(provenance.credited).toBe(metrics.flashAssists);
  });

  it("every kill carries the game's own flag → GAME_FLAG", () => {
    const { metrics, provenance } = provenanceOf([
      blind(10),
      death(11, ENEMY_A, { assister: MATE, assisted_flash: true }),
      death(12, ENEMY_B, { assisted_flash: false }),
    ]);
    expect(provenance.method).toBe("GAME_FLAG");
    expect(provenance).toMatchObject({ credited: 1, creditedByFlag: 1, creditedByTiming: 0 });
    expect(provenance.credited).toBe(metrics.flashAssists);
  });

  it("flag on some kills, timing on others → MIXED, never silently one or the other", () => {
    const { metrics, provenance } = provenanceOf([
      blind(10),
      blind(10, ENEMY_B),
      death(11, ENEMY_A, { assister: MATE, assisted_flash: true }),
      death(12, ENEMY_B),
    ]);
    expect(provenance.method).toBe("MIXED");
    expect(provenance).toMatchObject({ credited: 2, creditedByFlag: 1, creditedByTiming: 1 });
    expect(provenance.credited).toBe(metrics.flashAssists);
  });

  it("a flag of false is respected: the temporal rule does not override the game", () => {
    const { provenance } = provenanceOf([blind(10), death(11, ENEMY_A, { assisted_flash: false })]);
    expect(provenance).toMatchObject({ method: "GAME_FLAG", credited: 0, creditedByTiming: 0 });
  });

  it("unmeasured flash assists stay NOT_MEASURED with null counts, never 0", () => {
    const match = build([blind(10), death(11, ENEMY_A)]);
    const provenance = flashAssistProvenance(match, MATE, { flashAssists: null });
    expect(provenance).toEqual({
      version: FLASH_PROVENANCE_VERSION,
      method: "NOT_MEASURED",
      credited: null,
      creditedByFlag: null,
      creditedByTiming: null,
      unattributedCandidates: null,
    });
  });

  it("a flash with no instant is an undecidable candidate, not a credited assist", () => {
    const { provenance } = provenanceOf([blind(undefined), death(11, ENEMY_A)]);
    expect(provenance.credited).toBe(0);
    expect(provenance.unattributedCandidates).toBe(1);
  });

  it("the killer's own flash is never a candidate for the killer", () => {
    const { provenance } = provenanceOf(
      [{ ...blind(undefined), attacker: ME }, death(11, ENEMY_A)],
      ME,
    );
    expect(provenance.unattributedCandidates).toBe(0);
  });
});

// ------------------------------------------------------------------ Steam notifications
const NOW = new Date("2026-11-05T12:00:00Z");
const conn = (over: Partial<ConnectionRow>): ConnectionRow => ({
  id: "11111111-2222-3333-4444-555555555555",
  source: "steam",
  status: "connected",
  connected_at: "2026-11-04T10:00:00Z",
  disconnected_at: null,
  ...over,
});
const steamEvents = (connections: ConnectionRow[]) =>
  buildNotificationEvents({ now: NOW, jobs: [], matches: [], goals: [], connections }).filter(
    (e) => e.category === "account_security",
  );

describe("Steam account & security notifications", () => {
  it("a committed link → one essential steam_linked event, keyed by the connection", () => {
    const [e, ...rest] = steamEvents([conn({})]);
    expect(rest).toEqual([]);
    expect(e).toMatchObject({
      type: "steam_linked",
      category: "account_security",
      source: "player_connections",
      link: "/profile",
      occurred_at: "2026-11-04T10:00:00Z",
    });
    expect(e!.idempotency_key).toBe(
      `steam_linked:${conn({}).id}:${Date.parse("2026-11-04T10:00:00Z")}`,
    );
    expect(JSON.stringify(e)).not.toMatch(/7656119/); // no Steam id in payload or params
  });

  it("a committed unlink → steam_unlinked", () => {
    const [e] = steamEvents([
      conn({ status: "disconnected", disconnected_at: "2026-11-05T09:00:00Z" }),
    ]);
    expect(e?.type).toBe("steam_unlinked");
  });

  it("pending, expired, error, missing timestamp, other sources or old events → nothing", () => {
    expect(
      steamEvents([
        conn({ status: "pending" }),
        conn({ status: "expired" }),
        conn({ status: "error" }),
        conn({ status: "connected", connected_at: null }),
        conn({ status: "disconnected", disconnected_at: null }),
        conn({ source: "faceit" }),
        conn({ connected_at: "2026-09-01T00:00:00Z" }),
      ]),
    ).toEqual([]);
  });

  it("re-running the sync yields the same keys (deduplicated by the ingestion); a re-link is new", () => {
    const a = steamEvents([conn({})]).map((e) => e.idempotency_key);
    const b = steamEvents([conn({})]).map((e) => e.idempotency_key);
    expect(a).toEqual(b);
    const relink = steamEvents([conn({ connected_at: "2026-11-05T11:00:00Z" })]);
    expect(relink[0]!.idempotency_key).not.toBe(a[0]);
  });

  it("titles and bodies exist in all 5 locales", () => {
    for (const locale of LOCALES) {
      const t = tFor(locale);
      for (const type of ["steam_linked", "steam_unlinked"]) {
        const text = notificationText({ type, params: {} } as never, t as never);
        expect(JSON.stringify(text)).not.toMatch(/notify\.type\./);
      }
    }
  });
});

// ------------------------------------------------------------------ plural
describe("unread counter plural forms", () => {
  const expected: Record<Locale, [string, string, string]> = {
    "pt-BR": ["1 não lida", "2 não lidas", "10 não lidas"],
    "pt-PT": ["1 por ler", "2 por ler", "10 por ler"],
    en: ["1 unread", "2 unread", "10 unread"],
    es: ["1 sin leer", "2 sin leer", "10 sin leer"],
    fr: ["1 non lue", "2 non lues", "10 non lues"],
  };
  it.each(LOCALES)("%s uses the locale's plural rules", (locale) => {
    const t = tFor(locale);
    expect([1, 2, 10].map((n) => unreadLabel(n, locale, t as never))).toEqual(expected[locale]);
  });

  it("the old singular-only key is gone and the bell no longer interpolates by hand", () => {
    for (const locale of LOCALES)
      expect(Object.keys(dictionaries[locale])).not.toContain("notify.bell.unread");
    const src = read("src/components/notifications/NotificationComponents.tsx");
    expect(src).toContain("unreadLabel(unread, locale, t)");
    expect(src).toContain("Intl.PluralRules");
  });
});

// ------------------------------------------------------------------ wiring
describe("4.0.1 wiring", () => {
  it("provenance is written best-effort after the canonical projection, never blocking it", () => {
    const src = read("src/lib/pipeline/persistence.server.ts");
    const rpc = src.indexOf("persist_demo_projection");
    const prov = src.indexOf("match_flash_assist_provenance");
    expect(rpc).toBeGreaterThan(-1);
    expect(prov).toBeGreaterThan(rpc);
    expect(src).toContain("flash_provenance_not_recorded");
  });

  it("matches without a provenance row read as NOT_RECORDED (no backfill, no guess)", () => {
    const src = read("src/lib/playerData.functions.ts");
    expect(src).toContain('?? "NOT_RECORDED"');
  });

  it("every flash method has a label in all 5 locales", () => {
    for (const locale of LOCALES)
      for (const m of ["GAME_FLAG", "TIMED_ATTRIBUTION", "MIXED", "NOT_MEASURED", "NOT_RECORDED"])
        expect(dictionaries[locale]).toHaveProperty(`flash.method.${m}`);
  });

  it("retention is scheduled through the existing pg_cron, not a new service", () => {
    const sql = read("supabase/migrations/20261106100000_phase401_retention_flash.sql");
    expect(sql).toMatch(/cron\.schedule\(\s*'notification-retention'/);
    expect(sql).toContain("pg_try_advisory_xact_lock");
  });
});

// ------------------------------------------------------------------ Coach
describe("Coach reads the per-match method", () => {
  const base = (id: string, over: Partial<OverviewMatch>): OverviewMatch =>
    ({
      matchId: id,
      map: "de_nuke",
      playedAt: "2026-11-03T05:35:03Z",
      dateSource: "processed",
      resultStatus: "UNRESOLVED_BY_DEMO",
      result: null,
      scorePlayer: null,
      scoreOpponent: null,
      source: "demo",
      kills: 18,
      deaths: 10,
      assists: 4,
      adr: 90,
      kast: 70,
      hsPercent: 30,
      rating: 1.0,
      firstKills: 2,
      firstDeaths: 1,
      tradeKills: 2,
      flashAssists: 2,
      utilityDamage: 30,
      clutchAttempts: 1,
      clutchWins: 0,
      ctRating: 1,
      tRating: 1,
      roundsPlayed: 20,
      admission: "LIMITED",
      limitations: [],
      ...over,
    }) as OverviewMatch;
  const facts = (matches: OverviewMatch[]) =>
    buildCoachFacts(
      {
        state: "READY",
        generatedAt: "2026-11-04T00:00:00Z",
        counts: {
          total: 0,
          inFlight: 0,
          processed: 0,
          failed: 0,
          blocked: 0,
          cancelled: 0,
          identityPending: 0,
        },
        latestJobs: [],
        matches,
        aggregates: aggregate(matches),
      } as PlayerOverview,
      {
        state: "INSUFFICIENT_SAMPLE",
        matches: matches.length,
        rounds: 40,
        partialMatches: 0,
        minimumMatches: 3,
        dimensions: [],
      } as RealPlayerDna,
      "pt-BR",
    ).observations.find((o) => o.metric === "flashAssists")!;

  it("all matches counted by the game's flag → OBSERVED / GAME_FLAG", () => {
    const fa = facts([
      base("a", { flashAssistMethod: "GAME_FLAG" }),
      base("b", { flashAssistMethod: "GAME_FLAG" }),
    ]);
    expect(fa).toMatchObject({
      status: "OBSERVED",
      provenance: "GAME_FLAG",
      methods: { GAME_FLAG: 2 },
    });
  });

  it("any timed / mixed / unrecorded match keeps it DERIVED and names the methods", () => {
    const fa = facts([
      base("a", { flashAssistMethod: "GAME_FLAG" }),
      base("b", { flashAssistMethod: "TIMED_ATTRIBUTION" }),
      base("c", {}),
    ]);
    expect(fa.status).toBe("DERIVED");
    expect(fa.provenance).toBe("GAME_FLAG_OR_TIMED_ATTRIBUTION");
    expect(fa.methods).toEqual({ GAME_FLAG: 1, TIMED_ATTRIBUTION: 1, NOT_RECORDED: 1 });
  });

  it("unmeasured matches are not counted as a method (same basis as the dashboard)", () => {
    const fa = facts([
      base("a", { flashAssistMethod: "GAME_FLAG" }),
      base("b", { flashAssists: null, flashAssistMethod: "NOT_MEASURED" }),
    ]);
    expect(fa.methods).toEqual({ GAME_FLAG: 1 });
    expect(fa.provenance).toBe("GAME_FLAG");
  });

  it("the prompt tells the Coach how to speak about each case", () => {
    const prompt = coachSystemPrompt("en");
    expect(prompt).toContain("If provenance is GAME_FLAG");
    expect(prompt).toContain("NOT_RECORDED");
    expect(prompt).toContain(
      "never conclude from a 0 that the player does not flash for teammates",
    );
  });
});
