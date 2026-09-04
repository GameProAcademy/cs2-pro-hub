/**
 * FASE 2.2.1 — FACEIT player endpoints.
 *
 * The canonical identity is the FACEIT `player_id`; the nickname is display data
 * only, because it can change at any time.
 */
import type { FaceitClient } from "./faceit.http";
import { FaceitError } from "./faceit.errors";
import { faceitPlayerSchema, parseFaceit, type FaceitPlayer } from "./faceit.types";

/** GET /players/{player_id} */
export async function fetchFaceitPlayer(
  client: FaceitClient,
  playerId: string,
): Promise<FaceitPlayer> {
  try {
    const payload = await client.get(`/players/${encodeURIComponent(playerId)}`);
    return parseFaceit(faceitPlayerSchema, payload) as FaceitPlayer;
  } catch (error) {
    if (error instanceof FaceitError && error.code === "FACEIT_RESOURCE_NOT_FOUND") {
      throw new FaceitError("FACEIT_PLAYER_NOT_FOUND", { status: 404 });
    }
    throw error;
  }
}

/** GET /players?nickname=... — only used as a documented fallback. */
export async function fetchFaceitPlayerByNickname(
  client: FaceitClient,
  nickname: string,
): Promise<FaceitPlayer> {
  try {
    const payload = await client.get("/players", { nickname });
    return parseFaceit(faceitPlayerSchema, payload) as FaceitPlayer;
  } catch (error) {
    if (error instanceof FaceitError && error.code === "FACEIT_RESOURCE_NOT_FOUND") {
      throw new FaceitError("FACEIT_PLAYER_NOT_FOUND", { status: 404 });
    }
    throw error;
  }
}
