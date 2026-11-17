/**
 * PM4 (R5.8.31): round_end events carry `money_spent` and `disconnected` into round_events.data,
 * only as well-formed `{steamId: number}` maps and only on round_end; nothing is coerced.
 */
import { describe, expect, it } from "vitest";

import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserEvent, RawParserOutput } from "@/lib/pipeline/types";

import { ENEMY_A, ME, syntheticParserOutput } from "./fixture";

const withEvents = (events: RawParserEvent[]): RawParserOutput => ({
  ...syntheticParserOutput,
  events: [...syntheticParserOutput.events, ...events],
});
const at = (raw: RawParserOutput, tick: number) =>
  normalizeParserOutput(raw).events.find((e) => e.tick === tick)?.data ?? {};

describe("PM4 round_end context in the normalizer", () => {
  it("stores spend and disconnects on round_end, keeping 0 as 0", () => {
    const d = at(
      withEvents([
        {
          type: "round_end",
          round: 1,
          tick: 990001,
          money_spent: { [ME]: 650, [ENEMY_A]: 0 },
          disconnected: { [ENEMY_A]: 500 },
        },
      ]),
      990001,
    );
    expect(d["money_spent"]).toEqual({ [ME]: 650, [ENEMY_A]: 0 });
    expect(d["disconnected"]).toEqual({ [ENEMY_A]: 500 });
  });

  it("drops malformed entries and never stores an empty map", () => {
    const d = at(
      withEvents([
        {
          type: "round_end",
          round: 1,
          tick: 990002,
          money_spent: { [ME]: Number.NaN, bot: 5 } as unknown as Record<string, number>,
          disconnected: {},
        },
      ]),
      990002,
    );
    expect(d).not.toHaveProperty("money_spent");
    expect(d).not.toHaveProperty("disconnected");
  });

  it("ignores the keys on any other event type", () => {
    const d = at(
      withEvents([
        {
          type: "player_death",
          round: 1,
          tick: 990003,
          attacker: ME,
          victim: ENEMY_A,
          weapon: "ak47",
          money_spent: { [ME]: 650 },
        },
      ]),
      990003,
    );
    expect(d).not.toHaveProperty("money_spent");
  });
});
