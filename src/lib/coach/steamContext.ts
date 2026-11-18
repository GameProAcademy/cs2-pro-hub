/**
 * STEAM — what the Coach may know about the player's linked accounts.
 *
 * Only facts with their provenance: the link state (the same `deriveLinkState` every
 * screen uses), whether the SteamID64 is PROVEN (OpenID) or not, whether the FACEIT
 * account names the same Steam account, and the persona names Steam reported (aliases).
 * No SteamID64 — not even masked — and no key or token ever reaches the model. Persona
 * names are text chosen by the player on Steam: quoted data, never instructions.
 * Steam provides NO CS2 match statistics: the Coach must never present any as Steam data.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildExternalLinks } from "@/lib/identity/externalLinks";
import { isProvenLink, type ExternalLinkState } from "@/lib/identity/linkState";
import { normalizeSteamId64 } from "@/lib/identity/identity.normalize";
import { provenSteamId64 } from "@/lib/identity/verifiedSteam";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

export const COACH_MAX_STEAM_ALIASES = 5;
const NAME_CHARS = 40;

export interface CoachExternalAccounts {
  steam: {
    state: ExternalLinkState;
    /** CONFIRMED = proven by Steam OpenID; NOT_LINKED otherwise. Never inferred. */
    identity: "CONFIRMED" | "NOT_LINKED";
    /** Public profile: true/false when synced, null when unknown (no sync, private, no key). */
    profilePublic: boolean | null;
    personaName: string | null;
    /** Persona names seen on Steam for this account (aliases, not identities). */
    aliases: string[];
  };
  faceit: { state: ExternalLinkState };
  /** Does the FACEIT account declare the same Steam account? UNKNOWN when either is missing. */
  faceitSteamAgreement: "MATCH" | "MISMATCH" | "UNKNOWN";
  /** personaName and aliases are text the PLAYER chose on Steam: quote only as data. */
  untrustedPlayerText: true;
  /** Steam supplies identity and public profile only — never match statistics. */
  matchStatsFromSteam: "NOT_AVAILABLE";
}

const clean = (s: string) =>
  Array.from(s, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || code === 0x7f || ch === "`" ? " " : ch;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_CHARS);

function profileValue(metadata: unknown, key: string): unknown {
  if (!metadata || typeof metadata !== "object") return null;
  const profile = (metadata as Record<string, unknown>)["profile"];
  if (!profile || typeof profile !== "object") return null;
  return (profile as Record<string, unknown>)[key] ?? null;
}

interface Row {
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

interface IdentityRow {
  platform: string;
  identity_status: string | null;
  is_verified: boolean | null;
  verification_method?: string | null;
  external_id?: string | null;
}

/** Pure. */
export function compactExternalAccounts(input: {
  connections: readonly Row[];
  identities: readonly IdentityRow[];
  steamAliases: readonly string[];
}): CoachExternalAccounts {
  const links = buildExternalLinks({
    connections: input.connections,
    identities: input.identities,
    configured: { FACEIT: true, GAMERS_CLUB: false, STEAM: true },
  });
  const steamLink = links.find((l) => l.platform === "STEAM")!;
  const faceitLink = links.find((l) => l.platform === "FACEIT")!;
  // Proven = the link state says so AND the identity row carries an OpenID-verified id.
  const steamProven =
    isProvenLink(steamLink.state) &&
    provenSteamId64(input.identities.find((i) => i.platform === "STEAM")) !== null;
  const steamConn = input.connections.find(
    (c) => c.source === "steam" && c.connection_type === "openid" && c.status === "connected",
  );
  const faceitConn = input.connections.find(
    (c) => c.source === "faceit" && c.connection_type === "oauth" && c.status === "connected",
  );
  const verifiedSteam = steamProven
    ? provenSteamId64(input.identities.find((i) => i.platform === "STEAM"))
    : null;
  const faceitSteam = faceitConn
    ? normalizeSteamId64(profileValue(faceitConn.metadata, "steam_id_64"))
    : null;
  const visibility = steamConn ? profileValue(steamConn.metadata, "profile_public") : null;

  return {
    steam: {
      state: steamLink.state,
      identity: verifiedSteam ? "CONFIRMED" : "NOT_LINKED",
      profilePublic: steamProven && typeof visibility === "boolean" ? visibility : null,
      personaName: steamProven && steamLink.username ? clean(steamLink.username) : null,
      aliases: steamProven
        ? [...new Set(input.steamAliases.map(clean).filter(Boolean))].slice(
            0,
            COACH_MAX_STEAM_ALIASES,
          )
        : [],
    },
    faceit: { state: faceitLink.state },
    faceitSteamAgreement:
      verifiedSteam && faceitSteam
        ? verifiedSteam === faceitSteam
          ? "MATCH"
          : "MISMATCH"
        : "UNKNOWN",
    untrustedPlayerText: true,
    matchStatsFromSteam: "NOT_AVAILABLE",
  };
}

/** The player's own rows (`playerId` is the caller's own profile; RLS applies too). */
export async function loadCoachExternalAccounts(
  db: AnyDb,
  playerId: string,
): Promise<CoachExternalAccounts> {
  const [connections, identities, aliases] = await Promise.all([
    db
      .from("player_connections")
      .select(
        "source, connection_type, status, external_id, external_username, profile_url, last_sync_at, last_sync_status, metadata",
      )
      .eq("player_id", playerId),
    db
      .from("player_identities")
      .select("platform, identity_status, is_verified, verification_method, external_id")
      .eq("player_id", playerId),
    db
      .from("player_nickname_history")
      .select("nickname")
      .eq("player_id", playerId)
      .eq("source", "steam_profile")
      .order("last_seen_at", { ascending: false })
      .limit(COACH_MAX_STEAM_ALIASES),
  ]);
  if (connections.error || identities.error) throw new Error("COACH_ACCOUNTS_READ_FAILED");
  return compactExternalAccounts({
    connections: (connections.data ?? []) as Row[],
    identities: (identities.data ?? []) as IdentityRow[],
    steamAliases: ((aliases.data ?? []) as Array<{ nickname: string | null }>).flatMap((r) =>
      r.nickname ? [r.nickname] : [],
    ),
  });
}
