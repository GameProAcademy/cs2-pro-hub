import { z } from "zod";

import { PipelineError } from "@/lib/pipeline/errors";

const lifecycleResult = z
  .object({
    executionId: z.string().uuid(),
    lifecycle: z.enum([
      "NONE",
      "INTENT_ONLY",
      "STARTED",
      "FINISHED",
      "FAILED",
      "ABORTED",
      "INVALID",
    ]),
    terminalEventId: z.string().uuid().nullable(),
    terminalOutcome: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .nullable(),
    terminalEventAt: z.string().datetime({ offset: true }).nullable(),
    hasStarted: z.boolean(),
    hasTerminal: z.boolean(),
  })
  .strict();

export type H3E91LifecycleState = z.infer<typeof lifecycleResult>;

/** Minimal service-only lifecycle projection. Raw ledger rows never cross this boundary. */
export async function readH3E91ExecutionLifecycle(
  executionId: string,
): Promise<H3E91LifecycleState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc(
    "h3e91_read_execution_lifecycle" as never,
    { _execution_id: executionId } as never,
  );
  if (error) {
    throw new PipelineError("PARSER_UNAVAILABLE", "H3E91_LIFECYCLE_READ_UNAVAILABLE");
  }
  const parsed = lifecycleResult.safeParse(data);
  if (!parsed.success) {
    throw new PipelineError("PARSER_UNAVAILABLE", "H3E91_LIFECYCLE_READ_INVALID");
  }
  return parsed.data;
}
