/**
 * FASE 2.5 — Steam -> canonical mapping.
 *
 * Absence is absence: a private profile yields `null`, never `0` and never a
 * fabricated nickname. Connection metadata stays strictly NON-SENSITIVE (no
 * token exists in this flow at all).
 */
import { maskSteamId64, steamProfileUrl } from "./steam.openid";
import type { SteamProfileView } from "./steam.types";

/** Steam Web API `GetPlayerSummaries` player entry (only fields we read). */
export interface SteamPlayerSummary {
  steamid?: unknown;
  personaname?: unknown;
  profileurl?: unknown;
  avatarfull?: unknown;
  avatarmedium?: unknown;
  avatar?: unknown;
  communityvisibilitystate?: unknown;
  loccountrycode?: unknown;
  timecreated?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

/** Builds the public profile view. `steamId64` always comes from OUR validation. */
export function mapSteamPlayerSummary(
  steamId64: string,
  summary: SteamPlayerSummary | null,
): SteamProfileView {
  const visibility = int(summary?.communityvisibilitystate);
  const created = int(summary?.timecreated);
  return {
    steamId64,
    personaName: str(summary?.personaname),
    profileUrl: str(summary?.profileurl) ?? steamProfileUrl(steamId64),
    avatar: str(summary?.avatarfull) ?? str(summary?.avatarmedium) ?? str(summary?.avatar),
    visibility,
    isPublic: visibility === 3,
    countryCode: str(summary?.loccountrycode),
    createdAt: created === null ? null : new Date(created * 1000).toISOString(),
  };
}

/** Profile view for a link we could not enrich (no Web API key / private). */
export function steamMinimalProfile(steamId64: string): SteamProfileView {
  return {
    steamId64,
    personaName: null,
    profileUrl: steamProfileUrl(steamId64),
    avatar: null,
    visibility: null,
    isPublic: false,
    countryCode: null,
    createdAt: null,
  };
}

export interface SteamConnectionFields {
  external_id: string;
  external_username: string | null;
  profile_url: string;
  profile_locator_type: string;
  profile_slug: string | null;
  metadata: Record<string, unknown>;
}

/**
 * NON-SENSITIVE metadata only. `steam_id_64` is a public identifier (it is in
 * the profile URL); no credential exists in the OpenID flow to store.
 */
export function mapSteamConnectionFields(
  profile: SteamProfileView,
  sourceVersion: string,
): SteamConnectionFields {
  return {
    external_id: profile.steamId64,
    external_username: profile.personaName,
    profile_url: profile.profileUrl,
    profile_locator_type: "steam_id_64",
    profile_slug: null,
    metadata: {
      provider: "steam",
      source_version: sourceVersion,
      link_method: "openid",
      profile: {
        steam_id_64: profile.steamId64,
        steam_id_64_masked: maskSteamId64(profile.steamId64),
        persona_name: profile.personaName,
        avatar: profile.avatar,
        country: profile.countryCode,
        visibility: profile.visibility,
        profile_public: profile.isPublic,
        created_at: profile.createdAt,
      },
      observed_at: new Date().toISOString(),
    },
  };
}

export interface SteamIdentityFields {
  external_id: string;
  username: string | null;
  profile_url: string;
  profile_locator_type: string;
  profile_slug: string | null;
}

export function mapSteamIdentityFields(profile: SteamProfileView): SteamIdentityFields {
  return {
    external_id: profile.steamId64,
    username: profile.personaName,
    profile_url: profile.profileUrl,
    profile_locator_type: "steam_id_64",
    profile_slug: null,
  };
}
