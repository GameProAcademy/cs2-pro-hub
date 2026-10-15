import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  aggregate,
  buildOverview,
  deriveState,
  jobIdentity,
  shapeMatches,
  type OverviewJobRow,
  type OverviewMatchRow,
  type OverviewMetricRow,
} from "../playerOverview";

const NOW = new Date("2026-10-14T12:00:00Z");
const job = (status: string, extra: Partial<OverviewJobRow> = {}): OverviewJobRow => ({
  id: crypto.randomUUID(),
  upload_id: crypto.randomUUID(),
  status,
  queued_at: "2026-10-14T05:00:00Z",
  finished_at: null,
  error_code: null,
  attachment_state: null,
  attachment_confirmation_status: null,
  ...extra,
});
const match = (id: string, extra: Partial<OverviewMatchRow> = {}): OverviewMatchRow => ({
  id,
  map: "de_mirage",
  played_at: "2026-10-10T20:00:00Z",
  match_date: null,
  created_at: "2026-10-10T21:00:00Z",
  result: "win",
  score_player: 13,
  score_opponent: 9,
  data_source: "demo",
  ...extra,
});
const metric = (matchId: string, extra: Partial<OverviewMetricRow> = {}): OverviewMetricRow => ({
  match_id: matchId,
  kills: 20,
  deaths: 10,
  assists: 4,
  adr: "85.50",
  kast: "72.00",
  hs_percent: "48.00",
  rating: "1.21",
  rounds_played: 22,
  ...extra,
});

function overview(
  jobs: OverviewJobRow[],
  metrics: OverviewMetricRow[] = [],
  matches: OverviewMatchRow[] = [],
) {
  return buildOverview({ jobs, fileNames: new Map(), metrics, matches, now: NOW });
}

describe("player overview: honest states, never invented values", () => {
  it("is EMPTY with no upload and carries no number", () => {
    const o = overview([]);
    expect(o.state).toBe("EMPTY");
    expect(o.matches).toEqual([]);
    expect(o.aggregates).toBeNull();
  });

  it("orders states by what the player can act on", () => {
    const counts = {
      total: 5,
      inFlight: 1,
      processed: 1,
      failed: 1,
      blocked: 1,
      cancelled: 0,
      identityPending: 1,
    };
    expect(deriveState(counts, 0)).toBe("PROCESSING");
    expect(deriveState({ ...counts, inFlight: 0 }, 0)).toBe("IDENTITY_PENDING");
    expect(deriveState({ ...counts, inFlight: 0, identityPending: 0 }, 0)).toBe("BLOCKED");
    expect(deriveState({ ...counts, inFlight: 0, identityPending: 0, blocked: 0 }, 0)).toBe(
      "FAILED",
    );
    expect(
      deriveState({ ...counts, inFlight: 0, identityPending: 0, blocked: 0, failed: 0 }, 0),
    ).toBe("EMPTY");
    expect(deriveState(counts, 1)).toBe("READY");
  });

  it("reflects the managed state of 2026-10-14: demos held by the RAW audit, none persisted", () => {
    const o = overview([job("blocked_raw_audit"), job("blocked_raw_audit"), job("failed")]);
    expect(o.state).toBe("BLOCKED");
    expect(o.counts).toMatchObject({ total: 3, blocked: 2, failed: 1, processed: 0 });
    expect(o.aggregates).toBeNull();
  });

  it("requires a confirmed identity on processed demos", () => {
    expect(
      jobIdentity({
        status: "processed",
        attachment_state: "attached",
        attachment_confirmation_status: "user_confirmed",
      }),
    ).toBe("CONFIRMED");
    expect(
      jobIdentity({
        status: "processed",
        attachment_state: "attached",
        attachment_confirmation_status: "manual_selected",
      }),
    ).toBe("CONFIRMED");
    expect(
      jobIdentity({
        status: "processed",
        attachment_state: "attached",
        attachment_confirmation_status: "auto",
      }),
    ).toBe("PENDING");
    expect(
      jobIdentity({
        status: "processed",
        attachment_state: "unattached",
        attachment_confirmation_status: null,
      }),
    ).toBe("UNATTACHED");
    expect(
      jobIdentity({
        status: "processed",
        attachment_state: "conflict",
        attachment_confirmation_status: null,
      }),
    ).toBe("CONFLICT");
    expect(
      jobIdentity({
        status: "failed",
        attachment_state: "attached",
        attachment_confirmation_status: "user_confirmed",
      }),
    ).toBe("NOT_APPLICABLE");
    expect(overview([job("processed", { attachment_state: "unattached" })]).state).toBe(
      "IDENTITY_PENDING",
    );
  });

  it("is READY only from real metric rows joined to a readable match", () => {
    const o = overview([job("processed")], [metric("m1"), metric("unreadable")], [match("m1")]);
    expect(o.state).toBe("READY");
    expect(o.matches.map((m) => m.matchId)).toEqual(["m1"]); // a metric without its match is dropped
    expect(o.matches[0]).toMatchObject({
      adr: 85.5,
      kast: 72,
      hsPercent: 48,
      rating: 1.21,
      kills: 20,
      deaths: 10,
    });
  });

  it("averages only present values and never fills a gap", () => {
    const rows = shapeMatches(
      [metric("a"), metric("b", { adr: null, kast: null, deaths: null, rating: "x" })],
      [match("a"), match("b", { result: "loss" })],
    );
    const a = aggregate(rows)!;
    expect(a.matches).toBe(2);
    expect(a.adr).toBe(85.5);
    expect(a.kast).toBe(72);
    expect(a.rating).toBe(1.21);
    expect(a.kd).toBe(2); // only the match with both kills and deaths counts
    expect([a.wins, a.decided]).toEqual([1, 2]);
    expect(aggregate([])).toBeNull();
  });

  it("drops unknown job statuses instead of guessing", () => {
    expect(overview([job("mystery")]).counts.total).toBe(0);
  });
});

describe("production pages never read demonstration data", () => {
  const read = (path: string) => readFileSync(resolve(path), "utf8");

  it("the server function reads with the caller's session, scoped to the caller", () => {
    const source = read("src/lib/playerData.functions.ts");
    expect(source).toContain(".middleware([requireSupabaseAuth])");
    expect(source).not.toMatch(/service_role|supabaseAdmin|client\.server/);
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('.in("player_id", playerIds)');
    expect(source).not.toMatch(/@\/data\/|playerService/);
  });

  it("every analysis page switches on DEMO_DATA, and real components import no mock", () => {
    for (const page of [
      "dashboard",
      "matches",
      "player-dna",
      "coach",
      "analysis",
      "performance",
      "training",
    ]) {
      const source = read(`src/routes/_authenticated/${page}.tsx`);
      expect(source, page).toMatch(/component: DEMO_DATA \? \w+ : Real\w+,/);
    }
    const real = read("src/components/real/RealData.tsx");
    expect(real).not.toMatch(/@\/data\/|playerService|demoPlayer/);
  });
});

describe("admission provenance (admission contract v3)", () => {
  const metric = (matchId: string): OverviewMetricRow => ({
    match_id: matchId,
    kills: 20,
    deaths: 15,
    assists: 4,
    adr: "80",
    kast: "70",
    hs_percent: "50",
    rating: "1.1",
    rounds_played: 22,
  });

  it("marks a match LIMITED with its limitations and counts it in the aggregates", () => {
    const overview = buildOverview({
      jobs: [
        job("processed", {
          match_id: "m1",
          admission_verdict: "LIMITED",
          admission_limitations: ["L03-USERCMD-UNAVAILABLE", "L01-CAPABILITY-SURFACE-UNENUMERABLE"],
        }),
      ],
      fileNames: new Map(),
      metrics: [metric("m1")],
      matches: [match("m1", { result: null, score_player: null, score_opponent: null })],
      now: NOW,
    });
    expect(overview.matches[0]?.admission).toBe("LIMITED");
    expect(overview.matches[0]?.limitations).toEqual([
      "L01-CAPABILITY-SURFACE-UNENUMERABLE",
      "L03-USERCMD-UNAVAILABLE",
    ]);
    expect(overview.aggregates?.limited).toBe(1);
    // A limited match without a result never enters the win rate.
    expect(overview.aggregates?.decided).toBe(0);
  });

  it("never hides a limitation behind another admission of the same match", () => {
    const shaped = shapeMatches(
      [metric("m1")],
      [match("m1")],
      [
        job("processed", { match_id: "m1", admission_verdict: "PASS", admission_limitations: [] }),
        job("processed", {
          match_id: "m1",
          admission_verdict: "LIMITED",
          admission_limitations: ["L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE"],
        }),
      ],
    );
    expect(shaped[0]?.admission).toBe("LIMITED");
  });

  it("gives no admission label to a match without a v3 decision, nor from a job that did not finish", () => {
    const shaped = shapeMatches(
      [metric("m1"), metric("m2")],
      [match("m1"), match("m2")],
      [
        job("processed", { match_id: "m1", admission_verdict: null }),
        job("blocked_raw_audit", { match_id: "m2", admission_verdict: "LIMITED" }),
      ],
    );
    expect(shaped.map((m) => m.admission)).toEqual([null, null]);
  });
});
