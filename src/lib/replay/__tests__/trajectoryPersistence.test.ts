/** PM2 4.2.4 — trajectory persistence: first write wins, never fails the job, no orphan status. */
import { describe, expect, it, vi } from "vitest";

import { persistRoundTrajectories } from "@/lib/replay/trajectory.persistence.server";
import type { RoundTrajectoriesWireV1 } from "@/lib/replay/trajectory";

const wire: RoundTrajectoriesWireV1 = {
  schema: "cs2.round-trajectory.v1",
  encoding: "e",
  status: "COMPLETE",
  reason: null,
  step_ticks: 16,
  skipped: [],
  rounds: [
    {
      round: 1,
      first_tick: 0,
      end_tick: 16,
      step_ticks: 16,
      sample_count: 2,
      dropped_players: 0,
      players: [{ steam_id: "123", side: "CT", xyz: "AAAAAAAAAAAAAAAA", alive: "11" }],
    },
  ],
};

function fakeDb(opts: { upserted: boolean; roundsError?: boolean; statusError?: boolean }) {
  const calls: string[] = [];
  const inserted: unknown[] = [];
  const db = {
    from(table: string) {
      return {
        upsert: () => ({
          select: async () => {
            calls.push(`upsert:${table}`);
            return opts.statusError
              ? { data: null, error: { code: "XX" } }
              : { data: opts.upserted ? [{ match_id: "m" }] : [], error: null };
          },
        }),
        insert: async (rows: unknown[]) => {
          calls.push(`insert:${table}`);
          inserted.push(...rows);
          return { error: opts.roundsError ? { code: "23514" } : null };
        },
        delete: () => ({
          eq: async () => {
            calls.push(`delete:${table}`);
            return { error: null };
          },
        }),
      };
    },
  };
  return { db: db as never, calls, inserted };
}

describe("persistRoundTrajectories", () => {
  it("stores status and rounds with participant keys", async () => {
    const f = fakeDb({ upserted: true });
    expect(
      await persistRoundTrajectories(f.db, {
        matchId: "m",
        trajectories: wire,
        parserRevision: "r",
      }),
    ).toBe("STORED");
    expect(f.calls).toEqual(["upsert:match_trajectories", "insert:round_trajectories"]);
    expect(f.inserted[0]).toMatchObject({
      round_number: 1,
      players: [{ participant_key: "123", side: "CT" }],
    });
  });

  it("never overwrites an existing match (first write wins)", async () => {
    const f = fakeDb({ upserted: false });
    expect(
      await persistRoundTrajectories(f.db, {
        matchId: "m",
        trajectories: wire,
        parserRevision: "r",
      }),
    ).toBe("ALREADY_STORED");
    expect(f.calls).toEqual(["upsert:match_trajectories"]);
  });

  it("removes the status row when rounds fail and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fakeDb({ upserted: true, roundsError: true });
    expect(
      await persistRoundTrajectories(f.db, {
        matchId: "m",
        trajectories: wire,
        parserRevision: "r",
      }),
    ).toBe("FAILED");
    expect(f.calls).toContain("delete:match_trajectories");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("123");
    warn.mockRestore();
  });

  it("is a no-op for workers without trajectories", async () => {
    const f = fakeDb({ upserted: true });
    expect(
      await persistRoundTrajectories(f.db, {
        matchId: "m",
        trajectories: null,
        parserRevision: null,
      }),
    ).toBe("ABSENT");
    expect(f.calls).toEqual([]);
  });
});
