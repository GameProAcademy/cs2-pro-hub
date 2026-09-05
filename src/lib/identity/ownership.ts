/**
 * FASE 2.5.1 — CENTRALISED OWNERSHIP PROOF.
 *
 * There is exactly ONE place in the product that answers the question
 * "did this human actually prove they control this external account?".
 *
 * IDENTITY CORRELATION (nickname, avatar, country, a SteamID64 reported by a
 * third party) is evidence that two accounts probably belong to the same person.
 * It is NEVER ownership proof. Ownership proof requires that the external
 * provider itself authenticated the user in front of us:
 *
 *   FACEIT -> OAuth2 authorization code flow      -> verification_method "oauth"
 *   STEAM  -> Steam Community OpenID 2.0 assertion -> verification_method "openid"
 *
 * A public profile URL, a manually typed external id, a username match or any
 * weak correlation can never appear in this list.
 */

/** Verification methods that constitute STRONG ownership proof. */
export const STRONG_OWNERSHIP_METHODS = ["oauth", "openid"] as const;

export type StrongOwnershipMethod = (typeof STRONG_OWNERSHIP_METHODS)[number];

/** Methods that are explicitly NOT ownership proof (correlation only). */
export const CORRELATION_ONLY_METHODS = [
  "public_profile",
  "manual",
  "nickname",
  "username",
  "avatar",
  "team",
  "country",
] as const;

export function isStrongOwnershipMethod(
  method: string | null | undefined,
): method is StrongOwnershipMethod {
  if (!method) return false;
  return (STRONG_OWNERSHIP_METHODS as readonly string[]).includes(method);
}

/** Minimal shape any identity-like row must expose to be judged. */
export interface OwnershipCandidate {
  verification_method?: string | null;
  is_verified?: boolean | null;
  identity_status?: string | null;
}

/**
 * The single source of truth. Both conditions are required: the method must be a
 * strong one AND the row must still be flagged verified — unlinking revokes
 * trust by clearing those fields, so a historical identity stops proving
 * anything the moment the connection is removed.
 */
export function hasOwnershipProof(identity: OwnershipCandidate | null | undefined): boolean {
  if (!identity) return false;
  if (identity.identity_status === "conflict") return false;
  return isStrongOwnershipMethod(identity.verification_method) && identity.is_verified === true;
}

/** Human-facing, i18n-friendly key for how ownership was proven. */
export function ownershipProofKey(identity: OwnershipCandidate | null | undefined): string {
  if (!hasOwnershipProof(identity)) return "identity.ownership.none";
  return identity?.verification_method === "openid"
    ? "identity.ownership.openid"
    : "identity.ownership.oauth";
}
