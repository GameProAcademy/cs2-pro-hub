/** Server-only, fail-closed APP execution evidence; never authorizes parsing. */
import { PipelineError } from "@/lib/pipeline/errors";
import { createHash } from "node:crypto";

type EventType = "EXECUTION_INTENT" | "EXECUTION_STARTED" | "EXECUTION_FINISHED" | "EXECUTION_FAILED" | "EXECUTION_ABORTED";

/** Stable UUIDv5-shape identity derived only from immutable job and attempt identifiers. */
function executionUuid(name: string): string {
  const hash = createHash("sha1").update(`h3e91:app:${name}`, "utf8").digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function appExecutionRecorder(input: {
  jobId: string; uploadId: string; attemptNumber: number; demoSha256: string | null;
  fileSize: number; parserName: string; parserVersion: string; parserRevision: string | null;
}) {
  const executionId = executionUuid(`${input.jobId}:${input.attemptNumber}`);
  const correlationId = executionUuid(`${input.jobId}:${input.attemptNumber}:correlation`);
  const eventIds: Record<EventType, string> = {
    EXECUTION_INTENT: executionUuid(`${executionId}:EXECUTION_INTENT`),
    EXECUTION_STARTED: executionUuid(`${executionId}:EXECUTION_STARTED`),
    EXECUTION_FINISHED: executionUuid(`${executionId}:EXECUTION_FINISHED`),
    EXECUTION_FAILED: executionUuid(`${executionId}:EXECUTION_FAILED`),
    EXECUTION_ABORTED: executionUuid(`${executionId}:EXECUTION_ABORTED`),
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