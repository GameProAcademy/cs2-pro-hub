import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Context = { supabase: SupabaseClient<Database>; userId: string };

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
    return prepareR5ForensicStaging();
  });

export const verifyR5ForensicDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stagingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireMaster(context as Context);
    const { verifyR5ForensicStaging } = await import("@/lib/pipeline/r5ForensicStaging.server");
    return verifyR5ForensicStaging(data.stagingId);
  });