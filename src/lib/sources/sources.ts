/**
 * Phase 2.1.2 — Integration Readiness: the Data Source model.
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
 * NOTHING here calls an external API. No FACEIT / Gamers Club / Steam client,
 * no OAuth, no scraping, no token storage exists in this phase.
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
 */
export type SourceQuality = "high" | "medium" | "low" | "variable";

/**
 * Deliberately conservative and honest. Platforms are NOT equivalent:
 * - demo: richest behavioural evidence available to this product.
 * - faceit: may expose matches/stats through authorised APIs, subject to
 *   permissions and availability — unverified until an adapter is validated.
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

/** Sources that are actually implemented today. Only demos are real. */
export const IMPLEMENTED_SOURCES: readonly DataSource[] = ["demo"];

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
export const CONNECTION_TYPES = ["oauth", "public_profile", "manual"] as const;
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

/** Connectable sources. A demo is an upload, not a connection. */
export const CONNECTABLE_SOURCES: readonly Exclude<DataSource, "demo">[] = [
  "faceit",
  "gamers_club",
  "steam",
  "public_profile",
];

/** Connection types each source will eventually support. */
export const SOURCE_CONNECTION_TYPES: Record<Exclude<DataSource, "demo">, ConnectionType[]> = {
  faceit: ["oauth", "public_profile"],
  gamers_club: ["public_profile"],
  steam: ["oauth", "public_profile"],
  public_profile: ["public_profile", "manual"],
};

/**
 * Audit actions future integration flows must record in `admin_audit_logs`.
 * Typed now so the names never drift; no event is emitted in this phase
 * because no integration exists.
 */
export const INTEGRATION_AUDIT_ACTIONS = [
  "connection_created",
  "connection_removed",
  "identity_verified",
  "identity_unverified",
  "sync_started",
  "sync_completed",
  "sync_failed",
] as const;

export type IntegrationAuditAction = (typeof INTEGRATION_AUDIT_ACTIONS)[number];

/**
 * Token policy (documented because it is a security boundary, not a TODO):
 * if OAuth tokens ever become necessary they MUST stay server-side, in a secret
 * store, never in a Data-API readable table, never returned by a loader or
 * server function, never written to localStorage/sessionStorage, never logged
 * and never included in error messages.
 */
export const TOKEN_STORAGE_POLICY = "server-side-only-never-exposed" as const;
