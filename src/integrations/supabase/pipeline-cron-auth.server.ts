import { supabaseAdmin } from "./client.server";

/**
 * Authenticates the pipeline scheduler without exposing a scheduler secret to
 * the browser. The existing Lovable cron secret remains valid; the database
 * backed secret is an additional path used by the native pg_cron scheduler.
 */
export async function authenticatePipelineCronRequest(
  request: Request,
): Promise<Response | null> {
  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const currentSecret = process.env["LOVABLE_CRON_SECRET"];
  if (currentSecret && token === currentSecret) return null;

  try {
    const { data, error } = await supabaseAdmin.rpc("verify_pipeline_cron_secret", {
      candidate: token,
    });

    if (error) {
      console.error(`[cron] scheduler_auth_db_error code=${error.code ?? "unknown"}`);
      return new Response("Server configuration error", { status: 500 });
    }

    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  } catch (error) {
    const code = error instanceof Error ? error.name : "unknown_error";
    console.error(`[cron] scheduler_auth_error code=${code}`);
    return new Response("Server configuration error", { status: 500 });
  }
}
