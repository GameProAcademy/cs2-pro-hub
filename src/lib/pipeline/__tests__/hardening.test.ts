/**
 * Focused tests for Phase 2.1.1 corrections.
 * Pure layers only: no real `.dem`, no parser worker, no database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { FLASH_ASSIST_WINDOW_SECONDS, TRADE_WINDOW_SECONDS } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import { extractFeatures } from "@/lib/pipeline/features";
import {
  computeMetrics,
  participatedInRound,
  playerSurvivedRound,
  sideInRound,
} from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { assertDemoIntegrity, sha256FromStream } from "@/lib/pipeline/storage.server";
import type { RawParserOutput } from "@/lib/pipeline/types";

import { ENEMY_A, ENEMY_B, MATE, ME, syntheticParserOutput } from "./fixture";

const match = normalizeParserOutput(syntheticParserOutput);

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("1. streamed demo integrity", () => {
  it("hashes a multi-chunk stream incrementally with the same digest as a single buffer", async () => {
    const parts = ["demo-header", "-round-data", "-tail"];
    const expected = createHash("sha256").update(parts.join("")).digest("hex");
    await expect(sha256FromStream(streamOf(parts))).resolves.toBe(expected);
  });

  it("never materialises the demo: no whole-file buffering in the storage layer", () => {
    const source = readFileSync("src/lib/pipeline/storage.server.ts", "utf8");
    const hashSection = source.slice(source.indexOf("sha256FromStream"));
    expect(hashSection).not.toContain("arrayBuffer(");
    expect(hashSection).not.toContain("crypto.subtle.digest");
    expect(source).toContain("createHash");
  });

  it("accepts a matching hash and rejects a divergent one as permanent corruption", () => {
    expect(() => assertDemoIntegrity("abc123", "ABC123")).not.toThrow();
    expect(() => assertDemoIntegrity("abc123", "def456")).toThrow(PipelineError);
    try {
      assertDemoIntegrity("abc123", "def456");
    } catch (error) {
      expect((error as PipelineError).code).toBe("CORRUPTED_DEMO");
    }
  });
});

describe("2. atomic job claim", () => {
  const claimSql = (() => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const withClaim = files.filter((name) =>
      readFileSync(`${dir}/${name}`, "utf8").includes("claim_next_demo_job"),
    );
    const last = withClaim[withClaim.length - 1];
    return readFileSync(`${dir}/${last}`, "utf8");
  })();

  it("serialises the whole claim decision before counting busy jobs", () => {
    const lockAt = claimSql.indexOf("pg_advisory_xact_lock");
    const countAt = claimSql.indexOf("count(*)");
    expect(lockAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(lockAt);
  });

  it("keeps row-level skip-locked selection and the concurrency limit", () => {
    expect(claimSql).toContain("FOR UPDATE SKIP LOCKED");
    expect(claimSql).toContain("_max_concurrent");
    expect(claimSql).toContain("SET search_path TO ''");
  });

  it("is not executable by signed-in or anonymous callers", () => {
    expect(claimSql).toContain("REVOKE ALL ON FUNCTION public.claim_next_demo_job(integer) FROM authenticated");
    expect(claimSql).toContain("GRANT EXECUTE ON FUNCTION public.claim_next_demo_job(integer) TO service_role");
  });
});

describe("3. survival requires evidence", () => {
  it("is false only with an explicit death event", () => {
    // Round 3 of the fixture: ME is killed and not traded.
    expect(playerSurvivedRound(match, ME, 3)).toBe(false);
    // Round 1: ME survives with evidence.
    expect(playerSurvivedRound(match, ME, 1)).toBe(true);
  });

  it("is true when the player participated and the round provably ended with events", () => {
    expect(playerSurvivedRound(match, ME, 8)).toBe(true);
  });

  it("is null when the round carries no extracted combat evidence", () => {
    const quiet = {
      ...match,
      events: match.events.filter((event) => event.roundNumber !== 8),
    };
    expect(playerSurvivedRound(quiet, ME, 8)).toBeNull();
  });

  it("is null on a partial parse, never optimistic", () => {
    const partial = { ...match, quality: { ...match.quality, partialParse: true } };
    expect(playerSurvivedRound(partial, ME, 8)).toBeNull();
  });

  it("is null for a round the player did not take part in", () => {
    const orphan = {
      ...match,
      rounds: match.rounds.map((round) =>
        round.roundNumber === 8
          ? { ...round, sides: {}, moneyStart: {}, moneyEnd: {}, equipmentValue: {} }
          : round,
      ),
      events: match.events.filter((event) => event.roundNumber !== 8),
    };
    expect(participatedInRound(orphan, ME, 8)).toBe(false);
    expect(playerSurvivedRound(orphan, ME, 8)).toBeNull();
  });
});

describe("4. side is per round", () => {
  it("reads the side of that specific round", () => {
    expect(sideInRound(match, ME, 1)).toBe("CT");
    expect(sideInRound(match, ME, 10)).toBe("T");
  });

  it("never propagates another round's side", () => {
    const missing = {
      ...match,
      rounds: match.rounds.map((round) =>
        round.roundNumber === 3 ? { ...round, sides: {} } : round,
      ),
    };
    expect(sideInRound(missing, ME, 3)).toBeNull();
  });
});

describe("5. first death semantics", () => {
  it("first_death_rate is firstDeaths / rounds, with avoidance as a separate signal", () => {
    const metrics = computeMetrics(match, ME);
    const features = extractFeatures(match, metrics);
    const positioning = features.dimensions["positioning"]!;
    expect(positioning["first_death_rate"]).toBeCloseTo(metrics.firstDeaths / metrics.roundsPlayed, 3);
    expect(positioning["first_death_avoidance"]).toBeCloseTo(
      1 - metrics.firstDeaths / metrics.roundsPlayed,
      3,
    );
  });
});

describe("6. flash assists and trades", () => {
  const baseRound = {
    number: 1,
    winner_side: "CT",
    start_tick: 0,
    end_tick: 5000,
    duration_seconds: 60,
    sides: { [ME]: "CT", [MATE]: "CT", [ENEMY_A]: "T", [ENEMY_B]: "T" },
  } as unknown as RawParserOutput["rounds"][number];

  const build = (events: unknown[]): RawParserOutput => ({
    ...syntheticParserOutput,
    rounds: [baseRound],
    events: events as RawParserOutput["events"],
  });

  it("credits a flash assist only inside the configured window", () => {
    const inside = normalizeParserOutput(
      build([
        { type: "player_blind", round: 1, time_seconds: 10, attacker: MATE, victim: ENEMY_A },
        { type: "player_death", round: 1, time_seconds: 10 + FLASH_ASSIST_WINDOW_SECONDS, attacker: ME, victim: ENEMY_A },
      ]),
    );
    expect(computeMetrics(inside, MATE).flashAssists).toBe(1);

    const outside = normalizeParserOutput(
      build([
        { type: "player_blind", round: 1, time_seconds: 10, attacker: MATE, victim: ENEMY_A },
        { type: "player_death", round: 1, time_seconds: 10 + FLASH_ASSIST_WINDOW_SECONDS + 1, attacker: ME, victim: ENEMY_A },
      ]),
    );
    expect(computeMetrics(outside, MATE).flashAssists).toBe(0);
  });

  it("ignores a flash thrown after the kill and a self-flash", () => {
    const after = normalizeParserOutput(
      build([
        { type: "player_death", round: 1, time_seconds: 10, attacker: ME, victim: ENEMY_A },
        { type: "player_blind", round: 1, time_seconds: 11, attacker: MATE, victim: ENEMY_A },
      ]),
    );
    expect(computeMetrics(after, MATE).flashAssists).toBe(0);

    const self = normalizeParserOutput(
      build([
        { type: "player_blind", round: 1, time_seconds: 10, attacker: ENEMY_A, victim: ENEMY_A },
        { type: "player_death", round: 1, time_seconds: 11, attacker: ME, victim: ENEMY_A },
      ]),
    );
    expect(computeMetrics(self, ENEMY_A).flashAssists).toBe(0);
  });

  it("counts a trade only for a teammate revenge inside the window", () => {
    const traded = normalizeParserOutput(
      build([
        { type: "player_death", round: 1, time_seconds: 10, attacker: ENEMY_A, victim: MATE },
        { type: "player_death", round: 1, time_seconds: 10 + TRADE_WINDOW_SECONDS, attacker: ME, victim: ENEMY_A },
      ]),
    );
    expect(computeMetrics(traded, MATE).tradeDeaths).toBe(1);
    expect(computeMetrics(traded, ME).tradeKills).toBe(1);

    const late = normalizeParserOutput(
      build([
        { type: "player_death", round: 1, time_seconds: 10, attacker: ENEMY_A, victim: MATE },
        { type: "player_death", round: 1, time_seconds: 10 + TRADE_WINDOW_SECONDS + 1, attacker: ME, victim: ENEMY_A },
      ]),
    );
    expect(computeMetrics(late, MATE).tradeDeaths).toBe(0);
    expect(computeMetrics(late, ME).tradeKills).toBe(0);
  });

  it("never counts team kills or suicides as trades", () => {
    const teamKill = normalizeParserOutput(
      build([
        { type: "player_death", round: 1, time_seconds: 10, attacker: ME, victim: MATE },
        { type: "player_death", round: 1, time_seconds: 12, attacker: ENEMY_A, victim: ME },
      ]),
    );
    expect(computeMetrics(teamKill, MATE).tradeDeaths).toBe(0);
    expect(computeMetrics(teamKill, ENEMY_A).tradeKills).toBe(0);

    const suicide = normalizeParserOutput(
      build([
        { type: "player_death", round: 1, time_seconds: 10, attacker: MATE, victim: MATE },
        { type: "player_death", round: 1, time_seconds: 11, attacker: ME, victim: ENEMY_A },
      ]),
    );
    expect(computeMetrics(suicide, MATE).tradeDeaths).toBe(0);
  });

  it("does not count a trade across different rounds", () => {
    const crossRound = normalizeParserOutput({
      ...syntheticParserOutput,
      rounds: [baseRound, { ...baseRound, number: 2 }],
      events: [
        { type: "player_death", round: 1, time_seconds: 70, attacker: ENEMY_A, victim: MATE },
        { type: "player_death", round: 2, time_seconds: 1, attacker: ME, victim: ENEMY_A },
      ] as RawParserOutput["events"],
    });
    expect(computeMetrics(crossRound, MATE).tradeDeaths).toBe(0);
  });
});
