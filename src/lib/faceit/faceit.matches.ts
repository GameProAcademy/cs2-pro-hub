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
  from?: number | undefined;
  to?: number | undefined;
}

/**
 * Why pagination stopped. `end_of_history` is the ONLY value that proves the
 * requested window was fully read; anything else means the result is truncated.
 */
export type HistoryStopReason =
  "end_of_history" | "match_limit" | "page_limit" | "offset_limit" | "duplicate_pages";

export interface HistoryResult {
  items: FaceitHistoryItem[];
  pages: number;
  /** `true` unless we proved we reached the end of the requested window. */
  truncated: boolean;
  stopReason: HistoryStopReason;
}

/**
 * Consecutive pages containing exclusively already-seen matches that we tolerate
 * before stopping. Needed because the incremental `from` window overlaps on
 * purpose: the first page is often entirely known while newer pages are not.
 */
export const FACEIT_HISTORY_DUPLICATE_PAGE_TOLERANCE = 2;

/**
 * GET /players/{player_id}/history — bounded, de-duplicated pagination.
 *
 * A SHORT PAGE IS NOT PROOF OF THE END OF HISTORY: FACEIT may return fewer items
 * than requested and still have more. We only claim `end_of_history` after an
 * empty page. Every other exit sets `truncated = true` so the caller knows data
 * may remain, instead of silently losing it.
 */
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
  let knownOnlyPages = 0;
  let stopReason: HistoryStopReason = "page_limit";

  while (true) {
    if (items.length >= query.maxMatches) {
      stopReason = "match_limit";
      break;
    }
    if (pages >= maxPages) {
      stopReason = "page_limit";
      break;
    }
    if (offset > FACEIT_HISTORY_MAX_OFFSET) {
      stopReason = "offset_limit";
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
    const pageItems = page.items ?? [];
    pages += 1;

    // An EMPTY page is the only proof that the window has been fully read.
    if (pageItems.length === 0) {
      stopReason = "end_of_history";
      break;
    }

    let added = 0;
    for (const item of pageItems) {
      if (seen.has(item.match_id)) continue;
      seen.add(item.match_id);
      items.push(item as FaceitHistoryItem);
      added += 1;
      if (items.length >= query.maxMatches) break;
    }

    // Offset always advances by the page size actually returned, so the loop
    // makes progress even when every item was already known.
    offset += pageItems.length;

    if (added === 0) {
      knownOnlyPages += 1;
      if (knownOnlyPages >= FACEIT_HISTORY_DUPLICATE_PAGE_TOLERANCE) {
        stopReason = "duplicate_pages";
        break;
      }
    } else {
      knownOnlyPages = 0;
    }
  }

  return { items, pages, truncated: stopReason !== "end_of_history", stopReason };
}

/** GET /matches/{match_id} */
export async function fetchFaceitMatchDetails(
  client: FaceitClient,
  matchId: string,
): Promise<FaceitMatch | null> {
  try {
    const payload = await client.get(`/matches/${encodeURIComponent(matchId)}`);
    return parseFaceit(faceitMatchSchema, payload) as FaceitMatch;
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
    return parseFaceit(faceitMatchStatsSchema, payload) as FaceitMatchStats;
  } catch (error) {
    if (error instanceof FaceitError && error.code === "FACEIT_RESOURCE_NOT_FOUND") return null;
    throw error;
  }
}
