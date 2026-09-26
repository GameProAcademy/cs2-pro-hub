import { z } from "zod";
import { authenticateDurableWorker } from "@/lib/pipeline/durableBridge.server";

export const H3E91_EXECUTION_BRIDGE_VERSION = "H3E91_EXECUTION_BRIDGE_V1";
export const H3E91_EXECUTION_BRIDGE_MAX_BYTES = 8192;

const uuid = z.string().uuid();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const base = z.object({
  protocol: z.literal(H3E91_EXECUTION_BRIDGE_VERSION),
  eventId: uuid,
  executionId: uuid,
  uploadId: uuid,
  correlationId: uuid,
  jobId: uuid.nullable(),
  attemptNumber: z.number().int().positive().nullable(),
  demoSha256: digest.nullable(),
  fileSize: z.number().int().positive().nullable(),
  parserName: z.string().min(1).max(128).nullable(),
  parserVersion: z.string().min(1).max(128).nullable(),
  parserRevision: z.string().min(1).max(128).nullable(),
  metadataDigest: digest.nullable(),
  executionSurface: z.enum(["APP_REMOTE_PARSER", "RAILWAY_DURABLE_WORKER", "RAILWAY_V1_PARSE"]),
  source: z.enum(["APP", "RAILWAY"]),
  eventVersion: z.literal(1),
  outcomeCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).nullable(),
}).strict();

export const h3e91ExecutionEvent = base.extend({
  eventType: z.enum([
    "EXECUTION_INTENT",
    "EXECUTION_STARTED",
    "EXECUTION_FINISHED",
    "EXECUTION_FAILED",
    "EXECUTION_ABORTED",
  ]),
}).superRefine((event, ctx) => {
  const terminal = ["EXECUTION_FINISHED", "EXECUTION_FAILED", "EXECUTION_ABORTED"].includes(event.eventType);
  if (terminal !== (event.outcomeCode !== null)) {
    ctx.addIssue({ code: "custom", message: "terminal outcome mismatch" });
  }
  if (event.eventType !== "EXECUTION_INTENT" && (!event.parserName || !event.parserVersion || !event.parserRevision)) {
    ctx.addIssue({ code: "custom", message: "parser identity required after intent" });
  }
});

/** Authenticated, bounded transport. Only the database generates event time and digest. */
export async function handleH3E91ExecutionBridge(request: Request): Promise<Response> {
  const unauthorized = authenticateDurableWorker(request);
  if (unauthorized) return unauthorized;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > H3E91_EXECUTION_BRIDGE_MAX_BYTES) {
    return Response.json({ code: "H3E91_PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  let payload = "";
  let event: z.infer<typeof h3e91ExecutionEvent>;
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ code: "H3E91_PAYLOAD_INVALID" }, { status: 400 });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > H3E91_EXECUTION_BRIDGE_MAX_BYTES) {
          await reader.cancel();
          return Response.json({ code: "H3E91_PAYLOAD_TOO_LARGE" }, { status: 413 });
        }
        payload += decoder.decode(part.value, { stream: true });
      }
      payload += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const parsed = h3e91ExecutionEvent.safeParse(JSON.parse(payload));
    if (!parsed.success) {
      return Response.json({ code: "H3E91_PAYLOAD_INVALID" }, { status: 400 });
    }
    event = parsed.data;
  } catch {
    return Response.json({ code: "H3E91_PAYLOAD_INVALID" }, { status: 400 });
  }

  if (event.source !== "RAILWAY" || event.executionSurface === "APP_REMOTE_PARSER") {
    return Response.json({ code: "H3E91_SURFACE_UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("h3e91_record_execution_event" as never, {
      _event_id: event.eventId, _execution_id: event.executionId, _event_type: event.eventType,
      _upload_id: event.uploadId, _correlation_id: event.correlationId, _job_id: event.jobId,
      _attempt_number: event.attemptNumber, _demo_sha256: event.demoSha256,
      _file_size: event.fileSize, _parser_name: event.parserName, _parser_version: event.parserVersion,
      _parser_revision: event.parserRevision, _execution_surface: event.executionSurface,
      _source: event.source, _metadata_digest: event.metadataDigest,
      _outcome_code: event.outcomeCode, _event_version: event.eventVersion,
    } as never);
    if (error || !data || typeof data !== "object") return Response.json({ code: "H3E91_RECORDING_UNAVAILABLE" }, { status: 503 });
    const result = data as { status?: string; code?: string };
    if (result.status === "INSERTED") return Response.json(result, { status: 201 });
    if (result.status === "IDEMPOTENT_REPLAY") return Response.json(result, { status: 200 });
    if (result.status === "REJECTED") return Response.json(result, { status: result.code === "INVALID_INPUT" ? 400 : 409 });
  } catch {
    return Response.json({ code: "H3E91_RECORDING_UNAVAILABLE" }, { status: 503 });
  }
  return Response.json({ code: "H3E91_RECORDING_UNAVAILABLE" }, { status: 503 });
}