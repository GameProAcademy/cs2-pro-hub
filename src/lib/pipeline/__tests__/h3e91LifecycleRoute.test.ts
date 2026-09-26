import { describe, expect, it, vi } from "vitest";

import { handleH3E91LifecycleRead } from "@/routes/api/public/h3e91-execution-lifecycle";

const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pipeline/h3e91Lifecycle.server", () => ({
  readH3E91ExecutionLifecycle: read,
}));

const executionId = "11111111-1111-5111-8111-111111111111";

function request(body: unknown, authorized = true) {
  return new Request("http://localhost/api/public/h3e91-execution-lifecycle", {
    method: "POST",
    headers: authorized ? { authorization: "Bearer synthetic-test-only" } : undefined,
    body: JSON.stringify(body),
  });
}

describe("H3E91 lifecycle transport", () => {
  it("rejects anonymous callers before reading state", async () => {
    read.mockClear();
    const response = await handleH3E91LifecycleRead(request({ executionId }, false));
    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it("returns only the minimal authoritative lifecycle projection", async () => {
    vi.stubEnv("DEMO_PIPELINE_BRIDGE_SECRET", "synthetic-test-only");
    read.mockResolvedValueOnce({
      executionId,
      lifecycle: "FINISHED",
      terminalEventId: "22222222-2222-5222-8222-222222222222",
      terminalOutcome: "PARSE_SUCCEEDED",
      terminalCreatedAt: "2026-09-26T05:12:00.000Z",
      hasStarted: true,
      hasTerminal: true,
    });
    try {
      const response = await handleH3E91LifecycleRead(request({ executionId }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expect.objectContaining({ executionId, lifecycle: "FINISHED", hasTerminal: true }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails closed on invalid input and read failure", async () => {
    vi.stubEnv("DEMO_PIPELINE_BRIDGE_SECRET", "synthetic-test-only");
    try {
      expect((await handleH3E91LifecycleRead(request({ executionId, extra: true }))).status).toBe(
        400,
      );
      read.mockRejectedValueOnce(new Error("synthetic outage"));
      expect((await handleH3E91LifecycleRead(request({ executionId }))).status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});