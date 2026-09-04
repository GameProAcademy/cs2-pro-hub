/**
 * Gamers Club — public profile URL parser / validator.
 *
 * PURE function: it NEVER performs a request. A URL typed by a player is a
 * declaration of intent, not consent to crawl, and there is no permitted
 * collection path today (see `gamersclub.constants.ts`).
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

export interface GamersClubProfileRef {
  /** `https://gamersclub.com.br/player/<externalId>` — no query, no fragment. */
  canonicalProfileUrl: string;
  /** Numeric id or public slug, exactly as published. */
  externalId: string;
  /** Present only when the identifier is a slug; ids carry no username. */
  username: string | null;
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

  const identifier = decodeURIComponent(segments[1] ?? "");
  if (NUMERIC_ID.test(identifier)) {
    return {
      ok: true,
      error: null,
      profile: {
        canonicalProfileUrl: `https://${host}/${GAMERS_CLUB_PROFILE_PATH}/${identifier}`,
        externalId: identifier,
        username: null,
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
      externalId: slug,
      username: slug,
    },
  };
}
