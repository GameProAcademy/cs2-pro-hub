/**
 * PROFILE VERIFICATION ENGINE — pure functions, no hardcoded percentages.
 *
 * Two independent axes:
 *  1. PROFILE COMPLETENESS — data the player themself declared.
 *  2. IDENTITY CONFIDENCE  — evidence-backed correlation of external accounts.
 *
 * The "verified" badge requires REAL ownership proof (an authenticated link).
 * A complete profile alone never verifies anybody.
 */
import {
  EVIDENCE_WEIGHTS,
  OWNERSHIP_PROOF_ATTRIBUTES,
  type EvidenceAttribute,
  type EvidenceMatchType,
  type IdentityStatus,
} from "@/lib/identity/identity.types";

export const MATCH_TYPE_FACTOR: Record<EvidenceMatchType, number> = {
  exact: 1,
  normalized_exact: 0.8,
  partial: 0.5,
  visual_match: 0.4,
  conflict: 1,
};

export const CORRELATED_THRESHOLD = 0.15;
export const STRONGLY_CORRELATED_THRESHOLD = 0.85;

export interface ScorableEvidence {
  attribute: EvidenceAttribute;
  matchType: EvidenceMatchType;
  /** Pre-computed weight; recomputed from the attribute when absent. */
  confidenceScore?: number;
}

export function evidenceWeight(item: ScorableEvidence): number {
  if (item.matchType === "conflict") return 0;
  if (typeof item.confidenceScore === "number") {
    return Math.min(1, Math.max(0, item.confidenceScore));
  }
  const { weight } = EVIDENCE_WEIGHTS[item.attribute];
  return Number((weight * MATCH_TYPE_FACTOR[item.matchType]).toFixed(4));
}

/**
 * Diminishing-returns combination in [0, 1]. Many weak signals can never sum
 * to certainty, and no single weak signal is ever rounded up.
 */
export function calculateIdentityConfidence(evidence: readonly ScorableEvidence[]): number {
  let remaining = 1;
  for (const item of evidence) remaining *= 1 - Math.min(0.99, evidenceWeight(item));
  return Number((1 - remaining).toFixed(4));
}

export function deriveIdentityStatus(
  evidence: readonly ScorableEvidence[],
  conflicts: readonly ScorableEvidence[] = [],
  confidence: number = calculateIdentityConfidence(evidence),
): IdentityStatus {
  if (conflicts.length > 0) return "conflict";

  const hasOwnershipProof = evidence.some((item) =>
    OWNERSHIP_PROOF_ATTRIBUTES.includes(item.attribute),
  );
  if (hasOwnershipProof) return "verified";

  const veryStrong = evidence.filter(
    (item) => EVIDENCE_WEIGHTS[item.attribute].strength === "very_strong",
  ).length;
  const strong =
    veryStrong +
    evidence.filter((item) => EVIDENCE_WEIGHTS[item.attribute].strength === "strong").length;

  if ((veryStrong >= 1 || strong >= 2) && confidence >= STRONGLY_CORRELATED_THRESHOLD) {
    return "strongly_correlated";
  }
  if (confidence >= CORRELATED_THRESHOLD) return "correlated";
  return "unlinked";
}

/* ------------------------------------------------------------------ *
 * Profile completeness                                                *
 * ------------------------------------------------------------------ */

export const PROFILE_REQUIREMENTS = [
  "nickname",
  "country",
  "main_platform",
  "roles",
  "primary_goal",
  "experience",
] as const;
export type ProfileRequirement = (typeof PROFILE_REQUIREMENTS)[number];

export interface ProfileCompletenessInput {
  nickname?: string | null;
  country?: string | null;
  mainPlatform?: string | null;
  experience?: string | null;
  roleCodes?: readonly string[];
  goalCodes?: readonly string[];
  primaryGoalCode?: string | null;
}

export interface CompletenessResult {
  /** 0..1 — share of requirements actually satisfied. Never rounded up. */
  ratio: number;
  percent: number;
  missing: ProfileRequirement[];
  satisfied: ProfileRequirement[];
}

const filled = (value?: string | null) => typeof value === "string" && value.trim().length > 0;

export function profileCompleteness(input: ProfileCompletenessInput): CompletenessResult {
  const checks: Record<ProfileRequirement, boolean> = {
    nickname: filled(input.nickname),
    country: filled(input.country),
    main_platform: filled(input.mainPlatform),
    experience: filled(input.experience),
    roles: (input.roleCodes?.length ?? 0) > 0,
    primary_goal: filled(input.primaryGoalCode) || (input.goalCodes?.length ?? 0) > 0,
  };

  const satisfied = PROFILE_REQUIREMENTS.filter((key) => checks[key]);
  const missing = PROFILE_REQUIREMENTS.filter((key) => !checks[key]);
  const ratio = Number((satisfied.length / PROFILE_REQUIREMENTS.length).toFixed(4));

  return { ratio, percent: Math.floor(ratio * 100), missing, satisfied };
}

/* ------------------------------------------------------------------ *
 * Combined verification state                                         *
 * ------------------------------------------------------------------ */

export interface IdentitySummary {
  source: string;
  connected: boolean;
  status: IdentityStatus;
  confidence: number;
  /** True only when an authenticated flow proved ownership. */
  ownershipProven: boolean;
  /** Set when the source cannot be reached server-side (e.g. anti-bot). */
  blockedExternalAccess?: boolean;
}

export type VerificationRecommendation =
  | "complete_profile"
  | "connect_faceit"
  | "connect_steam"
  | "resolve_conflict"
  | "gamers_club_blocked"
  | "nothing_pending";

export interface VerificationResult {
  /** Real, computed value in [0,100]. Never a placeholder. */
  percent: number;
  profile: CompletenessResult;
  identityStatus: IdentityStatus;
  identityConfidence: number;
  /** The badge is granted ONLY on proven ownership plus a complete profile. */
  verifiedBadge: boolean;
  recommendations: VerificationRecommendation[];
}

/**
 * Half the meter is declared data, half is evidence-backed identity. Identity
 * contribution is the best confidence among connected identities, so an
 * unlinked account contributes exactly zero.
 */
export function evaluateVerification(
  profile: ProfileCompletenessInput,
  identities: readonly IdentitySummary[],
): VerificationResult {
  const completeness = profileCompleteness(profile);

  const connected = identities.filter((identity) => identity.connected);
  const identityConfidence = connected.reduce(
    (best, identity) => Math.max(best, Math.min(1, Math.max(0, identity.confidence))),
    0,
  );

  const hasConflict = identities.some((identity) => identity.status === "conflict");
  const ownershipProven = connected.some((identity) => identity.ownershipProven);

  const identityStatus: IdentityStatus = hasConflict
    ? "conflict"
    : ownershipProven
      ? "verified"
      : connected.length === 0
        ? "unlinked"
        : identityConfidence >= STRONGLY_CORRELATED_THRESHOLD
          ? "strongly_correlated"
          : identityConfidence >= CORRELATED_THRESHOLD
            ? "correlated"
            : "unlinked";

  const percent = Math.floor((completeness.ratio * 0.5 + identityConfidence * 0.5) * 100);

  const recommendations: VerificationRecommendation[] = [];
  if (hasConflict) recommendations.push("resolve_conflict");
  if (completeness.missing.length > 0) recommendations.push("complete_profile");
  if (!connected.some((identity) => identity.source === "faceit")) {
    recommendations.push("connect_faceit");
  }
  if (!connected.some((identity) => identity.source === "steam")) {
    recommendations.push("connect_steam");
  }
  if (identities.some((identity) => identity.blockedExternalAccess)) {
    recommendations.push("gamers_club_blocked");
  }
  if (recommendations.length === 0) recommendations.push("nothing_pending");

  return {
    percent,
    profile: completeness,
    identityStatus,
    identityConfidence,
    verifiedBadge: ownershipProven && !hasConflict && completeness.missing.length === 0,
    recommendations,
  };
}
