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
}

export interface CanonicalMetrics {
  steamId: string;
  /** Which evidence classes backed this computation. */
  availability: MetricsAvailability;
  roundsPlayed: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  hsPercent: number | null;
  damageGiven: number | null;
  damageTaken: number | null;
  adr: number | null;
  kast: number | null;
  firstKills: number;
  firstDeaths: number;
  openingAttempts: number;
  openingSuccess: number;
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
  sampleOpeningDuels: number;
  sampleClutches: number;
  /** dimension -> feature name -> value */
  dimensions: Record<string, Record<string, number | null>>;
}
