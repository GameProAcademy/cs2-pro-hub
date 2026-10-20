import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { decodeGzipJsonLines, summarizeRoundDiagnostics } from "@/lib/pipeline/rawRoundDiagnostics";

describe("RAW round-boundary diagnostics", () => {
  it("lists rounds without a boundary and the lifecycle ticks they were paired from", () => {
    const out = summarizeRoundDiagnostics(
      [
        { number: 1, start_tick: 100, end_tick: 200, winner_side: "CT" },
        { number: 2, start_tick: 300, end_tick: null },
        { number: 3, start_tick: null, end_tick: 500 },
      ],
      [
        { event_name: "round_start", tick: 300 },
        { event_name: "round_start", tick: 100 },
        { event_name: "round_end", tick: 200, raw_fields: { winner: 3, reason: 9, message: "x" } },
        { event_name: "player_death", tick: 150, raw_fields: { attacker_name: "secret" } },
      ],
    );
    expect(out.rounds_without_end).toEqual([2]);
    expect(out.rounds_without_start).toEqual([3]);
    expect(out.rounds[0]).toEqual({ number: 1, start_tick: 100, end_tick: 200, has_winner: true });
    expect(out.lifecycle["round_start"]).toEqual({ count: 2, ticks: [100, 300] });
    expect(out.lifecycle["round_end"]).toEqual({ count: 1, ticks: [200] });
    expect(out.round_end_raw_fields).toEqual(["message", "reason", "winner"]);
    expect(out.round_end_winner_values).toEqual(["3"]);
    // Non-lifecycle events and their fields never leak into the report.
    expect(JSON.stringify(out)).not.toContain("secret");
    expect(JSON.stringify(out)).not.toContain("attacker_name");
  });

  it("places kills and bomb events against round intervals without returning identities", () => {
    const out = summarizeRoundDiagnostics(
      [
        { number: 1, start_tick: 100, end_tick: 200 },
        { number: 2, start_tick: 300, end_tick: null },
      ],
      [
        { event_name: "player_death", tick: 50, raw_fields: { user_steamid: "76561190000000001" } },
        {
          event_name: "player_death",
          tick: 120,
          total_rounds_played: 0,
          raw_fields: { user_steamid: "76561190000000001" },
        },
        {
          event_name: "player_death",
          tick: 150,
          total_rounds_played: 1,
          raw_fields: { user_steamid: "76561190000000001" },
        },
        {
          event_name: "player_death",
          tick: 350,
          raw_fields: { user_steamid: "76561190000000002", total_rounds_played: 1 },
        },
        {
          event_name: "bomb_planted",
          tick: 320,
          raw_fields: { user_steamid: "76561190000000003" },
        },
        { event_name: "bomb_exploded", tick: 250 },
      ],
      [
        { tick: 10, total_rounds_played: 0, is_warmup_period: true, steamid: "76561190000000009" },
        { tick: 10, total_rounds_played: 0, is_warmup_period: true },
        { tick: 20, total_rounds_played: 0, is_warmup_period: false },
        { tick: 30, total_rounds_played: 0, is_warmup_period: false },
        { tick: 210, total_rounds_played: 1, is_warmup_period: false, name: "secret" },
      ],
    );
    expect(out.combat.kills_per_round).toEqual([
      {
        round: 1,
        kills: 2,
        repeated_victims: 1,
        total_rounds_played_at_kills: ["0", "1"],
        repeated_victim_deaths: [
          [
            {
              tick: 120,
              weapon: null,
              attacker_present: false,
              attacker_is_victim: false,
              field_names: ["user_steamid"],
            },
            {
              tick: 150,
              weapon: null,
              attacker_present: false,
              attacker_is_victim: false,
              field_names: ["user_steamid"],
            },
          ],
        ],
      },
      {
        round: 2,
        kills: 1,
        repeated_victims: 0,
        total_rounds_played_at_kills: ["1"],
        repeated_victim_deaths: [],
      },
    ]);
    expect(out.combat.kills_outside_rounds).toEqual({ count: 1, ticks: [50] });
    expect(out.combat.bomb_events).toEqual([
      { event: "bomb_exploded", tick: 250, round: null },
      { event: "bomb_planted", tick: 320, round: 2 },
    ]);
    expect(out.state_timeline.sampled_ticks).toBe(4);
    expect(out.state_timeline.changes.map((c) => c["tick"])).toEqual([10, 20, 210]);
    const text = JSON.stringify(out);
    expect(text).not.toContain("7656119");
    expect(text).not.toContain("secret");
  });

  it("decodes gzip JSONL rows", async () => {
    const bytes = new Uint8Array(gzipSync(Buffer.from('{"a":1}\n{"a":2}\n')));
    expect(await decodeGzipJsonLines(bytes)).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
