import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  authenticateDurableWorker,
  claimDurableDemo,
  completeDurableDemo,
  failDurableDemo,
  heartbeatDurableDemo,
} from "@/lib/pipeline/durableBridge.server";

const identity = z.object({
  jobId: z.string().uuid(),
  messageId: z.number().int().positive(),
  attempt: z.number().int().nonnegative(),
  workerId: z.string().min(3).max(128),
});

const MAX_COMPLETE_BYTES = 96 * 1024 * 1024;

export const Route = createFileRoute("/api/public/pipeline-worker/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const unauthorized = authenticateDurableWorker(request);
        if (unauthorized) return unauthorized;
        try {
          const declaredLength = Number(request.headers.get("content-length") ?? "0");
          if (Number.isFinite(declaredLength) && declaredLength > MAX_COMPLETE_BYTES) {
            return Response.json({ error: "payload_too_large" }, { status: 413 });
          }
          const body = await request.json();
          if (params.action === "claim") {
            const { workerId } = z.object({ workerId: z.string().min(3).max(128) }).parse(body);
            return Response.json(await claimDurableDemo(workerId));
          }
          if (params.action === "heartbeat") {
            const input = identity.extend({ stage: z.string().max(32).optional() }).parse(body);
            return Response.json(await heartbeatDurableDemo(input.stage ? { ...input, stage: input.stage } : input));
          }
          if (params.action === "complete") {
            const input = identity.extend({ result: z.unknown() }).parse(body);
            if (!("result" in input)) return Response.json({ error: "invalid_request" }, { status: 400 });
            return Response.json(await completeDurableDemo({ ...input, result: input.result }));
          }
          if (params.action === "fail") {
            const input = identity.extend({ errorCode: z.string().min(1).max(80), detail: z.string().max(300).optional() }).parse(body);
            return Response.json(await failDurableDemo(input.detail ? { ...input, detail: input.detail } : input));
          }
          return Response.json({ error: "not_found" }, { status: 404 });
        } catch (error) {
          const invalid = error instanceof z.ZodError;
          console.error(`[pipeline-worker] request_failed type=${invalid ? "validation" : "internal"}`);
          return Response.json({ error: invalid ? "invalid_request" : "worker_error" }, { status: invalid ? 400 : 500 });
        }
      },
    },
  },
});