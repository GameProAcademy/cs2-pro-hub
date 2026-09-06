/**
 * FASE 2.6 — versioning of the Canonical Match Engine.
 *
 * Three INDEPENDENT axes; conflating them makes history unreadable:
 *
 *  - CANONICAL_SCHEMA_VERSION — the shape of the canonical domain. Bumped only
 *    when the canonical model itself changes.
 *  - ANALYSIS_VERSION (see `@/config/pipeline`) — the analytical logic
 *    (metrics/features). A metric change never bumps the canonical schema.
 *  - SOURCE_CONTRACT_VERSIONS — the contract of each source adapter. A FACEIT
 *    payload change bumps `faceit`, nothing else.
 */

/**
 * Version 2: the canonical match became SOURCE-NEUTRAL — series, source
 * observations, participants, neutral rounds + per-player round state, and a
 * canonical match that no longer belongs to one player or one upload.
 * Version 1 was the demo-only, player-owned model.
 */
export const CANONICAL_SCHEMA_VERSION = 2;

/** Per-source adapter contract versions. */
export const SOURCE_CONTRACT_VERSIONS = {
  demo: "demo-v1",
  faceit: "faceit-v1",
  gamers_club: "gamers_club-v0",
  steam: "steam-v1",
  public_profile: "public_profile-v0",
} as const;

export type SourceContractVersion =
  (typeof SOURCE_CONTRACT_VERSIONS)[keyof typeof SOURCE_CONTRACT_VERSIONS];
