import { describe, expect, it, vi } from "vitest";
import {
  handleH3E91ExecutionBridge,
  h3e91ExecutionEvent,
} from "@/lib/pipeline/h3e91ExecutionBridge.server";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

const sample = {
  protocol: "H3E91_EXECUTION_BRIDGE_V1",
  eventId: "b3685a02-6d38-4f19-8b19-7c9810808773",
  executionId: "8d1b3d98-ddde-4500-bb8e-039d69907b9d",
  uploadId: "bf506999-b9bf-409b-b3ae-8545e617caab",
  correlationId: "37db9ea7-2af0-4ee2-b154-e0d6a5ec5d90",
  jobId: null,
  attemptNumber: null,
  demoSha256: null,
  fileSize: null,
  parserName: null,
  parserVersion: null,
  parserRevision: null,
  metadataDigest: null,
  executionSurface: "RAILWAY_V1_PARSE",
  source: "RAILWAY",
  eventVersion: 1,
  outcomeCode: null,
  eventType: "EXECUTION_INTENT",
};

describe("H3E91 bridge staging", () => {
  it("requires a strict versioned identity and rejects browser-provided digests or secrets", () => {
    expect(h3e91ExecutionEvent.safeParse(sample).success).toBe(true);
    for (const extra of [
      { eventDigest: "a".repeat(64) },
      { signedUrl: "https://example.invalid" },
      { token: "secret" },
    ]) {
      expect(h3e91ExecutionEvent.safeParse({ ...sample, ...extra }).success).toBe(false);
    }
    expect(
      h3e91ExecutionEvent.safeParse({ ...sample, eventType: "EXECUTION_FINISHED" }).success,
    ).toBe(false);
    expect(
      h3e91ExecutionEvent.safeParse({ ...sample, eventType: "EXECUTION_STARTED" }).success,
    ).toBe(false);
  });

  it("denies anonymous requests before parsing payloads", async () => {
    const response = await handleH3E91ExecutionBridge(
      new Request("http://localhost/api/public/h3e91-execution-event", {
        method: "POST",
        body: JSON.stringify(sample),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("authenticated requests fail closed when the database recording boundary is unavailable", async () => {
    vi.stubEnv("DEMO_PIPELINE_BRIDGE_SECRET", "synthetic-test-only");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "synthetic outage" } });
    try {
      const response = await handleH3E91ExecutionBridge(
        new Request("http://localhost/api/public/h3e91-execution-event", {
          method: "POST",
          headers: { authorization: "Bearer synthetic-test-only" },
          body: JSON.stringify(sample),
        }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: "H3E91_RECORDING_UNAVAILABLE" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["INSERTED", 201],
    ["IDEMPOTENT_REPLAY", 200],
    ["REJECTED", 409],
  ] as const)("maps database %s without permitting a direct insert", async (status, expected) => {
    vi.stubEnv("DEMO_PIPELINE_BRIDGE_SECRET", "synthetic-test-only");
    rpc.mockResolvedValueOnce({ data: { status, code: "INVALID_TRANSITION" }, error: null });
    try {
      const response = await handleH3E91ExecutionBridge(
        new Request("http://localhost/api/public/h3e91-execution-event", {
          method: "POST",
          headers: { authorization: "Bearer synthetic-test-only" },
          body: JSON.stringify(sample),
        }),
      );
      expect(response.status).toBe(expected);
      expect(rpc).toHaveBeenLastCalledWith(
        "h3e91_record_execution_event",
        expect.objectContaining({
          _event_id: sample.eventId,
          _execution_surface: "RAILWAY_V1_PARSE",
          _source: "RAILWAY",
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects an authenticated APP impersonation before database access", async () => {
    vi.stubEnv("DEMO_PIPELINE_BRIDGE_SECRET", "synthetic-test-only");
    rpc.mockClear();
    try {
      const response = await handleH3E91ExecutionBridge(
        new Request("http://localhost/api/public/h3e91-execution-event", {
          method: "POST",
          headers: { authorization: "Bearer synthetic-test-only" },
          body: JSON.stringify({ ...sample, source: "APP", executionSurface: "APP_REMOTE_PARSER" }),
        }),
      );
      expect(response.status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
