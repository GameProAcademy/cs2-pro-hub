import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  authenticateDurableWorker,
  claimDurableDemo,
  completeDurableDemo,
  failDurableDemo,
  heartbeatDurableDemo,
  initializeRawArtifact,
  prepareRawChunk,
  verifyRawChunk,
  finalizeRawArtifact,
} from "@/lib/pipeline/durableBridge.server";
import { DURABLE_HOT_HARD_MAX_BYTES, RAW_CHUNK_HARD_MAX_BYTES } from "@/lib/pipeline/types";
import { RAW_ARTIFACT_SECTION_ORDER } from "@/lib/pipeline/rawArtifactContract";

const identity = z.object({
  jobId: z.string().uuid(),
  messageId: z.number().int().positive(),
  attempt: z.number().int().nonnegative(),
  workerId: z.string().min(3).max(128),
});

class PayloadTooLargeError extends Error {}

export async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DURABLE_HOT_HARD_MAX_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text ? JSON.parse(text) : {};
  } finally {
    reader.releaseLock();
  }
}

function requestByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export const Route = createFileRoute("/api/public/pipeline-worker/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const unauthorized = authenticateDurableWorker(request);
        if (unauthorized) return unauthorized;
        try {
          const declaredLength = Number(request.headers.get("content-length") ?? "0");
          if (Number.isFinite(declaredLength) && declaredLength > DURABLE_HOT_HARD_MAX_BYTES) {
            return Response.json({ error: "payload_too_large" }, { status: 413 });
          }
          const body = await readBoundedJson(request);
          if (params.action === "claim") {
            const { workerId } = z.object({ workerId: z.string().min(3).max(128) }).parse(body);
            return Response.json(await claimDurableDemo(workerId));
          }
          if (params.action === "heartbeat") {
            const input = identity.extend({ stage: z.string().max(32).optional() }).parse(body);
            return Response.json(await heartbeatDurableDemo(input.stage ? { ...input, stage: input.stage } : input));
          }
          if (params.action === "complete") {
            const input = identity.extend({ hot: z.unknown(), raw: z.unknown() }).strict().parse(body);
            const startedAt = Date.now();
            const bytes = requestByteLength(body);
            console.info(`[pipeline-worker] complete_start bytes=${bytes}`);
            const result = await completeDurableDemo(input as Parameters<typeof completeDurableDemo>[0]);
            console.info(`[pipeline-worker] complete_end bytes=${bytes} duration_ms=${Date.now() - startedAt} status=200 memory=unavailable`);
            return Response.json(result);
          }
          if (params.action === "raw-artifact-init") {
            return Response.json(await initializeRawArtifact(identity.parse(body)));
          }
          if (params.action === "raw-chunk-prepare") {
            const input = identity.extend({ artifactId: z.string().uuid(), section: z.enum(RAW_ARTIFACT_SECTION_ORDER),
              chunkIndex: z.number().int().nonnegative(), firstRow: z.number().int().nonnegative(),
              lastRow: z.number().int().nonnegative(), rowCount: z.number().int().positive(),
              byteSize: z.number().int().positive().max(RAW_CHUNK_HARD_MAX_BYTES), sha256: z.string().regex(/^[0-9a-f]{64}$/),
              previousChunkSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable() }).parse(body);
            return Response.json(await prepareRawChunk(input));
          }
          if (params.action === "raw-chunk-verify") {
            const input = identity.extend({ artifactId: z.string().uuid(), section: z.string().min(1).max(32),
              chunkIndex: z.number().int().nonnegative() }).parse(body);
            return Response.json(await verifyRawChunk(input));
          }
          if (params.action === "raw-artifact-finalize") {
            const input = identity.extend({ artifactId: z.string().uuid(), rootDigest: z.string().regex(/^[0-9a-f]{64}$/),
              manifest: z.record(z.string(), z.unknown()) }).parse(body);
            return Response.json(await finalizeRawArtifact(input));
          }
          if (params.action === "fail") {
            const input = identity.extend({ errorCode: z.string().min(1).max(80), detail: z.string().max(300).optional() }).parse(body);
            return Response.json(await failDurableDemo(input.detail ? { ...input, detail: input.detail } : input));
          }
          return Response.json({ error: "not_found" }, { status: 404 });
        } catch (error) {
          if (error instanceof PayloadTooLargeError) {
            return Response.json({ error: "payload_too_large" }, { status: 413 });
          }
          const invalid = error instanceof z.ZodError;
          console.error(`[pipeline-worker] request_failed type=${invalid ? "validation" : "internal"}`);
          return Response.json({ error: invalid ? "invalid_request" : "worker_error" }, { status: invalid ? 400 : 500 });
        }
      },
    },
  },
});