/**
 * FASE 2.5.2 — rate limiting for the PUBLIC Steam callback (SERVER ONLY).
 *
 * OPERATIONAL DEPENDENCY, stated plainly: this app runs on a distributed
 * runtime (Cloudflare Workers), so an in-memory counter would be a fake limit —
 * each isolate would have its own. The shared state therefore lives in the
 * database (`public.steam_callback_events`, server-role only), which every
 * instance sees. If the deployment ever gains a purpose-built limiter (KV,
 * Durable Object, Redis), replace only this module: callers depend on the
 * `assertCallbackAllowed` / `recordCallbackOutcome` pair, not on the storage.
 *
 * No IP address is stored in clear text: only a salted SHA-256 hash, so the log
 * is useful for throttling and useless as a tracking dataset.
 */
import { SteamError } from "./steam.errors";

/** Window, and ceilings inside that window. */
export const STEAM_CALLBACK_THROTTLE = {
  windowSeconds: 600,
  /** Total callbacks a single caller may make in the window. */
  maxPerWindow: 20,
  /** Callbacks with an unusable state — a strong abuse signal. */
  maxInvalidPerWindow: 8,
} as const;

export type SteamCallbackOutcome = "received" | "invalid_state" | "rejected" | "success";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Identifies the caller without keeping the identifier. The salt is the realm
 * (already a server-side value), so hashes are not comparable across
 * deployments.
 */
export async function callbackClientHash(request: Request): Promise<string> {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
    "unknown";
  const salt = process.env["STEAM_OPENID_REALM"] ?? "gamepro";
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${ip || "unknown"}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Throws `STEAM_CALLBACK_RATE_LIMITED` when this caller is over budget. */
export async function assertCallbackAllowed(clientHash: string): Promise<void> {
  const since = new Date(Date.now() - STEAM_CALLBACK_THROTTLE.windowSeconds * 1000).toISOString();
  const supabase = await db();

  const [total, invalid] = await Promise.all([
    supabase
      .from("steam_callback_events")
      .select("id", { count: "exact", head: true })
      .eq("client_hash", clientHash)
      .gte("created_at", since),
    supabase
      .from("steam_callback_events")
      .select("id", { count: "exact", head: true })
      .eq("client_hash", clientHash)
      .eq("outcome", "invalid_state")
      .gte("created_at", since),
  ]);

  if ((total.count ?? 0) >= STEAM_CALLBACK_THROTTLE.maxPerWindow) {
    throw new SteamError("STEAM_CALLBACK_RATE_LIMITED");
  }
  if ((invalid.count ?? 0) >= STEAM_CALLBACK_THROTTLE.maxInvalidPerWindow) {
    throw new SteamError("STEAM_CALLBACK_RATE_LIMITED");
  }
}

/** Records the outcome. Best effort: a logging failure must not break linking. */
export async function recordCallbackOutcome(
  clientHash: string,
  outcome: SteamCallbackOutcome,
): Promise<void> {
  try {
    const supabase = await db();
    await supabase.from("steam_callback_events").insert({ client_hash: clientHash, outcome });
  } catch {
    // Intentionally silent: throttling telemetry is not worth a failed link.
  }
}
