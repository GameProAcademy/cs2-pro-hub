/**
 * PLAYER IDENTITY GRAPH — model.
 *
 * GamePro User -> external identities (gamers_club, faceit, steam, valve).
 * Identities are NOT strings: two equal nicknames are weak evidence, never proof.
 * Every state transition is driven by recorded evidence with an explicit weight.
 */
export const IDENTITY_SOURCES = ["gamers_club", "faceit", "steam", "valve"] as const;
export type IdentitySource = (typeof IDENTITY_SOURCES)[number];

export const IDENTITY_STATUSES = [
  /** No sufficient evidence. */
  "unlinked",
  /** Compatible evidence, not enough to confirm ownership. */
  "correlated",
  /** Multiple strong, consistent evidences. */
  "strongly_correlated",
  /** Adequate proof of ownership/authentication. */
  "verified",
  /** Strong contradictory evidence exists. Never resolved silently. */
  "conflict",
] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export const VERIFICATION_METHODS = [
  /** OAuth/OpenID flow completed by the user. */
  "oauth",
  "openid",
  /** Admin/backend decision, audited. */
  "manual_admin",
  /** No verification performed. */
  "none",
] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export interface ExternalIdentity {
  source: IdentitySource;
  externalId: string | null;
  username: string | null;
  profileUrl: string | null;
  status: IdentityStatus;
  /** Heuristic 0..1. Not a probability, and never shown as mathematical truth. */
  confidenceScore: number;
  verificationMethod: VerificationMethod;
  verifiedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Evidence                                                            *
 * ------------------------------------------------------------------ */

export const EVIDENCE_ATTRIBUTES = [
  "authenticated_link",
  "steam_id64",
  "external_account_id",
  "faceit_linked_identity",
  "nickname_exact",
  "nickname_normalized",
  "avatar",
  "team",
  "country",
] as const;
export type EvidenceAttribute = (typeof EVIDENCE_ATTRIBUTES)[number];

export const EVIDENCE_MATCH_TYPES = [
  "exact",
  "normalized_exact",
  "visual_match",
  "partial",
  "conflict",
] as const;
export type EvidenceMatchType = (typeof EVIDENCE_MATCH_TYPES)[number];

export type EvidenceStrength = "very_strong" | "strong" | "auxiliary" | "weak" | "very_weak";

/**
 * HEURISTIC weights. Configurable on purpose, and never presented to the user as
 * a mathematical certainty.
 */
export const EVIDENCE_WEIGHTS: Record<EvidenceAttribute, { strength: EvidenceStrength; weight: number }> = {
  authenticated_link: { strength: "very_strong", weight: 1 },
  steam_id64: { strength: "very_strong", weight: 0.95 },
  external_account_id: { strength: "very_strong", weight: 0.9 },
  faceit_linked_identity: { strength: "strong", weight: 0.6 },
  nickname_exact: { strength: "weak", weight: 0.15 },
  nickname_normalized: { strength: "very_weak", weight: 0.08 },
  avatar: { strength: "very_weak", weight: 0.05 },
  team: { strength: "auxiliary", weight: 0.05 },
  country: { strength: "auxiliary", weight: 0.03 },
};

/** Only these attributes can ever justify `verified`. */
export const OWNERSHIP_PROOF_ATTRIBUTES: readonly EvidenceAttribute[] = [
  "authenticated_link",
];

export interface IdentityCorrelationEvidence {
  identityA: { source: IdentitySource; id: string | null };
  identityB: { source: IdentitySource; id: string | null };
  attribute: EvidenceAttribute;
  matchType: EvidenceMatchType;
  /** Weight actually applied, after strength and match type. */
  confidenceScore: number;
  /** Sanitized value or a hash. Never raw PII beyond what the user provided. */
  evidenceValue: string | null;
  provenance: string;
  observedAt: string;
  expiresAt: string | null;
}
