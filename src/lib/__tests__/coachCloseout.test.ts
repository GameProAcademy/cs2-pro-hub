/**
 * Fase 3 closeout — regression tests for the three production findings of 2026-11-04:
 *  1. flash assists were described as "the game recorded N", but the count may come from a
 *     timed attribution; from Fase 4.0.1 the per-match method is recorded (metrics.ts flashAssists);
 *  2. a reply could carry invented statistics, benchmark comparisons ("abaixo da média
 *     esperada") and sources outside PLAYER_FACTS — now removed by coachReplyGuard before the
 *     player sees or the server stores the reply. (The "match_metrics.kills" cited for K/D was
 *     the catalog's own single-column source; the Coach now sees kills / deaths.);
 *  3. a requestId belonging to another account reached the provider (a billed call) before
 *     the duplicate was refused — now refused before the rate limit and the provider.
 * Fixtures mirror the production test account (2 matches: de_nuke + de_ancient).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { coachErrorKey } from "@/components/coach/coachErrors";
import { buildCoachFacts, coachSystemPrompt } from "@/lib/coach/coachContext";
import { backed, factNumbers, guardCoachReply, guardTag } from "@/lib/coach/coachReplyGuard";
import type { RealPlayerDna } from "@/lib/playerDna";
import { aggregate, type OverviewMatch, type PlayerOverview } from "@/lib/playerOverview";

const read = (p: string) => readFileSync(resolve(p), "utf8");
const L04 = [
  "L01-CAPABILITY-SURFACE-UNENUMERABLE",
  "L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE",
  "L03-USERCMD-UNAVAILABLE",
  "L04-MATCH-RESULT-UNRESOLVED",
];

function m(id: string, over: Partial<OverviewMatch> = {}): OverviewMatch {
  return {
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
    adr: 117.6,
    kast: 84.2,
    hsPercent: 27.8,
    rating: 1.13,
    firstKills: 3,
    firstDeaths: 0,
    tradeKills: 3,
    flashAssists: 0,
    utilityDamage: 38,
    clutchAttempts: 1,
    clutchWins: 1,
    ctRating: 0.78,
    tRating: 1.72,
    roundsPlayed: 19,
    admission: "LIMITED",
    limitations: L04,
    ...over,
  };
}
const ancient = m("ancient", {
  map: "de_ancient",
  playedAt: "2026-11-03T23:31:36Z",
  kills: 2,
  deaths: 13,
  adr: 34.4,
  kast: 40,
  hsPercent: 0,
  rating: 0.18,
  firstKills: 1,
  tradeKills: 0,
  utilityDamage: 71,
  clutchAttempts: null,
  clutchWins: null,
  ctRating: 0.2,
  tRating: 0.08,
  roundsPlayed: 15,
});
const overview = (matches: OverviewMatch[]): PlayerOverview => ({
  state: matches.length ? "READY" : "EMPTY",
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
});

const VALUES: Record<string, number | null> = {
  aim: 0.45,
  dueling: 0.69,
  survivability: 0.52,
  positioning: 0.71,
  utility: 0.27,
  decision_making: 0.87,
  teamplay: 0.24,
  economy: null,
  clutch: 0.57,
  consistency: 0.44,
};
function dna(
  state: RealPlayerDna["state"],
  matches: number,
  values: Record<string, number | null> = VALUES,
): RealPlayerDna {
  return {
    state,
    matches,
    rounds: 34,
    partialMatches: 0,
    minimumMatches: 3,
    dimensions: Object.entries(values).map(([dimension, value]) => ({
      dimension: dimension as never,
      value,
      signals: [
        {
          name: "damage_per_round",
          mean: value,
          matches: value === null ? 0 : matches,
          unit: "rate",
          direction: "up",
          foldedIntoDimension: true,
        },
      ],
    })),
  };
}
const two = overview([m("nuke"), ancient]);

const facts = (locale: "pt-BR" | "en" = "pt-BR") =>
  buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), locale);

describe("1. flash assists provenance", () => {
  it("is DERIVED with GAME_FLAG_OR_TIMED_ATTRIBUTION and never 'the game recorded'", () => {
    const f = facts();
    const fa = f.observations.find((o) => o.metric === "flashAssists")!;
    expect(fa.status).toBe("DERIVED");
    expect(fa.provenance).toBe("GAME_FLAG_OR_TIMED_ATTRIBUTION");
    expect(fa.value).toBe(0); // a counted 0 stays 0; it is not turned into null either
    const prompt = coachSystemPrompt("pt-BR");
    // Fase 3.5 B (intentional): the phrase is given in the reply's own language.
    expect(prompt).toContain("o CS2 PRO contou N flash assists");
    expect(coachSystemPrompt("en")).toContain("CS2 PRO counted N flash assists");
    expect(prompt).not.toMatch(/say 'the game recorded/);
  });

  it("the pipeline really has two methods (the provenance claim is grounded in code)", () => {
    const metrics = read("src/lib/pipeline/metrics.ts");
    // Fase 4.0.1 (intentional): the branches now also record which method decided.
    expect(metrics).toMatch(
      /if \(e\.assistedFlash === true\) \{\s*kill\.flashAssister = e\.assisterSteamId;\s*kill\.flashSource = "flag";/,
    );
    expect(metrics).toMatch(
      /kill\.flashAssister = flashAssisterFor\(kill\);\s*kill\.flashSource = "timing";/,
    );
  });

  it("the guard rewrites 'the game recorded' in every locale", () => {
    const pt = guardCoachReply("**Dados**\n- Flash assists: o jogo registrou 0.", facts(), "pt-BR");
    expect(pt.text).toContain("o CS2 PRO contou 0");
    expect(pt.removed.flashWording).toBe(1);
    const en = guardCoachReply("**Data**\n- The game recorded 0 flash assists.", facts("en"), "en");
    expect(en.text).toContain("CS2 PRO counted 0");
  });
});

/** The reply production returned on 2026-11-04 17:07 (account lojacriativa), trimmed. */
const PRODUCTION_REPLY = `**Dados**

| Métrica | Valor | Fonte | Observação |
|---|---|---|---|
| hsPercent | 13.9 % | match_metrics.hs_percent | Média de 2 partidas |
| kd | 0.87 | match_metrics.kills | Soma de 20 kills / 23 deaths |
| adr | 76 / round | match_metrics.adr | Média de 2 partidas |
| openingDeaths | 0 | match_metrics.first_deaths | Soma de 2 partidas |
| kast | 62.1 % | match_metrics.kast | Média de 2 partidas |
| clutchWins | 7 | match_metrics.clutch_wins | Soma de 2 partidas |

**Interpretação**

- AIM: O headshot % (13.9 %) está abaixo da média esperada para jogadores que buscam melhorar a mira, indicando espaço para crescimento.
- Seu K/D de 0.87 mostra mais mortes do que abates.
- Seu ADR de 91.4 sugere bom dano.

**Recomendação**

- Treino de mira em de_nuke: 30 segundos de spray por spot, 3 vezes, 15 minutos por dia.`;

describe("2. reply guard: statistics, comparisons and sources", () => {
  const out = guardCoachReply(PRODUCTION_REPLY, facts(), "pt-BR");

  it("keeps every number that is in PLAYER_FACTS", () => {
    expect(out.text).toContain("| hsPercent | 13.9 %");
    expect(out.text).toContain("| kd | 0.87");
    expect(out.text).toContain("| openingDeaths | 0");
    expect(out.text).toContain("Seu K/D de 0.87");
  });

  it("removes an invented statistic in Data and in Interpretation", () => {
    expect(out.text).not.toContain("clutchWins | 7"); // facts: 1 clutch win
    expect(out.text).not.toContain("91.4"); // facts ADR: 76
    expect(out.removed.stats).toBe(2);
  });

  it("removes a comparison with other players or an outside average", () => {
    expect(out.text).not.toMatch(/média esperada/);
    expect(out.removed.comparisons).toBe(1);
  });

  it("replaces a source that is not in PLAYER_FACTS, keeps real ones", () => {
    // K/D cites both inputs (the catalog keeps one column; the Coach view carries both).
    const kd = facts().observations.find((o) => o.metric === "kd")!;
    expect(kd.source).toBe("match_metrics.kills / match_metrics.deaths");
    expect(out.text).toContain("match_metrics.hs_percent");
    expect(out.text).toContain("match_metrics.first_deaths");
    const fake = guardCoachReply(
      "**Dados**\n- ADR 76 (fonte: player_stats.damage_avg).",
      facts(),
      "pt-BR",
    );
    expect(fake.text).not.toContain("player_stats.damage_avg");
    expect(fake.removed.sources).toBe(1);
    const path = guardCoachReply(
      "**Dados**\n- Opening kills por rodada (totals.perRound.openingKills) e matches[0].adr.",
      facts(),
      "pt-BR",
    );
    expect(path.removed.sources).toBe(0);
  });

  it("leaves Recommendation drill numbers alone and adds a visible notice", () => {
    expect(out.text).toContain("30 segundos de spray por spot, 3 vezes, 15 minutos");
    // Fase 3.5 B (intentional): the notice now says WHAT kind was removed and WHY.
    expect(out.text).toMatch(
      /Removemos uma comparação com outros jogadores ou com médias externas/,
    );
    expect(out.text).toMatch(/Removemos números que não constam nos seus dados processados/);
    expect(guardTag(out.removed)).toMatch(/^guard=2\.1\.\d+\.0$/);
  });

  it("a clean reply passes untouched (no notice)", () => {
    const clean =
      "**Dados**\n- K/D: 0,87 (20 / 23).\n\n**Interpretação**\n- Amostra pequena: 2 partidas.";
    const r = guardCoachReply(clean, facts(), "pt-BR");
    expect(r.text).toBe(clean);
    expect(r.removed).toEqual({ stats: 0, comparisons: 0, sources: 0, flashWording: 0 });
  });

  it("own comparisons are allowed; benchmark comparisons are not, in 5 languages", () => {
    const own = guardCoachReply(
      "**Interpretação**\n- Seu rating no T está acima da sua média.",
      facts(),
      "pt-BR",
    );
    expect(own.removed.comparisons).toBe(0);
    for (const [locale, line] of [
      ["en", "**Interpretation**\n- This is below average for most players."],
      ["es", "**Interpretación**\n- Está por debajo de la media de otros jugadores."],
      ["fr", "**Interprétation**\n- C'est en dessous de la moyenne des joueurs moyens."],
      ["pt-PT", "**Interpretação**\n- Está no percentil 30."],
    ] as const) {
      const r = guardCoachReply(line, facts("en"), locale);
      expect(r.removed.comparisons, locale).toBe(1);
    }
  });

  it("numbers match at the precision written and as percentages of ratios", () => {
    const nums = factNumbers({ a: 0.8696, b: 0.621 });
    expect(backed(0.87, 2, nums)).toBe(true);
    expect(backed(62.1, 1, nums)).toBe(true);
    expect(backed(0.9, 2, nums)).toBe(false);
  });

  it("runs on the server before the reply is stored, and its result is in the provenance", () => {
    const src = read("src/lib/coach.functions.ts");
    const guard = src.indexOf("guardCoachReply(");
    expect(guard).toBeGreaterThan(src.indexOf("sanitizeReplyLinks("));
    expect(guard).toBeLessThan(src.indexOf('stage = "persist"'));
    expect(src).toContain("${guardTag(guarded.removed)}");
  });
});

describe("3. idempotency never bills a foreign request id", () => {
  const src = read("src/lib/coach.functions.ts");

  // Fase 3.5 (intentional): the head-only existence count was replaced by the atomic,
  // global reservation. The guarantees are the same and stronger (no SELECT-then-INSERT
  // window): a foreign id is a CONFLICT before the rate limit and the provider, and the
  // CONFLICT carries no column about the other account.
  const sql = read("supabase/migrations/20261105100000_coach_request_reservations.sql");
  const flow = read("src/lib/coach/coachSendFlow.ts");

  it("a request id invisible to the caller but taken is refused before rate limit and provider", () => {
    const refuse = flow.indexOf('error: "COACH_REQUEST_ID_CONFLICT"');
    expect(refuse).toBeGreaterThan(0);
    expect(refuse).toBeLessThan(flow.indexOf("await d.withinRateLimit()"));
    expect(refuse).toBeLessThan(flow.indexOf("d.generate("));
    expect(sql).toMatch(/IF r\.user_id <> p_user_id OR r\.player_id <> p_player_id/);
  });

  it("the existence check returns a count only, never the foreign row", () => {
    // Every CONFLICT row in the claim is NULL apart from the outcome.
    const conflicts = [...sql.matchAll(/SELECT 'CONFLICT'::text,([^;]*);/g)].map((m) => m[1]!);
    expect(conflicts.length).toBeGreaterThan(0);
    for (const rest of conflicts) expect(rest.replace(/NULL::\w+|\s|,/g, "")).toBe("");
    expect(src).not.toMatch(/supabaseAdmin\s*\.from\("coach_messages"\)/);
  });

  it("the refusal has a user-facing message", () => {
    expect(coachErrorKey("COACH_REQUEST_ID_CONFLICT")).toBe("coach2.error.invalidResponse");
  });
});
