import { describe, expect, it, vi } from "vitest";

import { handleCompleteRequest, readBoundedJson } from "@/routes/api/public/pipeline-worker.$action";
import { DURABLE_HOT_HARD_MAX_BYTES } from "@/lib/pipeline/types";

describe("durable completion HTTP boundary", () => {
  it("reports the physical UTF-8 bytes read instead of reserializing JSON", async () => {
    const body = '{  "value": "á"  }';
    const request = new Request("http://localhost/api/public/pipeline-worker/complete", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await readBoundedJson(request);
    expect(result.value).toEqual({ value: "á" });
    expect(result.byteLength).toBe(new TextEncoder().encode(body).byteLength);
    expect(result.byteLength).not.toBe(new TextEncoder().encode(JSON.stringify(result.value)).byteLength);
  });

  it("rejects a streamed body above 8 MiB before durable completion", async () => {
    const complete = vi.fn();
    const payload = "x".repeat(DURABLE_HOT_HARD_MAX_BYTES + 1);
    const request = new Request("http://localhost/api/public/pipeline-worker/complete", {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
    });
    const response = await handleCompleteRequest(request, complete);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "payload_too_large" });
    expect(complete).not.toHaveBeenCalled();
  });
});