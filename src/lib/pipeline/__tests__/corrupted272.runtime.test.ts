/**
 * FASE 2.7.2 — GATE 02-A — BEHAVIOURAL PROOF (runtime, not source inspection).
 *
 * The REAL `processJob()` runs here. Only the external boundaries are mocked
 * (database, storage, parser worker). When the worker rejects a structurally
 * corrupted demo (HTTP 422 -> CORRUPTED_DEMO), we prove by execution that:
 *
 *   - normalization, metrics, features, canonical persistence and the player
 *     projection are NEVER invoked;
 *   - the job and its upload end as `failed` with `error_code=CORRUPTED_DEMO`;
 *   - no automatic requeue happens (permanent error);
 *   - nothing partial is persisted;
 *   - re-running the job does not start a second parse.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PipelineError } from "@/lib/pipeline/errors";

// ---------------------------------------------------------------- fake database

interface DbOp {
  table: string;
  type: "select" | "update" | "rpc";
  payload?: Record<string, unknown>;
}

const ops: DbOp[] = [];
const state: {
  job: Record<string, unknown> | null;
  player: Record<string, unknown> | null;
  claim: Array<{ id: string }>;
} = { job: null, player: null, claim: [{ id: "job-1" }] };

function builder(table: string, type: DbOp["type"], payload?: Record<string, unknown>) {
  const op: DbOp = { table, type, payload };
  ops.push(op);

  const result = () => {
    if (type === "select") {
      if (table === "demo_jobs") return { data: state.job, error: null };
      if (table === "player_profiles") return { data: state.player, error: null };
      return { data: [], error: null };
    }
    if (type === "update") return { data: state.claim, error: null };
    return { data: null, error: null };
  };

  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          const promise = Promise.resolve(result());
          return promise.then.bind(promise);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return () => Promise.resolve(result());
        }
        return () => proxy;
      },
    },
  );
  return proxy as never;
}

const db = {
  from(table: string) {
    return {
      select: (_columns?: string) => builder(table, "select"),
      update: (payload: Record<string, unknown>) => builder(table, "update", payload),
      insert: (payload: Record<string, unknown>) => builder(table, "update", payload),
      upsert: (payload: Record<string, unknown>) => builder(table, "update", payload),
      delete: () => builder(table, "update"),
    };
  },
  rpc: (name: string, args?: Record<string, unknown>) =>
    builder(`rpc:${name}`, "rpc", args) as unknown as Promise<{ data: null; error: null }>,
};

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

// ---------------------------------------------------------------- boundaries

const parseDemo = vi.fn();
const assertParserWorkerReady = vi.fn(async () => undefined);

vi.mock("@/lib/pipeline/parser/remoteParser.server", () => ({
  assertParserWorkerReady: (...args: unknown[]) => assertParserWorkerReady(...(args as [])),
  resolveParserAdapter: () => ({
    isAvailable: () => true,
    parseDemo: (...args: unknown[]) => parseDemo(...args),
  }),
}));

const createDemoSignedUrl = vi.fn(async () => "https://signed.example/demo.dem");

vi.mock("@/lib/pipeline/storage.server", () => ({
  demoExists: async () => ({ size: 20 * 1024 * 1024 }),
  computeStoredDemoSha256: async () => "a".repeat(64),
  assertDemoIntegrity: () => undefined,
  createDemoSignedUrl: () => createDemoSignedUrl(),
  deleteDemo: async () => undefined,
  retainUntil: () => new Date("2026-01-02T00:00:00.000Z").toISOString(),
}));

// Analytical + persistence layers: observable, and must stay untouched.
const normalizeParserOutput = vi.fn();
const computeMetrics = vi.fn();
const extractFeatures = vi.fn();
const persistCanonicalObservation = vi.fn();
const persistDemoProjection = vi.fn();
const demoToCanonicalBundle = vi.fn();
const loadCanonicalCandidates = vi.fn();

vi.mock("@/lib/pipeline/normalizer", () => ({
  normalizeParserOutput: (...a: unknown[]) => normalizeParserOutput(...a),
}));
vi.mock("@/lib/pipeline/metrics", () => ({
  computeMetrics: (...a: unknown[]) => computeMetrics(...a),
}));
vi.mock("@/lib/pipeline/features", () => ({
  extractFeatures: (...a: unknown[]) => extractFeatures(...a),
}));
vi.mock("@/lib/canonical/canonical.persistence.server", () => ({
  persistCanonicalObservation: (...a: unknown[]) => persistCanonicalObservation(...a),
}));
vi.mock("@/lib/pipeline/persistence.server", () => ({
  persistDemoProjection: (...a: unknown[]) => persistDemoProjection(...a),
}));
vi.mock("@/lib/canonical/adapters/demo.adapter", () => ({
  demoToCanonicalBundle: (...a: unknown[]) => demoToCanonicalBundle(...a),
}));
vi.mock("@/lib/canonical/candidates.server", () => ({
  loadCanonicalCandidates: (...a: unknown[]) => loadCanonicalCandidates(...a),
}));

const { processJob } = await import("@/lib/pipeline/jobs.server");

// ---------------------------------------------------------------- helpers

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    upload_id: "upload-1",
    user_id: "user-1",
    player_id: null,
    status: "processing",
    retry_count: 0,
    max_retries: 2,
    storage_path: "user-1/demo.dem",
    demo_sha256: "a".repeat(64),
    file_size: 20 * 1024 * 1024,
    ...overrides,
  };
}

function updatesFor(table: string) {
  return ops.filter((o) => o.table === table && o.type === "update").map((o) => o.payload ?? {});
}

beforeEach(() => {
  ops.length = 0;
  state.job = jobRow();
  state.player = { id: "player-1", steam_id: "76561198000000001" };
  state.claim = [{ id: "job-1" }];
  vi.clearAllMocks();
  // Real worker behaviour for a structurally corrupted demo: HTTP 422 with
  // { detail: { error_code: "CORRUPTED_DEMO" } }, already classified.
  parseDemo.mockRejectedValue(new PipelineError("CORRUPTED_DEMO", "structural integrity failed"));
  assertParserWorkerReady.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------- tests

describe("GATE 02-A — CORRUPTED_DEMO fails closed at runtime", () => {
  it("reports the failure without throwing, carrying the permanent code", async () => {
    const result = await processJob("job-1");
    expect(parseDemo).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ jobId: "job-1", status: "failed", errorCode: "CORRUPTED_DEMO" });
  });

  it("never reaches normalization, metrics, features, canonical or projection", async () => {
    await processJob("job-1");
    expect(normalizeParserOutput).not.toHaveBeenCalled();
    expect(computeMetrics).not.toHaveBeenCalled();
    expect(extractFeatures).not.toHaveBeenCalled();
    expect(demoToCanonicalBundle).not.toHaveBeenCalled();
    expect(loadCanonicalCandidates).not.toHaveBeenCalled();
    expect(persistCanonicalObservation).not.toHaveBeenCalled();
    expect(persistDemoProjection).not.toHaveBeenCalled();
  });

  it("leaves the job failed at the failed stage with the corrupted code", async () => {
    await processJob("job-1");
    const last = updatesFor("demo_jobs").at(-1)!;
    expect(last["status"]).toBe("failed");
    expect(last["stage"]).toBe("failed");
    expect(last["error_code"]).toBe("CORRUPTED_DEMO");
    expect(last["finished_at"]).toBeTruthy();
  });

  it("does not requeue a permanent failure, even with retries left", async () => {
    await processJob("job-1");
    const jobUpdates = updatesFor("demo_jobs");
    expect(jobUpdates.some((u) => u["status"] === "pending")).toBe(false);
    expect(jobUpdates.at(-1)!["retry_count"]).toBe(1);
    // ...and the same holds with retry_count already above zero.
    ops.length = 0;
    state.job = jobRow({ retry_count: 1 });
    await processJob("job-1");
    expect(updatesFor("demo_jobs").at(-1)!["status"]).toBe("failed");
  });

  it("marks the upload failed and never processed", async () => {
    await processJob("job-1");
    const uploadUpdates = updatesFor("uploads");
    const last = uploadUpdates.at(-1)!;
    expect(last["status"]).toBe("failed");
    expect(last["error_code"]).toBe("CORRUPTED_DEMO");
    expect(uploadUpdates.some((u) => u["status"] === "processed")).toBe(false);
    expect(uploadUpdates.some((u) => "processed_at" in u)).toBe(false);
  });

  it("persists nothing partial: a truncated demo is rejected, not degraded", async () => {
    await processJob("job-1");
    for (const payload of [...updatesFor("demo_jobs"), ...updatesFor("uploads")]) {
      expect("partial_parse" in payload).toBe(false);
      expect("match_id" in payload).toBe(false);
      expect("quality_flags" in payload).toBe(false);
      expect(Object.values(payload)).not.toContain("partial");
    }
  });

  it("does not re-parse a job already failed with CORRUPTED_DEMO", async () => {
    state.job = jobRow({ status: "failed", retry_count: 1 });
    state.claim = []; // no pending row to claim: the job is terminal
    const result = await processJob("job-1");
    expect(result.status).toBe("skipped");
    expect(parseDemo).not.toHaveBeenCalled();
    expect(persistCanonicalObservation).not.toHaveBeenCalled();
  });

  it("still retries a transient failure, so the taxonomy is respected", async () => {
    parseDemo.mockRejectedValue(new PipelineError("PARSER_TIMEOUT"));
    await processJob("job-1");
    const last = updatesFor("demo_jobs").at(-1)!;
    expect(last["status"]).toBe("pending");
    expect(last["stage"]).toBe("queued");
    expect(last["error_code"]).toBe("PARSER_TIMEOUT");
  });
});
