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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("admin_audit_logs").insert({
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
        state: z.enum(["started", "completed", "cancelled", "failed"]),
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
          : data.state === "cancelled"
            ? "R5_UPLOAD_CANCELLED"
            : "R5_UPLOAD_FAILED";
    await audit(context as Context, action, data.stagingId, {
      error_code: data.errorCode ?? null,
    });
    return { ok: true };
  });

export const recordR5ForensicProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        stagingId: z.string().uuid(),
        bytesUploaded: z.number().int().min(0),
        bytesTotal: z.number().int().positive(),
        percent: z.number().int().min(0).max(100),
        retryCount: z.number().int().min(0),
        resumed: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireMaster(context as Context);
    const { updateR5TransportProgress } = await import("@/lib/pipeline/r5ForensicStaging.server");
    await updateR5TransportProgress(data.stagingId, data.bytesUploaded);
    await audit(context as Context, "R5_UPLOAD_PROGRESS", data.stagingId, {
      bytes_uploaded: data.bytesUploaded,
      bytes_total: data.bytesTotal,
      percent: data.percent,
      retry_count: data.retryCount,
      resumed: data.resumed,
    });
    return { ok: true };
  });

export const verifyR5ForensicDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stagingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireMaster(context as Context);
    const { verifyR5ForensicStaging } = await import("@/lib/pipeline/r5ForensicStaging.server");
    await audit(context as Context, "R5_VERIFY_STARTED", data.stagingId, {});
    try {
      const result = await verifyR5ForensicStaging(data.stagingId);
      const gate =
        typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
      const ready = gate["status"] === "READY_FOR_EXECUTION";
      await audit(context as Context, "R5_VERIFY_COMPLETED", data.stagingId, {});
      await audit(context as Context, ready ? "R5_GATE_READY" : "R5_GATE_BLOCKED", data.stagingId, {
        status: typeof gate["status"] === "string" ? gate["status"] : "BLOCKED",
      });
      return result;
    } catch (error) {
      await audit(context as Context, "R5_VERIFY_FAILED", data.stagingId, {
        error_code:
          error instanceof Error
            ? (error.message.split(":", 1)[0] ?? "R5_VERIFICATION_FAILED")
            : "R5_VERIFICATION_FAILED",
      });
      throw error;
    }
  });
