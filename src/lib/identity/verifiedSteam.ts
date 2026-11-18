/**
 * STEAM — the ONE place that answers "which SteamID64 is proven for this player?".
 *
 * Proven = the player's `player_identities` row for STEAM is `verified`, `is_verified`,
 * with method `openid` (set only by `steam_link_commit` after Steam validated the
 * assertion). A self-declared `player_profiles.steam_id` is NOT proof: it is used only as
 * a legacy fallback when it equals the verified value, so it can never override it.
 *
 * Works with the service-role client (pipeline) and with the caller's RLS client
 * (own identities are readable by their owner).
 */
import { normalizeSteamId64 } from "./identity.normalize";

interface IdentityReader {
  from: (table: "player_identities") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null }>;
        };
      };
    };
  };
}

export interface VerifiedSteamRow {
  external_id?: unknown;
  identity_status?: unknown;
  is_verified?: unknown;
  verification_method?: unknown;
}

/** Pure: the proven SteamID64 of an identity row, or null. */
export function provenSteamId64(row: VerifiedSteamRow | null | undefined): string | null {
  if (!row) return null;
  if (row.is_verified !== true || row.identity_status !== "verified") return null;
  if (row.verification_method !== "openid") return null;
  return normalizeSteamId64(row.external_id);
}

export async function readVerifiedSteamId64(db: unknown, playerId: string): Promise<string | null> {
  const { data } = await (db as IdentityReader)
    .from("player_identities")
    .select("external_id, identity_status, is_verified, verification_method")
    .eq("player_id", playerId)
    .eq("platform", "STEAM")
    .maybeSingle();
  return provenSteamId64(data as VerifiedSteamRow | null);
}
