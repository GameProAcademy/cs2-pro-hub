/**
 * FASE 2.2.1 — FACEIT match history, details and stats.
 *
 * Pagination is bounded on every axis (page size, page count, offset ceiling and
 * total match ceiling) and de-duplicates by `match_id`, so a broken upstream
 * cursor can never produce an infinite loop.
 */
import type { FaceitClient } from "./faceit.http";
import { FACEIT_HISTORY_MAX_LIMIT, FACEIT_HISTORY_MAX_OFFSET } from "./faceit.constants";
import { FaceitError } from "./faceit.errors";
import {
  faceitHistoryPageSchema,
  faceitMatchSchema,
  faceitMatchStatsSchema,
  parseFaceit,
  type FaceitHistoryItem,
  type FaceitMatch,
  type FaceitMatchStats,
} from "./faceit.types";

export interface HistoryQuery {
  playerId: string;
  gameId: string;
  /** Maximum number of matches to collect in total. */
  maxMatches: number;
  /** Maximum number of HTTP pages, independent of `maxMatches`. */
  maxPages: number;
  /** Page size; clamped to the documented 100. */
  pageSize?: number;
  from?: number;
  to?: number;
}

export interface HistoryResult {
  items: FaceitHistoryItem[];
  pages: number;
  truncated: boolean;
}

/** GET /players/{player_id}/history — bounded, de-duplicated pagination. */
export async function fetchFaceitHistory(
  client: FaceitClient,
  query: HistoryQuery,
): Promise<HistoryResult> {
  const pageSize = Math.min(query.pageSize ?? FACEIT_HISTORY_MAX_LIMIT, FACEIT_HISTORY_MAX_LIMIT);
  const maxPages = Math.max(1, query.maxPages);
  const seen = new Set<string>();
  const items: FaceitHistoryItem[] = [];
  let pages = 0;
  let offset = 0;
  let truncated = false;

  while (pages < maxPages && items.length < query.maxMatches) {
    if (offset > FACEIT_HISTORY_MAX_OFFSET) {
      truncated = true;
      break;
    }
    const limit = Math.min(pageSize, query.maxMatches - items.length);
    const payload = await client.get(`/players/${encodeURIComponent(query.playerId)}/history`, {
      game: query.gameId,
      offset,
      limit,
      from: query.from,
      to: query.to,
    });
    const page = parseFaceit(faceitHistoryPageSchema, payload);
    pages += 1;

    let added = 0;
    for (const item of page.items) {
      if (seen.has(item.match_id)) continue;
      seen.add(item.match_id);
      items.push(item);
      added += 1;
      if (items.length >= query.maxMatches) break;
    }

    // Stop when the page is empty or shorter than requested: there is no more
    // history. A page that only repeats known ids also stops the loop.
    if (page.items.length === 0 || page.items.length < limit || added === 0) break;
    offset += page.items.length;
  }

  if (items.length >= query.maxMatches) truncated = true;
  return { items, pages, truncated };
}

/** GET /matches/{match_id} */
export async function fetchFaceitMatchDetails(
  client: FaceitClient,
  matchId: string,
): Promise<FaceitMatch | null> {
  try {
    const payload = await client.get(`/matches/${encodeURIComponent(matchId)}`);
    return parseFaceit(faceitMatchSchema, payload);
  } catch (error) {
    // A match that no longer exists is not a sync failure.
    if (error instanceof FaceitError && error.code === "FACEIT_RESOURCE_NOT_FOUND") return null;
    throw error;
  }
}

/** GET /matches/{match_id}/stats — frequently unavailable; that is not an error. */
export async function fetchFaceitMatchStats(
  client: FaceitClient,
  matchId: string,
): Promise<FaceitMatchStats | null> {
  try {
    const payload = await client.get(`/matches/${encodeURIComponent(matchId)}/stats`);
    return parseFaceit(faceitMatchStatsSchema, payload);
  } catch (error) {
    if (error instanceof FaceitError && error.code === "FACEIT_RESOURCE_NOT_FOUND") return null;
    throw error;
  }
}
