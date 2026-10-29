/**
 * D35 (thrower, enemies flashed, flash assists) and D36 (early deaths) after the parser
 * starts emitting the grenade thrower, the game's flash-assist flag and the round's
 * freeze-end instant. Event times are game-clock instants (production: ~618 s in round 1),
 * so "early" is only measurable from the round's own live instant.
 */
import { describe, expect, it } from "vitest";

import {
  EARLY_DEATH_SECONDS,
  PARSER_CONTRACT_VERSION,
  PARSER_NAME,
  PARSER_VERSION,
} from "@/config/pipeline";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserEvent, RawParserOutput } from "@/lib/pipeline/types";

const ME = "76561198000000001";
const MATE = "76561198000000002";
const ENEMY = "76561198000000101";

const death = (
  round: number,
  time: number,
  attacker: string,
  victim: string,
  extra: Partial<RawParserEvent> = {},
): RawParserEvent => ({
  type: "player_death",
  round,
  time_seconds: time,
  attacker,
  victim,
  ...extra,
});

function build(events: RawParserEvent[], freeze: Array<number | undefined> = [600, 700]) {
  return normalizeParserOutput({
    parser: { name: PARSER_NAME, version: PARSER_VERSION },
    contract_version: PARSER_CONTRACT_VERSION,
    header: { map: "de_dust2", duration_seconds: 2000 },
    players: [
      { steam_id: ME, name: "me", team: "A" },
      { steam_id: MATE, name: "mate", team: "A" },
      { steam_id: ENEMY, name: "e1", team: "B" },
    ],
    rounds: [1, 2].map((number, index) => ({
      number,
      winner_side: "CT",
      start_tick: 1000 * number,
      end_tick: 1000 * number + 900,
      ...(freeze[index] === undefined ? {} : { freeze_end_time_seconds: freeze[index] }),
      duration_seconds: 90,
      sides: { [ME]: "CT", [MATE]: "CT", [ENEMY]: "T" },
    })),
    events,
  } as RawParserOutput);
}

describe("D36: early deaths are measured from the round's freeze end", () => {
  it("a death 12 s after the round went live is early even at game time 612 s", () => {
    const metrics = computeMetrics(
      build([death(1, 612, ENEMY, ME), death(2, 760, ENEMY, ME), death(2, 650 + 100, ME, ENEMY)]),
      ME,
    );
    expect(EARLY_DEATH_SECONDS).toBe(20);
    expect(metrics.earlyDeaths).toBe(1); // 612-600 = 12 s (early); 760-700 = 60 s (not)
  });

  it("the pre-D36 rule (absolute time <= 20 s) would have published 0: unknown reference => NULL", () => {
    const metrics = computeMetrics(build([death(1, 612, ENEMY, ME)], [undefined, 700]), ME);
    expect(metrics.earlyDeaths).toBeNull();
  });

  it("a death before the recorded live instant is inconsistent => NULL, never early", () => {
    const metrics = computeMetrics(build([death(1, 590, ENEMY, ME)]), ME);
    expect(metrics.earlyDeaths).toBeNull();
  });

  it("no death => 0 (observed), with every round referenced", () => {
    const metrics = computeMetrics(build([death(1, 650, ME, ENEMY)]), ME);
    expect(metrics.earlyDeaths).toBe(0);
  });
});

describe("D35: flash assists from the game's flag; enemies flashed only from blind events", () => {
  it("assisted_flash names the assister as the flash assister (no blind events needed)", () => {
    const metrics = computeMetrics(
      build([
        death(1, 620, MATE, ENEMY, { assister: ME, assisted_flash: true }),
        death(2, 720, MATE, ENEMY, { assister: ME, assisted_flash: false }),
        death(2, 730, ENEMY, MATE, { assisted_flash: false }),
      ]),
      ME,
    );
    expect(metrics.availability.flashAssistFlag).toBe(true);
    expect(metrics.flashAssists).toBe(1);
  });

  it("without the flag and without blind events, flash assists are NULL (never 0)", () => {
    const metrics = computeMetrics(
      build([
        death(1, 620, MATE, ENEMY, { assister: ME }),
        { type: "flashbang_detonate", round: 1, time_seconds: 615, attacker: ME },
      ]),
      ME,
    );
    expect(metrics.availability.blindEvents).toBe(false);
    expect(metrics.flashAssists).toBeNull();
  });

  it("thrown flashes count as grenades but never as enemies flashed", () => {
    const metrics = computeMetrics(
      build([
        death(1, 620, ME, ENEMY),
        { type: "flashbang_detonate", round: 1, time_seconds: 605, attacker: ME },
        { type: "flashbang_detonate", round: 2, time_seconds: 705, attacker: ME },
        { type: "smokegrenade_detonate", round: 2, time_seconds: 706, attacker: ME },
      ]),
      ME,
    );
    expect(metrics.grenadesUsed).toBe(3);
    expect(metrics.enemiesFlashed).toBeNull();
  });

  it("blind events count enemies only (teammates and self excluded)", () => {
    const metrics = computeMetrics(
      build([
        death(1, 620, ME, ENEMY),
        { type: "player_blind", round: 1, time_seconds: 606, attacker: ME, victim: ENEMY },
        { type: "player_blind", round: 1, time_seconds: 606, attacker: ME, victim: MATE },
        { type: "player_blind", round: 1, time_seconds: 606, attacker: ME, victim: ME },
      ]),
      ME,
    );
    expect(metrics.enemiesFlashed).toBe(1);
  });
});
