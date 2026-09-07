/**
 * FASE 2.6.7 — FACEIT source adapter (canonical schema v2).
 *
 * FACEIT exposes MATCH-LEVEL data, not demo-level behaviour. This adapter is
 * therefore honest about coverage: no rounds, no events, no per-round player
 * state. It never fabricates rounds to make a match look analysable, and a
 * BO2/BO3 becomes a SERIES plus one canonical match per map — never one match
 * carrying a series score.
 *
 * No network access here: the caller supplies already-fetched payloads.
 */
import type { CanonicalFaceitMatch } from "@/lib/faceit/faceit.mapper";

import { computeCoverage, quality } from "../canonical.quality";
import type {
  CanonicalMatchBundle,
  CanonicalParticipant,
  CanonicalSeries,
  CanonicalStatus,
  CanonicalTeamSlot,
} from "../canonical.types";
import { CANONICAL_SCHEMA_VERSION, SOURCE_CONTRACT_VERSIONS } from "../canonical.versions";

export interface FaceitParticipantInput {
  externalPlayerId: string;
  nickname: string | null;
  steamId64: string | null;
  team: CanonicalTeamSlot | null;
  isTargetPlayer: boolean;
  internalPlayerId?: string | null;
}

export interface FaceitAdapterInput {
  /** Output of `mapFaceitMatchToMatch` — the player-relative FACEIT view. */
  mapped: CanonicalFaceitMatch;
  /** Which neutral slot the target player's team occupies. */
  targetTeamSlot: CanonicalTeamSlot;
  participants?: FaceitParticipantInput[];
  /** Per-map round scores, when FACEIT reported them (`detailed_results`). */
  mapScores?: Array<{ player: number; opponent: number }> | null;
  /** Canonical map codes per segment, when a series exposes them. */
  mapNames?: Array<string | null> | null;
  fetchedAt?: string;
}

function statusOf(mapped: CanonicalFaceitMatch): CanonicalStatus {
  if (mapped.finished) return "completed";
  if (mapped.terminal) return "cancelled";
  return "unknown";
}

function invert(slot: CanonicalTeamSlot): CanonicalTeamSlot {
  return slot === "team_a" ? "team_b" : "team_a";
}

const FACEIT_COVERAGE_REASONS = [
  "no_round_data",
  "no_event_data",
  "no_player_round_state",
  "match_level_source",
];

/**
 * Result of translating ONE FACEIT record. `series` survives even when no
 * playable map could be identified — a known BO3 must not vanish just because
 * FACEIT did not report per-map scores.
 */
export interface FaceitCanonicalObservation {
  series: CanonicalSeries | null;
  bundles: CanonicalMatchBundle[];
  /** External identifier of the series, when a series exists. */
  externalSeriesId: string | null;
  sourceContractVersion: string;
  sourceVersion: string | null;
  fetchedAt: string;
}

/**
 * Translates ONE FACEIT match record. A BO1 yields one bundle; a series yields
 * one bundle per map segment FACEIT actually reported, plus the series itself.
 */
export function faceitToCanonicalObservation(
  input: FaceitAdapterInput,
): FaceitCanonicalObservation {

  const mapped = input.mapped;
  const fetchedAt = input.fetchedAt ?? mapped.source_fetched_at ?? new Date().toISOString();
  const targetSlot = input.targetTeamSlot;
  const otherSlot = invert(targetSlot);

  const teamNames: Record<CanonicalTeamSlot, string | null> = {
    team_a: null,
    team_b: null,
  };
  teamNames[targetSlot] = mapped.team_player;
  teamNames[otherSlot] = mapped.team_opponent;

  const participants: CanonicalParticipant[] = (input.participants ?? []).map((p) => ({
    participantKey: p.steamId64 ?? p.externalPlayerId,
    internalPlayerId: p.internalPlayerId ?? null,
    source: "faceit" as const,
    externalPlayerId: p.externalPlayerId,
    steamId64: p.steamId64,
    nicknameSnapshot: p.nickname,
    team: p.team,
    isTargetPlayer: p.isTargetPlayer,
    // FACEIT proves the ACCOUNT played; ownership proof lives in the identity
    // graph, so nothing is upgraded to `verified` here.
    identityStatus: p.steamId64 ? ("correlated" as const) : ("unlinked" as const),
    identityConfidence: null,
    metadata: {},
  }));

  const isSeries = Boolean(mapped.metadata["is_series"]);
  const bestOf = typeof mapped.metadata["best_of"] === "number" ? mapped.metadata["best_of"] : null;
  const segments =
    input.mapScores ??
    (mapped.metadata["map_scores"] as Array<{ player: number; opponent: number }> | null) ??
    null;

  const coverage = computeCoverage({
    roundCount: null,
    participants,
    rounds: [],
    roundPlayers: [],
    events: [],
    participantsExpected: null,
  });
  const matchQuality = quality("degraded", FACEIT_COVERAGE_REASONS);

  const seriesRecord: CanonicalSeries | null =
    isSeries || (bestOf !== null && bestOf > 1)
      ? {
          game: "cs2",
          bestOf,
          status: statusOf(mapped),
          startedAt: (mapped.metadata["started_at"] as string | null) ?? null,
          finishedAt: (mapped.metadata["finished_at"] as string | null) ?? null,
          durationSeconds: mapped.duration_seconds,
          teamA: teamNames.team_a,
          teamB: teamNames.team_b,
          // For a series, FACEIT's score IS the number of maps won.
          mapsWonTeamA: targetSlot === "team_a" ? mapped.score_player : mapped.score_opponent,
          mapsWonTeamB: targetSlot === "team_b" ? mapped.score_player : mapped.score_opponent,
          winnerTeam:
            mapped.result === null
              ? null
              : mapped.result === "win"
                ? targetSlot
                : mapped.result === "loss"
                  ? otherSlot
                  : null,
          schemaVersion: CANONICAL_SCHEMA_VERSION,
          quality: quality("partial", ["series_from_match_level_source"]),
          metadata: { external_match_id: mapped.external_match_id, best_of: bestOf },
        }
      : null;

  const observationBase = {
    source: "faceit" as const,
    sourceContractVersion: SOURCE_CONTRACT_VERSIONS.faceit,
    externalMatchId: mapped.external_match_id,
    sourceVersion: mapped.source_version,
    fetchedAt,
    sourceUpdatedAt: (mapped.metadata["finished_at"] as string | null) ?? null,
    fingerprint: null,
    // A FACEIT record is never "complete" in canonical terms: it lacks rounds.
    status: mapped.finished ? ("incomplete" as const) : ("stale" as const),
    quality: matchQuality,
  };

  // BO1: one map, and the FACEIT score IS the round score.
  if (!seriesRecord) {
    return [
      {
        observation: {
          ...observationBase,
          externalParentId: null,
          metadata: { ...mapped.metadata, canonical_shape: "bo1" },
        },
        series: null,
        match: {
          game: "cs2",
          map: mapped.map,
          mapNumber: null,
          playedAt: mapped.match_date,
          startedAt: (mapped.metadata["started_at"] as string | null) ?? null,
          finishedAt: (mapped.metadata["finished_at"] as string | null) ?? null,
          durationSeconds: mapped.duration_seconds,
          status: statusOf(mapped),
          // Lifecycle comes from the mapper, which already demands real proof
          // (`finished_at` or an explicitly finished status). Nothing here may
          // upgrade an unfinished match into a finished one.
          finished: mapped.finished,
          terminal: mapped.terminal,
          teamA: teamNames.team_a,
          teamB: teamNames.team_b,
          scoreTeamA: targetSlot === "team_a" ? mapped.score_player : mapped.score_opponent,
          scoreTeamB: targetSlot === "team_b" ? mapped.score_player : mapped.score_opponent,
          winnerTeam:
            mapped.result === null
              ? null
              : mapped.result === "win"
                ? targetSlot
                : mapped.result === "loss"
                  ? otherSlot
                  : null,
          roundCount: mapped.rounds,
          quality: matchQuality,
          coverage,
          schemaVersion: CANONICAL_SCHEMA_VERSION,
        },
        participants,
        rounds: [],
        roundPlayers: [],
        events: [],
      },
    ];
  }

  // Series: one canonical match per map segment FACEIT actually reported. When
  // no per-map score exists, no map row is invented — only the series survives.
  if (!segments || segments.length === 0) return [];

  return segments.map((segment, index) => {
    const scoreTarget = segment.player;
    const scoreOther = segment.opponent;
    const mapName = input.mapNames?.[index] ?? null;
    return {
      observation: {
        ...observationBase,
        externalMatchId: `${mapped.external_match_id}:map${index + 1}`,
        externalParentId: mapped.external_match_id,
        metadata: { ...mapped.metadata, canonical_shape: "series_map", map_number: index + 1 },
      },
      series: seriesRecord,
      match: {
        game: "cs2" as const,
        map: mapName,
        mapNumber: index + 1,
        playedAt: mapped.match_date,
        startedAt: null,
        finishedAt: null,
        // FACEIT reports no per-map duration; the series duration is NOT it.
        durationSeconds: null,
        status: statusOf(mapped),
        finished: mapped.finished,
        terminal: mapped.terminal,
        teamA: teamNames.team_a,
        teamB: teamNames.team_b,
        scoreTeamA: targetSlot === "team_a" ? scoreTarget : scoreOther,
        scoreTeamB: targetSlot === "team_b" ? scoreTarget : scoreOther,
        winnerTeam:
          scoreTarget === scoreOther ? null : scoreTarget > scoreOther ? targetSlot : otherSlot,
        roundCount: scoreTarget + scoreOther,
        quality: matchQuality,
        coverage,
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      participants,
      rounds: [],
      roundPlayers: [],
      events: [],
    };
  });
}
