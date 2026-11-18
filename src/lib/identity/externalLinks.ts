/**
 * External accounts of the signed-in player — ONE view for every screen.
 *
 * Pure: built from the player's own `player_connections` and `player_identities` rows
 * (read under RLS by `getMyExternalLinks`). Every screen that shows "is FACEIT / Steam
 * linked?" renders this list, so the profile cards, the identities card and the upload
 * sources can never disagree.
 */
import type { IdentityObservation } from "./identity.correlation";
import { deriveLinkState, isProvenLink, type ExternalLinkState } from "./linkState";

export type ExternalPlatform = "FACEIT" | "GAMERS_CLUB" | "STEAM";

export const EXTERNAL_PLATFORMS: readonly ExternalPlatform[] = ["FACEIT", "GAMERS_CLUB", "STEAM"];

/** `player_connections.source` / `connection_type` of each platform's authenticated link. */
export const PLATFORM_CONNECTION: Record<
  ExternalPlatform,
  { source: string; connectionType: string | null }
> = {
  FACEIT: { source: "faceit", connectionType: "oauth" },
  GAMERS_CLUB: { source: "gamers_club", connectionType: null },
  STEAM: { source: "steam", connectionType: "openid" },
};

export interface ExternalLinkView {
  platform: ExternalPlatform;
  state: ExternalLinkState;
  /** Display name from the provider (never used as identity). Null when not linked. */
  username: string | null;
  profileUrl: string | null;
  avatar: string | null;
  lastSyncAt: string | null;
  /** Masked id for display (Steam); the full id is never part of this view. */
  idMasked: string | null;
}

export interface ConnectionInput {
  source: string;
  connection_type: string | null;
  status: string | null;
  external_id?: string | null;
  external_username: string | null;
  profile_url: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  metadata?: unknown;
}

export interface IdentityInput {
  platform: string;
  identity_status: string | null;
  is_verified: boolean | null;
  username?: string | null;
}

export interface BuildLinksInput {
  connections: readonly ConnectionInput[];
  identities: readonly IdentityInput[];
  configured: Record<ExternalPlatform, boolean>;
  syncRunning?: Partial<Record<ExternalPlatform, boolean>>;
  /** Display transforms (e.g. FACEIT `{lang}` URLs, Steam id masking) applied by the caller. */
  profileUrl?: (platform: ExternalPlatform, url: string | null) => string | null;
  maskId?: (platform: ExternalPlatform, externalId: string | null) => string | null;
}

function avatarOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const profile = (metadata as Record<string, unknown>)["profile"];
  if (!profile || typeof profile !== "object") return null;
  const avatar = (profile as Record<string, unknown>)["avatar"];
  return typeof avatar === "string" && avatar.startsWith("https://") ? avatar : null;
}

export function buildExternalLinks(input: BuildLinksInput): ExternalLinkView[] {
  return EXTERNAL_PLATFORMS.map((platform) => {
    const wanted = PLATFORM_CONNECTION[platform];
    const connection =
      input.connections.find(
        (c) =>
          c.source === wanted.source &&
          (wanted.connectionType === null || c.connection_type === wanted.connectionType),
      ) ?? null;
    const identity = input.identities.find((i) => i.platform === platform) ?? null;
    const state = deriveLinkState({
      configured: input.configured[platform],
      connectionStatus: connection?.status,
      identityStatus: identity?.identity_status,
      isVerified: identity?.is_verified,
      lastSyncAt: connection?.last_sync_at ?? null,
      lastSyncStatus: connection?.last_sync_status ?? null,
      syncRunning: input.syncRunning?.[platform] ?? false,
    });
    const linked = state !== "NOT_LINKED" && state !== "UNAVAILABLE";
    if (!linked || !connection) {
      // A disconnected account shows nothing from its old data: it is not linked.
      return {
        platform,
        state,
        username: null,
        profileUrl: null,
        avatar: null,
        lastSyncAt: null,
        idMasked: null,
      };
    }
    return {
      platform,
      state,
      username: connection.external_username ?? identity?.username ?? null,
      profileUrl: input.profileUrl
        ? input.profileUrl(platform, connection.profile_url)
        : connection.profile_url,
      avatar: avatarOf(connection.metadata),
      lastSyncAt: connection.last_sync_at,
      idMasked: input.maskId ? input.maskId(platform, connection.external_id ?? null) : null,
    };
  });
}

export const LINK_SOURCE: Record<ExternalLinkView["platform"], IdentityObservation["source"]> = {
  FACEIT: "faceit",
  GAMERS_CLUB: "gamers_club",
  STEAM: "steam",
};

/** Real, server-derived observations: the same link view every screen renders. */
export function observationsFromLinks(links: readonly ExternalLinkView[]): IdentityObservation[] {
  return links.map((link) => ({
    source: LINK_SOURCE[link.platform],
    username: link.username,
    authenticatedLink: isProvenLink(link.state),
  }));
}
