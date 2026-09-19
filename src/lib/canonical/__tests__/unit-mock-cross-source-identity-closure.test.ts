/**
 * FASE 2.6.11.5 — UNIT / MOCK PROOF (NOT a production E2E proof).
 *
 * This file exercises the production FUNCTIONS in isolation behind an in-memory
 * PostgREST-shaped fake (`fakeDb`). It is useful, fast regression cover for the
 * convergence chain, but it is NOT evidence that the pipeline works against the
 * real database. That evidence lives in `scripts/faceit-pipeline-proof.ts`
 * (REAL DB / REAL PRODUCTION PIPELINE) — see
 * docs/PHASE-2.6.11.5-FINAL-FACEIT-PRODUCTION-E2E-CLOSURE.md.
 *
 * FASE 2.6.11.3 — cross-source closure logic, component level.
 *
 * Every assertion here runs the PRODUCTION functions of the convergence chain:
 *
 *   FACEIT payload
 *     -> faceitParticipants()            (production roster extraction)
 *     -> resolveFaceitIdentities()       (real Identity Graph query contract)
 *     -> loadCandidates()                (player-neutral candidate discovery)
 *     -> resolveAgainstAll()             (deterministic resolution)
 *     -> canConvergeCrossSource()        (attach authorisation)
 *
 * Nothing is fabricated: no SteamID64 is invented or derived from a nickname, no
 * fingerprint is copied from the demo to FACEIT, and no external match id is
 * used as a universal identity. The Identity Graph rows are the ONLY source of
 * SteamID64s, and the database access layer is exercised through the same
 * Supabase query contract used in production.
 *
 * LIMITATION (documented, not hidden): the vitest environment has no service
 * role credential, so the routine-level proofs (atomic attach, rollback,
 * idempotency, concurrency, RLS) are executed against the real database
 * out-of-band and reported in the phase report — they are NOT claimed here.
 */
import { describe, expect, it } from "vitest";

import {
  faceitParticipants,
  loadCandidates,
  resolveFaceitIdentities,
  FaceitIdentityResolutionError,
} from "@/lib/faceit/faceit.canonical.server";
import type { FaceitMatch } from "@/lib/faceit/faceit.types";

import { canConvergeCrossSource, resolveAgainstAll } from "../canonical.resolver";
import type { MatchIdentityCandidate } from "../canonical.resolver";

/* ------------------------------------------------------------------ */
/* Identity Graph / canonical tables, behind the real query contract. */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

interface Fixture {
  player_identities: Row[];
  match_participants: Row[];
  matches: Row[];
  match_sources: Row[];
  raw_demo_evidence_reports: Row[];
  failOn?: string;
}

/** Minimal PostgREST-shaped client: same call chain the production code uses. */
function fakeDb(fixture: Fixture) {
  const builder = (table: string) => {
    let rows = [...((fixture as unknown as Record<string, Row[]>)[table] ?? [])];
    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((r) => r[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((r) => values.includes(r[column]));
        return api;
      },
      gte(column: string, value: string) {
        rows = rows.filter((r) => String(r[column]) >= value);
        return api;
      },
      lte(column: string, value: string) {
        rows = rows.filter((r) => String(r[column]) <= value);
        return api;
      },
      limit() {
        return api;
      },
      then(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) {
        if (fixture.failOn === table) {
          return Promise.resolve(resolve({ data: null, error: { message: "permission denied" } }));
        }
        return Promise.resolve(resolve({ data: rows, error: null }));
      },
    };
    return api;
  };
  return { from: builder } as never;
}

/** Ten real-shaped SteamID64s, stored in the graph — never derived in code. */
const STEAM = [
  "76561198000000001",
  "76561198000000002",
  "76561198000000003",
  "76561198000000004",
  "76561198000000005",
  "76561198000000006",
  "76561198000000007",
  "76561198000000008",
  "76561198000000009",
  "76561198000000010",
];
const FACEIT_IDS = STEAM.map((_, i) => `faceit-player-${i + 1}`);

function graphFixture(linked = STEAM.length): Fixture {
  const identities: Row[] = [];
  FACEIT_IDS.forEach((faceitId, index) => {
    const playerId = `player-${index + 1}`;
    identities.push({
      platform: "FACEIT",
      external_id: faceitId,
      player_id: playerId,
      identity_status: "strongly_correlated",
    });
    if (index < linked) {
      identities.push({
        platform: "STEAM",
        external_id: STEAM[index],
        player_id: playerId,
        identity_status: "verified",
      });
    }
  });
  return {
    player_identities: identities,
    match_participants: [],
    matches: [],
    match_sources: [],
    raw_demo_evidence_reports: [],
  };
}

const DEMO_MATCH_ID = "demo-canonical-match";
const PLAYED_AT = "2026-03-01T20:00:00.000Z";

function demoCanonicalFixture(roster: string[], overrides: Row = {}): Fixture {
  const base = graphFixture();
  return {
    ...base,
    matches: [
      {
        id: DEMO_MATCH_ID,
        data_source: "demo",
        external_match_id: null,
        // The demo fingerprint is NEVER shared with FACEIT.
        content_fingerprint: "a".repeat(64),
        map: "de_mirage",
        played_at: PLAYED_AT,
        match_date: PLAYED_AT,
        round_count: 22,
        score_team_a: 13,
        score_team_b: 9,
        // A canonical match belongs to no player.
        player_id: null,
        ...overrides,
      },
    ],
    match_participants: roster.map((steamId) => ({
      match_id: DEMO_MATCH_ID,
      steam_id64: steamId,
    })),
    match_sources: [
      {
        match_id: DEMO_MATCH_ID,
        source: "demo",
        upload_id: "approved-demo-upload",
      },
    ],
    raw_demo_evidence_reports: [
      {
        upload_id: "approved-demo-upload",
        approved_for_canonical: true,
        raw_audit_status: "APPROVED",
      },
    ],
  };
}

function faceitDetails(): FaceitMatch {
  return {
    match_id: "1-faceit-real",
    status: "finished",
    finished_at: Math.floor(Date.parse(PLAYED_AT) / 1000),
    teams: {
      faction1: {
        name: "team_alpha",
        roster: FACEIT_IDS.slice(0, 5).map((id, i) => ({
          player_id: id,
          nickname: `alpha${i + 1}`,
        })),
      },
      faction2: {
        name: "team_beta",
        roster: FACEIT_IDS.slice(5).map((id, i) => ({
          player_id: id,
          nickname: `beta${i + 1}`,
        })),
      },
    },
  } as unknown as FaceitMatch;
}

async function faceitIncoming(fixture: Fixture): Promise<{
  incoming: MatchIdentityCandidate;
  resolution: string;
  proven: string[];
}> {
  const db = fakeDb(fixture);
  const participants = faceitParticipants(faceitDetails(), null, FACEIT_IDS[0]!, "team_a");
  const graph = await resolveFaceitIdentities(
    db,
    participants.map((p) => p.externalPlayerId),
  );
  const proven = participants
    .map((p) => graph.identities.get(p.externalPlayerId)?.steamId64 ?? null)
    .filter((id): id is string => typeof id === "string");

  return {
    proven,
    resolution: graph.resolution,
    incoming: {
      source: "faceit",
      externalMatchId: "1-faceit-real",
      // Production reality: FACEIT has no content fingerprint.
      fingerprint: null,
      map: "de_mirage",
      playedAt: PLAYED_AT,
      roundCount: 22,
      scoreTeamA: 13,
      scoreTeamB: 9,
      participantSteamIds: proven,
    },
  };
}

/* --------------------------------- gates -------------------------------- */

describe("UNIT/MOCK cross-source closure (fakeDb — not a production E2E proof)", () => {
  it("A/B — FACEIT ids resolve to Steam identities exclusively through the graph", async () => {
    const { proven, resolution } = await faceitIncoming(demoCanonicalFixture(STEAM));
    expect(resolution).toBe("RESOLVED");
    expect(proven.sort()).toEqual([...STEAM].sort());

    // No SteamID64 may be derivable from the FACEIT payload itself.
    const payload = JSON.stringify(faceitDetails());
    for (const steamId of STEAM) expect(payload).not.toContain(steamId);
  });

  it("C — candidate discovery is player-neutral (canonical match has player_id = NULL)", async () => {
    const fixture = demoCanonicalFixture(STEAM);
    const candidates = await loadCandidates(fakeDb(fixture), PLAYED_AT, STEAM);
    expect(candidates.map((c) => c.canonicalMatchId)).toEqual([DEMO_MATCH_ID]);
    expect(candidates[0]?.participantSteamIds?.length).toBe(10);
  });

  it("D/E — full identical proven roster on the same map yields EXACT and authorises attach", async () => {
    const fixture = demoCanonicalFixture(STEAM);
    const { incoming } = await faceitIncoming(fixture);
    const candidates = await loadCandidates(
      fakeDb(fixture),
      PLAYED_AT,
      incoming.participantSteamIds!,
    );
    const resolved = resolveAgainstAll(incoming, candidates);

    expect(resolved.decision.resolution).toBe("EXACT_MATCH");
    expect(resolved.decision.signals).toContain("cross_source_roster_identical");
    expect(canConvergeCrossSource(resolved.decision)).toBe(true);
    expect(resolved.candidate?.canonicalMatchId).toBe(DEMO_MATCH_ID);
    // The evidence is the identities, not a copied fingerprint.
    expect(incoming.fingerprint).toBeNull();
  });

  it("G — a similar but different match is NEVER attached (partial roster + same map + close time)", async () => {
    const fixture = demoCanonicalFixture(STEAM.slice(0, 7));
    const { incoming } = await faceitIncoming(fixture);
    const candidates = await loadCandidates(
      fakeDb(fixture),
      PLAYED_AT,
      incoming.participantSteamIds!,
    );
    const resolved = resolveAgainstAll(incoming, candidates);

    expect(resolved.decision.resolution).toBe("PROBABLE_MATCH");
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
  });

  it("G — a contradicting score is a CONFLICT and never attaches", async () => {
    const fixture = demoCanonicalFixture(STEAM, { score_team_a: 7, score_team_b: 16 });
    const { incoming } = await faceitIncoming(fixture);
    const candidates = await loadCandidates(
      fakeDb(fixture),
      PLAYED_AT,
      incoming.participantSteamIds!,
    );
    const resolved = resolveAgainstAll(incoming, candidates);

    expect(resolved.decision.resolution).toBe("CONFLICT");
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
  });

  it("H — partial identity resolution never fabricates the missing accounts nor reaches EXACT", async () => {
    const fixture: Fixture = { ...graphFixture(4), ...demoCanonicalFixture(STEAM) };
    fixture.player_identities = graphFixture(4).player_identities;
    const { proven, resolution, incoming } = await faceitIncoming(fixture);

    expect(resolution).toBe("IDENTITY_UNRESOLVED");
    expect(proven).toHaveLength(4);
    const candidates = await loadCandidates(fakeDb(fixture), PLAYED_AT, proven);
    const resolved = resolveAgainstAll(incoming, candidates);
    expect(resolved.decision.resolution).not.toBe("EXACT_MATCH");
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
  });

  it("I — a failing Identity Graph query is an ERROR, never 'no identity found'", async () => {
    const fixture: Fixture = { ...demoCanonicalFixture(STEAM), failOn: "player_identities" };
    await expect(resolveFaceitIdentities(fakeDb(fixture), FACEIT_IDS)).rejects.toBeInstanceOf(
      FaceitIdentityResolutionError,
    );
  });

  it("I — an empty graph is UNRESOLVED, with no invented identity", async () => {
    const empty: Fixture = {
      player_identities: [],
      match_participants: [],
      matches: [],
      match_sources: [],
      raw_demo_evidence_reports: [],
    };
    const graph = await resolveFaceitIdentities(fakeDb(empty), FACEIT_IDS);
    expect(graph.resolution).toBe("IDENTITY_UNRESOLVED");
    expect(graph.identities.size).toBe(0);
  });
});
