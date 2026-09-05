/**
 * FASE 2.3 — Source availability states.
 *
 * `implemented` (does an adapter exist?) is NOT the same question as "can we
 * collect from this source right now?". This module answers the second one and
 * is the single place allowed to declare a source usable.
 *
 * Every state below reflects something OBSERVED, never something assumed.
 */
import type { DataSource } from "./sources";

export const SOURCE_AVAILABILITY_STATES = [
  /** Adapter implemented and collection proven to work. */
  "implemented",
  /** Collection possible, awaiting a validated adapter. */
  "available",
  /** Reachable but unreliable/incomplete right now. */
  "degraded",
  /** Reachable in principle, currently not collectable. */
  "unavailable",
  /** Credentials/config missing on our side. */
  "configuration_missing",
  /** No permitted collection method exists. */
  "unsupported",
] as const;

export type SourceAvailabilityState = (typeof SOURCE_AVAILABILITY_STATES)[number];

/** Machine-readable, non-PII reason. The UI localises it. */
export type SourceAvailabilityReason =
  | "adapter_implemented"
  | "not_implemented"
  | "credentials_missing"
  | "no_official_api"
  | "anti_bot_challenge"
  | "identity_only"
  | "validation_only";

export interface SourceAvailability {
  source: DataSource;
  state: SourceAvailabilityState;
  reason: SourceAvailabilityReason;
  /** Can the app collect data from this source without human intervention? */
  collectable: boolean;
}

/**
 * OBSERVED FACTS (2026-09, verified from the server runtime):
 * - `demo`: local pipeline, fully implemented.
 * - `faceit`: official Data API + OAuth implemented and hardened.
 * - `gamers_club`: no official public API. Every request to the public site —
 *   including the homepage — answers HTTP 403 with a Cloudflare interstitial
 *   challenge (`cf-mitigated: challenge`). Bypassing it is forbidden, so there
 *   is NO permitted collection path: `unavailable`, not `available`.
 * - `steam`: OpenID 2.0 identity linking implemented; no match-data collection.
 * - `public_profile`: no adapter; URL validation only.
 */
const AVAILABILITY: Record<DataSource, Omit<SourceAvailability, "source" | "collectable">> = {
  demo: { state: "implemented", reason: "adapter_implemented" },
  faceit: { state: "implemented", reason: "adapter_implemented" },
  gamers_club: { state: "unavailable", reason: "anti_bot_challenge" },
  // Steam: account LINKING is implemented (OpenID 2.0, see src/lib/steam) and
  // proves identity ownership. That is not the same as collecting match data —
  // Steam publishes no CS2 match history, so nothing is collectable here.
  steam: { state: "unavailable", reason: "identity_only" },
  public_profile: { state: "unavailable", reason: "validation_only" },
};

const COLLECTABLE: ReadonlySet<SourceAvailabilityState> = new Set<SourceAvailabilityState>([
  "implemented",
  "available",
  "degraded",
]);

export function sourceAvailability(source: DataSource): SourceAvailability {
  const entry = AVAILABILITY[source];
  return { source, ...entry, collectable: COLLECTABLE.has(entry.state) };
}

export function isSourceCollectable(source: DataSource): boolean {
  return sourceAvailability(source).collectable;
}
