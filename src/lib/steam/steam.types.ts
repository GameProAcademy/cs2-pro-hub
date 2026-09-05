/**
 * FASE 2.5 — Steam types.
 *
 * A SteamID64 is a 64-bit unsigned integer. It is handled as a STRING
 * everywhere: parsing it as a JS number silently loses precision.
 */

/** Runtime state of the Steam integration, derived from the server env. */
export const STEAM_INTEGRATION_STATES = [
  /** No environment configuration at all: the UI must not offer a button. */
  "not_configured",
  /** OpenID linking configured; public profile enrichment unavailable. */
  "configured",
  /** OpenID linking + Steam Web API available. */
  "available",
  /** Configured but the last observed interaction failed. */
  "error",
] as const;

export type SteamIntegrationState = (typeof STEAM_INTEGRATION_STATES)[number];

/** Public, non-sensitive profile view. Every field may legitimately be absent. */
export interface SteamProfileView {
  /** SteamID64 as a string. Never a number. */
  steamId64: string;
  personaName: string | null;
  profileUrl: string;
  avatar: string | null;
  /** Steam's own visibility flag: 1 = private, 3 = public. */
  visibility: number | null;
  /** True only when Steam reports a public profile. */
  isPublic: boolean;
  countryCode: string | null;
  createdAt: string | null;
}

/** Result of a validated OpenID assertion. */
export interface SteamOpenIdAssertion {
  claimedId: string;
  steamId64: string;
}

/** Client-facing view of the player's Steam link. */
export interface SteamConnectionView {
  state: "disconnected" | "connected" | "error" | "configuration_missing";
  connected: boolean;
  /** Masked SteamID64 (never the full value in a list/admin context). */
  steamId64Masked: string | null;
  /** Full SteamID64 — only ever returned to the OWNER of the account. */
  steamId64: string | null;
  personaName: string | null;
  profileUrl: string | null;
  avatar: string | null;
  profilePublic: boolean | null;
  identityStatus: string;
  confidence: number;
  verified: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
  integrationState: SteamIntegrationState;
  /** Steam Web API configured? Linking works without it. */
  webApiReady: boolean;
  openidReady: boolean;
}
