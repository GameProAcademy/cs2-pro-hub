/**
 * STEAM — records WHERE a Steam OpenID callback failed (server-only, best effort).
 * Only the stage, the stable internal error code and the upstream HTTP status are stored;
 * never a user id, SteamID64, state, signature, nonce, URL or body.
 */
import { toSteamError } from "./steam.errors";

export type SteamCallbackStage = "payload" | "throttle" | "validate" | "link";

export async function recordSteamLinkFailure(
  stage: SteamCallbackStage,
  error: unknown,
): Promise<void> {
  const e = toSteamError(error);
  const code = /^[A-Z_]{3,64}$/.test(e.code) ? e.code : "STEAM_INTERNAL_ERROR";
  const status =
    typeof e.status === "number" && e.status >= 100 && e.status <= 599 ? e.status : null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("steam_link_failures" as never)
      .insert({ stage, error_code: code, http_status: status } as never);
  } catch {
    // Diagnostics never change the outcome of the callback.
  }
}
