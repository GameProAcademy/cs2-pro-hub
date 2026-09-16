/**
 * Canonical CS2 PRO pipeline schema.
 *
 * The database and the rest of the application depend ONLY on these shapes,
 * never on the internal structure of the parser library. The parser adapter
 * produces `RawParserOutput`; the normalizer converts it into the canonical
 * types below.
 */

export type Side = "CT" | "T";

export type CanonicalEventType =
  | "kill"
  | "death"
  | "assist"
  | "damage"
  | "flash"
  | "smoke"
  | "molotov"
  | "incendiary"
  | "he"
  | "bomb_plant"
  | "bomb_defuse"
  | "bomb_explode"
  | "weapon_fire"
  | "weapon_purchase"
  | "round_start"
  | "round_end";

export type BuyContext = "full_buy" | "force_buy" | "half_buy" | "eco" | "save" | "unknown";

/* ------------------------------------------------------------------ *
 * Raw parser contract (what the external parser worker must return)  *
 * ------------------------------------------------------------------ */

export interface RawParserPosition {
  x?: number | undefined;
  y?: number | undefined;
  z?: number | undefined;
}

export interface RawParserPlayer {
  steam_id: string;
  name?: string | undefined;
  team?: string | undefined;
  side?: string | undefined;
}

export interface RawParserRound {
  number: number;
  winner_team?: string | undefined;
  winner_side?: string | undefined;
  start_tick?: number | undefined;
  end_tick?: number | undefined;
  duration_seconds?: number | undefined;
  bomb_planted?: boolean | undefined;
  bomb_defused?: boolean | undefined;
  bomb_exploded?: boolean | undefined;
  /** steam_id -> value */
  money_start?: Record<string, number> | undefined;
  money_end?: Record<string, number> | undefined;
  equipment_value?: Record<string, number> | undefined;
  sides?: Record<string, string> | undefined;
}

export interface RawParserEvent {
  type: string;
  round: number;
  tick?: number | undefined;
  time_seconds?: number | undefined;
  attacker?: string | undefined;
  victim?: string | undefined;
  assister?: string | undefined;
  weapon?: string | undefined;
  headshot?: boolean | undefined;
  wallbang?: boolean | undefined;
  penetration?: number | undefined;
  noscope?: boolean | undefined;
  blind?: boolean | undefined;
  distance?: number | undefined;
  damage?: number | undefined;
  armor_damage?: number | undefined;
  flash_duration?: number | undefined;
  players_flashed?: number | undefined;
  grenade_type?: string | undefined;
  cost?: number | undefined;
  position?: RawParserPosition | undefined;
  victim_position?: RawParserPosition | undefined;
}

export interface RawParserOutput {
  parser: { name: string; version: string; revision?: string | undefined };
  contract_version: number;
  header: {
    map?: string | undefined;
    game_version?: string | undefined;
    tickrate?: number | undefined;
    duration_seconds?: number | undefined;
    match_date?: string | undefined;
    score?: { team_a?: number | undefined; team_b?: number | undefined } | undefined;
    teams?: { team_a?: string | undefined; team_b?: string | undefined } | undefined;
  };
  players: RawParserPlayer[];
  rounds: RawParserRound[];
  events: RawParserEvent[];
  warnings?: string[] | undefined;
  /** Parser-native evidence, validated and persisted before normalization. */
  raw_evidence?: import("@/lib/pipeline/rawEvidence").RawDemoEvidence | undefined;
}

export const HOT_DEMO_PAYLOAD_VERSION = 1;
export const DURABLE_HOT_TARGET_BYTES = 4 * 1024 * 1024;
export const DURABLE_HOT_HARD_MAX_BYTES = 8 * 1024 * 1024;
export const RAW_CHUNK_TARGET_BYTES = 4 * 1024 * 1024;
export const RAW_CHUNK_HARD_MAX_BYTES = 8 * 1024 * 1024;
export const HOT_DEMO_LIMITS = {
  players: 64,
  rounds: 256,
  combatEvents: 50_000,
  utilityEvents: 20_000,
  objectiveEvents: 4_096,
  aimObservations: 4_096,
  positionSnapshots: 4_096,
  economySnapshots: 4_096,
  warnings: 128,
} as const;

export interface HotSectionQuality {
  status: "complete" | "limited" | "not_implemented";
  observed_rows: number;
  included_rows: number;
  limit: number;
  overflow_rows: number;
}

export interface HotDemoPayloadV1 {
  schema_version: 1;
  parser: RawParserOutput["parser"];
  contract_version: number;
  demo: { sha256: string; upload_id: string };
  header: RawParserOutput["header"];
  players: RawParserPlayer[];
  rounds: RawParserRound[];
  combat_events: RawParserEvent[];
  utility_events: RawParserEvent[];
  objective_events: RawParserEvent[];
  aim_observations: RawParserEvent[];
  position_snapshots: RawParserEvent[];
  economy_snapshots: RawParserEvent[];
  quality: {
    partial: boolean;
    limited_sections: string[];
    sections: Record<string, HotSectionQuality>;
    unclassified_event_rows: number;
  };
  provenance: { source: "demo"; raw_artifact_required: true };
  warnings: string[];
}

export interface RawArtifactReferenceV1 {
  schema_version: 1;
  artifact_id: string;
  bucket: "cs2-raw-evidence";
  manifest_storage_path: string;
  root_digest: string;
  status: "ready";
  raw_status: "ready";
  audit_status: "approved" | "limited" | "blocked";
  job_id: string;
  upload_id: string;
  user_id: string;
  attempt_number: number;
  demo_sha256: string;
  parser: RawParserOutput["parser"];
  contract_version: number;
  total_chunks: number;
  total_rows: number;
  total_bytes: number;
}

export interface DurableDemoCompletionV1 {
  hot: HotDemoPayloadV1;
  raw: RawArtifactReferenceV1;
}

/* ------------------------------------------------------------------ *
 * Canonical schema                                                    *
 * ------------------------------------------------------------------ */

export interface CanonicalPlayer {
  steamId: string;
  name: string | null;
  team: string | null;
  side: Side | null;
}

export interface CanonicalRound {
  roundNumber: number;
  winnerTeam: string | null;
  winnerSide: Side | null;
  startTick: number | null;
  endTick: number | null;
  durationSeconds: number | null;
  /**
   * FASE 2.7 — NULL ≠ FALSE. `null` means the parser did not report the fact;
   * `false` means it reported that it did NOT happen. The absence of evidence is
   * never turned into negative evidence.
   */
  bombPlanted: boolean | null;
  bombDefused: boolean | null;
  bombExploded: boolean | null;
  moneyStart: Record<string, number>;
  moneyEnd: Record<string, number>;
  equipmentValue: Record<string, number>;
  sides: Record<string, Side>;
}

export interface CanonicalEvent {
  roundNumber: number;
  type: CanonicalEventType;
  tick: number | null;
  timeSeconds: number | null;
  actorSteamId: string | null;
  victimSteamId: string | null;
  assisterSteamId: string | null;
  weapon: string | null;
  headshot: boolean | null;
  distance: number | null;
  damage: number | null;
  data: Record<string, unknown>;
}

/** Quality of the extraction. Never claim a partial parse is complete. */
export interface ExtractionQuality {
  extractionConfidence: number;
  partialParse: boolean;
  roundsDetected: number;
  roundsValid: number;
  playersDetected: number;
  eventsDetected: number;
  flags: QualityFlag[];
}

export type QualityFlag =
  | "missing_players"
  | "missing_rounds"
  | "missing_positions"
  | "missing_economy"
  | "missing_utility"
  | "partial_parse"
  | "unsupported_event"
  | "low_sample";

export interface CanonicalMatch {
  map: string | null;
  matchDate: string | null;
  gameVersion: string | null;
  durationSeconds: number | null;
  tickrate: number | null;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  players: CanonicalPlayer[];
  rounds: CanonicalRound[];
  events: CanonicalEvent[];
  quality: ExtractionQuality;
  parser: { name: string; version: string; revision: string | null };
  schemaVersion: number;
}

/* ------------------------------------------------------------------ *
 * Derived metrics + features                                          *
 * ------------------------------------------------------------------ */

/**
 * FASE 2.7 — classes of evidence the observation actually carries. Metrics that
 * depend on a missing class are emitted as NULL, never as 0.
 */
export interface MetricsAvailability {
  killEvents: boolean;
  damageEvents: boolean;
  utilityEvents: boolean;
  roundEndEvidence: boolean;
  economy: boolean;
  /** Every kill event has a trustworthy instant (time_seconds or tick+tickrate). */
  timing: boolean;
  /**
   * The extraction covers the whole match. FALSE on a partial parse, which makes
   * whole-match rates (rating, KAST) unknown instead of understated.
   */
  completeCoverage: boolean;
}

export interface CanonicalMetrics {
  steamId: string;
  /** Which evidence classes backed this computation. */
  availability: MetricsAvailability;
  roundsPlayed: number;
  /**
   * FASE 2.7.1F — denominator for survival-style rates. It is NOT `roundsPlayed`.
   *
   * It counts the rounds where (1) the player provably participated, (2) the
   * round carries round-end evidence and (3) `playerSurvivedRound()` reaches a
   * DECISION: `true` = survival proven, `false` = death proven. A round whose
   * result is `null` (not determinable) is excluded from the denominator — the
   * absence of a death event is never read as a survival. A round having ENDED
   * does not by itself make that player's survival determinable.
   *
   * NULL (never 0) when the extraction does not cover the whole match or no
   * participated round is determinable: NULL = unknown, 0 = observed zero.
   */
  survivalRounds: number | null;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  hsPercent: number | null;
  damageGiven: number | null;
  damageTaken: number | null;
  adr: number | null;
  kast: number | null;
  /**
   * NULL when no round has a determinable opening duel (missing kill evidence,
   * or unknown/ambiguous instants). Zero would claim "no opening duel happened".
   */
  firstKills: number | null;
  firstDeaths: number | null;
  openingAttempts: number | null;
  openingSuccess: number | null;
  openingSuccessRate: number | null;

  /** NULL when timing is unknown: trades cannot be observed without instants. */
  tradeKills: number | null;
  tradeDeaths: number | null;
  untradedDeaths: number | null;
  earlyDeaths: number | null;
  /** NULL when kill events are missing: alive/dead state is unknowable. */
  clutchAttempts: number | null;
  clutchWins: number | null;
  multiKills: number;
  multiKillBreakdown: { k2: number; k3: number; k4: number; ace: number };
  utilityDamage: number | null;
  grenadeDamage: number | null;
  flashAssists: number | null;
  enemiesFlashed: number | null;
  grenadesUsed: number | null;
  ctRating: number | null;
  tRating: number | null;
  /** Rating derived from this pipeline. NOT the CS2 PRO Score. */
  sourceRating: number | null;
  damageEfficiency: number | null;
}

/** Feature signals consumed by the future analysis engine, per DNA dimension. */
export interface CanonicalFeatures {
  steamId: string;
  sampleRounds: number;
  /** NULL when no round had a determinable opening duel. */
  sampleOpeningDuels: number | null;

  /** NULL when clutches were not observable (no kill events). */
  sampleClutches: number | null;

  /** dimension -> feature name -> value */
  dimensions: Record<string, Record<string, number | null>>;
}
