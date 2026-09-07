/**
 * FASE 2.6.4 — MATCH IDENTITY RESOLVER.
 *
 * Answers ONE question: "is this observation the same canonical match as one we
 * already have?" It never merges data and never decides which source wins —
 * `SOURCE_PRIORITY` describes preference for READING, not automatic merging.
 *
 * A wrong EXACT_MATCH corrupts history permanently, so the resolver is
 * deliberately conservative: ambiguity yields POSSIBLE_MATCH or CONFLICT and the
 * decision is escalated instead of guessed.
 */
import type { DataSource } from "@/lib/sources/sources";

export type MatchResolution =
  "EXACT_MATCH" | "PROBABLE_MATCH" | "POSSIBLE_MATCH" | "NO_MATCH" | "CONFLICT";

/** Minimal fingerprint of a match, from either side of the comparison. */
export interface MatchIdentityCandidate {
  /** Canonical match id, when the candidate is already persisted. */
  canonicalMatchId?: string | null;
  source: DataSource;
  externalMatchId: string | null;
  /** Deterministic content fingerprint (e.g. demo SHA-256). */
  fingerprint?: string | null;
  map: string | null;
  /** Competitive date (ISO). Never an ingestion timestamp. */
  playedAt: string | null;
  roundCount?: number | null;
  scoreTeamA?: number | null;
  scoreTeamB?: number | null;
  /** SteamID64s of the participants, when known. */
  participantSteamIds?: readonly string[];
}

export interface MatchIdentityDecision {
  resolution: MatchResolution;
  /** [0,1]; only a measured signal, never decoration. */
  confidence: number;
  /** Stable slugs describing WHY, for audit and observability. */
  signals: string[];
  /** True when a human/administrative decision is required. */
  requiresReview: boolean;
}

/** Same map played twice on the same day is normal; same minute is not. */
export const MATCH_TIME_TOLERANCE_MS = 20 * 60 * 1000;

/** Minimum shared participants for a cross-source claim of "same match". */
export const MIN_SHARED_PARTICIPANTS = 6;

function decision(
  resolution: MatchResolution,
  confidence: number,
  signals: string[],
  requiresReview = false,
): MatchIdentityDecision {
  return { resolution, confidence, signals: [...new Set(signals)].sort(), requiresReview };
}

function timeDeltaMs(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.abs(ta - tb);
}

function sharedParticipants(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): number | null {
  if (!a || !b || a.length === 0 || b.length === 0) return null;
  const set = new Set(b);
  return a.filter((id) => set.has(id)).length;
}

function scoresConflict(a: MatchIdentityCandidate, b: MatchIdentityCandidate): boolean {
  if (
    a.scoreTeamA === null ||
    a.scoreTeamA === undefined ||
    a.scoreTeamB === null ||
    a.scoreTeamB === undefined ||
    b.scoreTeamA === null ||
    b.scoreTeamA === undefined ||
    b.scoreTeamB === null ||
    b.scoreTeamB === undefined
  ) {
    return false; // Unknown is NOT a contradiction.
  }
  const direct = a.scoreTeamA === b.scoreTeamA && a.scoreTeamB === b.scoreTeamB;
  const swapped = a.scoreTeamA === b.scoreTeamB && a.scoreTeamB === b.scoreTeamA;
  return !direct && !swapped;
}

/**
 * Resolves `incoming` against an already known `existing` observation.
 *
 * Order of evidence — strongest first:
 *  1. identical content fingerprint (the same demo file) => EXACT_MATCH
 *  2. same source + same external id => EXACT_MATCH (per-source uniqueness)
 *  3. cross-source: map + time window + enough shared participants
 *  4. contradictory facts (different map, contradictory score) => CONFLICT
 */
export function resolveMatchIdentity(
  incoming: MatchIdentityCandidate,
  existing: MatchIdentityCandidate,
): MatchIdentityDecision {
  if (incoming.fingerprint && existing.fingerprint) {
    if (incoming.fingerprint === existing.fingerprint) {
      return decision("EXACT_MATCH", 1, ["fingerprint_equal"]);
    }
    // Different fingerprints only prove the FILES differ, not the matches.
  }

  if (
    incoming.source === existing.source &&
    incoming.externalMatchId &&
    existing.externalMatchId &&
    incoming.externalMatchId === existing.externalMatchId
  ) {
    return decision("EXACT_MATCH", 1, ["same_source_external_id_equal"]);
  }

  if (
    incoming.source === existing.source &&
    incoming.externalMatchId &&
    existing.externalMatchId &&
    incoming.externalMatchId !== existing.externalMatchId
  ) {
    return decision("NO_MATCH", 0, ["same_source_external_id_differs"]);
  }

  const delta = timeDeltaMs(incoming.playedAt, existing.playedAt);
  const shared = sharedParticipants(incoming.participantSteamIds, existing.participantSteamIds);
  const bothMapsKnown = Boolean(incoming.map && existing.map);
  const sameMap = bothMapsKnown && incoming.map === existing.map;

  if (bothMapsKnown && !sameMap) {
    // Different maps in the same time window with the same roster is a real
    // contradiction worth reviewing, not a silent NO_MATCH.
    if (
      delta !== null &&
      delta <= MATCH_TIME_TOLERANCE_MS &&
      (shared ?? 0) >= MIN_SHARED_PARTICIPANTS
    ) {
      return decision("CONFLICT", 0.5, ["map_differs", "roster_overlap", "time_close"], true);
    }
    return decision("NO_MATCH", 0, ["map_differs"]);
  }

  if (scoresConflict(incoming, existing)) {
    return decision("CONFLICT", 0.5, ["score_contradiction"], true);
  }

  if (sameMap && delta !== null && delta <= MATCH_TIME_TOLERANCE_MS) {
    if (shared !== null && shared >= MIN_SHARED_PARTICIPANTS) {
      return decision("PROBABLE_MATCH", 0.85, ["map_equal", "time_close", "roster_overlap"]);
    }
    if (shared !== null && shared > 0) {
      return decision("POSSIBLE_MATCH", 0.5, ["map_equal", "time_close", "roster_partial"], true);
    }
    return decision("POSSIBLE_MATCH", 0.4, ["map_equal", "time_close", "roster_unknown"], true);
  }

  if (!bothMapsKnown && delta !== null && delta <= MATCH_TIME_TOLERANCE_MS) {
    return decision("POSSIBLE_MATCH", 0.3, ["map_unknown", "time_close"], true);
  }

  return decision("NO_MATCH", 0, ["no_shared_evidence"]);
}

/**
 * Resolves against every known candidate and returns the single best decision.
 * A CONFLICT is never hidden by a weaker positive elsewhere in the list.
 */
export function resolveAgainstAll(
  incoming: MatchIdentityCandidate,
  candidates: readonly MatchIdentityCandidate[],
): { decision: MatchIdentityDecision; candidate: MatchIdentityCandidate | null } {
  let best: { decision: MatchIdentityDecision; candidate: MatchIdentityCandidate } | null = null;
  let conflict: { decision: MatchIdentityDecision; candidate: MatchIdentityCandidate } | null =
    null;

  for (const candidate of candidates) {
    const result = resolveMatchIdentity(incoming, candidate);
    if (result.resolution === "CONFLICT") {
      if (!conflict || result.confidence > conflict.decision.confidence) {
        conflict = { decision: result, candidate };
      }
      continue;
    }
    if (result.resolution === "NO_MATCH") continue;
    if (!best || result.confidence > best.decision.confidence)
      best = { decision: result, candidate };
  }

  if (best && best.decision.resolution === "EXACT_MATCH") return best;
  if (conflict) return conflict;
  if (best) return best;
  return { decision: decision("NO_MATCH", 0, ["no_candidate"]), candidate: null };
}

/** Only EXACT_MATCH may attach an observation to an existing canonical match. */
export function canAttachAutomatically(decisionResult: MatchIdentityDecision): boolean {
  return decisionResult.resolution === "EXACT_MATCH" && !decisionResult.requiresReview;
}

/**
 * Cross-source convergence (e.g. a DEMO already stored and the same match seen
 * on FACEIT). No shared identifier exists between such sources, so EXACT_MATCH
 * is impossible by construction: the strongest honest evidence is same map +
 * same time window + at least `MIN_SHARED_PARTICIPANTS` shared SteamID64s.
 *
 * Anything weaker (partial or unknown roster, unknown map) stays unattached and
 * is escalated for review — a wrong attach corrupts history permanently.
 */
export function canConvergeCrossSource(decisionResult: MatchIdentityDecision): boolean {
  if (canAttachAutomatically(decisionResult)) return true;
  return (
    decisionResult.resolution === "PROBABLE_MATCH" &&
    !decisionResult.requiresReview &&
    decisionResult.confidence >= 0.85
  );
}
