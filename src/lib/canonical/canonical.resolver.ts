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
  /**
   * Competitive date (ISO). Never an ingestion timestamp.
   *
   * FASE 2.6.11.4 — this field may carry different SEMANTICS per source (a demo
   * exposes the start, FACEIT's `match_date` falls back to `finished_at`), so it
   * is NOT used directly for identity time comparison. See
   * `canonicalStartTimestamp`.
   */
  playedAt: string | null;
  /** Match START (ISO), when the source proves it. Identity reference. */
  startedAt?: string | null;
  /** Match END (ISO). Lifecycle/duration only — never an identity reference. */
  finishedAt?: string | null;
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

/**
 * FASE 2.6.11.3 — the ONLY legitimate cross-source EXACT evidence.
 *
 * A demo carries a content fingerprint, FACEIT carries none, and the external
 * ids of two different sources are unrelated — so a cross-source EXACT can only
 * come from the identities themselves. A FULL, IDENTICAL roster of ten
 * graph-proven SteamID64 accounts, on the same map, inside the competitive time
 * window, with no contradicting score, identifies one single match: the same ten
 * accounts cannot be in two different matches of the same map at the same time.
 *
 * Anything weaker (partial roster, nicknames, score similarity, close
 * timestamps) stays PROBABLE/POSSIBLE and is never auto-attached.
 */
export const FULL_ROSTER_IDENTITY_SIZE = 10;

function rosterIdentical(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  if (!a || !b) return false;
  const left = new Set(a);
  const right = new Set(b);
  if (left.size < FULL_ROSTER_IDENTITY_SIZE || left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

function decision(
  resolution: MatchResolution,
  confidence: number,
  signals: string[],
  requiresReview = false,
): MatchIdentityDecision {
  return { resolution, confidence, signals: [...new Set(signals)].sort(), requiresReview };
}

/**
 * FASE 2.6.11.4 — TEMPORAL SEMANTICS.
 *
 * Cross-source identity may ONLY compare comparable instants. A demo exposes the
 * match START; FACEIT's `match_date` is `finished_at ?? started_at`, so it may
 * carry the END. Comparing a demo start against a FACEIT end manufactures a fake
 * ~40 minute divergence and destroys legitimate convergence.
 *
 * Rule: the identity reference is `startedAt` when the source proves it. When it
 * does not, `playedAt` is accepted ONLY if it is not demonstrably the end
 * instant (i.e. it does not equal `finishedAt`). Otherwise there is NO trusted
 * start, and the resolver treats the timestamp as unknown instead of pretending
 * precision it does not have. `finishedAt` remains available for duration and
 * lifecycle, never as a silent substitute for the start.
 */
export function canonicalStartTimestamp(candidate: MatchIdentityCandidate): string | null {
  if (candidate.startedAt) return candidate.startedAt;
  if (candidate.finishedAt && candidate.playedAt === candidate.finishedAt) return null;
  return candidate.playedAt ?? null;
}

/** Match END instant, for duration/lifecycle only. */
export function canonicalEndTimestamp(candidate: MatchIdentityCandidate): string | null {
  return candidate.finishedAt ?? null;
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

  // Cross-source EXACT: full identical roster of proven accounts, same map,
  // same competitive window, no contradicting score.
  if (
    incoming.source !== existing.source &&
    sameMap &&
    delta !== null &&
    delta <= MATCH_TIME_TOLERANCE_MS &&
    rosterIdentical(incoming.participantSteamIds, existing.participantSteamIds)
  ) {
    return decision("EXACT_MATCH", 1, ["cross_source_roster_identical", "map_equal", "time_close"]);
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
 * on FACEIT).
 *
 * FASE 2.6.11.1 — ONLY an unambiguous EXACT_MATCH may attach an observation to
 * an existing canonical match. Confidence is a measurement, never an
 * authorisation: PROBABLE_MATCH (same map, close time, overlapping roster) is
 * deliberately NOT enough, because the cost of a wrong fusion is permanent
 * corruption of history, while the cost of keeping two observations apart is
 * merely duplicated storage.
 */
export function canConvergeCrossSource(decisionResult: MatchIdentityDecision): boolean {
  return canAttachAutomatically(decisionResult);
}
