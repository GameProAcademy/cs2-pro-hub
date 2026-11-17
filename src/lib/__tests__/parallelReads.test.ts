/**
 * PM3 latency fix — the overview and the replay segment run independent reads together, with
 * unchanged semantics: error precedence of the overview, IDOR (an id outside the caller's own
 * overview is never queried), and the replay statuses evaluated in their original order.
 * The fake records every query (table + filters) and the peak number of reads in flight.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: () => {} }));
vi.mock("@/lib/quarantineRead.server", () => ({ quarantinedAmong: async () => new Set() }));

const { loadPlayerOverview } = await import("@/lib/playerData.functions");
const { replaySegment } = await import("@/lib/replay.functions");
const { stageTimer } = await import("@/lib/serverTiming");

type Result = { data: unknown; error: { code: string } | null };
const USER = "user-1";
const PLAYER = "player-1";
const MATCH = "44444444-4444-4444-8444-444444444444";
const FOREIGN = "55555555-5555-4555-8555-555555555555";

function fake(tables: Record<string, Result>) {
  const log: Array<{ table: string; filters: string[] }> = [];
  let inFlight = 0;
  let peak = 0;
  const from = (table: string) => {
    const entry = { table, filters: [] as string[] };
    log.push(entry);
    const run = () =>
      new Promise<Result>((resolve) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        setTimeout(() => {
          inFlight -= 1;
          resolve(tables[table] ?? { data: [], error: null });
        }, 5);
      });
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "order", "limit", "not", "or", "range"])
      chain[m] = (...args: unknown[]) => {
        entry.filters.push(`${m}:${JSON.stringify(args)}`);
        return chain;
      };
    chain["maybeSingle"] = () => run();
    chain["then"] = (ok: (r: Result) => unknown, ko: (e: unknown) => unknown) => run().then(ok, ko);
    return chain;
  };
  return { client: { from } as never, log, peak: () => peak };
}

const base: Record<string, Result> = {
  demo_jobs: { data: [], error: null },
  player_profiles: { data: [{ id: PLAYER }], error: null },
  match_metrics: {
    data: [{ match_id: MATCH, player_id: PLAYER, created_at: "2026-11-01" }],
    error: null,
  },
  matches: {
    data: [{ id: MATCH, map: "de_dust2", played_at: "2026-11-01T00:00:00Z" }],
    error: null,
  },
  match_flash_assist_provenance: { data: [], error: null },
};

describe("loadPlayerOverview (parallel reads)", () => {
  it("runs independent reads together", async () => {
    const f = fake(base);
    await loadPlayerOverview(f.client, USER);
    expect(f.peak()).toBeGreaterThanOrEqual(2);
    expect(f.log.map((q) => q.table).sort()).toEqual(
      [
        "demo_jobs",
        "match_flash_assist_provenance",
        "match_metrics",
        "matches",
        "player_profiles",
      ].sort(),
    );
  });

  it("keeps the original error precedence (jobs before players/metrics)", async () => {
    const f = fake({
      ...base,
      demo_jobs: { data: null, error: { code: "J1" } },
      match_metrics: { data: null, error: { code: "M1" } },
    });
    await expect(loadPlayerOverview(f.client, USER)).rejects.toThrow(
      "PLAYER_OVERVIEW_JOBS_FAILED:J1",
    );
    const g = fake({
      ...base,
      match_metrics: { data: null, error: { code: "M1" } },
      matches: { data: null, error: { code: "X1" } },
    });
    await expect(loadPlayerOverview(g.client, USER)).rejects.toThrow(
      "PLAYER_OVERVIEW_METRICS_FAILED:M1",
    );
  });
});

describe("replaySegment (parallel reads)", () => {
  const timer = () => stageTimer();

  it("never queries a match id outside the caller's own overview (IDOR → NOT_FOUND)", async () => {
    const f = fake(base);
    const r = await replaySegment(f.client, USER, { matchId: FOREIGN }, timer());
    expect(r).toEqual({ status: "NOT_FOUND" });
    expect(JSON.stringify(f.log)).not.toContain(FOREIGN);
    for (const t of [
      "match_participants",
      "match_trajectories",
      "match_rounds",
      "round_trajectories",
    ])
      expect(f.log.map((q) => q.table)).not.toContain(t);
  });

  it("no own participant wins over every later status", async () => {
    const f = fake({
      ...base,
      match_participants: { data: [], error: null },
      match_trajectories: { data: null, error: { code: "T1" } },
    });
    expect(await replaySegment(f.client, USER, { matchId: MATCH }, timer())).toEqual({
      status: "NO_PARTICIPANT",
    });
  });

  it("then trajectory status, then the rounds error, in the original order", async () => {
    const own = { data: [{ match_id: MATCH, participant_key: "76561190000000001" }], error: null };
    const f = fake({
      ...base,
      match_participants: own,
      match_trajectories: { data: null, error: null },
      match_rounds: { data: null, error: { code: "R1" } },
    });
    expect(await replaySegment(f.client, USER, { matchId: MATCH }, timer())).toEqual({
      status: "NOT_RECORDED",
      map: "de_dust2",
    });
    const g = fake({
      ...base,
      match_participants: own,
      match_trajectories: { data: { status: "COMPLETE", reason: null, skipped: [] }, error: null },
      match_rounds: { data: null, error: { code: "R1" } },
    });
    await expect(replaySegment(g.client, USER, { matchId: MATCH }, timer())).rejects.toThrow(
      "REPLAY_READ_FAILED:R1",
    );
    expect(g.peak()).toBeGreaterThanOrEqual(4);
  });
});
