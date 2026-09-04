/**
 * Gamers Club — data provider abstraction.
 *
 * The provider is the ONLY place allowed to talk to an external Gamers Club
 * data path. Nothing downstream (jobs, normalizer, identity graph, UI) knows how
 * the data was obtained. When an authorized/official access path appears, a new
 * provider implements this interface and nothing else changes.
 */
import type { GamersClubAccessStatus } from "./gamersclub.access";
import {
  GAMERS_CLUB_COLLECTOR_VERSION,
  GAMERS_CLUB_PARSER_VERSION,
  GAMERS_CLUB_SOURCE_VERSION,
} from "./gamersclub.constants";
import type { GamersClubErrorCode } from "./gamersclub.errors";
import type { GamersClubProfileRef } from "./gamersclub.url";

export type GamersClubResultStatus =
  | "success"
  | "not_found"
  | "blocked_external_access"
  | "rate_limited"
  | "timeout"
  | "invalid_response"
  | "unsupported"
  | "error";

export interface GamersClubProvenance {
  source: "gamers_club";
  provenance: "public_profile" | "manual_import" | "authorized_api";
  observedAt: string;
  collectorVersion: string;
  parserVersion: string;
  sourceVersion: string;
}

export interface GamersClubResultMetadata extends GamersClubProvenance {
  durationMs: number | null;
  /** True when some, but not all, of the expected data was obtained. */
  partial: boolean;
  errorCode: GamersClubErrorCode | null;
}

export interface GamersClubResult<T> {
  status: GamersClubResultStatus;
  data: T | null;
  metadata: GamersClubResultMetadata;
}

export interface GamersClubPaginationReport {
  pagesFetched: number;
  itemsFetched: number;
  duplicates: number;
  truncated: boolean;
  stopReason:
    | "completed"
    | "max_pages"
    | "max_items"
    | "max_offset"
    | "duplicate_pages"
    | "deadline"
    | "budget"
    | "blocked"
    | "error";
}

export interface GamersClubMatchHistoryPage<T> {
  items: T[];
  report: GamersClubPaginationReport;
}

export interface GamersClubProviderContext {
  profile: GamersClubProfileRef;
  /** Absolute epoch ms after which no request may START. */
  deadlineAt?: number;
  /** Literal request budget. Never silently raised. */
  requestBudget?: number;
}

/**
 * Provider contract. Every operation returns a structured result — it never
 * throws for a source-side condition, and it never maps a block to `not_found`.
 */
export interface GamersClubDataProvider {
  readonly id: string;
  /** What this provider can currently do, observed rather than assumed. */
  accessStatus(): Promise<GamersClubAccessStatus>;
  getProfile(context: GamersClubProviderContext): Promise<GamersClubResult<unknown>>;
  getMatchHistory(
    context: GamersClubProviderContext,
  ): Promise<GamersClubResult<GamersClubMatchHistoryPage<unknown>>>;
  getMatchDetails(
    context: GamersClubProviderContext & { sourceMatchId: string },
  ): Promise<GamersClubResult<unknown>>;
  getPlayerStats(context: GamersClubProviderContext): Promise<GamersClubResult<unknown>>;
}

export function gamersClubMetadata(
  overrides: Partial<GamersClubResultMetadata> = {},
): GamersClubResultMetadata {
  return {
    source: "gamers_club",
    provenance: "public_profile",
    observedAt: new Date().toISOString(),
    collectorVersion: GAMERS_CLUB_COLLECTOR_VERSION,
    parserVersion: GAMERS_CLUB_PARSER_VERSION,
    sourceVersion: GAMERS_CLUB_SOURCE_VERSION,
    durationMs: null,
    partial: false,
    errorCode: null,
    ...overrides,
  };
}

export function gamersClubBlockedResult<T>(): GamersClubResult<T> {
  return {
    status: "blocked_external_access",
    data: null,
    metadata: gamersClubMetadata({ errorCode: "GC_BLOCKED_EXTERNAL_ACCESS", partial: false }),
  };
}

/**
 * The provider that reflects reality today: the public site answers server-side
 * requests with a Cloudflare interstitial challenge, and bypassing it is
 * forbidden. It performs NO request at all — pretending to try, retrying, or
 * disguising the block as "not found" would all be dishonest.
 */
export class BlockedGamersClubProvider implements GamersClubDataProvider {
  readonly id = "gc-public-profile-blocked";

  accessStatus(): Promise<GamersClubAccessStatus> {
    return Promise.resolve("blocked_external_access");
  }

  getProfile(): Promise<GamersClubResult<unknown>> {
    return Promise.resolve(gamersClubBlockedResult());
  }

  getMatchHistory(): Promise<GamersClubResult<GamersClubMatchHistoryPage<unknown>>> {
    return Promise.resolve(gamersClubBlockedResult());
  }

  getMatchDetails(): Promise<GamersClubResult<unknown>> {
    return Promise.resolve(gamersClubBlockedResult());
  }

  getPlayerStats(): Promise<GamersClubResult<unknown>> {
    return Promise.resolve(gamersClubBlockedResult());
  }
}

/** Single resolution point, so a future authorized provider swaps in here. */
export function getGamersClubProvider(): GamersClubDataProvider {
  return new BlockedGamersClubProvider();
}
