/**
 * FASE 2.6.11 — FACEIT ➜ CANONICAL MATCH ENGINE wiring (server-only).
 *
 * This is the ONLY path by which a FACEIT observation becomes canonical data.
 * The sync worker no longer writes `matches` directly: it hands the mapped
 * FACEIT view to the adapter, asks the Match Identity Resolver whether the
 * observation is an already-known canonical match, and persists through the
 * transactional canonical routines.
 *
 * Honesty rules enforced here:
 *  - a bo2/bo3 becomes ONE series plus one canonical match per REPORTED map;
 *    when FACEIT reported no per-map score, the series is stored ALONE and no
 *    placeholder match is invented;
 *  - only a positive, non-reviewable identity decision attaches an observation
 *    to an existing canonical match — ambiguity leaves the sources separate;
 *  - nothing is merged: source precedence inside the persistence routine still
 *    decides which observation may write the canonical columns.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  faceitToCanonicalObservation,
  persistCanonicalObservation,
  persistCanonicalSeriesObservation,
  resolveAgainstAll,
  canConvergeCrossSource,
  type CanonicalTeamSlot,
  type FaceitParticipantInput,
  type MatchIdentityCandidate,
} from "@/lib/canonical";
import type { Database } from "@/integrations/supabase/types";
import type { CanonicalFaceitMatch } from "./faceit.mapper";
import type { FaceitMatch, FaceitMatchStats } from "./faceit.types";

/** Time window used to look for an already stored match of the same player. */
const CANDIDATE_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface FaceitCanonicalResult {
  /** Canonical match ids written by this observation (0 for series-only). */
  matchIds: string[];
  seriesId: string | null;
  created: number;
  /** Identity decisions taken, for observability. Never silent. */
  decisions: Array<{ resolution: string; confidence: number; attached: boolean }>;
}

/**
 * The target player's team is projected onto `team_a`. The neutral slot only has
 * to be STABLE within one observation; FACEIT factions carry no global meaning.
 */
const TARGET_TEAM_SLOT: CanonicalTeamSlot = "team_a";

/** Roster of both teams, from details when present, else from the stats payload. */
export function faceitParticipants(
  details: FaceitMatch | null,
  stats: FaceitMatchStats | null,
  faceitPlayerId: string,
  targetSlot: CanonicalTeamSlot,
): FaceitParticipantInput[] {
  const other: CanonicalTeamSlot = targetSlot === "team_a" ? "team_b" : "team_a";
  const out: FaceitParticipantInput[] = [];
  const seen = new Set<string>();

  const push = (id: string | null, nickname: string | null, team: CanonicalTeamSlot | null) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({
      externalPlayerId: id,
      nickname,
      // FACEIT match payloads do NOT expose SteamID64s; absence stays null.
      steamId64: null,
      team,
      isTargetPlayer: id === faceitPlayerId,
    });
  };

  const teams = details?.teams ?? null;
  if (teams) {
    // Which faction holds the target player decides the slot of each faction.
    const keys = Object.keys(teams);
    const targetKey =
      keys.find((key) =>
        (teams[key]?.roster ?? []).some((member) => member.player_id === faceitPlayerId),
      ) ?? null;
    for (const key of keys) {
      const slot = targetKey === null ? null : key === targetKey ? targetSlot : other;
      for (const member of teams[key]?.roster ?? []) {
        push(member.player_id ?? null, member.nickname ?? null, slot);
      }
    }
  }

  if (out.length === 0 && stats) {
    for (const round of stats.rounds ?? []) {
      for (const team of round.teams ?? []) {
        const holdsTarget = (team.players ?? []).some((p) => p.player_id === faceitPlayerId);
        for (const player of team.players ?? []) {
          push(player.player_id ?? null, player.nickname ?? null, holdsTarget ? targetSlot : other);
        }
      }
    }
  }

  return out;
}

/**
 * Already stored matches of this player near the same competitive date. They are
 * the candidates the resolver compares the incoming FACEIT observation against.
 */
async function loadCandidates(
  db: SupabaseClient<Database>,
  playerId: string,
  playedAt: string | null,
): Promise<MatchIdentityCandidate[]> {
  if (!playedAt) return [];
  const center = Date.parse(playedAt);
  if (!Number.isFinite(center)) return [];

  const { data } = await db
    .from("matches")
    .select(
      "id, data_source, external_match_id, content_fingerprint, map, played_at, match_date, round_count, score_team_a, score_team_b",
    )
    .eq("player_id", playerId)
    .gte("match_date", new Date(center - CANDIDATE_WINDOW_MS).toISOString())
    .lte("match_date", new Date(center + CANDIDATE_WINDOW_MS).toISOString())
    .limit(50);

  return (data ?? []).map((row) => ({
    canonicalMatchId: row.id,
    source: row.data_source,
    externalMatchId: row.external_match_id ?? null,
    fingerprint: row.content_fingerprint ?? null,
    map: row.map ?? null,
    playedAt: row.played_at ?? row.match_date ?? null,
    roundCount: row.round_count ?? null,
    scoreTeamA: row.score_team_a ?? null,
    scoreTeamB: row.score_team_b ?? null,
  }));
}

/**
 * Persists ONE FACEIT match observation canonically. Returns the canonical match
 * ids so the caller can project player-scoped metrics onto them.
 */
export async function persistFaceitObservation(args: {
  db: SupabaseClient<Database>;
  playerId: string;
  faceitPlayerId: string;
  mapped: CanonicalFaceitMatch;
  details: FaceitMatch | null;
  stats: FaceitMatchStats | null;
}): Promise<FaceitCanonicalResult> {
  const targetSlot = TARGET_TEAM_SLOT;
  const participants = faceitParticipants(
    args.details,
    args.stats,
    args.faceitPlayerId,
    targetSlot,
  );

  const observation = faceitToCanonicalObservation({
    mapped: args.mapped,
    targetTeamSlot: targetSlot,
    participants,
  });

  const result: FaceitCanonicalResult = {
    matchIds: [],
    seriesId: null,
    created: 0,
    decisions: [],
  };

  // SERIES-ONLY: the series is proven, its maps are not. Store the series and
  // stop — a match row with no map and no score would be fabricated data.
  if (observation.bundles.length === 0) {
    if (!observation.series || !observation.externalSeriesId) return result;
    const persisted = await persistCanonicalSeriesObservation({
      series: observation.series,
      observation: {
        source: "faceit",
        externalSeriesId: observation.externalSeriesId,
        sourceContractVersion: observation.sourceContractVersion,
        sourceVersion: observation.sourceVersion,
        fetchedAt: observation.fetchedAt,
        status: "incomplete",
        quality: observation.series.quality,
        metadata: { canonical_shape: "series_only" },
      },
      ownerPlayerId: args.playerId,
    });
    result.seriesId = persisted.seriesId;
    if (persisted.created) result.created += 1;
    return result;
  }

  const candidates = await loadCandidates(args.db, args.playerId, args.mapped.match_date);

  for (const bundle of observation.bundles) {
    const incoming: MatchIdentityCandidate = {
      source: "faceit",
      externalMatchId: bundle.observation.externalMatchId,
      fingerprint: bundle.observation.fingerprint,
      map: bundle.match.map,
      playedAt: bundle.match.playedAt,
      roundCount: bundle.match.roundCount,
      scoreTeamA: bundle.match.scoreTeamA,
      scoreTeamB: bundle.match.scoreTeamB,
    };
    const resolved = resolveAgainstAll(incoming, candidates);
    const attach =
      canConvergeCrossSource(resolved.decision) && resolved.candidate?.canonicalMatchId
        ? resolved.candidate.canonicalMatchId
        : null;

    result.decisions.push({
      resolution: resolved.decision.resolution,
      confidence: resolved.decision.confidence,
      attached: attach !== null,
    });

    const persisted = await persistCanonicalObservation({
      bundle,
      ownerPlayerId: args.playerId,
      attachMatchId: attach,
    });
    result.matchIds.push(persisted.matchId);
    result.seriesId = persisted.seriesId ?? result.seriesId;
    if (persisted.created) result.created += 1;
  }

  return result;
}
