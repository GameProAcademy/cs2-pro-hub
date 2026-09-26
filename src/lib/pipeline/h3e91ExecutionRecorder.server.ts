/** Server-only, fail-closed APP execution evidence; never authorizes parsing. */
import { PipelineError } from "@/lib/pipeline/errors";

type EventType = "EXECUTION_INTENT" | "EXECUTION_STARTED" | "EXECUTION_FINISHED" | "EXECUTION_FAILED" | "EXECUTION_ABORTED";

export function appExecutionRecorder(input: {
  jobId: string; uploadId: string; attemptNumber: number; demoSha256: string | null;
  fileSize: number; parserName: string; parserVersion: string; parserRevision: string | null;
}) {
  const executionId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const eventIds: Record<EventType, string> = {
    EXECUTION_INTENT: crypto.randomUUID(),
    EXECUTION_STARTED: crypto.randomUUID(),
    EXECUTION_FINISHED: crypto.randomUUID(),
    EXECUTION_FAILED: crypto.randomUUID(),
    EXECUTION_ABORTED: crypto.randomUUID(),
  };
  return async (eventType: EventType, outcomeCode: string | null = null) => {
    const intent = eventType === "EXECUTION_INTENT";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("h3e91_record_execution_event" as never, {
      _event_id: eventIds[eventType], _execution_id: executionId, _event_type: eventType,
      _upload_id: input.uploadId, _correlation_id: correlationId, _job_id: input.jobId,
      _attempt_number: input.attemptNumber, _demo_sha256: intent ? null : input.demoSha256,
      _file_size: intent ? null : input.fileSize,
      _parser_name: intent ? null : input.parserName,
      _parser_version: intent ? null : input.parserVersion,
      _parser_revision: intent ? null : input.parserRevision,
      _execution_surface: "APP_REMOTE_PARSER", _source: "APP", _metadata_digest: null,
      _outcome_code: outcomeCode, _event_version: 1,
    } as never);
    const result = data as { status?: string; code?: string } | null;
    if (error || !result || !["INSERTED", "IDEMPOTENT_REPLAY"].includes(result.status ?? "")) {
      throw new PipelineError("PARSER_UNAVAILABLE", `H3E91_RECORDING_FAILED:${result?.code ?? "UNAVAILABLE"}`);
    }
  };
}