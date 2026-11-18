/**
 * FASE 2.2.1 — FACEIT player statistics.
 *
 * Lifetime statistics and per-match statistics are DIFFERENT things and are
 * never mixed: the caller always states which one it wants.
 */
import type { FaceitClient } from "./faceit.http";
import { FaceitError } from "./faceit.errors";
import type { z } from "zod";

import { faceitLifetimeStatsSchema, parseFaceit } from "./faceit.types";

/** GET /players/{player_id}/stats/{game_id} — aggregated lifetime statistics. */
export async function fetchFaceitLifetimeStats(
  client: FaceitClient,
  playerId: string,
  gameId: string,
): Promise<z.output<typeof faceitLifetimeStatsSchema> | null> {
  try {
    const payload = await client.get(
      `/players/${encodeURIComponent(playerId)}/stats/${encodeURIComponent(gameId)}`,
    );
    return parseFaceit(faceitLifetimeStatsSchema, payload) as z.output<
      typeof faceitLifetimeStatsSchema
    >;
  } catch (error) {
    if (error instanceof FaceitError && error.code === "FACEIT_RESOURCE_NOT_FOUND") return null;
    throw error;
  }
}
