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
  resolveAgainstAll,
  canConvergeCrossSource,
  type CanonicalTeamSlot,
  type FaceitParticipantInput,
  type MatchIdentityCandidate,
} from "@/lib/canonical";
import {
  persistCanonicalObservation,
  persistCanonicalSeriesObservation,
} from "@/lib/canonical/canonical.persistence.server";
import { normalizeSteamId64 } from "@/lib/identity/identity.normalize";
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
 * FASE 2.6.11.1 — IDENTITY GRAPH resolution for FACEIT participants.
 *
 * FACEIT match payloads never expose SteamID64s. The ONLY legitimate way to
 * obtain one is an identity the Player Identity Graph already correlated with
 * enough evidence. A nickname, an avatar, a team name or a coincidence in time
 * is NOT evidence, and a missing identity stays missing: no SteamID is ever
 * fabricated to make a comparison succeed.
 */
const GRAPH_TRUSTED_STATUSES = ["correlated", "strongly_correlated", "verified"] as const;
const GRAPH_STEAM_STATUSES = ["strongly_correlated", "verified"] as const;

export interface ResolvedGraphIdentity {
  internalPlayerId: string | null;
  steamId64: string | null;
}

export async function resolveFaceitIdentities(
  db: SupabaseClient<Database>,
  faceitPlayerIds: readonly string[],
): Promise<Map<string, ResolvedGraphIdentity>> {
  const out = new Map<string, ResolvedGraphIdentity>();
  const ids = [...new Set(faceitPlayerIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return out;

  const { data: faceitRows } = await db
    .from("player_identities")
    .select("player_id, external_id, identity_status")
    .eq("platform", "FACEIT")
    .in("external_id", ids)
    .in("identity_status", [...GRAPH_TRUSTED_STATUSES]);

  const byPlayer = new Map<string, string[]>();
  for (const row of faceitRows ?? []) {
    if (!row.external_id) continue;
    out.set(row.external_id, { internalPlayerId: row.player_id, steamId64: null });
    const list = byPlayer.get(row.player_id) ?? [];
    list.push(row.external_id);
    byPlayer.set(row.player_id, list);
  }
  if (byPlayer.size === 0) return out;

  // A Steam identity is only usable when the graph proved OWNERSHIP of it.
  const { data: steamRows } = await db
    .from("player_identities")
    .select("player_id, external_id, identity_status")
    .eq("platform", "STEAM")
    .in("player_id", [...byPlayer.keys()])
    .in("identity_status", [...GRAPH_STEAM_STATUSES]);

  for (const row of steamRows ?? []) {
    const steamId = normalizeSteamId64(row.external_id);
    if (!steamId) continue;
    for (const externalId of byPlayer.get(row.player_id) ?? []) {
      const current = out.get(externalId);
      if (current) current.steamId64 = steamId;
    }
  }
  return out;
}

/** SteamID64s already stored for a canonical match, used as resolver evidence. */
async function loadCandidateRosters(
  db: SupabaseClient<Database>,
  matchIds: readonly string[],
): Promise<Map<string, string[]>> {
  const rosters = new Map<string, string[]>();
  if (matchIds.length === 0) return rosters;
  const { data } = await db
    .from("match_participants")
    .select("match_id, steam_id64")
    .in("match_id", [...matchIds]);
  for (const row of data ?? []) {
    const steamId = normalizeSteamId64(row.steam_id64);
    if (!steamId) continue;
    const list = rosters.get(row.match_id) ?? [];
    list.push(steamId);
    rosters.set(row.match_id, list);
  }
  return rosters;
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

  const rosters = await loadCandidateRosters(
    db,
    (data ?? []).map((row) => row.id),
  );

  return (data ?? []).map((row) => ({
    canonicalMatchId: row.id,
    participantSteamIds: rosters.get(row.id) ?? [],
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

  // Real Identity Graph, never invented identities.
  const graph = await resolveFaceitIdentities(
    args.db,
    participants.map((p) => p.externalPlayerId),
  );
  const enriched = participants.map((p) => {
    const resolvedIdentity = graph.get(p.externalPlayerId);
    return {
      ...p,
      steamId64: resolvedIdentity?.steamId64 ?? p.steamId64,
      internalPlayerId: resolvedIdentity?.internalPlayerId ?? p.internalPlayerId ?? null,
    };
  });

  const observation = faceitToCanonicalObservation({
    mapped: args.mapped,
    targetTeamSlot: targetSlot,
    participants: enriched,
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
      // Only graph-proven SteamID64s; absence is never filled in.
      participantSteamIds: enriched
        .map((p) => p.steamId64)
        .filter((id): id is string => typeof id === "string"),
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
