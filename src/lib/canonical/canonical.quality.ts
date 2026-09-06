/**
 * FASE 2.6 — quality + coverage helpers for the Canonical Match Engine.
 *
 * Quality is never a magic number. It is a status plus explicit reasons, so a
 * future analytical layer can decide "this sample is not good enough" and SAY
 * WHY. Absence of information degrades quality; it never becomes a zero.
 */
import type {
  CanonicalCoverage,
  CanonicalEvent,
  CanonicalMatch,
  CanonicalQuality,
  CanonicalRound,
  CanonicalRoundPlayer,
  CanonicalParticipant,
  QualityStatus,
} from "./canonical.types";

export function quality(
  status: QualityStatus,
  reasons: string[] = [],
  confidence: number | null = null,
): CanonicalQuality {
  return { status, reasons: [...new Set(reasons)].sort(), confidence };
}

export const UNKNOWN_QUALITY: CanonicalQuality = quality("unknown", ["not_reported"]);

/** Worst of two statuses. Used when a layer inherits its parent's limits. */
const ORDER: Record<QualityStatus, number> = { complete: 3, partial: 2, degraded: 1, unknown: 0 };

export function worstQuality(a: CanonicalQuality, b: CanonicalQuality): CanonicalQuality {
  const status = ORDER[a.status] <= ORDER[b.status] ? a.status : b.status;
  const confidence =
    a.confidence === null || b.confidence === null
      ? (a.confidence ?? b.confidence ?? null)
      : Math.min(a.confidence, b.confidence);
  return quality(status, [...a.reasons, ...b.reasons], confidence);
}

export function emptyCoverage(): CanonicalCoverage {
  return {
    roundsExpected: null,
    roundsObserved: null,
    participantsExpected: null,
    participantsObserved: null,
    participantsResolved: null,
    eventsObserved: null,
    hasRoundData: false,
    hasEventData: false,
    hasPlayerRoundState: false,
  };
}

export interface CoverageInput {
  roundCount: number | null;
  participants: CanonicalParticipant[];
  rounds: CanonicalRound[];
  roundPlayers: CanonicalRoundPlayer[];
  events: CanonicalEvent[];
  participantsExpected?: number | null;
}

/** Measures what was ACTUALLY observed. Nothing here is inferred. */
export function computeCoverage(input: CoverageInput): CanonicalCoverage {
  return {
    roundsExpected: input.roundCount,
    roundsObserved: input.rounds.length > 0 ? input.rounds.length : null,
    participantsExpected: input.participantsExpected ?? null,
    participantsObserved: input.participants.length > 0 ? input.participants.length : null,
    participantsResolved:
      input.participants.length > 0
        ? input.participants.filter((p) => p.internalPlayerId !== null).length
        : null,
    eventsObserved: input.events.length > 0 ? input.events.length : null,
    hasRoundData: input.rounds.length > 0,
    hasEventData: input.events.length > 0,
    hasPlayerRoundState: input.roundPlayers.length > 0,
  };
}

/**
 * Derives match quality from coverage. "The match exists" is never promoted to
 * "the match is fully analysable".
 */
export function qualityFromCoverage(coverage: CanonicalCoverage): CanonicalQuality {
  const reasons: string[] = [];
  if (!coverage.hasRoundData) reasons.push("missing_rounds");
  if (!coverage.hasEventData) reasons.push("missing_events");
  if (!coverage.hasPlayerRoundState) reasons.push("missing_player_round_state");
  if (coverage.participantsObserved === null) reasons.push("missing_participants");
  if (
    coverage.roundsExpected !== null &&
    coverage.roundsObserved !== null &&
    coverage.roundsObserved < coverage.roundsExpected
  ) {
    reasons.push("incomplete_rounds");
  }

  if (reasons.length === 0) return quality("complete", [], 1);
  if (coverage.hasRoundData) return quality("partial", reasons);
  if (coverage.participantsObserved !== null) return quality("degraded", reasons);
  return quality("unknown", reasons);
}

/** Is this match good enough to derive per-round analytics from? */
export function hasAnalyticalCoverage(match: CanonicalMatch): boolean {
  return (
    match.finished &&
    match.coverage.hasRoundData &&
    match.coverage.hasPlayerRoundState &&
    match.quality.status !== "unknown"
  );
}
