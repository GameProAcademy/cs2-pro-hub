/**
 * FASE 2.2.1 — FACEIT player statistics.
 *
 * Lifetime statistics and per-match statistics are DIFFERENT things and are
 * never mixed: the caller always states which one it wants.
 */
import type { FaceitClient } from "./faceit.http";
import { FaceitError } from "./faceit.errors";
import { faceitLifetimeStatsSchema, parseFaceit } from "./faceit.types";

/** GET /players/{player_id}/games/{game_id}/stats — recent match statistics. */
export async function fetchFaceitRecentMatchStats(
  client: FaceitClient,
  playerId: string,
  gameId: string,
): Promise<unknown | null> {
  try {
    return await client.get(
      `/players/${encodeURIComponent(playerId)}/games/${encodeURIComponent(gameId)}/stats`,
    );
  } catch (error) {
    if (error instanceof FaceitError && error.code === "FACEIT_RESOURCE_NOT_FOUND") return null;
    throw error;
  }
}

/** GET /players/{player_id}/stats/{game_id} — aggregated lifetime statistics. */
export async function fetchFaceitLifetimeStats(
  client: FaceitClient,
  playerId: string,
  gameId: string,
) {
  try {
    const payload = await client.get(
      `/players/${encodeURIComponent(playerId)}/stats/${encodeURIComponent(gameId)}`,
    );
    return parseFaceit(faceitLifetimeStatsSchema, payload);
  } catch (error) {
    if (error instanceof FaceitError && error.code === "FACEIT_RESOURCE_NOT_FOUND") return null;
    throw error;
  }
}
