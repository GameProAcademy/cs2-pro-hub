/**
 * Fase 3.5 B — complementary Coach corrections: no accidental English in replies in other
 * languages, a guard notice that explains WHY something was removed (5 languages), precise
 * flash-assist wording, the K/D source, and guard precision (no false positives on clean
 * replies; invented numbers still removed; drill numbers kept).
 */
import { describe, expect, it } from "vitest";

import type { Locale } from "@/i18n/config";
import { buildCoachFacts, coachSystemPrompt, FLASH_PHRASE } from "@/lib/coach/coachContext";
import { guardCoachReply, NOTICE } from "@/lib/coach/coachReplyGuard";
import { aggregate, type OverviewMatch } from "@/lib/playerOverview";

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const L = ["L04-MATCH-RESULT-UNRESOLVED"];
const base = {
  playedAt: "2026-11-03T05:35:03Z",
  dateSource: "processed",
  resultStatus: "UNRESOLVED_BY_DEMO",
  result: null,
  scorePlayer: null,
  scoreOpponent: null,
  source: "demo",
  admission: "LIMITED",
  limitations: L,
} as const;
const ms = [
  {
    ...base,
    matchId: "n",
    map: "de_nuke",
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
  },
  {
    ...base,
    matchId: "a",
    map: "de_ancient",
    kills: 2,
    deaths: 13,
    assists: 1,
    adr: 34.4,
    kast: 40,
    hsPercent: 0,
    rating: 0.18,
    firstKills: 1,
    firstDeaths: 0,
    tradeKills: 0,
    flashAssists: 0,
    utilityDamage: 71,
    clutchAttempts: null,
    clutchWins: null,
    ctRating: 0.2,
    tRating: 0.08,
    roundsPlayed: 15,
  },
] as unknown as OverviewMatch[];
const overview = {
  state: "READY",
  generatedAt: "x",
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
  matches: ms,
  aggregates: aggregate(ms),
} as never;
const dna = {
  state: "INSUFFICIENT_SAMPLE",
  matches: 2,
  rounds: 34,
  partialMatches: 0,
  minimumMatches: 3,
  dimensions: [],
} as never;
const facts = (l: Locale) => buildCoachFacts(overview, dna, l);

describe("localization of the flash-assist phrase", () => {
  it("every prompt asks for the phrase in its own language; only en carries the English one", () => {
    for (const l of LOCALES) {
      const prompt = coachSystemPrompt(l);
      expect(prompt, l).toContain(FLASH_PHRASE[l]);
      if (l !== "en") expect(prompt, l).not.toContain("CS2 PRO counted");
    }
    expect(new Set(Object.values(FLASH_PHRASE)).size).toBe(4); // pt-BR = pt-PT
  });

  it("an English phrase leaking into a non-English reply is rewritten", () => {
    const cases: Array<[Locale, string, string]> = [
      ["pt-BR", "- Flash assists: CS2 PRO counted 0.", "o CS2 PRO contou 0"],
      ["pt-PT", "- Flash assists: CS2 PRO counted 0.", "o CS2 PRO contou 0"],
      ["es", "- Flash assists: CS2 PRO counted 0.", "CS2 PRO contó 0"],
      ["fr", "- Flash assists : CS2 PRO counted 0.", "CS2 PRO a compté 0"],
    ];
    for (const [l, line, want] of cases) {
      const r = guardCoachReply(line, facts(l), l);
      expect(r.text, l).toContain(want);
      expect(r.text, l).not.toContain("counted");
    }
    // In English the correct phrase is kept as is.
    expect(guardCoachReply("- CS2 PRO counted 0.", facts("en"), "en").removed.flashWording).toBe(0);
  });
});

describe("the guard explains what was removed and why", () => {
  it("one specific sentence per kind, in 5 languages, never the removed text", () => {
    for (const l of LOCALES) {
      const reply = [
        `**${l === "en" ? "Data" : l === "es" ? "Datos" : l === "fr" ? "Données" : "Dados"}**`,
        "- clutchWins: 7 (fonte: player_stats.clutches)",
        "- This is below average for most players. Está abaixo da média dos jogadores. Está por debajo de la media de otros jugadores. C'est en dessous de la moyenne des joueurs moyens.",
      ].join("\n");
      const r = guardCoachReply(reply, facts(l), l);
      expect(r.text, l).toContain(NOTICE[l].comparisons);
      expect(r.text, l).toContain(NOTICE[l].stats);
      expect(r.text, l).not.toContain("player_stats.clutches");
      expect(r.text, l).not.toMatch(/below average|abaixo da média dos jogadores/);
    }
  });

  it("the explanation says the Coach uses the player's own observed data, not outside averages", () => {
    expect(NOTICE["pt-BR"].comparisons).toMatch(/dados observados nas suas próprias partidas/);
    expect(NOTICE["pt-BR"].comparisons).toMatch(/médias externas não verificadas/);
    expect(NOTICE.en.comparisons).toMatch(/data observed in your own matches/);
    expect(NOTICE.es.comparisons).toMatch(/datos observados en tus propias partidas/);
    expect(NOTICE.fr.comparisons).toMatch(/données observées dans vos propres matchs/);
    for (const l of LOCALES) expect(NOTICE[l].comparisons).not.toMatch(/guard|regex|PLAYER_FACTS/i);
  });

  it("only the kinds actually removed are explained", () => {
    const r = guardCoachReply("**Dados**\n- ADR 76 (fonte: x_table.y).", facts("pt-BR"), "pt-BR");
    expect(r.text).toContain(NOTICE["pt-BR"].sources);
    expect(r.text).not.toContain(NOTICE["pt-BR"].comparisons);
    expect(r.text).not.toContain(NOTICE["pt-BR"].stats);
  });
});

describe("guard precision", () => {
  it("a clean, fully grounded reply is untouched in every language", () => {
    for (const l of LOCALES) {
      const clean =
        "**Dados**\n- K/D: 0,87 (20 / 23) — match_metrics.kills / match_metrics.deaths.\n- ADR: 76.\n- KAST: 62,1 %.\n\n**Interpretação**\n- Amostra pequena: 2 partidas, 34 rounds.";
      const r = guardCoachReply(clean, facts(l), l);
      expect(r.removed, l).toEqual({ stats: 0, comparisons: 0, sources: 0, flashWording: 0 });
      expect(r.text, l).toBe(clean);
    }
  });

  it("invented factual numbers are removed; recommendation drill numbers stay", () => {
    const reply =
      "**Dados**\n- ADR: 91,4.\n- K/D: 0,87.\n\n**Interpretação**\n- Seu KAST de 70,5 % é bom.\n\n**Recomendação**\n- 15 minutos por dia, 3 séries de 30 segundos, durante 4 semanas.";
    const r = guardCoachReply(reply, facts("pt-BR"), "pt-BR");
    expect(r.text).not.toContain("91,4");
    expect(r.text).not.toContain("70,5");
    expect(r.text).toContain("K/D: 0,87");
    expect(r.text).toContain("15 minutos por dia, 3 séries de 30 segundos, durante 4 semanas");
    expect(r.removed.stats).toBe(2);
  });

  it("K/D keeps its two-column source and the guard accepts it", () => {
    const f = facts("pt-BR");
    expect(f.observations.find((o) => o.metric === "kd")!.source).toBe(
      "match_metrics.kills / match_metrics.deaths",
    );
    const r = guardCoachReply(
      "**Dados**\n- K/D 0,87 (match_metrics.kills / match_metrics.deaths).",
      f,
      "pt-BR",
    );
    expect(r.removed.sources).toBe(0);
  });
});

describe("flash-assist wording separates the four cases", () => {
  it("count derived, method not stored, zero is not 'no flashes', enemies flashed not measured", () => {
    const note = facts("en").observations.find((o) => o.metric === "flashAssists")!.note!;
    expect(note).toMatch(/COUNT is a CS2 PRO derivation, not a game report/);
    expect(note).toMatch(
      /METHOD used for each match is not stored, which says nothing about whether flash assists happened/,
    );
    expect(note).toMatch(/NOT that the player threw no flashes/);
    expect(note).toMatch(/enemies flashed is a different metric and is NOT MEASURED/);
  });
});
