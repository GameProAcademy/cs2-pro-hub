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

/**
 * FASE 2.6.11.3 — a technical failure is NOT an absent identity.
 *
 * A database error, a permission denial or a timeout says nothing about whether
 * the identity exists. Treating it as "no identity found" would silently turn a
 * broken Identity Graph into a resolver that never converges, so the failure is
 * raised instead of being flattened into an empty result.
 */
export class FaceitIdentityResolutionError extends Error {
  constructor(readonly detail: string) {
    super(`IDENTITY_RESOLUTION_ERROR: ${detail}`);
    this.name = "FaceitIdentityResolutionError";
  }
}

export type FaceitIdentityResolution =
  /** The graph answered and every requested identity resolved to Steam. */
  | "RESOLVED"
  /** The graph answered; some or all identities simply do not exist yet. */
  | "IDENTITY_UNRESOLVED";

export interface FaceitIdentityResult {
  identities: Map<string, ResolvedGraphIdentity>;
  resolution: FaceitIdentityResolution;
}

export async function resolveFaceitIdentities(
  db: SupabaseClient<Database>,
  faceitPlayerIds: readonly string[],
): Promise<FaceitIdentityResult> {
  const out = new Map<string, ResolvedGraphIdentity>();
  const ids = [...new Set(faceitPlayerIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return { identities: out, resolution: "IDENTITY_UNRESOLVED" };

  const { data: faceitRows, error: faceitError } = await db
    .from("player_identities")
    .select("player_id, external_id, identity_status")
    .eq("platform", "FACEIT")
    .in("external_id", ids)
    .in("identity_status", [...GRAPH_TRUSTED_STATUSES]);

  if (faceitError) throw new FaceitIdentityResolutionError(faceitError.message);

  const byPlayer = new Map<string, string[]>();
  for (const row of faceitRows ?? []) {
    if (!row.external_id) continue;
    out.set(row.external_id, { internalPlayerId: row.player_id, steamId64: null });
    const list = byPlayer.get(row.player_id) ?? [];
    list.push(row.external_id);
    byPlayer.set(row.player_id, list);
  }
  if (byPlayer.size === 0) return { identities: out, resolution: "IDENTITY_UNRESOLVED" };

  // A Steam identity is only usable when the graph proved OWNERSHIP of it.
  const { data: steamRows, error: steamError } = await db
    .from("player_identities")
    .select("player_id, external_id, identity_status")
    .eq("platform", "STEAM")
    .in("player_id", [...byPlayer.keys()])
    .in("identity_status", [...GRAPH_STEAM_STATUSES]);

  if (steamError) throw new FaceitIdentityResolutionError(steamError.message);

  for (const row of steamRows ?? []) {
    const steamId = normalizeSteamId64(row.external_id);
    if (!steamId) continue;
    for (const externalId of byPlayer.get(row.player_id) ?? []) {
      const current = out.get(externalId);
      if (current) current.steamId64 = steamId;
    }
  }

  const resolvedSteam = [...out.values()].filter((entry) => entry.steamId64 !== null).length;
  return {
    identities: out,
    resolution: resolvedSteam === ids.length ? "RESOLVED" : "IDENTITY_UNRESOLVED",
  };
}

/** SteamID64s already stored for a canonical match, used as resolver evidence. */
async function loadCandidateRosters(
  db: SupabaseClient<Database>,
  matchIds: readonly string[],
): Promise<Map<string, string[]>> {
  const rosters = new Map<string, string[]>();
  if (matchIds.length === 0) return rosters;
  const { data, error } = await db
    .from("match_participants")
    .select("match_id, steam_id64")
    .in("match_id", [...matchIds]);
  if (error) throw new FaceitIdentityResolutionError(error.message);
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
 * FASE 2.6.11.3 — PLAYER-NEUTRAL candidate discovery.
 *
 * A canonical match does not belong to a player, so discovery may NOT depend on
 * `matches.player_id`: a match persisted without an owner (or owned by another
 * participant) is still the same match. Candidates are found by canonical
 * attributes only — the participants proven by the Identity Graph, plus the
 * competitive time window.
 */
export async function loadCandidates(
  db: SupabaseClient<Database>,
  playedAt: string | null,
  steamIds: readonly string[],
): Promise<MatchIdentityCandidate[]> {
  if (!playedAt) return [];
  const center = Date.parse(playedAt);
  if (!Number.isFinite(center)) return [];
  const from = new Date(center - CANDIDATE_WINDOW_MS).toISOString();
  const to = new Date(center + CANDIDATE_WINDOW_MS).toISOString();

  const ids = new Set<string>();

  // 1. Roster-driven discovery: matches that already contain these accounts.
  if (steamIds.length > 0) {
    const { data: byRoster, error: rosterError } = await db
      .from("match_participants")
      .select("match_id")
      .in("steam_id64", [...new Set(steamIds)])
      .limit(500);
    if (rosterError) throw new FaceitIdentityResolutionError(rosterError.message);
    for (const row of byRoster ?? []) if (row.match_id) ids.add(row.match_id);
  }

  // 2. Time-window discovery, so a match with no resolved roster is still seen.
  const { data: byWindow, error: windowError } = await db
    .from("matches")
    .select("id")
    .gte("match_date", from)
    .lte("match_date", to)
    .limit(200);
  if (windowError) throw new FaceitIdentityResolutionError(windowError.message);
  for (const row of byWindow ?? []) ids.add(row.id);

  if (ids.size === 0) return [];

  const { data, error } = await db
    .from("matches")
    .select(
      "id, data_source, external_match_id, content_fingerprint, map, played_at, match_date, round_count, score_team_a, score_team_b",
    )
    .in("id", [...ids])
    .limit(200);
  if (error) throw new FaceitIdentityResolutionError(error.message);

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
    const resolvedIdentity = graph.identities.get(p.externalPlayerId);
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

  const provenSteamIds = enriched
    .map((p) => p.steamId64)
    .filter((id): id is string => typeof id === "string");
  const candidates = await loadCandidates(args.db, args.mapped.match_date, provenSteamIds);

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
      participantSteamIds: provenSteamIds,
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
