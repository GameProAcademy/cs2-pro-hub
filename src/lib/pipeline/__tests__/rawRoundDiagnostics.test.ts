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

  it("decodes gzip JSONL rows", async () => {
    const bytes = new Uint8Array(gzipSync(Buffer.from('{"a":1}\n{"a":2}\n')));
    expect(await decodeGzipJsonLines(bytes)).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
