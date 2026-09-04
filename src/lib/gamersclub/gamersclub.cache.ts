/**
 * Freshness / cache policy for Gamers Club data.
 *
 * Pure decision layer: it holds no storage. The job layer persists entries and
 * asks here whether an entry may be reused. TTLs differ per data kind.
 */
import { GC_CACHE_TTL_MINUTES, type GamersClubCacheKind } from "./gamersclub.constants";

export type CacheOutcome = "cache_hit" | "cache_stale" | "cache_miss";
export type FreshnessState = "fresh" | "stale" | "expired" | "unknown";

/** Stale-while-revalidate window, as a multiple of the TTL. */
const STALE_FACTOR = 3;

export function cacheTtlMs(kind: GamersClubCacheKind): number {
  return GC_CACHE_TTL_MINUTES[kind] * 60_000;
}

export function freshness(
  kind: GamersClubCacheKind,
  observedAt: string | null | undefined,
  now: number = Date.now(),
): FreshnessState {
  if (!observedAt) return "unknown";
  const time = Date.parse(observedAt);
  if (Number.isNaN(time)) return "unknown";
  const age = now - time;
  if (age < 0) return "unknown";
  const ttl = cacheTtlMs(kind);
  if (age <= ttl) return "fresh";
  if (age <= ttl * STALE_FACTOR) return "stale";
  return "expired";
}

export interface CacheDecision {
  outcome: CacheOutcome;
  state: FreshnessState;
  /** Should the caller perform an external request? */
  refresh: boolean;
  ageMs: number | null;
}

export function decideCache(
  kind: GamersClubCacheKind,
  observedAt: string | null | undefined,
  options: { now?: number; force?: boolean } = {},
): CacheDecision {
  const now = options.now ?? Date.now();
  const state = freshness(kind, observedAt, now);
  const time = observedAt ? Date.parse(observedAt) : Number.NaN;
  const ageMs = Number.isNaN(time) ? null : Math.max(0, now - time);

  if (options.force === true) {
    return { outcome: "cache_refresh" as unknown as CacheOutcome, state, refresh: true, ageMs };
  }
  if (state === "fresh") return { outcome: "cache_hit", state, refresh: false, ageMs };
  if (state === "stale") return { outcome: "cache_stale", state, refresh: true, ageMs };
  return { outcome: "cache_miss", state, refresh: true, ageMs };
}
