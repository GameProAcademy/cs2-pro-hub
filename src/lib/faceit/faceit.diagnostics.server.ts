/**
 * PM5 — records WHERE a FACEIT OAuth callback failed (server-only, best effort).
 * Only the stage, the stable internal error code and the upstream HTTP status are stored;
 * never a user id, FACEIT id, code, state, token, e-mail, URL or response body.
 */
import { toFaceitError } from "./faceit.errors";

export type FaceitOAuthStage =
  "state" | "token" | "userinfo" | "link" | "sync" | "session" | "account";

export async function recordFaceitOAuthFailure(
  purpose: "link" | "login",
  stage: FaceitOAuthStage,
  error: unknown,
): Promise<void> {
  const e = toFaceitError(error);
  const code = /^[A-Z_]{3,64}$/.test(e.code) ? e.code : "FACEIT_INTERNAL_ERROR";
  const status =
    typeof e.status === "number" && e.status >= 100 && e.status <= 599 ? e.status : null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("faceit_oauth_failures" as never)
      .insert({ purpose, stage, error_code: code, http_status: status } as never);
  } catch {
    // Diagnostics never change the outcome of the callback.
  }
  console.warn(
    `[faceit] oauth_failure purpose=${purpose} stage=${stage} code=${code} status=${status ?? "-"}`,
  );
}
