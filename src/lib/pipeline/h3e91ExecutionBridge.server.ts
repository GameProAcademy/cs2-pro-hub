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

/** Unactivated until the controlled writer and all production paths are reviewed. */
export async function handleH3E91ExecutionBridge(request: Request): Promise<Response> {
  const unauthorized = authenticateDurableWorker(request);
  if (unauthorized) return unauthorized;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > H3E91_EXECUTION_BRIDGE_MAX_BYTES) {
    return Response.json({ code: "H3E91_PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  let payload = "";
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
    if (!h3e91ExecutionEvent.safeParse(JSON.parse(payload)).success) {
      return Response.json({ code: "H3E91_PAYLOAD_INVALID" }, { status: 400 });
    }
  } catch {
    return Response.json({ code: "H3E91_PAYLOAD_INVALID" }, { status: 400 });
  }

  // Deliberate fail-closed response: no writer, no DB access, no execution authority.
  return Response.json({ code: "H3E91_WRITER_NOT_ACTIVATED" }, { status: 503 });
}