/**
 * FASE 2.6 — the SOURCE-NEUTRAL canonical domain.
 *
 * Two rules govern everything in this file:
 *
 *   SOURCE ≠ CANONICAL MATCH — a source provides an OBSERVATION; the canonical
 *   match is the product's own model of what happened. FACEIT and a demo can
 *   observe the SAME canonical match.
 *
 *   MATCH ≠ PLAYER — a canonical match is one PLAYABLE MAP with participants.
 *   It never carries `player_id`, `upload_id`, "my team" or "my score". The
 *   player's viewpoint lives in `PlayerMatchProjection`.
 *
 * And one data rule, enforced everywhere: NULL ≠ ZERO. A field the source did
 * not provide stays `null`. A zero the source actually reported stays `0`.
 */
import type { DataSource } from "@/lib/sources/sources";

import type { SourceContractVersion } from "./canonical.versions";

export type CanonicalGame = "cs2";

export type CanonicalSide = "CT" | "T";

/** Neutral team slots. Never "player team" / "opponent team". */
export type CanonicalTeamSlot = "team_a" | "team_b";

/** Lifecycle of a canonical entity, independent of analytics completeness. */
export type CanonicalStatus =
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "unknown";

/* ------------------------------------------------------------------ *
 * Quality                                                             *
 * ------------------------------------------------------------------ */

export type QualityStatus = "complete" | "partial" | "degraded" | "unknown";

/**
 * Quality exists PER LAYER (match, participant identity, rounds, events).
 * It is never a magic number: `status` plus explicit reasons, and an optional
 * confidence in [0,1] only when it is genuinely measured.
 */
export interface CanonicalQuality {
  status: QualityStatus;
  /** Stable reason slugs, e.g. `missing_rounds`, `truncated`, `no_event_data`. */
  reasons: string[];
  confidence: number | null;
}

/** Coverage: "the match exists" is NOT "the match is fully analysable". */
export interface CanonicalCoverage {
  roundsExpected: number | null;
  roundsObserved: number | null;
  participantsExpected: number | null;
  participantsObserved: number | null;
  participantsResolved: number | null;
  eventsObserved: number | null;
  hasRoundData: boolean;
  hasEventData: boolean;
  hasPlayerRoundState: boolean;
}

/* ------------------------------------------------------------------ *
 * Provenance / source observation                                     *
 * ------------------------------------------------------------------ */

/** Status of the OBSERVATION, not of the canonical match. */
export type ObservationStatus = "complete" | "incomplete" | "stale" | "conflicting" | "unknown";

/**
 * One source's observation of one canonical match. Persisted separately from the
 * canonical match so provenance can never be overwritten silently.
 *
 * Idempotency key: `(source, externalMatchId)` when the external id exists;
 * a demo observation is keyed by its cryptographic `fingerprint` (SHA-256).
 */
export interface CanonicalMatchSource {
  source: DataSource;
  sourceContractVersion: SourceContractVersion;
  /** Identifier of the record INSIDE the source. `null` for a pure demo. */
  externalMatchId: string | null;
  /** Parent record in the source (e.g. FACEIT series/match containing maps). */
  externalParentId: string | null;
  /** Version reported by the source/parser (API version, parser version...). */
  sourceVersion: string | null;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  status: ObservationStatus;
  quality: CanonicalQuality;
  /** SHA-256 or another deterministic fingerprint, when the source has one. */
  fingerprint: string | null;
  metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Series / match                                                      *
 * ------------------------------------------------------------------ */

/**
 * Optional parent of a BO2/BO3. A BO1 needs no series. `bestOf` is NEVER
 * invented: `null` when the source does not state it.
 */
export interface CanonicalSeries {
  game: CanonicalGame;
  bestOf: number | null;
  status: CanonicalStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  teamA: string | null;
  teamB: string | null;
  /** Maps won per side — the SERIES score. Never round score. */
  mapsWonTeamA: number | null;
  mapsWonTeamB: number | null;
  winnerTeam: CanonicalTeamSlot | null;
  schemaVersion: number;
  quality: CanonicalQuality;
  metadata: Record<string, unknown>;
}

/**
 * ONE playable map. A BO3 produces up to three of these, each with its own
 * ROUND score (13-8), never the series score (2-1).
 */
export interface CanonicalMatch {
  game: CanonicalGame;
  /** Canonical, stable map code (see `@/lib/cs2/maps`). Not a display name. */
  map: string | null;
  /** Position inside the series (1-based) when known. */
  mapNumber: number | null;
  /** The COMPETITIVE date. Never an ingestion timestamp. */
  playedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  status: CanonicalStatus;
  /** Proven to have ended normally. Never inferred from a date. */
  finished: boolean;
  /** Lifecycle over (finished OR cancelled/aborted). */
  terminal: boolean;
  teamA: string | null;
  teamB: string | null;
  /** ROUND score of this map. `null` when the source did not report it. */
  scoreTeamA: number | null;
  scoreTeamB: number | null;
  winnerTeam: CanonicalTeamSlot | null;
  /** Rounds actually played. Never the number of maps won. */
  roundCount: number | null;
  quality: CanonicalQuality;
  coverage: CanonicalCoverage;
  schemaVersion: number;
}

/* ------------------------------------------------------------------ *
 * Participants                                                        *
 * ------------------------------------------------------------------ */

export type IdentityStatus =
  | "unlinked"
  | "correlated"
  | "strongly_correlated"
  | "verified"
  | "conflict";

/**
 * A participant of a canonical match. It may exist WITHOUT an internal player:
 * a match can be collected before identity resolution completes, and the
 * identity can be attached later.
 */
export interface CanonicalParticipant {
  /** Deterministic key inside the match (steamId64 or source player id). */
  participantKey: string;
  internalPlayerId: string | null;
  source: DataSource;
  externalPlayerId: string | null;
  steamId64: string | null;
  nicknameSnapshot: string | null;
  team: CanonicalTeamSlot | null;
  /** Whether this participant is the player the collection was run for. */
  isTargetPlayer: boolean;
  identityStatus: IdentityStatus;
  identityConfidence: number | null;
  metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Rounds                                                              *
 * ------------------------------------------------------------------ */

export type RoundWinReason =
  | "elimination"
  | "bomb_exploded"
  | "bomb_defused"
  | "time_expired"
  | "surrender"
  | "unknown";

/** NEUTRAL facts of a round. No player-specific field belongs here. */
export interface CanonicalRound {
  roundNumber: number;
  startTick: number | null;
  endTick: number | null;
  startTimeSeconds: number | null;
  endTimeSeconds: number | null;
  durationSeconds: number | null;
  winningTeam: CanonicalTeamSlot | null;
  winningSide: CanonicalSide | null;
  winReason: RoundWinReason | null;
  bombPlanted: boolean | null;
  bombDefused: boolean | null;
  bombExploded: boolean | null;
  quality: CanonicalQuality;
  metadata: Record<string, unknown>;
}

export type BuyContext = "full_buy" | "force_buy" | "half_buy" | "eco" | "save" | "unknown";

/**
 * The state of ONE participant in ONE round. Every metric is nullable: a source
 * that does not report deaths does NOT report zero deaths, and an unknown
 * survival is `null`, never `false`.
 */
export interface CanonicalRoundPlayer {
  roundNumber: number;
  participantKey: string;
  side: CanonicalSide | null;
  survived: boolean | null;
  moneyStart: number | null;
  moneyEnd: number | null;
  equipmentValue: number | null;
  buyContext: BuyContext | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  damage: number | null;
  flashAssists: number | null;
  openingKill: boolean | null;
  openingDeath: boolean | null;
  traded: boolean | null;
  tradeKill: boolean | null;
  metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Events                                                              *
 * ------------------------------------------------------------------ */

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

/**
 * A round event. Participants are resolved internally WHEN POSSIBLE, but the
 * original source identifiers are always preserved as evidence: an unresolved
 * actor is allowed, losing the source id is not.
 */
export interface CanonicalEvent {
  roundNumber: number;
  type: CanonicalEventType;
  tick: number | null;
  gameTimeSeconds: number | null;
  actorParticipantKey: string | null;
  victimParticipantKey: string | null;
  assisterParticipantKey: string | null;
  sourceActorExternalId: string | null;
  sourceVictimExternalId: string | null;
  sourceAssisterExternalId: string | null;
  weapon: string | null;
  headshot: boolean | null;
  distance: number | null;
  damage: number | null;
  quality: CanonicalQuality;
  data: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Aggregate produced by every adapter                                 *
 * ------------------------------------------------------------------ */

/**
 * What ONE source observation yields. This is the ONLY shape the persistence
 * layer, the metrics engine and every future analytical layer consume — none of
 * them can tell which source produced it.
 */
export interface CanonicalMatchBundle {
  observation: CanonicalMatchSource;
  series: CanonicalSeries | null;
  match: CanonicalMatch;
  participants: CanonicalParticipant[];
  rounds: CanonicalRound[];
  roundPlayers: CanonicalRoundPlayer[];
  events: CanonicalEvent[];
}

/* ------------------------------------------------------------------ *
 * Player-match projection                                             *
 * ------------------------------------------------------------------ */

export type PlayerMatchResult = "win" | "loss" | "draw";

/**
 * "How did THIS player take part in THIS match" — derived, never stored inside
 * the canonical match. Two players of the same match produce two projections
 * and never two matches.
 */
export interface PlayerMatchProjection {
  participantKey: string;
  internalPlayerId: string | null;
  team: CanonicalTeamSlot | null;
  opponentTeam: CanonicalTeamSlot | null;
  teamName: string | null;
  opponentTeamName: string | null;
  scorePlayer: number | null;
  scoreOpponent: number | null;
  result: PlayerMatchResult | null;
  /** Sides the player actually held, from round state. Empty when unknown. */
  sides: CanonicalSide[];
  roundsPlayed: number | null;
}
