import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Context = { supabase: SupabaseClient<Database>; userId: string };

async function audit(
  context: Context,
  action: string,
  stagingId: string | null,
  metadata: Record<string, string | number | boolean | null>,
): Promise<void> {
  const { error } = await context.supabase.from("admin_audit_logs").insert({
    admin_user_id: context.userId,
    action,
    target_user_id: null,
    metadata: { staging_id: stagingId, ...metadata },
  });
  if (error) throw new Error("R5_AUDIT_FAILED");
}

async function requireMaster(context: Context): Promise<void> {
  const { data: profile, error } = await context.supabase
    .from("profiles")
    .select("status")
    .eq("id", context.userId)
    .maybeSingle();
  if (error || profile?.status !== "active") throw new Error("ADMIN_FORBIDDEN");
  const { data: isMaster, error: roleError } = await context.supabase.rpc("is_admin_master", {
    _user_id: context.userId,
  });
  if (roleError || isMaster !== true) throw new Error("ADMIN_FORBIDDEN");
}

export const prepareR5ForensicDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireMaster(context as Context);
    const { prepareR5ForensicStaging } = await import("@/lib/pipeline/r5ForensicStaging.server");
    const result = await prepareR5ForensicStaging();
    await audit(context as Context, "R5_STAGING_CREATED", result.id, { status: result.status });
    return result;
  });

export const getR5ForensicDemo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireMaster(context as Context);
    const { getR5ForensicStaging } = await import("@/lib/pipeline/r5ForensicStaging.server");
    return getR5ForensicStaging();
  });

export const recordR5ForensicUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        stagingId: z.string().uuid(),
        state: z.enum(["started", "completed", "failed"]),
        errorCode: z.string().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireMaster(context as Context);
    const { updateR5TransportState } = await import("@/lib/pipeline/r5ForensicStaging.server");
    await updateR5TransportState(data.stagingId, data.state, data.errorCode);
    const action =
      data.state === "started"
        ? "R5_UPLOAD_STARTED"
        : data.state === "completed"
          ? "R5_UPLOAD_COMPLETED"
          : "R5_UPLOAD_FAILED";
    await audit(context as Context, action, data.stagingId, {
      error_code: data.errorCode ?? null,
    });
    return { ok: true };
  });

export const verifyR5ForensicDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stagingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireMaster(context as Context);
    const { verifyR5ForensicStaging } = await import("@/lib/pipeline/r5ForensicStaging.server");
    await audit(context as Context, "R5_VERIFICATION_STARTED", data.stagingId, {});
    try {
      const result = await verifyR5ForensicStaging(data.stagingId);
      await audit(context as Context, "R5_VERIFICATION_COMPLETED", data.stagingId, {});
      return result;
    } catch (error) {
      await audit(context as Context, "R5_VERIFICATION_FAILED", data.stagingId, {
        error_code:
          error instanceof Error
            ? (error.message.split(":", 1)[0] ?? "R5_VERIFICATION_FAILED")
            : "R5_VERIFICATION_FAILED",
      });
      throw error;
    }
  });