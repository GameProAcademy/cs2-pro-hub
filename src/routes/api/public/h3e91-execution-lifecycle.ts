import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { authenticateDurableWorker } from "@/lib/pipeline/durableBridge.server";
import { readH3E91ExecutionLifecycle } from "@/lib/pipeline/h3e91Lifecycle.server";

const requestSchema = z.object({ executionId: z.string().uuid() }).strict();

export async function handleH3E91LifecycleRead(request: Request): Promise<Response> {
  const unauthorized = authenticateDurableWorker(request);
  if (unauthorized) return unauthorized;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > 512) {
    return Response.json({ code: "H3E91_PAYLOAD_TOO_LARGE" }, { status: 413 });
  }
  try {
    const payload = await request.text();
    if (new TextEncoder().encode(payload).byteLength > 512) {
      return Response.json({ code: "H3E91_PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
    const input = requestSchema.parse(JSON.parse(payload));
    return Response.json(await readH3E91ExecutionLifecycle(input.executionId));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ code: "H3E91_PAYLOAD_INVALID" }, { status: 400 });
    }
    return Response.json({ code: "H3E91_LIFECYCLE_READ_UNAVAILABLE" }, { status: 503 });
  }
}

export const Route = createFileRoute("/api/public/h3e91-execution-lifecycle")({
  server: { handlers: { POST: ({ request }) => handleH3E91LifecycleRead(request) } },
});