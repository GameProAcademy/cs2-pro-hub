/**
 * Phase 2.1.2 — Integration Readiness: the shared Data Source model.
 *
 * ARCHITECTURAL RULE (do not break):
 *
 *   SOURCE -> COLLECTOR -> SOURCE ADAPTER -> CANONICAL NORMALIZER
 *          -> CANONICAL MATCH DATA -> METRICS -> FEATURES -> ANALYSIS
 *          -> PLAYER DNA -> SCORE -> TRAINING PLAN -> AI COACH
 *
 * The analysis engine NEVER learns where the data came from. No external
 * integration may write directly into match_metrics, match_features, analyses,
 * analysis_findings, player_dna_snapshots or player_score_snapshots — it must
 * produce canonical data and let the existing pipeline derive everything else.
 *
 * This module defines source identifiers, metadata and shared policies; it does
 * NOT itself call external APIs. Provider implementations live in dedicated
 * modules:
 * - FACEIT: official Data API + OAuth, implemented under src/lib/faceit.
 * - Steam: OpenID identity linking; no CS2 match-data collection.
 * - Gamers Club: no permitted automatic collection path is currently available.
 * Runtime availability is described separately in ./availability.
 */

/** Stable source identifiers. Mirrors the `public.data_source` enum. */
export const DATA_SOURCES = ["demo", "faceit", "gamers_club", "steam", "public_profile"] as const;

export type DataSource = (typeof DATA_SOURCES)[number];

export function isDataSource(value: unknown): value is DataSource {
  return typeof value === "string" && (DATA_SOURCES as readonly string[]).includes(value);
}

/**
 * How trustworthy a source is *as a category*. This is only a starting point:
 * the effective quality of an analysis always comes from the data that was
 * actually collected (see `DataCoverage`), never from the platform name.
 * This rating is independent from implementation status and per-signal
 * capability: an implemented integration may still provide only partial data.
 */
export type SourceQuality = "high" | "medium" | "low" | "variable";

/**
 * Deliberately conservative and honest. Platforms are NOT equivalent:
 * - demo: richest behavioural evidence available to this product.
 * - faceit: official OAuth/Data API integration is implemented; the fields
 *   actually returned still depend on permissions, endpoint availability and
 *   observed coverage. See ./capabilities for per-signal validation.
 * - gamers_club: no public API availability is assumed at all.
 * - steam: useful for account identification and public data, NOT a demo
 *   substitute.
 * - public_profile: only whatever is genuinely published.
 */
export const SOURCE_QUALITY: Record<DataSource, SourceQuality> = {
  demo: "high",
  faceit: "medium",
  gamers_club: "variable",
  steam: "low",
  public_profile: "low",
};

/**
 * Conceptual priority used when two sources describe the same match.
 * Higher wins. No merge algorithm is implemented in this phase.
 */
export const SOURCE_PRIORITY: Record<DataSource, number> = {
  demo: 100,
  faceit: 60,
  gamers_club: 50,
  steam: 30,
  public_profile: 10,
};

export function preferredSource(a: DataSource, b: DataSource): DataSource {
  return SOURCE_PRIORITY[a] >= SOURCE_PRIORITY[b] ? a : b;
}

/**
 * Sources with an implemented adapter.
 * - `demo`: local demo pipeline.
 * - `faceit`: official Data API + OAuth (see `src/lib/faceit`).
 * This registry-level flag describes implementation, not proof that every
 * signal is available or that every account has completed a successful sync.
 * `gamers_club` is NOT here: there is no official API and the public site
 * answers unauthenticated requests with a Cloudflare challenge, which we are
 * not allowed to bypass. Runtime usability lives in `./availability`.
 */
export const IMPLEMENTED_SOURCES: readonly DataSource[] = ["demo", "faceit"];

export function isSourceImplemented(source: DataSource): boolean {
  return IMPLEMENTED_SOURCES.includes(source);
}

/**
 * Identity vs Connection (kept distinct on purpose):
 *
 * - IDENTITY (`player_identities`): "we know this external identity belongs to
 *   this player". `is_verified` is backend/admin controlled and guarded by
 *   `guard_identity_verification()`; a player can never self-verify.
 * - CONNECTION (`player_connections`): "the player authorised CS2 PRO AI COACH
 *   to access this account". Players may only create a `pending` connection and
 *   delete their own; every other state transition is server-side.
 */
export const CONNECTION_TYPES = ["oauth", "openid", "public_profile", "manual"] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const CONNECTION_STATUSES = [
  "pending",
  "connected",
  "disconnected",
  "expired",
  "error",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return typeof value === "string" && (CONNECTION_STATUSES as readonly string[]).includes(value);
}

/** Connectable sources. A demo is an upload, not an account connection. */
export const CONNECTABLE_SOURCES: readonly Exclude<DataSource, "demo">[] = [
  "faceit",
  "gamers_club",
  "steam",
  "public_profile",
];

/**
 * Connection mechanisms represented by each source in the shared model.
 * Actual flows are implemented in their provider modules; a listed mechanism
 * does not by itself guarantee runtime configuration or data availability.
 */
export const SOURCE_CONNECTION_TYPES: Record<Exclude<DataSource, "demo">, ConnectionType[]> = {
  faceit: ["oauth", "public_profile"],
  gamers_club: ["public_profile"],
  // Steam publishes NO OAuth2 server for account linking: OpenID 2.0 is the
  // official, permitted mechanism (see src/lib/steam).
  steam: ["openid", "public_profile"],
  public_profile: ["public_profile", "manual"],
};

/**
 * Audit action names used by integration flows and their server-side audit
 * records. The list is a shared type contract; whether a particular action is
 * emitted is determined by the corresponding provider implementation.
 */
export const INTEGRATION_AUDIT_ACTIONS = [
  "connection_created",
  "connection_removed",
  "identity_verified",
  "identity_unverified",
  "steam_connection_created",
  "steam_connection_removed",
  "sync_started",
  "sync_completed",
  "sync_failed",
] as const;

export type IntegrationAuditAction = (typeof INTEGRATION_AUDIT_ACTIONS)[number];

/**
 * Token policy (documented because it is a security boundary):
 * OAuth credentials and tokens must remain server-side and must never be
 * exposed through a Data-API readable table, loader, server function response,
 * localStorage/sessionStorage, logs or error messages. The FACEIT OAuth flow
 * currently handles its authorization tokens server-side and does not persist
 * them as reusable client credentials. Any future provider that needs token
 * persistence must use an approved server-side secret store.
 */
export const TOKEN_STORAGE_POLICY = "server-side-only-never-exposed" as const;
