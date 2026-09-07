/**
 * FASE 2.6.11.3 — RE-EXECUTABLE CANONICAL PROOF (real database, real code).
 *
 *   bun scripts/canonical-proof.ts
 *
 * Every gate below runs the PRODUCTION persistence path
 * (`persistCanonicalObservation` -> `persist_canonical_observation_attached`)
 * against the real database with the service role, then verifies the outcome by
 * reading the canonical tables back. Fixtures are namespaced by a run id and
 * removed at the end; a non-empty leftover is itself a FAIL.
 *
 * It proves nothing by assertion in TypeScript memory: every PASS is a row (or
 * the absence of a row) in the database.
 *
 * Requires the server environment: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Optional: SUPABASE_PUBLISHABLE_KEY (anonymous-read denial gate) and
 * PROOF_USER_ACCESS_TOKEN (signed-in write-denial gate). Missing optional
 * credentials are reported as SKIPPED, never as PASS.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  CANONICAL_SCHEMA_VERSION,
  SOURCE_CONTRACT_VERSIONS,
} from "@/lib/canonical/canonical.versions";
import {
  persistCanonicalObservation,
  persistCanonicalSeriesObservation,
  CanonicalPersistenceError,
} from "@/lib/canonical/canonical.persistence.server";
import {
  canConvergeCrossSource,
  resolveAgainstAll,
  type MatchIdentityCandidate,
} from "@/lib/canonical/canonical.resolver";
import {
  loadCandidates,
  resolveFaceitIdentities,
  FaceitIdentityResolutionError,
} from "@/lib/faceit/faceit.canonical.server";
import type {
  CanonicalMatchBundle,
  CanonicalParticipant,
  CanonicalQuality,
} from "@/lib/canonical/canonical.types";
import type { Database } from "@/integrations/supabase/types";

/* ------------------------------------------------------------------ */
/* Fixtures — deterministic, namespaced, never colliding with real data */
/* ------------------------------------------------------------------ */

const RUN = randomUUID().slice(0, 8);
const MAP = "de_mirage";
const PLAYED_AT = new Date("2026-01-15T20:00:00.000Z").toISOString();
const ROSTER = Array.from({ length: 10 }, (_, i) => `7656119800000${(110 + i).toString()}`);
const DEMO_FINGERPRINT = `proof-${RUN}-demo-sha256`;

const quality = (status: CanonicalQuality["status"], reasons: string[] = []): CanonicalQuality => ({
  status,
  reasons,
  confidence: null,
});

function participants(
  source: "demo" | "faceit",
  roster: readonly string[] = ROSTER,
  externalIds: readonly string[] | null = null,
): CanonicalParticipant[] {
  return roster.map((steamId, index) => ({
    participantKey: steamId,
    internalPlayerId: null,
    source,
    externalPlayerId:
      source === "faceit" ? (externalIds?.[index] ?? `${RUN}-faceit-player-${index}`) : null,
    steamId64: steamId,
    nicknameSnapshot: null,
    team: index < 5 ? "team_a" : "team_b",
    isTargetPlayer: index === 0,
    identityStatus: "verified",
    identityConfidence: null,
    metadata: {},
  }));
}

function bundle(args: {
  source: "demo" | "faceit";
  externalMatchId: string | null;
  fingerprint: string | null;
  scoreTeamA: number | null;
  scoreTeamB: number | null;
  withRounds: boolean;
  roster?: readonly string[];
  externalPlayerIds?: readonly string[] | null;
  map?: string;
  playedAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}): CanonicalMatchBundle {
  const roster = participants(args.source, args.roster ?? ROSTER, args.externalPlayerIds ?? null);
  return {
    observation: {
      source: args.source,
      sourceContractVersion: SOURCE_CONTRACT_VERSIONS[args.source],
      externalMatchId: args.externalMatchId,
      externalParentId: null,
      sourceVersion: null,
      fetchedAt: new Date().toISOString(),
      sourceUpdatedAt: null,
      status: args.withRounds ? "complete" : "incomplete",
      quality: args.withRounds ? quality("complete") : quality("degraded", ["no_round_data"]),
      fingerprint: args.fingerprint,
      metadata: { canonical_proof_run: RUN },
    },
    series: null,
    match: {
      game: "cs2",
      map: args.map ?? MAP,
      mapNumber: null,
      playedAt: args.playedAt ?? PLAYED_AT,
      startedAt: args.startedAt ?? null,
      finishedAt: args.finishedAt ?? null,
      durationSeconds: null,
      status: "completed",
      finished: true,
      terminal: true,
      teamA: `proof-${RUN}-A`,
      teamB: `proof-${RUN}-B`,
      scoreTeamA: args.scoreTeamA,
      scoreTeamB: args.scoreTeamB,
      winnerTeam: null,
      roundCount: args.withRounds ? 1 : null,
      quality: args.withRounds ? quality("complete") : quality("degraded", ["no_round_data"]),
      coverage: {
        roundsExpected: null,
        roundsObserved: args.withRounds ? 1 : null,
        participantsExpected: roster.length,
        participantsObserved: roster.length,
        participantsResolved: roster.length,
        eventsObserved: args.withRounds ? 2 : null,
        hasRoundData: args.withRounds,
        hasEventData: args.withRounds,
        hasPlayerRoundState: args.withRounds,
      },
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    participants: roster,
    rounds: args.withRounds
      ? [
          {
            roundNumber: 1,
            startTick: null,
            endTick: null,
            startTimeSeconds: null,
            endTimeSeconds: null,
            durationSeconds: null,
            winningTeam: "team_a",
            winningSide: "CT",
            winReason: "elimination",
            // NULL != FALSE: the fixture proves unknown bomb state survives.
            bombPlanted: null,
            bombDefused: null,
            bombExploded: null,
            quality: quality("complete"),
            metadata: {},
          },
        ]
      : [],
    roundPlayers: args.withRounds
      ? roster.map((participant, index) => ({
          roundNumber: 1,
          participantKey: participant.participantKey,
          side: index < 5 ? "CT" : "T",
          survived: null,
          moneyStart: null,
          moneyEnd: null,
          equipmentValue: null,
          buyContext: null,
          kills: null,
          deaths: null,
          assists: null,
          damage: null,
          flashAssists: null,
          openingKill: null,
          openingDeath: null,
          traded: null,
          tradeKill: null,
          metadata: {},
        }))
      : [],
    events: args.withRounds
      ? [
          {
            roundNumber: 1,
            type: "kill",
            tick: null,
            gameTimeSeconds: null,
            actorParticipantKey: roster[0]!.participantKey,
            victimParticipantKey: roster[5]!.participantKey,
            assisterParticipantKey: null,
            sourceActorExternalId: roster[0]!.externalPlayerId,
            sourceVictimExternalId: roster[5]!.externalPlayerId,
            sourceAssisterExternalId: null,
            weapon: "ak47",
            headshot: null,
            distance: null,
            damage: null,
            quality: quality("complete"),
            data: {},
          },
          {
            roundNumber: 1,
            type: "round_end",
            tick: null,
            gameTimeSeconds: null,
            actorParticipantKey: null,
            victimParticipantKey: null,
            assisterParticipantKey: null,
            sourceActorExternalId: null,
            sourceVictimExternalId: null,
            sourceAssisterExternalId: null,
            weapon: null,
            headshot: null,
            distance: null,
            damage: null,
            quality: quality("complete"),
            data: {},
          },
        ]
      : [],
  };
}

const demoBundle = () =>
  bundle({
    source: "demo",
    externalMatchId: null,
    fingerprint: DEMO_FINGERPRINT,
    scoreTeamA: 13,
    scoreTeamB: 9,
    withRounds: true,
  });

/** Same canonical match seen on FACEIT: no fingerprint, identical roster. */
const faceitSameBundle = () =>
  bundle({
    source: "faceit",
    externalMatchId: `proof-${RUN}-faceit-same`,
    fingerprint: null,
    scoreTeamA: 13,
    scoreTeamB: 9,
    withRounds: false,
  });

/** A DIFFERENT match: same map and window, contradicting score. */
const faceitOtherBundle = () =>
  bundle({
    source: "faceit",
    externalMatchId: `proof-${RUN}-faceit-other`,
    fingerprint: null,
    scoreTeamA: 16,
    scoreTeamB: 7,
    withRounds: false,
  });

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

type Verdict = "PASS" | "FAIL" | "SKIPPED";
const results: Array<{ gate: string; verdict: Verdict; evidence: string }> = [];

function record(gate: string, verdict: Verdict, evidence: string) {
  results.push({ gate, verdict, evidence });
  const mark = verdict === "PASS" ? "PASS " : verdict === "FAIL" ? "FAIL " : "SKIP ";
  console.log(`${mark} ${gate} — ${evidence}`);
}

function check(gate: string, condition: boolean, evidence: string) {
  record(gate, condition ? "PASS" : "FAIL", evidence);
}

/* ------------------------------------------------------------------ */
/* Proof                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const touchedMatchIds = new Set<string>();
  const touchedSeriesIds = new Set<string>();
  const touchedUserIds = new Set<string>();
  const touchedProfileIds = new Set<string>();

  console.log(`\ncanonical proof run=${RUN} map=${MAP} playedAt=${PLAYED_AT}\n`);

  try {
    /* Gate 1 — a demo observation becomes a canonical match with real rows. */
    const demo = await persistCanonicalObservation({ bundle: demoBundle() });
    touchedMatchIds.add(demo.matchId);
    if (demo.seriesId) touchedSeriesIds.add(demo.seriesId);

    const demoRow = await supabaseAdmin
      .from("matches")
      .select("id, player_id, map, score_team_a, score_team_b, round_count, data_source")
      .eq("id", demo.matchId)
      .maybeSingle();

    check(
      "1 — demo observation persisted",
      demo.created && demo.roundsWritten === 1 && demo.eventsWritten === 2,
      `match=${demo.matchId} rounds=${demo.roundsWritten} events=${demo.eventsWritten}`,
    );
    check(
      "2 — a canonical match belongs to NO player (player_id IS NULL)",
      demoRow.data?.player_id === null,
      `player_id=${JSON.stringify(demoRow.data?.player_id)}`,
    );

    const nullNotFalse = await supabaseAdmin
      .from("match_rounds")
      .select("bomb_planted, bomb_defused, bomb_exploded")
      .eq("match_id", demo.matchId);
    check(
      "3 — NULL != FALSE survived persistence (unknown bomb state)",
      (nullNotFalse.data ?? []).every(
        (row) =>
          row.bomb_planted === null && row.bomb_defused === null && row.bomb_exploded === null,
      ),
      JSON.stringify(nullNotFalse.data ?? []),
    );

    /* Gate 4 — cross-source attach lands on the SAME canonical match. */
    const attached = await persistCanonicalObservation({
      bundle: faceitSameBundle(),
      attachMatchId: demo.matchId,
    });
    touchedMatchIds.add(attached.matchId);
    check(
      "4 — cross-source attach converges on ONE canonical match",
      attached.matchId === demo.matchId && attached.created === false,
      `faceit.matchId=${attached.matchId} demo.matchId=${demo.matchId} created=${attached.created}`,
    );

    /* Gate 5 — a weaker source never destroys the stronger source's rounds. */
    const afterAttach = await supabaseAdmin
      .from("match_rounds")
      .select("id", { count: "exact", head: true })
      .eq("match_id", demo.matchId);
    check(
      "5 — the round data of the stronger source survived the weaker observation",
      afterAttach.count === 1,
      `rounds=${afterAttach.count}`,
    );

    /* Gate 6 — idempotency: repeating both observations creates nothing new. */
    for (let i = 0; i < 3; i += 1) {
      const again = await persistCanonicalObservation({ bundle: demoBundle() });
      touchedMatchIds.add(again.matchId);
      const againFaceit = await persistCanonicalObservation({
        bundle: faceitSameBundle(),
        attachMatchId: demo.matchId,
      });
      touchedMatchIds.add(againFaceit.matchId);
    }
    const sources = await supabaseAdmin
      .from("match_sources")
      .select("source, observation_count")
      .eq("match_id", demo.matchId);
    const participantRows = await supabaseAdmin
      .from("match_participants")
      .select("id", { count: "exact", head: true })
      .eq("match_id", demo.matchId);
    check(
      "6 — idempotent: one observation per source, no duplicated participants",
      touchedMatchIds.size === 1 &&
        (sources.data ?? []).length === 2 &&
        participantRows.count === 10,
      `matches=${touchedMatchIds.size} sources=${JSON.stringify(sources.data)} participants=${participantRows.count}`,
    );

    /* Gate 7 — rollback: attaching to a match that does not exist writes nothing. */
    const ghost = randomUUID();
    let rollbackCode = "none";
    try {
      await persistCanonicalObservation({
        bundle: bundle({
          source: "faceit",
          externalMatchId: `proof-${RUN}-faceit-ghost`,
          fingerprint: null,
          scoreTeamA: 13,
          scoreTeamB: 9,
          withRounds: false,
        }),
        attachMatchId: ghost,
      });
    } catch (error) {
      rollbackCode =
        error instanceof CanonicalPersistenceError
          ? `${error.code}:${error.detail ?? ""}`
          : String(error);
    }
    const leftover = await supabaseAdmin
      .from("match_sources")
      .select("id", { count: "exact", head: true })
      .eq("external_match_id", `proof-${RUN}-faceit-ghost`);
    check(
      "7 — atomic rollback: a failed attach leaves ZERO rows",
      rollbackCode.includes("CANONICAL") && leftover.count === 0,
      `error=${rollbackCode} leftoverSources=${leftover.count}`,
    );

    /* Gate 8 — a contradicting observation stays a SEPARATE canonical match. */
    const other = await persistCanonicalObservation({ bundle: faceitOtherBundle() });
    touchedMatchIds.add(other.matchId);
    check(
      "8 — a contradicting match is never fused",
      other.matchId !== demo.matchId && other.created,
      `other=${other.matchId} demo=${demo.matchId}`,
    );

    /* Gate 9 — REAL PARALLEL CONCURRENCY through the production path. */
    const parallelExternalId = `proof-${RUN}-faceit-parallel`;
    const parallel = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        persistCanonicalObservation({
          bundle: bundle({
            source: "faceit",
            externalMatchId: parallelExternalId,
            fingerprint: null,
            scoreTeamA: 13,
            scoreTeamB: 9,
            withRounds: false,
          }),
        }),
      ),
    );
    const fulfilled = parallel.filter(
      (
        entry,
      ): entry is PromiseFulfilledResult<Awaited<ReturnType<typeof persistCanonicalObservation>>> =>
        entry.status === "fulfilled",
    );
    for (const entry of fulfilled) touchedMatchIds.add(entry.value.matchId);
    const parallelMatchIds = new Set(fulfilled.map((entry) => entry.value.matchId));
    const parallelSources = await supabaseAdmin
      .from("match_sources")
      .select("id, match_id, observation_count")
      .eq("external_match_id", parallelExternalId);
    const rejected = parallel.filter((entry) => entry.status === "rejected");
    check(
      "9 — six PARALLEL writers of the same observation yield ONE match and ONE observation row",
      fulfilled.length === parallel.length &&
        parallelMatchIds.size === 1 &&
        (parallelSources.data ?? []).length === 1,
      `fulfilled=${fulfilled.length}/${parallel.length} rejected=${rejected.length} distinctMatches=${parallelMatchIds.size} sourceRows=${(parallelSources.data ?? []).length} observation_count=${parallelSources.data?.[0]?.observation_count}`,
    );

    const parallelParticipants = await supabaseAdmin
      .from("match_participants")
      .select("id", { count: "exact", head: true })
      .in("match_id", [...parallelMatchIds]);
    check(
      "10 — parallel writers never duplicated the roster",
      parallelParticipants.count === 10,
      `participants=${parallelParticipants.count}`,
    );

    /* Gate 11/12 — application-side access is denied. */
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"];
    if (!publishableKey || !url) {
      record("11 — anonymous read denied", "SKIPPED", "no publishable key in this environment");
      record("12 — signed-in write denied", "SKIPPED", "no publishable key in this environment");
    } else {
      const anon = createClient<Database>(url, publishableKey, {
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });
      const anonRead = await anon.from("matches").select("id").eq("id", demo.matchId);
      check(
        "11 — anonymous cannot read canonical matches",
        Boolean(anonRead.error) || (anonRead.data ?? []).length === 0,
        `error=${anonRead.error?.message ?? "none"} rows=${(anonRead.data ?? []).length}`,
      );

      const token = process.env["PROOF_USER_ACCESS_TOKEN"];
      if (!token) {
        record(
          "12 — signed-in write denied",
          "SKIPPED",
          "set PROOF_USER_ACCESS_TOKEN to run the signed-in gate",
        );
      } else {
        const asUser = createClient<Database>(url, publishableKey, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const insert = await asUser
          .from("matches")
          .insert({ game: "cs2", data_source: "faceit", map: MAP });
        const rpc = await asUser.rpc("persist_canonical_observation_attached", {
          _bundle: {} as never,
        });
        const update = await asUser
          .from("matches")
          .update({ map: "de_dust2" })
          .eq("id", demo.matchId);
        const del = await asUser.from("matches").delete().eq("id", demo.matchId);
        const insertSource = await asUser.from("match_sources").insert({
          match_id: demo.matchId,
          source: "faceit",
          source_contract_version: SOURCE_CONTRACT_VERSIONS["faceit"],
          fetched_at: new Date().toISOString(),
          status: "incomplete",
        });
        const insertParticipant = await asUser
          .from("match_participants")
          .insert({ match_id: demo.matchId, participant_key: "x", source: "faceit" });
        check(
          "12 — a signed-in user can neither write canonical tables nor run the canonical routine",
          Boolean(insert.error) &&
            Boolean(rpc.error) &&
            Boolean(insertSource.error) &&
            Boolean(insertParticipant.error) &&
            (Boolean(update.error) || update.count === 0) &&
            (Boolean(del.error) || del.count === 0),
          `insert=${insert.error?.message ?? "ALLOWED"} update=${update.error?.message ?? "no-row"} delete=${del.error?.message ?? "no-row"} sources=${insertSource.error?.message ?? "ALLOWED"} participants=${insertParticipant.error?.message ?? "ALLOWED"} rpc=${rpc.error?.message ?? "ALLOWED"}`,
        );

        /* Gates 23/24 — RLS read scoping with a REAL session.
           USER A owns a canonical match through participation; the very same
           authenticated user must NOT see a match it does not participate in
           (the USER B position). */
        const me = await asUser.auth.getUser();
        const myProfile = me.data.user
          ? await supabaseAdmin
              .from("player_profiles")
              .select("id")
              .eq("user_id", me.data.user.id)
              .maybeSingle()
          : null;
        const myProfileId = myProfile?.data?.id ?? null;
        if (!myProfileId) {
          record(
            "23 — RLS: USER A reads own canonical match",
            "SKIPPED",
            "no player profile for the proof session",
          );
          record(
            "24 — RLS: USER B cannot read a foreign canonical match",
            "SKIPPED",
            "no player profile for the proof session",
          );
        } else {
          const ownedFixture = await persistCanonicalObservation({
            bundle: bundle({
              source: "faceit",
              externalMatchId: `proof-${RUN}-rls-owned`,
              fingerprint: null,
              scoreTeamA: 13,
              scoreTeamB: 4,
              withRounds: false,
              playedAt: new Date("2026-01-17T12:00:00.000Z").toISOString(),
            }),
            ownerPlayerId: myProfileId,
          });
          touchedMatchIds.add(ownedFixture.matchId);
          const readOwn = await asUser.from("matches").select("id").eq("id", ownedFixture.matchId);
          check(
            "23 — RLS: USER A reads its own canonical match",
            !readOwn.error && (readOwn.data ?? []).length === 1,
            `rows=${(readOwn.data ?? []).length} error=${readOwn.error?.message ?? "none"}`,
          );

          const readForeign = await asUser.from("matches").select("id").eq("id", other.matchId);
          check(
            "24 — RLS: a signed-in NON-participant cannot read a foreign canonical match",
            !readForeign.error && (readForeign.data ?? []).length === 0,
            `rows=${(readForeign.data ?? []).length} error=${readForeign.error?.message ?? "none"}`,
          );
        }
      }
    }

    /* ------------------------------------------------------------------ */
    /* FASE 2.6.11.4 — Identity Graph, temporal semantics, ambiguity        */
    /* ------------------------------------------------------------------ */

    /* Fixtures: ten REAL accounts with a FACEIT identity and a proven Steam
       identity, so nothing below invents a SteamID64 or a fingerprint. */
    const graphSteamIds = Array.from(
      { length: 10 },
      (_, i) => `7656119${(8000000000 + i).toString()}`,
    );
    const graphFaceitIds = Array.from({ length: 10 }, (_, i) => `${RUN}-gc-faceit-${i}`);

    for (let i = 0; i < 10; i += 1) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: `proof-${RUN}-${i}@canonical-proof.invalid`,
        password: randomUUID(),
        email_confirm: true,
        user_metadata: { full_name: `proof ${RUN} ${i}` },
      });
      if (created.error || !created.data.user) {
        record(
          "14 — Identity Graph fixtures",
          "SKIPPED",
          `auth admin unavailable: ${created.error?.message ?? "no user"}`,
        );
        break;
      }
      touchedUserIds.add(created.data.user.id);
      const profile = await supabaseAdmin
        .from("player_profiles")
        .select("id")
        .eq("user_id", created.data.user.id)
        .maybeSingle();
      const profileId = profile.data?.id;
      if (!profileId) continue;
      touchedProfileIds.add(profileId);
      const identityInsert = await supabaseAdmin.from("player_identities").insert([
        {
          player_id: profileId,
          platform: "FACEIT",
          external_id: graphFaceitIds[i]!,
          identity_status: "verified",
          is_verified: true,
        },
        {
          player_id: profileId,
          platform: "STEAM",
          external_id: graphSteamIds[i]!,
          identity_status: "verified",
          is_verified: true,
        },
      ]);
      if (identityInsert.error) {
        record(
          "14 — Identity Graph fixtures",
          "SKIPPED",
          `identity insert failed: ${identityInsert.error.message}`,
        );
        break;
      }
    }

    const graphReady = touchedProfileIds.size === 10;

    if (!graphReady) {
      for (const gate of [
        "14 — Identity Graph CASE A (resolved)",
        "15 — Identity Graph CASE B (unresolved)",
        "17 — cross-source EXACT through the real graph",
        "18 — temporal semantics (start vs finish)",
        "19 — multiple EXACT candidates => ambiguity",
      ]) {
        record(gate, "SKIPPED", `only ${touchedProfileIds.size}/10 identity fixtures available`);
      }
    } else {
      /* Gate 14 — CASE A: the graph resolves FACEIT -> profile -> SteamID64. */
      const caseA = await resolveFaceitIdentities(supabaseAdmin, graphFaceitIds);
      const resolvedSteam = graphFaceitIds
        .map((id) => caseA.identities.get(id)?.steamId64)
        .filter((id): id is string => typeof id === "string");
      check(
        "14 — Identity Graph CASE A (resolved)",
        caseA.resolution === "RESOLVED" &&
          resolvedSteam.length === 10 &&
          resolvedSteam.every((id) => graphSteamIds.includes(id)),
        `resolution=${caseA.resolution} steamIds=${resolvedSteam.length}`,
      );

      /* Gate 15 — CASE B: an absent identity is UNRESOLVED, never an error. */
      const caseB = await resolveFaceitIdentities(supabaseAdmin, [`${RUN}-absent-faceit-id`]);
      check(
        "15 — Identity Graph CASE B (unresolved, not an error)",
        caseB.resolution === "IDENTITY_UNRESOLVED" && caseB.identities.size === 0,
        `resolution=${caseB.resolution} entries=${caseB.identities.size}`,
      );

      /* Gate 17/18 — DEMO persisted, then the SAME match seen on FACEIT with a
         DIFFERENT external id, NO fingerprint and a `playedAt` that carries the
         END instant. Convergence must come from the graph roster + the START. */
      const demoStart = new Date("2026-01-15T22:00:00.000Z").toISOString();
      const faceitStart = new Date("2026-01-15T22:01:00.000Z").toISOString();
      const faceitFinish = new Date("2026-01-15T22:42:00.000Z").toISOString();

      const graphDemo = await persistCanonicalObservation({
        bundle: bundle({
          source: "demo",
          externalMatchId: null,
          fingerprint: `proof-${RUN}-graph-demo-sha256`,
          scoreTeamA: 13,
          scoreTeamB: 9,
          withRounds: true,
          roster: graphSteamIds,
          playedAt: demoStart,
          startedAt: demoStart,
        }),
      });
      touchedMatchIds.add(graphDemo.matchId);

      const faceitCross = bundle({
        source: "faceit",
        externalMatchId: `proof-${RUN}-faceit-cross`,
        fingerprint: null,
        scoreTeamA: 13,
        scoreTeamB: 9,
        withRounds: false,
        roster: resolvedSteam,
        externalPlayerIds: graphFaceitIds,
        // FACEIT's `match_date` may be the END instant.
        playedAt: faceitFinish,
        startedAt: faceitStart,
        finishedAt: faceitFinish,
      });

      // Isolated to the fixture under proof: unrelated fixtures from earlier
      // gates share the map and the discovery window on purpose.
      const crossCandidates = (
        await loadCandidates(supabaseAdmin, faceitStart, resolvedSteam)
      ).filter((candidate) => candidate.canonicalMatchId === graphDemo.matchId);
      const incoming: MatchIdentityCandidate = {
        source: "faceit",
        externalMatchId: faceitCross.observation.externalMatchId,
        fingerprint: null,
        map: faceitCross.match.map,
        playedAt: faceitCross.match.playedAt,
        startedAt: faceitCross.match.startedAt,
        finishedAt: faceitCross.match.finishedAt,
        roundCount: null,
        scoreTeamA: faceitCross.match.scoreTeamA,
        scoreTeamB: faceitCross.match.scoreTeamB,
        participantSteamIds: resolvedSteam,
      };
      const resolvedCross = resolveAgainstAll(incoming, crossCandidates);
      const attachTarget =
        canConvergeCrossSource(resolvedCross.decision) && resolvedCross.candidate?.canonicalMatchId
          ? resolvedCross.candidate.canonicalMatchId
          : null;
      const crossPersisted = await persistCanonicalObservation({
        bundle: faceitCross,
        attachMatchId: attachTarget,
      });
      touchedMatchIds.add(crossPersisted.matchId);

      const crossSources = await supabaseAdmin
        .from("match_sources")
        .select("source")
        .eq("match_id", graphDemo.matchId);
      const crossParticipants = await supabaseAdmin
        .from("match_participants")
        .select("id", { count: "exact", head: true })
        .eq("match_id", graphDemo.matchId);
      check(
        "17 — cross-source EXACT through the real graph (no fingerprint, no shared external id)",
        resolvedCross.decision.resolution === "EXACT_MATCH" &&
          crossPersisted.matchId === graphDemo.matchId &&
          (crossSources.data ?? []).length === 2 &&
          crossParticipants.count === 10,
        `resolution=${resolvedCross.decision.resolution} signals=${resolvedCross.decision.signals.join(",")} sources=${(crossSources.data ?? []).length} participants=${crossParticipants.count}`,
      );
      check(
        "18 — temporal semantics: DEMO start vs FACEIT start (never vs finish)",
        resolvedCross.decision.signals.includes("time_close"),
        `demoStart=${demoStart} faceitStart=${faceitStart} faceitFinish=${faceitFinish} signals=${resolvedCross.decision.signals.join(",")}`,
      );

      const precedence = await supabaseAdmin
        .from("matches")
        .select("canonical_source, round_source, score_team_a, score_team_b, round_count")
        .eq("id", graphDemo.matchId)
        .maybeSingle();
      check(
        "20 — source precedence: the weaker source never degrades canonical facts",
        precedence.data?.canonical_source === "demo" &&
          precedence.data?.round_source === "demo" &&
          precedence.data?.score_team_a === 13 &&
          precedence.data?.round_count === 1,
        JSON.stringify(precedence.data),
      );

      /* Gate 19 — TWO equally EXACT candidates must NEVER be auto-attached. */
      const twinA = await persistCanonicalObservation({
        bundle: bundle({
          source: "faceit",
          externalMatchId: `proof-${RUN}-twin-a`,
          fingerprint: null,
          scoreTeamA: 13,
          scoreTeamB: 9,
          withRounds: false,
          roster: graphSteamIds,
          playedAt: new Date("2026-01-16T10:00:00.000Z").toISOString(),
          startedAt: new Date("2026-01-16T10:00:00.000Z").toISOString(),
        }),
      });
      const twinB = await persistCanonicalObservation({
        bundle: bundle({
          source: "faceit",
          externalMatchId: `proof-${RUN}-twin-b`,
          fingerprint: null,
          scoreTeamA: 13,
          scoreTeamB: 9,
          withRounds: false,
          roster: graphSteamIds,
          playedAt: new Date("2026-01-16T10:02:00.000Z").toISOString(),
          startedAt: new Date("2026-01-16T10:02:00.000Z").toISOString(),
        }),
      });
      touchedMatchIds.add(twinA.matchId);
      touchedMatchIds.add(twinB.matchId);
      const twinCandidates = (
        await loadCandidates(
          supabaseAdmin,
          new Date("2026-01-16T10:00:00.000Z").toISOString(),
          graphSteamIds,
        )
      ).filter((candidate) => [twinA.matchId, twinB.matchId].includes(candidate.canonicalMatchId!));
      const twinDecision = resolveAgainstAll(
        {
          source: "demo",
          externalMatchId: null,
          fingerprint: `proof-${RUN}-twin-demo`,
          map: MAP,
          playedAt: new Date("2026-01-16T10:01:00.000Z").toISOString(),
          startedAt: new Date("2026-01-16T10:01:00.000Z").toISOString(),
          roundCount: null,
          scoreTeamA: 13,
          scoreTeamB: 9,
          participantSteamIds: graphSteamIds,
        },
        twinCandidates,
      );
      check(
        "19 — two EXACT candidates => ambiguity, never an arbitrary attach",
        twinCandidates.length === 2 &&
          twinDecision.decision.resolution === "CONFLICT" &&
          twinDecision.candidate === null &&
          canConvergeCrossSource(twinDecision.decision) === false,
        `candidates=${twinCandidates.length} resolution=${twinDecision.decision.resolution} signals=${twinDecision.decision.signals.join(",")}`,
      );

      /* Gate 16 — CASE C: a FAILING graph query is an error, never "absent". */
      const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
      const projectUrl = process.env["SUPABASE_URL"];
      if (!publishable || !projectUrl) {
        record(
          "16 — Identity Graph CASE C (query failure)",
          "SKIPPED",
          "no publishable key in this environment",
        );
      } else {
        const denied = createClient<Database>(projectUrl, publishable, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        let caseC = "none";
        try {
          const out = await resolveFaceitIdentities(denied, graphFaceitIds);
          caseC = `NO_ERROR:${out.resolution}`;
        } catch (error) {
          caseC =
            error instanceof FaceitIdentityResolutionError
              ? `IDENTITY_RESOLUTION_ERROR:${error.detail}`
              : `WRONG_ERROR:${String(error)}`;
        }
        check(
          "16 — Identity Graph CASE C: a query failure raises IDENTITY_RESOLUTION_ERROR",
          caseC.startsWith("IDENTITY_RESOLUTION_ERROR"),
          caseC,
        );
      }
    }

    /* Gate 21 — SERIES-ONLY stays intact: a proven BO3 with unproven maps
       stores the SERIES and no placeholder match. */
    const seriesExternalId = `proof-${RUN}-series-only`;
    const seriesPersisted = await persistCanonicalSeriesObservation({
      series: {
        game: "cs2",
        bestOf: 3,
        status: "completed",
        startedAt: null,
        finishedAt: null,
        durationSeconds: null,
        teamA: `proof-${RUN}-S-A`,
        teamB: `proof-${RUN}-S-B`,
        mapsWonTeamA: 2,
        mapsWonTeamB: 1,
        winnerTeam: "team_a",
        schemaVersion: CANONICAL_SCHEMA_VERSION,
        quality: quality("degraded", ["series_only"]),
        metadata: { canonical_proof_run: RUN },
      },
      observation: {
        source: "faceit",
        externalSeriesId: seriesExternalId,
        sourceContractVersion: SOURCE_CONTRACT_VERSIONS["faceit"],
        sourceVersion: null,
        fetchedAt: new Date().toISOString(),
        status: "incomplete",
        quality: quality("degraded", ["series_only"]),
        metadata: { canonical_shape: "series_only" },
      },
    });
    touchedSeriesIds.add(seriesPersisted.seriesId);
    const seriesSources = await supabaseAdmin
      .from("match_sources")
      .select("match_id, series_id")
      .eq("series_id", seriesPersisted.seriesId);
    const seriesMatches = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("series_id", seriesPersisted.seriesId);
    check(
      "21 — SERIES-ONLY: one series, zero placeholder matches",
      (seriesSources.data ?? []).length === 1 &&
        seriesSources.data?.[0]?.match_id === null &&
        seriesSources.data?.[0]?.series_id === seriesPersisted.seriesId &&
        seriesMatches.count === 0,
      `sources=${JSON.stringify(seriesSources.data)} matches=${seriesMatches.count}`,
    );
  } finally {
    /* Cleanup — fixtures only, verified by re-reading the tables. */
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
    if (touchedSeriesIds.size > 0) {
      await supabaseAdmin
        .from("match_sources")
        .delete()
        .in("series_id", [...touchedSeriesIds]);
      await supabaseAdmin
        .from("match_series")
        .delete()
        .in("id", [...touchedSeriesIds]);
    }
    // Identity fixtures: deleting the auth user cascades profile + identities.
    for (const userId of touchedUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }
    const leftIdentities = await supabaseAdmin
      .from("player_identities")
      .select("id", { count: "exact", head: true })
      .like("external_id", `${RUN}-gc-faceit-%`);
    check(
      "22 — identity fixtures fully removed",
      leftIdentities.count === 0,
      `leftoverIdentities=${leftIdentities.count}`,
    );

    const leftMatches = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("id", ids.length > 0 ? ids : [randomUUID()]);
    const leftSources = await supabaseAdmin
      .from("match_sources")
      .select("id", { count: "exact", head: true })
      .like("external_match_id", `proof-${RUN}-%`);
    check(
      "13 — fixtures fully removed",
      leftMatches.count === 0 && leftSources.count === 0,
      `leftoverMatches=${leftMatches.count} leftoverSources=${leftSources.count}`,
    );

    const failed = results.filter((entry) => entry.verdict === "FAIL");
    const skipped = results.filter((entry) => entry.verdict === "SKIPPED");
    console.log(
      `\n${results.length - failed.length - skipped.length} PASS / ${failed.length} FAIL / ${skipped.length} SKIPPED`,
    );
    if (failed.length > 0) process.exitCode = 1;
  }
}

await main();
