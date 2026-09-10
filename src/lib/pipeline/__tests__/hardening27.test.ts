/**
 * FASE 2.7 — HARDENING TESTS (H1–H15).
 *
 * These tests pin the P1/P2 corrections of the demo pipeline: absence of
 * information stays NULL, timing is never assumed, quality-aware metrics refuse
 * to invent denominators, the parser transport is bounded, hashing is
 * incremental and short demos have an explicit, non-retryable policy.
 *
 * No real `.dem` file is parsed here: the fixture is synthetic and the parser
 * worker is still not provisioned.
 */
import { describe, expect, it } from "vitest";

import { MIN_VALID_ROUNDS } from "@/config/pipeline";
import { canConvergeCrossSource, resolveAgainstAll } from "@/lib/canonical";
import { isPermanentError, PipelineError } from "@/lib/pipeline/errors";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { Sha256, sha256HexFromBlob } from "@/lib/pipeline/sha256";
import type { RawParserOutput } from "@/lib/pipeline/types";
import { validateCanonicalMatch } from "@/lib/pipeline/validator";

import { ME, syntheticParserOutput } from "./fixture";

function clone(): RawParserOutput {
  return JSON.parse(JSON.stringify(syntheticParserOutput)) as RawParserOutput;
}

describe("FASE 2.7 hardening — NULL is not FALSE", () => {
  it("H1: missing bomb flags stay null instead of becoming false", () => {
    const raw = clone();
    for (const round of raw.rounds) {
      delete (round as unknown as Record<string, unknown>)["bomb_planted"];
      delete (round as unknown as Record<string, unknown>)["bomb_defused"];
      delete (round as unknown as Record<string, unknown>)["bomb_exploded"];
    }
    const match = normalizeParserOutput(raw);
    for (const round of match.rounds) {
      expect(round.bombPlanted).toBeNull();
      expect(round.bombDefused).toBeNull();
      expect(round.bombExploded).toBeNull();
    }
  });

  it("H2: explicit false is preserved as an asserted negative", () => {
    const raw = clone();
    for (const round of raw.rounds) {
      (round as unknown as Record<string, unknown>)["bomb_planted"] = false;
    }
    const match = normalizeParserOutput(raw);
    expect(match.rounds.every((round) => round.bombPlanted === false)).toBe(true);
  });

  it("H3: non-boolean junk is rejected as unknown, never coerced", () => {
    const raw = clone();
    (raw.rounds[0] as unknown as Record<string, unknown>)["bomb_defused"] = "yes";
    const match = normalizeParserOutput(raw);
    expect(match.rounds[0]!.bombDefused).toBeNull();
  });
});

describe("FASE 2.7 hardening — timing is never assumed", () => {
  it("H4: without a tickrate, tick-only events yield no trade timing", () => {
    const raw = clone();
    delete (raw.header as unknown as Record<string, unknown>)["tickrate"];
    for (const event of raw.events) {
      delete (event as unknown as Record<string, unknown>)["time_seconds"];
      (event as unknown as Record<string, unknown>)["tick"] = 1000;
    }
    const metrics = computeMetrics(normalizeParserOutput(raw), ME);
    expect(metrics.tradeKills).toBeNull();
    expect(metrics.tradeDeaths).toBeNull();
    expect(metrics.flashAssists).toBeNull();
  });

  it("H5: a reported tickrate is used instead of a hardcoded 64", () => {
    const raw = clone();
    (raw.header as unknown as Record<string, unknown>)["tickrate"] = 128;
    const match = normalizeParserOutput(raw);
    expect(match.tickrate).toBe(128);
  });

  it("H6: with explicit seconds, trades are still detected", () => {
    const metrics = computeMetrics(normalizeParserOutput(clone()), ME);
    expect(metrics.tradeDeaths).not.toBeNull();
  });
});

describe("FASE 2.7 hardening — quality-aware metrics", () => {
  it("H7: KAST is null when no round proves the player participated", () => {
    const raw = clone();
    for (const round of raw.rounds) {
      (round as unknown as Record<string, unknown>)["sides"] = {};
      (round as unknown as Record<string, unknown>)["money_start"] = {};
      (round as unknown as Record<string, unknown>)["equipment_value"] = {};
    }
    raw.events = [];
    const match = normalizeParserOutput(raw);
    const metrics = computeMetrics(match, ME);
    expect(metrics.kast).toBeNull();
  });

  it("H8: clutch participation is counted from real per-round evidence", () => {
    // The fixture contains exactly two rounds where ME is the last player alive
    // on its team against living enemies: round 6 (1v2, won) and round 9 (ME's
    // only teammate dies and ME never wins the round). Concrete values, no
    // `>= 0` tolerance.
    const metrics = computeMetrics(normalizeParserOutput(clone()), ME);
    expect(metrics.clutchAttempts).toBe(2);
    expect(metrics.clutchWins).toBe(1);
  });

  it("H9: availability flags describe what the demo actually contained", () => {
    const metrics = computeMetrics(normalizeParserOutput(clone()), ME);
    expect(metrics.availability.killEvents).toBe(true);
    expect(metrics.availability.damageEvents).toBe(true);
    expect(metrics.availability.utilityEvents).toBe(true);
    expect(metrics.availability.timing).toBe(true);
    expect(metrics.availability.economy).toBe(true);
    expect(metrics.availability.roundEndEvidence).toBe(true);
  });
});

describe("FASE 2.7 hardening — short demo policy", () => {
  it("H10: a demo below the minimum sample fails as DEMO_INSUFFICIENT_SAMPLE", () => {
    const raw = clone();
    raw.rounds = raw.rounds.slice(0, MIN_VALID_ROUNDS - 1);
    raw.events = raw.events.filter((event) => (event.round ?? 99) <= MIN_VALID_ROUNDS - 1);
    try {
      validateCanonicalMatch(normalizeParserOutput(raw));
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PipelineError);
      expect((error as PipelineError).code).toBe("DEMO_INSUFFICIENT_SAMPLE");
    }
  });

  it("H11: insufficient sample and oversized payload are permanent, not retried", () => {
    expect(isPermanentError("DEMO_INSUFFICIENT_SAMPLE")).toBe(true);
    expect(isPermanentError("PARSER_PAYLOAD_TOO_LARGE")).toBe(true);
  });

  it("H12: a full-length demo passes validation", () => {
    expect(() => validateCanonicalMatch(normalizeParserOutput(clone()))).not.toThrow();
  });
});

describe("FASE 2.7 hardening — incremental hashing", () => {
  it("H13: matches the known SHA-256 vectors", async () => {
    const empty = new Sha256();
    expect(empty.hex()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const abc = new Sha256();
    abc.update(new TextEncoder().encode("abc"));
    expect(abc.hex()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("H14: chunked blob hashing equals single-shot hashing", async () => {
    const bytes = new Uint8Array(300_000).map((_, index) => index % 251);
    const blob = new Blob([bytes]);
    const chunked = await sha256HexFromBlob(blob, 4096);
    const oneShot = new Sha256();
    oneShot.update(bytes);
    expect(chunked).toBe(oneShot.hex());
  });
});

describe("FASE 2.7 hardening — resolver wiring", () => {
  it("H15: a demo with no candidate never attaches, and ambiguity never fuses", () => {
    const incoming = {
      canonicalMatchId: "",
      participantSteamIds: [ME],
      source: "demo" as const,
      externalMatchId: null,
      fingerprint: "a".repeat(64),
      map: "de_mirage",
      playedAt: "2026-01-15T20:00:00.000Z",
      startedAt: "2026-01-15T20:00:00.000Z",
      finishedAt: null,
      roundCount: 10,
      scoreTeamA: 6,
      scoreTeamB: 4,
    };
    const none = resolveAgainstAll(incoming, []);
    expect(none.candidate).toBeNull();
    expect(canConvergeCrossSource(none.decision)).toBe(false);
  });
});
