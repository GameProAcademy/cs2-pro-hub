/**
 * FASE 2.5 — STEAM IDENTITY FOUNDATION — constants.
 *
 * Steam does NOT offer OAuth2 for account linking. The only official, permitted
 * mechanism is **Steam Community OpenID 2.0** (`/openid/login`), which proves
 * ownership of a Steam account without ever handing us a credential.
 *
 * Nothing here is a secret: endpoints and public prefixes only. Every value that
 * depends on the deployment (realm, return URL, Web API key) lives in the server
 * environment — see `steam.config.server.ts`.
 */

/** Official Steam OpenID 2.0 provider endpoint. */
export const STEAM_OPENID_DEFAULT_ENDPOINT = "https://steamcommunity.com/openid/login";

/** OpenID 2.0 namespace. Any other value in a callback is refused. */
export const STEAM_OPENID_NS = "http://specs.openid.net/auth/2.0";

/** "Let the provider tell us who the user is" identifier. */
export const STEAM_OPENID_IDENTIFIER_SELECT =
  "http://specs.openid.net/auth/2.0/identifier_select";

/** Steam always returns a claimed_id under this prefix. */
export const STEAM_CLAIMED_ID_PREFIX = "https://steamcommunity.com/openid/id/";

/** Public community profile URL prefix for a SteamID64. */
export const STEAM_PROFILE_BASE_URL = "https://steamcommunity.com/profiles/";

/** Steam Web API host (only used when a Web API key is configured). */
export const STEAM_WEB_API_BASE_URL = "https://api.steampowered.com";

/** Counter-Strike 2 app id. Kept for future, permitted public-data reads. */
export const STEAM_CS2_APP_ID = 730;

/**
 * A link attempt is single-use and short-lived. Ten minutes is enough for a
 * human to complete the Steam sign-in and short enough to make a stolen return
 * URL useless.
 */
export const STEAM_LINK_STATE_TTL_SECONDS = 600;

/** Query parameter that carries OUR state through Steam's `return_to`. */
export const STEAM_STATE_PARAM = "gp_state";

/** Hard network ceiling for every Steam request. */
export const STEAM_HTTP_TIMEOUT_MS = 8000;

/** Provenance stamp recorded on identities/connections created by this module. */
export const STEAM_SOURCE_VERSION = "steam.openid.v1";

/**
 * Identity semantics, stated explicitly so no later phase misreads them:
 * a validated OpenID assertion proves the user controls the Steam account, so
 * the identity may become `verified` with method `openid`. It proves NOTHING
 * about match data — Steam is not a demo source.
 */
export const STEAM_IDENTITY_VERIFIABLE = true as const;

/** Steam never becomes a match/statistics source in this phase. */
export const STEAM_MATCH_DATA_SUPPORTED = false as const;
