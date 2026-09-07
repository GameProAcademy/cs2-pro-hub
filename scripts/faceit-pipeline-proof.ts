/**
 * FASE 2.6.11.5 — REAL FACEIT PRODUCTION PIPELINE E2E PROOF.
 *
 *   bun scripts/faceit-pipeline-proof.ts
 *
 * THIS IS NOT A UNIT TEST AND USES NO MOCK. There is no `fakeDb`, no injected
 * SteamID64, no fabricated fingerprint and no hand-built canonical bundle on the
 * FACEIT side. A realistic FACEIT payload is parsed by the PRODUCTION zod
 * contract, mapped by the PRODUCTION mapper and handed to the PRODUCTION
 * entry point `persistFaceitObservation()`, which internally runs:
 *
 *   faceitParticipants()
 *     -> resolveFaceitIdentities()   (real player_identities rows)
 *     -> faceitToCanonicalObservation()
 *     -> loadCandidates()            (canonical participants, never player_id)
 *     -> resolveAgainstAll()
 *     -> persistCanonicalObservation()
 *     -> persist_canonical_observation_attached()  (one transaction)
 *
 * Every verdict below is a row (or the proven absence of a row) in the real
 * database. Fixtures are namespaced by a run id and removed in `finally`.
 *
 * Requires the server environment: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Optional: SUPABASE_PUBLISHABLE_KEY (Identity Graph query-error gate). A
 * missing credential is reported as BLOCKED, never as PASS.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  persistCanonicalObservation,
  CanonicalPersistenceError,
} from "@/lib/canonical/canonical.persistence.server";
import {
  SOURCE_CONTRACT_VERSIONS,
  CANONICAL_SCHEMA_VERSION,
} from "@/lib/canonical/canonical.versions";
import type {
  CanonicalMatchBundle,
  CanonicalParticipant,
  CanonicalQuality,
} from "@/lib/canonical/canonical.types";
import {
  persistFaceitObservation,
  faceitParticipants,
  resolveFaceitIdentities,
  FaceitIdentityResolutionError,
} from "@/lib/faceit/faceit.canonical.server";
import { mapFaceitMatchToMatch } from "@/lib/faceit/faceit.mapper";
import { faceitMatchSchema, parseFaceit, type FaceitMatch } from "@/lib/faceit/faceit.types";
import type { Database } from "@/integrations/supabase/types";

const RUN = randomUUID().slice(0, 8);
const MAP = "de_mirage";
const GAME_ID = "cs2";
const SOURCE_VERSION = "faceit-data-v4";

/** Competitive instants used by the scenarios (start != finish everywhere). */
const T1_START = "2026-02-10T20:00:00.000Z";
const T1_FINISH = "2026-02-10T20:41:00.000Z";
const T3_START = "2026-02-11T20:00:00.000Z";
const T4_START = "2026-02-12T20:00:00.000Z";

const iso = (value: string) => new Date(value).toISOString();
const epoch = (value: string) => Math.floor(Date.parse(value) / 1000);

/* ------------------------------------------------------------------ */
/* Reporting                                                            */
/* ------------------------------------------------------------------ */

type Verdict = "PASS" | "FAIL" | "BLOCKED" | "NOT_PROVEN";
const results: Array<{ gate: string; verdict: Verdict; evidence: string }> = [];

function record(gate: string, verdict: Verdict, evidence: string) {
  results.push({ gate, verdict, evidence });
  console.log(`${verdict.padEnd(10)} ${gate} :: ${evidence}`);
}
function check(gate: string, condition: boolean, evidence: string) {
  record(gate, condition ? "PASS" : "FAIL", evidence);
  return condition;
}

/* ------------------------------------------------------------------ */
/* FACEIT fixture — realistic payload, parsed by the production schema  */
/* ------------------------------------------------------------------ */

function faceitPayload(args: {
  matchId: string;
  faceitIds: readonly string[];
  startedAt: string;
  finishedAt: string;
  scoreA?: number;
  scoreB?: number;
}): FaceitMatch {
  const rosterA = args.faceitIds.slice(0, 5);
  const rosterB = args.faceitIds.slice(5, 10);
  const raw = {
    match_id: args.matchId,
    game: GAME_ID,
    region: "SA",
    competition_name: "CS2 5v5 PREMADE",
    competition_type: "matchmaking",
    organizer_id: "faceit",
    status: "FINISHED",
    best_of: 1,
    started_at: epoch(args.startedAt),
    finished_at: epoch(args.finishedAt),
    faceit_url: `https://www.faceit.com/en/cs2/room/${args.matchId}`,
    demo_url: [],
    voting: { map: { pick: [MAP] } },
    results: {
      winner: "faction1",
      score: { faction1: args.scoreA ?? 13, faction2: args.scoreB ?? 9 },
    },
    teams: {
      faction1: {
        team_id: `${RUN}-faction1`,
        nickname: `team_${RUN}_a`,
        roster: rosterA.map((id, i) => ({ player_id: id, nickname: `alpha${i + 1}` })),
      },
      faction2: {
        team_id: `${RUN}-faction2`,
        nickname: `team_${RUN}_b`,
        roster: rosterB.map((id, i) => ({ player_id: id, nickname: `beta${i + 1}` })),
      },
    },
  };
  // Production validator: the fixture must satisfy the real contract.
  return parseFaceit(faceitMatchSchema, raw) as FaceitMatch;
}

/* ------------------------------------------------------------------ */
/* DEMO side — fixture data only; the path under test is the FACEIT one */
/* ------------------------------------------------------------------ */

const quality = (status: CanonicalQuality["status"], reasons: string[] = []): CanonicalQuality => ({
  status,
  reasons,
  confidence: null,
});

function demoBundle(args: {
  fingerprint: string;
  roster: readonly string[];
  startedAt: string;
  finishedAt: string;
}): CanonicalMatchBundle {
  const participants: CanonicalParticipant[] = args.roster.map((steamId, index) => ({
    participantKey: steamId,
    internalPlayerId: null,
    source: "demo",
    externalPlayerId: null,
    steamId64: steamId,
    nicknameSnapshot: null,
    team: index < 5 ? "team_a" : "team_b",
    isTargetPlayer: index === 0,
    identityStatus: "verified",
    identityConfidence: null,
    metadata: {},
  }));
  return {
    observation: {
      source: "demo",
      sourceContractVersion: SOURCE_CONTRACT_VERSIONS.demo,
      externalMatchId: null,
      externalParentId: null,
      sourceVersion: null,
      fetchedAt: new Date().toISOString(),
      sourceUpdatedAt: null,
      status: "complete",
      quality: quality("complete"),
      fingerprint: args.fingerprint,
      metadata: { faceit_e2e_proof_run: RUN },
    },
    series: null,
    match: {
      game: "cs2",
      map: MAP,
      mapNumber: null,
      playedAt: iso(args.startedAt),
      startedAt: iso(args.startedAt),
      finishedAt: iso(args.finishedAt),
      durationSeconds: null,
      status: "completed",
      finished: true,
      terminal: true,
      teamA: `demo-${RUN}-A`,
      teamB: `demo-${RUN}-B`,
      scoreTeamA: 13,
      scoreTeamB: 9,
      winnerTeam: "team_a",
      roundCount: 22,
      quality: quality("complete"),
      coverage: {
        roundsExpected: null,
        roundsObserved: null,
        participantsExpected: participants.length,
        participantsObserved: participants.length,
        participantsResolved: participants.length,
        eventsObserved: null,
      },
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    participants,
    rounds: [],
    roundPlayers: [],
    events: [],
  };
}

/* ------------------------------------------------------------------ */

async function main() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const touchedMatchIds = new Set<string>();
  const touchedUserIds = new Set<string>();
  const touchedProfileIds = new Set<string>();


  console.log(`\nFACEIT production pipeline E2E proof run=${RUN}\n`);

  try {
    /* ---------------------------------------------------------------- */
    /* Identity Graph fixtures: 20 REAL accounts, each with a FACEIT and  */
    /* a proven STEAM identity. No SteamID64 ever enters a FACEIT payload.*/
    /* ---------------------------------------------------------------- */
    const groups: Array<{ faceit: string[]; steam: string[] }> = [
      { faceit: [], steam: [] },
      { faceit: [], steam: [] },
    ];
    let created = 0;
    for (let g = 0; g < 2; g += 1) {
      for (let i = 0; i < 10; i += 1) {
        const index = g * 10 + i;
        const steamId = `7656119${(8100000000 + index).toString()}`;
        const faceitId = `${RUN}-fc-${g}-${i}`;
        const user = await supabaseAdmin.auth.admin.createUser({
          email: `faceit-e2e-${RUN}-${index}@faceit-proof.invalid`,
          password: randomUUID(),
          email_confirm: true,
        });
        if (user.error || !user.data.user) break;
        touchedUserIds.add(user.data.user.id);
        const profile = await supabaseAdmin
          .from("player_profiles")
          .select("id")
          .eq("user_id", user.data.user.id)
          .maybeSingle();
        const profileId = profile.data?.id;
        if (!profileId) break;
        touchedProfileIds.add(profileId);

        const inserted = await supabaseAdmin.from("player_identities").insert([
          {
            player_id: profileId,
            platform: "FACEIT",
            external_id: faceitId,
            identity_status: "verified",
            is_verified: true,
          },
          {
            player_id: profileId,
            platform: "STEAM",
            external_id: steamId,
            identity_status: "verified",
            is_verified: true,
          },
        ]);
        if (inserted.error) break;
        groups[g]!.faceit.push(faceitId);
        groups[g]!.steam.push(steamId);
        created += 1;
      }
    }

    if (created !== 20) {
      record(
        "01 — Identity Graph fixtures (20 real accounts)",
        "BLOCKED",
        `only ${created}/20 fixtures could be created; every downstream gate is BLOCKED`,
      );
      return;
    }
    record(
      "01 — Identity Graph fixtures (20 real accounts)",
      "PASS",
      `accounts=20 faceitIdentities=20 steamIdentities=20 (no SteamID in any FACEIT payload)`,
    );

    const A = groups[0]!;
    const C = groups[1]!;
    const ownerProfile = await supabaseAdmin
      .from("player_profiles")
      .select("id, user_id")
      .eq("user_id", [...touchedUserIds][0]!)
      .maybeSingle();
    const ownerPlayerId = ownerProfile.data?.id ?? null;

    /** Runs the REAL production entry point for one FACEIT payload. */
    const runPipeline = async (
      details: FaceitMatch,
      faceitPlayerId: string,
      db = supabaseAdmin,
    ) => {
      const mapped = mapFaceitMatchToMatch({
        playerId: faceitPlayerId,
        details,
        sourceVersion: SOURCE_VERSION,
        gameId: GAME_ID,
      });
      if (!mapped) throw new Error("mapper returned null");
      return {
        mapped,
        result: await persistFaceitObservation({
          db,
          playerId: ownerPlayerId!,
          faceitPlayerId,
          mapped,
          details,
          stats: null,
        }),
      };
    };

    /* Gate 02/03 — the production roster extraction and the real graph. */
    const positivePayload = faceitPayload({
      matchId: `${RUN}-faceit-positive`,
      faceitIds: A.faceit,
      startedAt: T1_START,
      finishedAt: T1_FINISH,
    });
    const extracted = faceitParticipants(positivePayload, null, A.faceit[0]!, "team_a");
    check(
      "02 — faceitParticipants() extracts 10 FACEIT ids and NO SteamID",
      extracted.length === 10 && extracted.every((p) => p.steamId64 === null),
      `participants=${extracted.length} steamIdsInPayload=${
        JSON.stringify(positivePayload).match(/765611/g)?.length ?? 0
      }`,
    );

    const graph = await resolveFaceitIdentities(supabaseAdmin, A.faceit);
    const proven = A.faceit
      .map((id) => graph.identities.get(id)?.steamId64)
      .filter((id): id is string => typeof id === "string");
    check(
      "03 — Identity Graph resolves FACEIT -> profile -> SteamID64",
      graph.resolution === "RESOLVED" &&
        proven.length === 10 &&
        proven.every((id) => A.steam.includes(id)),
      `resolution=${graph.resolution} resolved=${proven.length}/10`,
    );

    /* Gate 04 — DEMO observation of the SAME event exists first. */
    const demo = await persistCanonicalObservation({
      bundle: demoBundle({
        fingerprint: `faceit-e2e-${RUN}-demo-sha256`,
        roster: A.steam,
        startedAt: T1_START,
        finishedAt: T1_FINISH,
      }),
    });
    touchedMatchIds.add(demo.matchId);
    check(
      "04 — DEMO canonical observation persisted (player-neutral)",
      demo.created,
      `match=${demo.matchId}`,
    );

    // Ownership state of the target BEFORE the FACEIT pipeline runs. This is the
    // value candidate discovery could have keyed on — it is NULL, so a match
    // found through it proves discovery is player-neutral.
    const ownerBeforeAttach = await supabaseAdmin
      .from("matches")
      .select("player_id")
      .eq("id", demo.matchId)
      .maybeSingle();

    /* Gate 05 — FULL production pipeline: EXACT + attach. */
    const positive = await runPipeline(positivePayload, A.faceit[0]!);
    for (const id of positive.result.matchIds) touchedMatchIds.add(id);

    check(
      "05 — production pipeline resolved EXACT and attached",
      positive.result.decisions.length === 1 &&
        positive.result.decisions[0]!.resolution === "EXACT_MATCH" &&
        positive.result.decisions[0]!.attached &&
        positive.result.matchIds[0] === demo.matchId,
      `decisions=${JSON.stringify(positive.result.decisions)} matchIds=${JSON.stringify(
        positive.result.matchIds,
      )} demo=${demo.matchId}`,
    );

    /* Gate 06 — the convergence is proven to rest ONLY on legitimate signals.
       Every property below is asserted, not merely printed: a violation fails. */
    const demoFingerprint = `faceit-e2e-${RUN}-demo-sha256`;
    const convergedSources = await supabaseAdmin
      .from("match_sources")
      .select("source, external_match_id, fingerprint, match_id")
      .eq("match_id", demo.matchId);
    const faceitSource = (convergedSources.data ?? []).find((row) => row.source === "faceit");
    const demoSource = (convergedSources.data ?? []).find((row) => row.source === "demo");
    const convergedMatch = await supabaseAdmin
      .from("matches")
      .select("map, started_at, score_team_a, score_team_b")
      .eq("id", demo.matchId)
      .maybeSingle();
    const faceitPayloadHasSteamId = /7656119\d{10}/.test(JSON.stringify(positivePayload));

    const gate06 = {
      // (A) the FACEIT observation carries NO fingerprint at all
      faceitFingerprintNull: faceitSource?.fingerprint === null,
      // (B) the demo fingerprint was NOT copied onto the FACEIT observation
      demoFingerprintKept: demoSource?.fingerprint === demoFingerprint,
      fingerprintNotShared: faceitSource?.fingerprint !== demoSource?.fingerprint,
      // (C)+(D) external ids differ, so equality of external ids cannot explain it
      externalIdsDiffer: faceitSource?.external_match_id !== demoSource?.external_match_id,
      faceitExternalId: faceitSource?.external_match_id === `${RUN}-faceit-positive`,
      demoExternalIdNull: demoSource?.external_match_id === null,
      // (E) the legitimate signals: same map, same canonical start, identical
      //     ten-account roster, no contradicting score
      sameMap: convergedMatch.data?.map === MAP && positive.mapped.map === MAP,
      sameCanonicalStart:
        convergedMatch.data?.started_at !== null &&
        Date.parse(String(convergedMatch.data?.started_at)) ===
          Date.parse(String(positive.mapped.metadata["started_at"])),
      // FACEIT reports the score for the TARGET faction; the target sits in
      // `team_a` by construction of the adapter, so the canonical scores must
      // agree with the FACEIT ones for the resolver to see no contradiction.
      noScoreContradiction:
        convergedMatch.data?.score_team_a === positive.mapped.score_player &&
        convergedMatch.data?.score_team_b === positive.mapped.score_opponent,

      // no SteamID64 exists anywhere in the FACEIT payload
      noSteamIdInPayload: faceitPayloadHasSteamId === false,
      // (F) the attach was produced by the production entry point
      productionAttach:
        faceitSource?.match_id === demo.matchId && positive.result.matchIds[0] === demo.matchId,
    };
    check(
      "06 — convergence used NO fingerprint and NO shared external id",
      Object.values(gate06).every(Boolean),
      JSON.stringify(gate06),
    );

    check(
      "07 — started_at is the temporal anchor, finished_at is not",
      positive.mapped.metadata["started_at"] === iso(T1_START) &&
        positive.mapped.metadata["finished_at"] === iso(T1_FINISH) &&
        positive.mapped.match_date === iso(T1_FINISH),
      `started_at=${String(positive.mapped.metadata["started_at"])} finished_at=${String(
        positive.mapped.metadata["finished_at"],
      )} match_date(END)=${String(positive.mapped.match_date)}`,
    );

    /* Gate 08 — database state after convergence. */
    const sources = await supabaseAdmin
      .from("match_sources")
      .select("id, source, external_match_id, observation_count")
      .eq("match_id", demo.matchId);
    const parts = await supabaseAdmin
      .from("match_participants")
      .select("participant_key, steam_id64, source")
      .eq("match_id", demo.matchId);
    const matchCount = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("id", [...touchedMatchIds]);

    const uniqueKeys = new Set((parts.data ?? []).map((row) => row.participant_key));
    check(
      "08 — exactly 1 canonical match, 2 source observations, 10 unique participants",
      matchCount.count === 1 &&
        (sources.data ?? []).length === 2 &&
        new Set((sources.data ?? []).map((r) => r.source)).size === 2 &&
        uniqueKeys.size === 10 &&
        (parts.data ?? []).length === 10,
      `matches=${matchCount.count} sources=${JSON.stringify(
        (sources.data ?? []).map((r) => r.source),
      )} participants=${(parts.data ?? []).length} unique=${uniqueKeys.size}`,
    );
    /* Gate 09 — the FULL identity chain of all ten canonical participants:
       FACEIT external id -> Identity Graph row -> player profile -> STEAM
       identity -> SteamID64 -> persisted canonical participant. Every link is
       read back from the database; nothing is accepted because the fixture
       declared it. */
    const persistedSteamIds = (parts.data ?? [])
      .map((row) => row.steam_id64)
      .filter((id): id is string => typeof id === "string");
    // Identity rows as the DATABASE has them, for the profiles the graph resolved.
    const graphProfileIds = [
      ...new Set(
        A.faceit
          .map((id) => graph.identities.get(id)?.internalPlayerId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const identityRows = await supabaseAdmin
      .from("player_identities")
      .select("player_id, platform, external_id, identity_status")
      .in("player_id", graphProfileIds.length > 0 ? graphProfileIds : [randomUUID()]);
    const steamByProfile = new Map<string, string>();
    const faceitByProfile = new Map<string, string>();
    for (const row of identityRows.data ?? []) {
      if (row.platform === "STEAM") steamByProfile.set(row.player_id, row.external_id);
      if (row.platform === "FACEIT") faceitByProfile.set(row.player_id, row.external_id);
    }
    // Chain, rebuilt from database rows only: FACEIT id -> profile -> SteamID64.
    const chainSteamIds = new Set(
      graphProfileIds
        .filter((profileId) => A.faceit.includes(faceitByProfile.get(profileId) ?? ""))
        .map((profileId) => steamByProfile.get(profileId))
        .filter((id): id is string => typeof id === "string"),
    );
    const gate09 = {
      exactlyTenParticipants: (parts.data ?? []).length === 10,
      tenUniqueSteamIds: new Set(persistedSteamIds).size === 10,
      noNullSteamId: persistedSteamIds.length === 10,
      // every FACEIT id of the converging roster has an Identity Graph row
      allFaceitIdsInGraph: A.faceit.every(
        (id) => typeof graph.identities.get(id)?.internalPlayerId === "string",
      ),
      // the chain rebuilt from the DB accounts for all ten SteamIDs
      chainCoversAllTen: chainSteamIds.size === 10,
      everyPersistedIdFromChain: persistedSteamIds.every((id) => chainSteamIds.has(id)),
      // and for nothing else: no participant outside the resolved chain
      noExtraParticipant: persistedSteamIds.every((id) =>
        [...graph.identities.values()].some((entry) => entry.steamId64 === id),
      ),
      // no SteamID64 could have come from the FACEIT payload or a nickname
      noSteamIdInFaceitPayload: /7656119\d{10}/.test(JSON.stringify(positivePayload)) === false,
      noNicknameDerivedId: persistedSteamIds.every((id) => /^7656119\d{10}$/.test(id)),
      // every persisted id is a verified STEAM identity row in the database
      everyIdIsVerifiedIdentityRow: persistedSteamIds.every((id) =>
        (identityRows.data ?? []).some(
          (row) =>
            row.platform === "STEAM" &&
            row.external_id === id &&
            row.identity_status === "verified",
        ),
      ),
    };
    check(
      "09 — all ten participants trace back through the Identity Graph chain",
      Object.values(gate09).every(Boolean),
      JSON.stringify(gate09),
    );


    /* Gate 10 — idempotency of the production pipeline. */
    const again = await runPipeline(positivePayload, A.faceit[0]!);
    for (const id of again.result.matchIds) touchedMatchIds.add(id);
    const sourcesAfter = await supabaseAdmin
      .from("match_sources")
      .select("id, source, observation_count")
      .eq("match_id", demo.matchId);
    const partsAfter = await supabaseAdmin
      .from("match_participants")
      .select("id", { count: "exact", head: true })
      .eq("match_id", demo.matchId);
    const matchesAfter = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("id", [...touchedMatchIds]);
    check(
      "10 — replaying the SAME payload is idempotent",
      again.result.matchIds[0] === demo.matchId &&
        again.result.created === 0 &&
        matchesAfter.count === 1 &&
        (sourcesAfter.data ?? []).length === 2 &&
        partsAfter.count === 10,
      `matchIds=${JSON.stringify(again.result.matchIds)} created=${again.result.created} matches=${
        matchesAfter.count
      } sources=${(sourcesAfter.data ?? []).length} participants=${partsAfter.count}`,
    );

    /* Gate 11 — concurrency through the production pipeline. */
    const concurrent = await Promise.allSettled(
      Array.from({ length: 6 }, () => runPipeline(positivePayload, A.faceit[0]!)),
    );
    for (const entry of concurrent) {
      if (entry.status === "fulfilled")
        for (const id of entry.value.result.matchIds) touchedMatchIds.add(id);
    }
    const concurrentMatches = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("id", [...touchedMatchIds]);
    const concurrentSources = await supabaseAdmin
      .from("match_sources")
      .select("id, source")
      .eq("match_id", demo.matchId);
    const concurrentParts = await supabaseAdmin
      .from("match_participants")
      .select("id", { count: "exact", head: true })
      .eq("match_id", demo.matchId);
    check(
      "11 — 6 simultaneous production calls converge (request-level concurrency)",
      concurrentMatches.count === 1 &&
        (concurrentSources.data ?? []).length === 2 &&
        concurrentParts.count === 10,
      `settled=${JSON.stringify(concurrent.map((c) => c.status))} matches=${
        concurrentMatches.count
      } sources=${(concurrentSources.data ?? []).length} participants=${concurrentParts.count}`,
    );
    record(
      "11b — independent PostgreSQL backend PIDs",
      "NOT_PROVEN",
      "the sandbox cannot inspect backend PIDs; only request-level concurrency is proven here",
    );

    /* Gate 12 — SIMILAR BUT NOT THE SAME: same map, same window, 6 shared. */
    const negativeIds = [...A.faceit.slice(0, 6), ...C.faceit.slice(0, 4)];
    const negative = await runPipeline(
      faceitPayload({
        matchId: `${RUN}-faceit-negative`,
        faceitIds: negativeIds,
        startedAt: T1_START,
        finishedAt: T1_FINISH,
      }),
      negativeIds[0]!,
    );
    for (const id of negative.result.matchIds) touchedMatchIds.add(id);
    check(
      "12 — a similar but different match does NOT converge",
      negative.result.decisions[0]!.attached === false &&
        negative.result.decisions[0]!.resolution !== "EXACT_MATCH" &&
        negative.result.matchIds[0] !== demo.matchId,
      `decision=${JSON.stringify(negative.result.decisions[0])} newMatch=${
        negative.result.matchIds[0]
      }`,
    );

    /* Gate 13 — one unresolvable identity: never converge, never invent. */
    const unresolvedIds = [...A.faceit.slice(0, 9), `${RUN}-unknown-faceit-id`];
    const unresolved = await runPipeline(
      faceitPayload({
        matchId: `${RUN}-faceit-unresolved`,
        faceitIds: unresolvedIds,
        startedAt: T3_START,
        finishedAt: T3_START,
      }),
      unresolvedIds[0]!,
    );
    for (const id of unresolved.result.matchIds) touchedMatchIds.add(id);
    const unresolvedGraph = await resolveFaceitIdentities(supabaseAdmin, unresolvedIds);
    const unresolvedParts = await supabaseAdmin
      .from("match_participants")
      .select("steam_id64, external_player_id")
      .eq("match_id", unresolved.result.matchIds[0]!);
    check(
      "13 — an unresolvable identity blocks convergence and invents nothing",
      unresolvedGraph.resolution === "IDENTITY_UNRESOLVED" &&
        unresolved.result.decisions[0]!.attached === false &&
        (unresolvedParts.data ?? []).filter((r) => r.steam_id64 === null).length === 1 &&
        (unresolvedParts.data ?? []).every(
          (r) => r.steam_id64 === null || A.steam.includes(r.steam_id64),
        ),
      `resolution=${unresolvedGraph.resolution} decision=${JSON.stringify(
        unresolved.result.decisions[0],
      )} nullSteamIds=${(unresolvedParts.data ?? []).filter((r) => r.steam_id64 === null).length}`,
    );

    /* Gate 14 — a FAILING graph query is an ERROR, not "identity absent". */
    const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const supabaseUrl = process.env["SUPABASE_URL"];
    if (!publishable || !supabaseUrl) {
      record(
        "14 — Identity Graph query error != identity absent",
        "BLOCKED",
        "SUPABASE_PUBLISHABLE_KEY / SUPABASE_URL unavailable in this environment",
      );
    } else {
      const anon = createClient<Database>(supabaseUrl, publishable, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            if (
              publishable.startsWith("sb_") &&
              headers.get("Authorization") === `Bearer ${publishable}`
            ) {
              headers.delete("Authorization");
            }
            headers.set("apikey", publishable);
            return fetch(input, { ...init, headers });
          },
        },
      });
      let raised: unknown = null;
      try {
        await runPipeline(
          faceitPayload({
            matchId: `${RUN}-faceit-graph-error`,
            faceitIds: A.faceit,
            startedAt: T3_START,
            finishedAt: T3_START,
          }),
          A.faceit[0]!,
          anon as never,
        );
      } catch (error) {
        raised = error;
      }
      check(
        "14 — Identity Graph query error != identity absent",
        raised instanceof FaceitIdentityResolutionError,
        `raised=${raised instanceof Error ? `${raised.name}: ${raised.message}` : String(raised)}`,
      );
    }

    /* Gate 15 — TWO EXACT candidates must become an ambiguity CONFLICT. */
    const ambiguousDemoA = await persistCanonicalObservation({
      bundle: demoBundle({
        fingerprint: `faceit-e2e-${RUN}-amb-a-sha256`,
        roster: C.steam,
        startedAt: T4_START,
        finishedAt: T4_START,
      }),
    });
    const ambiguousDemoB = await persistCanonicalObservation({
      bundle: demoBundle({
        fingerprint: `faceit-e2e-${RUN}-amb-b-sha256`,
        roster: C.steam,
        startedAt: T4_START,
        finishedAt: T4_START,
      }),
    });
    touchedMatchIds.add(ambiguousDemoA.matchId);
    touchedMatchIds.add(ambiguousDemoB.matchId);
    const ambiguous = await runPipeline(
      faceitPayload({
        matchId: `${RUN}-faceit-ambiguous`,
        faceitIds: C.faceit,
        startedAt: T4_START,
        finishedAt: T4_START,
      }),
      C.faceit[0]!,
    );
    for (const id of ambiguous.result.matchIds) touchedMatchIds.add(id);
    check(
      "15 — two EXACT candidates => CONFLICT, no arbitrary attach",
      ambiguousDemoA.matchId !== ambiguousDemoB.matchId &&
        ambiguous.result.decisions[0]!.resolution === "CONFLICT" &&
        ambiguous.result.decisions[0]!.attached === false &&
        ambiguous.result.matchIds[0] !== ambiguousDemoA.matchId &&
        ambiguous.result.matchIds[0] !== ambiguousDemoB.matchId,
      `decision=${JSON.stringify(ambiguous.result.decisions[0])} candidates=[${
        ambiguousDemoA.matchId
      },${ambiguousDemoB.matchId}] persisted=${ambiguous.result.matchIds[0]}`,
    );

    /* Gate 16 — atomicity of the SAME routine the pipeline calls. */
    const ghost = randomUUID();
    let rollbackError: unknown = null;
    try {
      await persistCanonicalObservation({
        bundle: {
          ...demoBundle({
            fingerprint: `faceit-e2e-${RUN}-rollback-sha256`,
            roster: A.steam,
            startedAt: T4_START,
            finishedAt: T4_START,
          }),
          observation: {
            ...demoBundle({
              fingerprint: `faceit-e2e-${RUN}-rollback-sha256`,
              roster: A.steam,
              startedAt: T4_START,
              finishedAt: T4_START,
            }).observation,
            source: "faceit",
            sourceContractVersion: SOURCE_CONTRACT_VERSIONS.faceit,
            externalMatchId: `${RUN}-faceit-rollback`,
            fingerprint: null,
          },
        },
        attachMatchId: ghost,
      });
    } catch (error) {
      rollbackError = error;
    }
    const rollbackSources = await supabaseAdmin
      .from("match_sources")
      .select("id", { count: "exact", head: true })
      .eq("external_match_id", `${RUN}-faceit-rollback`);
    check(
      "16 — attach to a missing target rolls the whole transaction back",
      rollbackError instanceof CanonicalPersistenceError && rollbackSources.count === 0,
      `error=${
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      } leftoverSources=${rollbackSources.count}`,
    );

    /* Gate 17 — candidate discovery never depends on matches.player_id.
       The DEMO match was written with NO owner, and the FACEIT observation was
       collected FOR a player; the pipeline still discovered and attached it, so
       discovery cannot be keyed on the ownership column. `matches.player_id`
       remains a per-player projection column, never an identity signal. */
    const ownerAfterAttach = await supabaseAdmin
      .from("matches")
      .select("id, player_id")
      .eq("id", demo.matchId)
      .maybeSingle();
    check(
      "17 — discovery is player-neutral (target had player_id NULL when found)",
      ownerBeforeAttach.data?.player_id === null &&
        positive.result.matchIds[0] === demo.matchId &&
        ownerPlayerId !== null,
      `ownerBeforeAttach=${JSON.stringify(
        ownerBeforeAttach.data?.player_id,
      )} collectedForPlayer=${String(ownerPlayerId)} attachedTo=${positive.result.matchIds[0]}`,
    );
    console.log(
      `NOTE       matches.player_id after attach = ${JSON.stringify(
        ownerAfterAttach.data?.player_id,
      )} (legacy per-player projection column, written by the persistence routine ` +
        `from the collecting player; never an identity/discovery signal)`,
    );
  } catch (error) {
    record(
      "RUN — unexpected failure",
      "FAIL",
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  } finally {
    const ids = [...touchedMatchIds];
    if (ids.length > 0) {
      for (const table of [
        "round_events",
        "round_players",
        "match_rounds",
        "match_participants",
        "match_metrics",
        "match_features",
        "match_sources",
      ] as const) {
        await supabaseAdmin.from(table).delete().in("match_id", ids);
      }
      await supabaseAdmin.from("matches").delete().in("id", ids);
    }
    for (const userId of touchedUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    const profileIds = [...touchedProfileIds];
    const fallback = [randomUUID()];
    const leftMatches = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("id", ids.length > 0 ? ids : fallback);
    const leftSources = await supabaseAdmin
      .from("match_sources")
      .select("id", { count: "exact", head: true })
      .like("external_match_id", `${RUN}-%`);
    const leftParticipants = await supabaseAdmin
      .from("match_participants")
      .select("id", { count: "exact", head: true })
      .in("match_id", ids.length > 0 ? ids : fallback);
    const leftIdentities = await supabaseAdmin
      .from("player_identities")
      .select("id", { count: "exact", head: true })
      .like("external_id", `${RUN}-fc-%`);
    // The fixture accounts cascade away with the auth user; prove it.
    const leftProfiles = await supabaseAdmin
      .from("player_profiles")
      .select("id", { count: "exact", head: true })
      .in("id", profileIds.length > 0 ? profileIds : fallback);
    const leftConnections = await supabaseAdmin
      .from("player_connections")
      .select("id", { count: "exact", head: true })
      .in("player_id", profileIds.length > 0 ? profileIds : fallback);
    // `match_series` is only written by BO2/BO3 observations; this fixture is
    // BO1-only, so the assertion is that it was never touched at all.
    const leftSeries = await supabaseAdmin
      .from("match_series")
      .select("id", { count: "exact", head: true })
      .in("discovered_by_player_id", profileIds.length > 0 ? profileIds : fallback);
    check(
      "18 — fixtures fully removed from the real database",
      leftMatches.count === 0 &&
        leftSources.count === 0 &&
        leftParticipants.count === 0 &&
        leftIdentities.count === 0 &&
        leftProfiles.count === 0 &&
        leftConnections.count === 0 &&
        leftSeries.count === 0,
      `matches=${leftMatches.count} sources=${leftSources.count} participants=${
        leftParticipants.count
      } identities=${leftIdentities.count} profiles=${leftProfiles.count} connections=${
        leftConnections.count
      } series=${leftSeries.count} (series never written: BO1-only fixture)`,
    );


    const tally = (verdict: Verdict) => results.filter((r) => r.verdict === verdict).length;
    console.log(
      `\nPASS=${tally("PASS")} FAIL=${tally("FAIL")} BLOCKED=${tally("BLOCKED")} NOT_PROVEN=${tally(
        "NOT_PROVEN",
      )} total=${results.length}\n`,
    );
    if (tally("FAIL") > 0) process.exitCode = 1;
  }
}

void main();
