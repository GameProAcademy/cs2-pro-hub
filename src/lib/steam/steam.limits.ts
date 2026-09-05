/**
 * FASE 2.5.1 — abuse protection for the PUBLIC Steam callback.
 *
 * The callback is reachable by anyone, so it must be cheap to reject junk before
 * any database read or any outbound request to Steam happens. Everything here is
 * stateless and therefore correct in a distributed deployment; the per-user
 * throttle that DOES need shared state lives in `steam_link_attempts` (see
 * `steam.openid.server.ts`), which is the same row set the flow already owns.
 */
import { SteamError } from "./steam.errors";

/** Hard structural ceilings for an OpenID 2.0 assertion. */
export const STEAM_CALLBACK_LIMITS = {
  /** Full query string, in bytes. A real assertion is well under 2 KB. */
  maxQueryBytes: 4096,
  /** Number of parameters. Steam sends about a dozen. */
  maxParams: 32,
  /** Longest single value (the signature and claimed id are the big ones). */
  maxValueLength: 1024,
} as const;

/** How many link attempts one user may start inside the TTL window. */
export const STEAM_MAX_ATTEMPTS_PER_WINDOW = 8;

/**
 * Fail-fast payload guard. Throws `STEAM_OPENID_INVALID_RESPONSE` (an oversized
 * or over-wide callback is not a legitimate assertion) or `STEAM_RATE_LIMITED`
 * for the size ceiling, so the redirect reason stays honest.
 */
export function assertCallbackPayloadWithinLimits(url: URL): void {
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (new TextEncoder().encode(query).length > STEAM_CALLBACK_LIMITS.maxQueryBytes) {
    throw new SteamError("STEAM_RATE_LIMITED");
  }

  let count = 0;
  for (const [, value] of url.searchParams) {
    count += 1;
    if (count > STEAM_CALLBACK_LIMITS.maxParams) {
      throw new SteamError("STEAM_OPENID_INVALID_RESPONSE");
    }
    if (value.length > STEAM_CALLBACK_LIMITS.maxValueLength) {
      throw new SteamError("STEAM_OPENID_INVALID_RESPONSE");
    }
  }
}
