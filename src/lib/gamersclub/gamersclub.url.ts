/**
 * Gamers Club — public profile URL parser / validator.
 *
 * PURE function: it NEVER performs a request. A URL typed by a player is a
 * declaration of intent, not consent to crawl, and there is no permitted
 * collection path today (see `gamersclub.constants.ts`).
 *
 * CRITICAL MODEL RULE:
 * `/player/123456` and `/player/nickname` are NOT the same thing. A slug is not
 * a stable identifier and must never be stored as `externalId` (GCID). Only a
 * collection/normalization step that observes the real GCID may set it.
 */
import { GAMERS_CLUB_ALLOWED_HOSTS, GAMERS_CLUB_PROFILE_PATH } from "./gamersclub.constants";
import type { GamersClubErrorCode } from "./gamersclub.errors";

export type GamersClubUrlError = Extract<
  GamersClubErrorCode,
  | "GAMERS_CLUB_INVALID_URL"
  | "GAMERS_CLUB_UNSUPPORTED_HOST"
  | "GAMERS_CLUB_INSECURE_URL"
  | "GAMERS_CLUB_URL_CREDENTIALS"
  | "GAMERS_CLUB_INVALID_PROFILE_PATH"
>;

/** How the profile is addressed in the URL. */
export type GamersClubProfileLocatorType = "numeric_id" | "slug";

export interface GamersClubProfileRef {
  /** `https://gamersclub.com.br/player/<locator>` — no query, no fragment. */
  canonicalProfileUrl: string;
  profileLocatorType: GamersClubProfileLocatorType;
  /**
   * GCID. Set ONLY when the URL carries a numeric identifier, and even then it
   * remains "claimed" until a collection step confirms it. Never a slug.
   */
  externalId: string | null;
  /** Public slug/nickname locator. `null` for numeric URLs. */
  profileSlug: string | null;
  /**
   * Whether the GCID is confirmed by observation. A player-supplied URL never
   * confirms anything, so this is always `false` here.
   */
  externalIdConfirmed: boolean;
}

export type GamersClubUrlResult =
  | { ok: true; profile: GamersClubProfileRef; error: null }
  | { ok: false; profile: null; error: GamersClubUrlError };

const NUMERIC_ID = /^[0-9]{1,12}$/;
/** Conservative slug shape; anything else is rejected instead of guessed. */
const SLUG = /^[a-z0-9](?:[a-z0-9._-]{1,30})$/;

function fail(error: GamersClubUrlError): GamersClubUrlResult {
  return { ok: false, profile: null, error };
}

export function parseGamersClubProfileUrl(raw: string): GamersClubUrlResult {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length === 0 || value.length > 2048) return fail("GAMERS_CLUB_INVALID_URL");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("GAMERS_CLUB_INVALID_URL");
  }

  // Rejects javascript:, data:, http: and anything else non-TLS.
  if (url.protocol !== "https:") return fail("GAMERS_CLUB_INSECURE_URL");
  // `https://evil.com@gamersclub.com.br/...` and friends.
  if (url.username !== "" || url.password !== "") return fail("GAMERS_CLUB_URL_CREDENTIALS");
  if (url.port !== "") return fail("GAMERS_CLUB_UNSUPPORTED_HOST");

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = (GAMERS_CLUB_ALLOWED_HOSTS as readonly string[]).includes(host);
  if (!allowed) return fail("GAMERS_CLUB_UNSUPPORTED_HOST");

  // Query string and fragment are dropped, never interpreted.
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 2 || segments[0]?.toLowerCase() !== GAMERS_CLUB_PROFILE_PATH) {
    return fail("GAMERS_CLUB_INVALID_PROFILE_PATH");
  }

  let identifier: string;
  try {
    identifier = decodeURIComponent(segments[1] ?? "");
  } catch {
    return fail("GAMERS_CLUB_INVALID_PROFILE_PATH");
  }
  if (identifier.includes("/") || identifier.includes("\\")) {
    return fail("GAMERS_CLUB_INVALID_PROFILE_PATH");
  }

  if (NUMERIC_ID.test(identifier)) {
    return {
      ok: true,
      error: null,
      profile: {
        canonicalProfileUrl: `https://${host}/${GAMERS_CLUB_PROFILE_PATH}/${identifier}`,
        profileLocatorType: "numeric_id",
        externalId: identifier,
        profileSlug: null,
        externalIdConfirmed: false,
      },
    };
  }

  const slug = identifier.toLowerCase();
  if (!SLUG.test(slug)) return fail("GAMERS_CLUB_INVALID_PROFILE_PATH");
  return {
    ok: true,
    error: null,
    profile: {
      canonicalProfileUrl: `https://${host}/${GAMERS_CLUB_PROFILE_PATH}/${slug}`,
      profileLocatorType: "slug",
      /** A slug is NOT a GCID. */
      externalId: null,
      profileSlug: slug,
      externalIdConfirmed: false,
    },
  };
}

/**
 * Promotes a parsed reference to a confirmed GCID. Only a collector/normalizer
 * that OBSERVED the id may call this — never the UI, never a URL parse.
 */
export function withConfirmedGamersClubId(
  profile: GamersClubProfileRef,
  observedExternalId: string,
): GamersClubProfileRef {
  if (!NUMERIC_ID.test(observedExternalId)) {
    throw new Error("A confirmed Gamers Club id must be numeric.");
  }
  return {
    ...profile,
    profileLocatorType: "numeric_id",
    externalId: observedExternalId,
    externalIdConfirmed: true,
  };
}
