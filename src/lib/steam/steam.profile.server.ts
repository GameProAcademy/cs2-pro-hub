/**
 * FASE 2.5 — PUBLIC Steam profile enrichment (SERVER ONLY, OPTIONAL).
 *
 * Reads only what Steam publishes through the official Web API, and only when a
 * Web API key is configured. Without a key, linking still works: the profile is
 * simply not enriched (`steamMinimalProfile`), which is honest rather than fake.
 *
 * No scraping. No private data. The key is read inside the function, never at
 * module scope, and never returned to a caller.
 */
import { STEAM_HTTP_TIMEOUT_MS, STEAM_WEB_API_BASE_URL } from "./steam.constants";
import { steamConfigStatus, requireSteamWebApiKey } from "./steam.config.server";
import { steamErrorFromStatus, toSteamError } from "./steam.errors";
import {
  mapSteamPlayerSummary,
  steamMinimalProfile,
  type SteamPlayerSummary,
} from "./steam.mapper";
import { isSteamId64 } from "./steam.openid";
import { SteamError } from "./steam.errors";
import type { SteamProfileView } from "./steam.types";

/**
 * Fetches the public summary. Returns `null` when enrichment is unavailable, so
 * a caller can decide between "not enriched" and "failed"; it never throws for a
 * missing key.
 */
export async function fetchSteamPlayerSummary(
  steamId64: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<SteamProfileView | null> {
  if (!isSteamId64(steamId64)) throw new SteamError("STEAM_INVALID_STEAM_ID");
  if (!steamConfigStatus().webApiReady) return null;

  const key = requireSteamWebApiKey();
  const url = new URL(`${STEAM_WEB_API_BASE_URL}/ISteamUser/GetPlayerSummaries/v2/`);
  url.searchParams.set("key", key);
  url.searchParams.set("steamids", steamId64);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEAM_HTTP_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    throw toSteamError(error);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw steamErrorFromStatus(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SteamError("STEAM_OPENID_INVALID_RESPONSE");
  }

  const players = (payload as { response?: { players?: unknown } } | null)?.response?.players;
  const entry = Array.isArray(players) ? (players[0] as SteamPlayerSummary | undefined) : undefined;
  // The response is only trusted when it describes the account we asked about.
  if (!entry || String(entry.steamid ?? "") !== steamId64) return null;
  return mapSteamPlayerSummary(steamId64, entry);
}

/**
 * Best-effort enrichment used by the link flow: a Steam outage must never break
 * an otherwise valid, proven account link.
 */
export async function resolveSteamProfile(
  steamId64: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ profile: SteamProfileView; enriched: boolean }> {
  try {
    const profile = await fetchSteamPlayerSummary(steamId64, fetchImpl);
    if (profile) return { profile, enriched: true };
  } catch (error) {
    console.warn(`[steam] profile_enrichment_failed code=${toSteamError(error).code}`);
  }
  return { profile: steamMinimalProfile(steamId64), enriched: false };
}
