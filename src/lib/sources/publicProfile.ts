/**
 * Public profile handling — validation only.
 *
 * PRIVACY AND LEGAL BOUNDARY (this is why no fetching exists here):
 * - Only data the player explicitly provides or explicitly authorises may be
 *   used. A URL typed by the player is a declaration of intent, not consent to
 *   crawl.
 * - NO scraping, NO crawler, NO automated collection of third-party pages is
 *   implemented, and none may be added without official API/permission.
 * - Third-party players are never analysed. Only the authenticated player's own
 *   accounts.
 * - Public profile data is never used to build public rankings or to expose one
 *   player's data to another.
 */
import type { DataSource } from "./sources";

export type PublicProfileValidationError =
  "empty" | "invalid_url" | "insecure_url" | "unsupported_host";

export interface PublicProfileParseResult {
  ok: boolean;
  source: DataSource | null;
  normalizedUrl: string | null;
  error: PublicProfileValidationError | null;
}

/** Hosts we are willing to associate with a source, once permitted. */
const HOST_SOURCES: { suffix: string; source: DataSource }[] = [
  { suffix: "faceit.com", source: "faceit" },
  { suffix: "gamersclub.com.br", source: "gamers_club" },
  { suffix: "steamcommunity.com", source: "steam" },
  { suffix: "steampowered.com", source: "steam" },
];

function fail(error: PublicProfileValidationError): PublicProfileParseResult {
  return { ok: false, source: null, normalizedUrl: null, error };
}

/**
 * Validates a player-provided profile URL. Pure function: it NEVER performs a
 * request against the URL.
 */
export function parsePublicProfileUrl(raw: string): PublicProfileParseResult {
  const value = raw.trim();
  if (value.length === 0) return fail("empty");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("invalid_url");
  }

  if (url.protocol !== "https:") return fail("insecure_url");

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const match = HOST_SOURCES.find(
    (entry) => host === entry.suffix || host.endsWith(`.${entry.suffix}`),
  );
  if (!match) return fail("unsupported_host");

  const normalizedUrl = `https://${host}${url.pathname.replace(/\/+$/, "")}`;
  return { ok: true, source: match.source, normalizedUrl, error: null };
}
