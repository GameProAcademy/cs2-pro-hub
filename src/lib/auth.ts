/**
 * Real authentication helpers on top of Supabase Auth.
 *
 * The Supabase browser client is the single source of truth for the session
 * (it persists and refreshes it). Nothing here keeps a parallel auth state.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TranslationKey } from "@/i18n";

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
 * Returns `null` when the profile cannot be read (treated as active so a
 * transient read failure never locks a legitimate user out).
 */
export async function fetchAccountStatus(userId: string): Promise<"active" | "inactive" | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.status;
}

/** Ends the Supabase session. Callers redirect to /login afterwards. */
export async function signOutEverywhere() {
  await supabase.auth.signOut();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const MIN_PASSWORD_LENGTH = 6;
