/**
 * Real authentication helpers on top of Supabase Auth.
 *
 * The Supabase browser client is the single source of truth for the session
 * (it persists and refreshes it). Nothing here keeps a parallel auth state.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TranslationKey } from "@/i18n";
import { recordLogin } from "@/lib/session.functions";

/** Maps a Supabase auth error to a translated, non-revealing message key. */
export function authErrorKey(message: string | undefined): TranslationKey {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("invalid login credentials")) return "login.invalidCredentials";
  if (normalized.includes("email not confirmed")) return "login.emailNotConfirmed";
  return "login.genericError";
}

export function signUpErrorKey(message: string | undefined): TranslationKey {
  const normalized = (message ?? "").toLowerCase();
  if (
    normalized.includes("already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("user already exists")
  ) {
    return "register.emailTaken";
  }
  if (normalized.includes("password")) return "register.passwordMin";
  return "register.genericError";
}

/**
 * Reads the account status from the existing `profiles` row.
 *
 * Fail-closed: when the profile is missing or the query fails, the status
 * cannot be confirmed and `"unknown"` is returned — callers MUST treat that
 * as unauthorised rather than assuming the account is active.
 */
export async function fetchAccountStatus(
  userId: string,
): Promise<"active" | "inactive" | "unknown"> {
  const { data, error } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data || (data.status !== "active" && data.status !== "inactive")) return "unknown";
  return data.status;
}

/**
 * Records the current sign-in timestamp.
 *
 * `last_login_at` is administrative: the database blocks players from writing
 * it, so the value is set server-side for the authenticated caller.
 */
export async function touchLastLogin() {
  try {
    await recordLogin();
  } catch {
    // Never block sign-in because of a telemetry write.
  }
}

/** Ends the Supabase session. Callers redirect to /login afterwards. */
export async function signOutEverywhere() {
  await supabase.auth.signOut();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const MIN_PASSWORD_LENGTH = 6;
