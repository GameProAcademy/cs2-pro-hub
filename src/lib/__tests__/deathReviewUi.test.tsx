/**
 * PM2 / 4.2.3 — death review page states (static render, every locale): empty, NOT_FOUND (IDOR),
 * no participant, special death without rule conclusions, the four sections with provenance,
 * NOT_MEASURED never shown as zero, positions only on a VALIDATED map; plus the pure server
 * helpers (row mapping, integrity reference, radar points).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/config";
import { buildDeathContexts, type DeathContextInput } from "@/lib/diagnosis/deathContext";
import { evaluateDeathRules } from "@/lib/diagnosis/deathRules";
import { MAP_OVERVIEWS } from "@/lib/spatial/maps";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: ReactNode }) => <a>{children}</a> };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { DeathReviewBody } = await import("@/components/real/RealDeathReview");
const { deathFeedbackInput, feedbackByEvent, integrityRef, radarFor, toKillEventRow } =
  await import("@/lib/diagnosis.functions");
type Resp = import("@/lib/diagnosis.functions").DeathReviewResponse;

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );

const dust2 = MAP_OVERVIEWS["de_dust2"]!;
const world = (rx: number, ry: number) => ({
  x: rx * dust2.scale + dust2.posX,
  y: dust2.posY - ry * dust2.scale,
  z: 0,
});
const ME = "p-me";
const roster = [
  { roundNumber: 1, participantKey: ME, side: "CT" as const },
  { roundNumber: 1, participantKey: "p-m1", side: "CT" as const },
  { roundNumber: 1, participantKey: "p-o1", side: "T" as const },
  { roundNumber: 1, participantKey: "p-o2", side: "T" as const },
];
const input = (over: Partial<DeathContextInput> = {}): DeathContextInput => ({
  matchId: "11111111-1111-4111-8111-111111111111",
  map: "de_dust2",
  mapValidation: "VALIDATED",
  integrity: { status: "MATCH_COMPLETED", eligible: true, endedBy: "NORMAL", validRounds: 21 },
  rounds: [{ roundNumber: 1, startTick: 0, endTick: 9000, winnerSide: "T", winReason: "t_killed" }],
  roundPlayers: roster,
  kills: [
    {
      id: "k1",
      roundNumber: 1,
      tick: 1000,
      timeSeconds: 10,
      actor: "p-o1",
      victim: ME,
      weapon: "ak47",
      headshot: true,
      distance: null,
      attackerPosition: world(300, 300),
      victimPosition: world(400, 400),
      blind: false,
      wallbang: null,
    },
  ],
  objectives: [],
  ...over,
});
const matches = [
  {
    matchId: "11111111-1111-4111-8111-111111111111",
    map: "de_dust2",
    playedAt: "2026-11-12T10:00:00Z",
    dateSource: "processed" as const,
  },
];
const ok = (i: DeathContextInput = input()): Resp => ({
  matches,
  status: "OK",
  matchId: i.matchId,
  map: i.map,
  mapSupport: i.mapValidation === "VALIDATED" ? "SUPPORTED" : "NOT_VALIDATED",
  rulesVersion: "cs2.death-rules.v1",
  integrity: i.integrity,
  deaths: buildDeathContexts(i, ME).map((context) => ({
    context,
    rules: evaluateDeathRules(context),
    radar: radarFor(context, i.map),
    feedback: {},
  })),
});
const noop = () => {};

describe("death review UI", () => {
  it.each(LOCALES)("renders the four sections with provenance (%s)", (locale) => {
    const html = render(<DeathReviewBody r={ok()} onSearch={noop} />, locale);
    const d = dictionaries[locale];
    for (const k of [
      "diagnosis.section.facts",
      "diagnosis.section.derived",
      "diagnosis.section.rules",
      "diagnosis.section.unknown",
    ] as const)
      expect(html).toContain(d[k]);
    expect(html).toContain('data-provenance="OBSERVED"');
    expect(html).toContain('data-provenance="DERIVED"');
    expect(html).toContain('data-rule="TRADE_NOT_OBSERVED" data-outcome="MATCH"');
    expect(html).not.toMatch(/\d+\s?%/);
  });

  it("shows a missing distance as not measured, never 0", () => {
    const html = render(<DeathReviewBody r={ok()} onSearch={noop} />);
    expect(html).toContain('data-missing="distance,wallbang"');
    expect(html).not.toContain(">0 m");
  });

  it("draws positions only on a validated map", () => {
    expect(render(<DeathReviewBody r={ok()} onSearch={noop} />)).toContain("data-death-radar");
    const mirage = ok(input({ map: "de_inferno", mapValidation: "NOT_VALIDATED" }));
    const html = render(<DeathReviewBody r={mirage} onSearch={noop} />);
    expect(html).not.toContain("data-death-radar");
    expect(html).toContain(dictionaries["pt-BR"]["diagnosis.position.notValidated"]);
  });

  it("does not draw rule conclusions for a special death", () => {
    const self = input();
    self.kills[0] = { ...self.kills[0]!, actor: ME };
    const html = render(<DeathReviewBody r={ok(self)} onSearch={noop} />);
    expect(html).toContain('data-death-kind="SELF_KILL"');
    expect(html).toContain(dictionaries["pt-BR"]["diagnosis.kind.special"]);
    expect(html).not.toContain('data-outcome="MATCH"');
  });

  it.each([
    ["EMPTY", "diagnosis.empty.title"],
    ["NOT_FOUND", "diagnosis.notFound.title"],
  ] as const)("state %s", (status, key) => {
    const r = (status === "EMPTY" ? { matches: [], status } : { matches, status }) as Resp;
    expect(render(<DeathReviewBody r={r} onSearch={noop} />)).toContain(dictionaries["pt-BR"][key]);
  });

  it("states a pre-contract match instead of inventing its end", () => {
    const html = render(<DeathReviewBody r={ok(input({ integrity: null }))} onSearch={noop} />);
    expect(html).toContain('data-integrity="PRE_CONTRACT"');
  });
});

describe("death review server helpers", () => {
  it("maps a kill row keeping absences and rejecting suspect positions", () => {
    const row = toKillEventRow({
      id: "k",
      round_number: 3,
      tick: 10,
      time_seconds: null,
      actor_steam_id: null,
      victim_steam_id: ME,
      weapon: null,
      headshot: null,
      distance: null,
      position: { x: 0, y: 0, z: 0 },
      victim_position: { x: 1, y: 2, z: 3 },
      blind: "yes",
      wallbang: true,
    });
    expect(row.attackerPosition).toBeNull();
    expect(row.victimPosition).toEqual({ x: 1, y: 2, z: 3 });
    expect(row.blind).toBeNull();
    expect(row.timeSeconds).toBeNull();
  });

  it("derives the integrity reference only from an eligible decision", () => {
    expect(integrityRef({ matchEnd: null })).toBeNull();
    expect(integrityRef({ matchEnd: { endedBy: "SURRENDER", validRounds: 10 } })).toMatchObject({
      status: "MATCH_SURRENDER_COMPLETED",
      eligible: true,
    });
  });

  it("returns no radar points off a validated map", () => {
    const [ctx] = buildDeathContexts(input(), ME);
    expect(radarFor(ctx!, "de_dust2")?.victim).toMatchObject({ x: 400, y: 400 });
    expect(radarFor(ctx!, "de_inferno")).toBeNull();
  });
});

describe("death feedback", () => {
  it("shows the player's own verdict, separately from the rule outcome", () => {
    const r = ok();
    if (r.status !== "OK") throw new Error("expected OK");
    r.deaths[0]!.feedback = { TRADE_NOT_OBSERVED: "INCORRECT", REVIEW: "USEFUL" };
    const html = render(<DeathReviewBody r={r} onSearch={noop} />);
    expect(html).toContain('data-feedback="TRADE_NOT_OBSERVED" data-feedback-current="INCORRECT"');
    expect(html).toContain('data-feedback="REVIEW" data-feedback-current="USEFUL"');
    // The rule outcome is unchanged by the feedback.
    expect(html).toContain('data-rule="TRADE_NOT_OBSERVED" data-outcome="MATCH"');
  });

  it("groups own rows by event and ignores unknown verdicts", () => {
    const m = feedbackByEvent([
      { round_number: 3, death_tick: 100, rule_id: null, verdict: "USEFUL" },
      { round_number: 3, death_tick: 100, rule_id: "OPENING_DEATH", verdict: "NOT_USEFUL" },
      { round_number: 4, death_tick: 9, rule_id: "OPENING_DEATH", verdict: "LOVE_IT" },
    ]);
    expect(m.get("3:100")).toEqual({ REVIEW: "USEFUL", OPENING_DEATH: "NOT_USEFUL" });
    expect(m.has("4:9")).toBe(false);
  });

  it("accepts only evaluable rule ids, known verdicts and short notes", () => {
    const base = {
      matchId: "11111111-1111-4111-8111-111111111111",
      roundEventId: "22222222-2222-4222-8222-222222222222",
      verdict: "USEFUL",
    };
    expect(deathFeedbackInput.safeParse({ ...base, ruleId: "REVIEW" }).success).toBe(true);
    expect(deathFeedbackInput.safeParse({ ...base, ruleId: "TRADE_NOT_OBSERVED" }).success).toBe(
      true,
    );
    expect(deathFeedbackInput.safeParse({ ...base, ruleId: "POSSIBLE_EXPOSURE" }).success).toBe(
      false,
    );
    expect(
      deathFeedbackInput.safeParse({ ...base, ruleId: "REVIEW", verdict: "MEH" }).success,
    ).toBe(false);
    expect(
      deathFeedbackInput.safeParse({ ...base, ruleId: "REVIEW", note: "x".repeat(501) }).success,
    ).toBe(false);
    expect(deathFeedbackInput.safeParse({ ...base, ruleId: "REVIEW", userId: "x" }).success).toBe(
      false,
    );
  });
});
