/**
 * Per-source OPERATIONAL capabilities.
 *
 * Different question from `capabilities.ts` (which describes match SIGNALS):
 * here we answer "which operations does this source support today?".
 *
 * A source can have a complete architecture and still be uncollectable. That is
 * expressed with `architecture` + `externalAccess`, never by claiming
 * "fully implemented".
 */
import { sourceAvailability, type SourceAvailability } from "./availability";
import type { DataSource } from "./sources";

export const SOURCE_OPERATIONS = [
  "identity",
  "profile",
  "match_history",
  "match_details",
  "player_stats",
  "snapshots",
  "sync",
  "realtime",
  "manual_import",
] as const;

export type SourceOperation = (typeof SOURCE_OPERATIONS)[number];

/**
 * - `supported`: works today.
 * - `architecture_ready`: code path exists, blocked only by external access.
 * - `unsupported`: no path at all.
 */
export type OperationSupport = "supported" | "architecture_ready" | "unsupported";

export type ArchitectureState = "implemented" | "architecture_ready" | "not_implemented";

/** External access, observed rather than assumed. */
export type ExternalAccessStatus =
  | "available"
  | "blocked_external_access"
  | "unavailable"
  | "unknown"
  | "not_applicable";

export interface SourceOperationalProfile {
  source: DataSource;
  architecture: ArchitectureState;
  externalAccess: ExternalAccessStatus;
  operations: Record<SourceOperation, OperationSupport>;
  availability: SourceAvailability;
}

function ops(
  overrides: Partial<Record<SourceOperation, OperationSupport>>,
  fallback: OperationSupport,
): Record<SourceOperation, OperationSupport> {
  const base = {} as Record<SourceOperation, OperationSupport>;
  for (const operation of SOURCE_OPERATIONS) base[operation] = fallback;
  return { ...base, ...overrides };
}

const PROFILES: Record<
  DataSource,
  Pick<SourceOperationalProfile, "architecture" | "externalAccess" | "operations">
> = {
  demo: {
    architecture: "implemented",
    externalAccess: "not_applicable",
    operations: ops(
      { realtime: "unsupported", sync: "unsupported", manual_import: "supported" },
      "supported",
    ),
  },
  faceit: {
    architecture: "implemented",
    externalAccess: "available",
    operations: ops(
      { realtime: "unsupported", manual_import: "unsupported", snapshots: "architecture_ready" },
      "supported",
    ),
  },
  /**
   * Gamers Club: the whole pipeline (validator, provider contract, normalizer,
   * identity graph, cache, snapshots, jobs, UI) exists, but the public site
   * answers server-side requests with a Cloudflare challenge and there is no
   * official API, so nothing is collectable.
   */
  gamers_club: {
    architecture: "architecture_ready",
    externalAccess: "blocked_external_access",
    operations: ops(
      { identity: "supported", realtime: "unsupported" },
      "architecture_ready",
    ),
  },
  steam: {
    architecture: "not_implemented",
    externalAccess: "unknown",
    operations: ops({ identity: "architecture_ready" }, "unsupported"),
  },
  public_profile: {
    architecture: "architecture_ready",
    externalAccess: "unavailable",
    operations: ops({ identity: "supported", manual_import: "architecture_ready" }, "unsupported"),
  },
};

export function sourceOperationalProfile(source: DataSource): SourceOperationalProfile {
  const profile = PROFILES[source];
  return { source, ...profile, availability: sourceAvailability(source) };
}

export function supportsOperation(source: DataSource, operation: SourceOperation): boolean {
  return PROFILES[source].operations[operation] === "supported";
}

/** True when only external access separates us from supporting the operation. */
export function operationBlockedExternally(
  source: DataSource,
  operation: SourceOperation,
): boolean {
  const profile = PROFILES[source];
  return (
    profile.operations[operation] === "architecture_ready" &&
    profile.externalAccess === "blocked_external_access"
  );
}
