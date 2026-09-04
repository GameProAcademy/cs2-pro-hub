/**
 * Gamers Club — constants.
 *
 * SCOPE OF THIS PHASE (read before adding anything here):
 * There is NO official public Gamers Club API for this product, and the public
 * website answers every unauthenticated request with a Cloudflare interstitial
 * challenge (HTTP 403, `cf-mitigated: challenge`). Bypassing it — cookies,
 * session capture, stealth browsers, proxy rotation, CAPTCHA solving — is
 * explicitly forbidden. Therefore this module contains URL validation only:
 * no HTTP client, no collector, no parser, no worker.
 *
 * Do not add an endpoint here until a permitted, documented, unauthenticated
 * access path exists.
 */

/** Hosts we accept as an official Gamers Club profile location. */
export const GAMERS_CLUB_ALLOWED_HOSTS = ["gamersclub.com.br"] as const;

/** Path prefix of a public player profile: /player/<identifier>. */
export const GAMERS_CLUB_PROFILE_PATH = "player" as const;

/** Version stamp for anything persisted from this module. */
export const GAMERS_CLUB_SOURCE_VERSION = "gamers-club-public-profile/0.1.0" as const;

/**
 * Ownership: a player-supplied public URL proves intent, not identity. Linking
 * a profile NEVER sets `is_verified`; there is no verification method today.
 */
export const GAMERS_CLUB_IDENTITY_VERIFIABLE = false as const;
