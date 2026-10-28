/**
 * D35 — utility events without a thrower.
 *
 * Production demos carried flash/HE/smoke events with no thrower, so "grenades
 * thrown", "enemies flashed" and "flash assists" were counted as 0 for every
 * player: an attribution gap published as an observed zero. Those counters (and
 * the DNA signals built from them) must be NULL unless some utility event names
 * its thrower; an attributed observation with no throws by the player stays 0.
 */
import { describe, expect, it } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { extractFeatures } from "@/lib/pipeline/features";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserEvent, RawParserOutput } from "@/lib/pipeline/types";

const ME = "76561198000000001";
const MATE = "76561198000000002";
const ENEMY = "76561198000000101";

const kill = (round: number, attacker: string, victim: string): RawParserEvent => ({
  type: "player_death",
  round,
  time_seconds: 30,
  attacker,
  victim,
});
const flash = (round: number, attacker?: string): RawParserEvent => ({
  type: "flashbang_detonate",
  round,
  time_seconds: 10,
  ...(attacker ? { attacker } : {}),
});

const signals = (
  features: ReturnType<typeof extractFeatures>,
  dimension: string,
): Record<string, unknown> =>
  (features.dimensions as Record<string, Record<string, unknown>>)[dimension] ?? {};

function build(events: RawParserEvent[]) {
  return normalizeParserOutput({
    parser: { name: PARSER_NAME, version: PARSER_VERSION },
    contract_version: PARSER_CONTRACT_VERSION,
    header: { map: "de_mirage", tickrate: 64, duration_seconds: 600 },
    players: [
      { steam_id: ME, name: "me", team: "A" },
      { steam_id: MATE, name: "mate", team: "A" },
      { steam_id: ENEMY, name: "e1", team: "B" },
    ],
    rounds: [1, 2].map((number) => ({
      number,
      winner_side: "CT",
      end_tick: 5000 * number,
      duration_seconds: 60,
      sides: { [ME]: "CT", [MATE]: "CT", [ENEMY]: "T" },
    })),
    events,
  } as RawParserOutput);
}

describe("D35: utility usage needs the thrower", () => {
  it("utility events without any thrower => usage counters and DNA signals are NULL, not 0", () => {
    const match = build([kill(1, ME, ENEMY), kill(2, ENEMY, ME), flash(1), flash(2)]);
    const metrics = computeMetrics(match, ME);
    expect(metrics.availability.utilityEvents).toBe(true);
    expect(metrics.availability.utilityAttribution).toBe(false);
    expect(metrics.grenadesUsed).toBeNull();
    expect(metrics.enemiesFlashed).toBeNull();
    expect(metrics.flashAssists).toBeNull();
    const utility = signals(extractFeatures(match, metrics), "utility");
    expect(utility["grenades_per_round"]).toBeNull();
    expect(utility["enemies_flashed_per_round"]).toBeNull();
    expect(utility["flash_assists_per_round"]).toBeNull();
    expect(signals(extractFeatures(match, metrics), "teamplay")["flash_assist_share"]).toBeNull();
  });

  it("attributed utility where the player threw nothing => an observed 0", () => {
    const match = build([kill(1, ME, ENEMY), kill(2, ENEMY, ME), flash(1, MATE)]);
    const metrics = computeMetrics(match, ME);
    expect(metrics.availability.utilityAttribution).toBe(true);
    expect(metrics.grenadesUsed).toBe(0);
    expect(signals(extractFeatures(match, metrics), "utility")["grenades_per_round"]).toBe(0);
  });

  it("attributed utility thrown by the player is counted", () => {
    const match = build([kill(1, ME, ENEMY), kill(2, ENEMY, ME), flash(1, ME), flash(2, ME)]);
    expect(computeMetrics(match, ME).grenadesUsed).toBe(2);
  });
});
