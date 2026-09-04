/**
 * IdentityCorrelationEngine.
 *
 * Collects the identities we already hold, compares attributes, records
 * evidence, computes a heuristic confidence and derives a state. It NEVER
 * invents an identity and NEVER promotes to `verified` from weak evidence.
 */
import {
  EVIDENCE_WEIGHTS,
  type EvidenceAttribute,
  type EvidenceMatchType,
  type IdentityCorrelationEvidence,
  type IdentitySource,
  type IdentityStatus,
} from "./identity.types";
import {
  MATCH_TYPE_FACTOR,
  calculateIdentityConfidence,
  deriveIdentityStatus,
} from "@/lib/profile/verification";
import {
  evidenceValueHash,
  normalizeExternalId,
  normalizeNickname,
  normalizeSteamId64,
} from "./identity.normalize";

/** Observed attributes of one external identity. Absent = unknown, never empty. */
export interface IdentityObservation {
  source: IdentitySource;
  externalId?: string | null;
  username?: string | null;
  steamId64?: string | null;
  avatarFingerprint?: string | null;
  team?: string | null;
  country?: string | null;
  /** True only when the user completed an authenticated flow for this source. */
  authenticatedLink?: boolean;
  provenance?: string;
  observedAt?: string;
}

export interface CorrelationResult {
  status: IdentityStatus;
  confidence: number;
  evidence: IdentityCorrelationEvidence[];
  reasons: string[];
  conflicts: IdentityCorrelationEvidence[];
}

// Weights, thresholds and the state machine live in the verification engine so
// the UI meter and this engine can never disagree.

function makeEvidence(
  a: IdentityObservation,
  b: IdentityObservation,
  attribute: EvidenceAttribute,
  matchType: EvidenceMatchType,
  value: string | null,
  hashed: boolean,
): IdentityCorrelationEvidence {
  const { weight } = EVIDENCE_WEIGHTS[attribute];
  return {
    identityA: { source: a.source, id: normalizeExternalId(a.externalId) },
    identityB: { source: b.source, id: normalizeExternalId(b.externalId) },
    attribute,
    matchType,
    confidenceScore:
      matchType === "conflict" ? 0 : Number((weight * MATCH_TYPE_FACTOR[matchType]).toFixed(4)),
    evidenceValue: value === null ? null : hashed ? evidenceValueHash(value) : value,
    provenance: `${a.provenance ?? a.source}+${b.provenance ?? b.source}`,
    observedAt: b.observedAt ?? a.observedAt ?? new Date().toISOString(),
    expiresAt: null,
  };
}

/** Compares exactly two observations. */
export function correlateIdentities(
  a: IdentityObservation,
  b: IdentityObservation,
): CorrelationResult {
  const evidence: IdentityCorrelationEvidence[] = [];
  const conflicts: IdentityCorrelationEvidence[] = [];
  const reasons: string[] = [];

  if (a.authenticatedLink === true && b.authenticatedLink === true) {
    evidence.push(makeEvidence(a, b, "authenticated_link", "exact", null, false));
    reasons.push("Both accounts were linked through an authenticated flow.");
  }

  const steamA = normalizeSteamId64(a.steamId64);
  const steamB = normalizeSteamId64(b.steamId64);
  if (steamA && steamB) {
    if (steamA === steamB) {
      evidence.push(makeEvidence(a, b, "steam_id64", "exact", steamA, true));
      reasons.push("Both accounts report the same SteamID64.");
    } else {
      const conflict = makeEvidence(a, b, "steam_id64", "conflict", null, false);
      conflicts.push(conflict);
      reasons.push("The accounts report different SteamID64 values.");
    }
  }

  const idA = normalizeExternalId(a.externalId);
  const idB = normalizeExternalId(b.externalId);
  if (idA && idB && a.source === b.source && idA !== idB) {
    conflicts.push(makeEvidence(a, b, "external_account_id", "conflict", null, false));
    reasons.push("Two different account ids were observed for the same source.");
  }

  const nickA = a.username?.trim() ?? null;
  const nickB = b.username?.trim() ?? null;
  if (nickA && nickB) {
    if (nickA === nickB) {
      evidence.push(makeEvidence(a, b, "nickname_exact", "exact", nickA, true));
      reasons.push("The nicknames are identical (weak evidence).");
    } else {
      const normA = normalizeNickname(nickA);
      const normB = normalizeNickname(nickB);
      if (normA && normB && normA === normB) {
        evidence.push(makeEvidence(a, b, "nickname_normalized", "normalized_exact", normA, true));
        reasons.push("The nicknames match after normalization (very weak evidence).");
      }
    }
  }

  if (a.avatarFingerprint && b.avatarFingerprint && a.avatarFingerprint === b.avatarFingerprint) {
    evidence.push(makeEvidence(a, b, "avatar", "visual_match", a.avatarFingerprint, true));
    reasons.push("The avatars look the same (very weak evidence).");
  }

  if (a.team && b.team && normalizeNickname(a.team) === normalizeNickname(b.team)) {
    evidence.push(makeEvidence(a, b, "team", "normalized_exact", a.team, false));
    reasons.push("Both accounts report the same team (auxiliary evidence).");
  }

  if (a.country && b.country && a.country.toLowerCase() === b.country.toLowerCase()) {
    evidence.push(makeEvidence(a, b, "country", "exact", a.country, false));
    reasons.push("Both accounts report the same country (auxiliary evidence).");
  }

  return finalizeCorrelation(evidence, conflicts, reasons);
}

export function finalizeCorrelation(
  evidence: IdentityCorrelationEvidence[],
  conflicts: IdentityCorrelationEvidence[],
  reasons: string[],
): CorrelationResult {
  // Single source of truth: the same pure functions the profile meter uses.
  const confidence = calculateIdentityConfidence(evidence);
  const status = deriveIdentityStatus(evidence, conflicts, confidence);
  return { status, confidence, evidence, reasons, conflicts };
}

/** Compares every pair among the observations we hold for one GamePro user. */
export function correlateIdentityGraph(observations: IdentityObservation[]): CorrelationResult {
  const evidence: IdentityCorrelationEvidence[] = [];
  const conflicts: IdentityCorrelationEvidence[] = [];
  const reasons: string[] = [];

  for (let i = 0; i < observations.length; i += 1) {
    for (let j = i + 1; j < observations.length; j += 1) {
      const pair = correlateIdentities(observations[i]!, observations[j]!);
      evidence.push(...pair.evidence);
      conflicts.push(...pair.conflicts);
      for (const reason of pair.reasons) if (!reasons.includes(reason)) reasons.push(reason);
    }
  }

  return finalizeCorrelation(evidence, conflicts, reasons);
}

/** UI label. Deliberately never says "Verified" without ownership proof. */
export function confidenceLabel(confidence: number): "very_low" | "low" | "medium" | "high" {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.5) return "medium";
  if (confidence >= 0.15) return "low";
  return "very_low";
}
