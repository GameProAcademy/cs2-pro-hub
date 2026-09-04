/**
 * Bounded pagination for Gamers Club collections.
 *
 * Every loop is bounded by pages, items, offset, deadline AND request budget,
 * and reports honestly why it stopped. A short page is NOT assumed to be the
 * end of the data.
 */
import {
  GC_HISTORY_DUPLICATE_PAGE_TOLERANCE,
  GC_HISTORY_MAX_ITEMS,
  GC_HISTORY_MAX_OFFSET,
  GC_HISTORY_MAX_PAGES,
  GC_HISTORY_PAGE_SIZE,
} from "./gamersclub.constants";
import { GamersClubError } from "./gamersclub.errors";
import type { GamersClubPaginationReport } from "./gamersclub.provider";

export interface PaginationBounds {
  pageSize?: number;
  maxPages?: number;
  maxItems?: number;
  maxOffset?: number;
  deadlineAt?: number;
  requestBudget?: number;
  /** Injectable clock, so tests never depend on wall time. */
  now?: () => number;
}

export interface PageFetchResult<T> {
  items: T[];
  /** `true` only when the SOURCE says there is nothing more. */
  exhausted?: boolean;
}

export interface PaginateOutcome<T> {
  items: T[];
  report: GamersClubPaginationReport;
}

/**
 * Drives a paginated read. `fetchPage` must consume one unit of request budget
 * per call; the driver refuses to start a page once any bound is reached.
 */
export async function paginateGamersClub<T>(
  fetchPage: (input: { offset: number; limit: number }) => Promise<PageFetchResult<T>>,
  key: (item: T) => string,
  bounds: PaginationBounds = {},
): Promise<PaginateOutcome<T>> {
  const pageSize = bounds.pageSize ?? GC_HISTORY_PAGE_SIZE;
  const maxPages = bounds.maxPages ?? GC_HISTORY_MAX_PAGES;
  const maxItems = bounds.maxItems ?? GC_HISTORY_MAX_ITEMS;
  const maxOffset = bounds.maxOffset ?? GC_HISTORY_MAX_OFFSET;
  const now = bounds.now ?? (() => Date.now());

  let budget = bounds.requestBudget ?? Number.POSITIVE_INFINITY;
  if (Number.isFinite(budget) && (!Number.isInteger(budget) || budget < 0)) {
    throw new GamersClubError("GC_API_BUDGET_EXHAUSTED");
  }

  const seen = new Set<string>();
  const items: T[] = [];
  let pagesFetched = 0;
  let duplicates = 0;
  let repeatedPages = 0;
  let offset = 0;
  let stopReason: GamersClubPaginationReport["stopReason"] = "completed";

  for (;;) {
    if (pagesFetched >= maxPages) {
      stopReason = "max_pages";
      break;
    }
    if (items.length >= maxItems) {
      stopReason = "max_items";
      break;
    }
    if (offset >= maxOffset) {
      stopReason = "max_offset";
      break;
    }
    // No request may START after the deadline.
    if (bounds.deadlineAt !== undefined && now() >= bounds.deadlineAt) {
      stopReason = "deadline";
      break;
    }
    if (budget <= 0) {
      stopReason = "budget";
      break;
    }

    budget -= 1;
    const page = await fetchPage({ offset, limit: Math.min(pageSize, maxItems - items.length) });
    pagesFetched += 1;

    let newItems = 0;
    for (const item of page.items) {
      const id = key(item);
      if (seen.has(id)) {
        duplicates += 1;
        continue;
      }
      seen.add(id);
      items.push(item);
      newItems += 1;
      if (items.length >= maxItems) break;
    }

    if (page.items.length > 0 && newItems === 0) {
      repeatedPages += 1;
      if (repeatedPages >= GC_HISTORY_DUPLICATE_PAGE_TOLERANCE) {
        stopReason = "duplicate_pages";
        break;
      }
    } else {
      repeatedPages = 0;
    }

    // Only the source may declare the end; a short page does not.
    if (page.exhausted === true) {
      stopReason = "completed";
      break;
    }
    if (page.items.length === 0) {
      stopReason = "completed";
      break;
    }

    offset += page.items.length;
  }

  const truncated = stopReason !== "completed";
  return {
    items,
    report: { pagesFetched, itemsFetched: items.length, duplicates, truncated, stopReason },
  };
}
