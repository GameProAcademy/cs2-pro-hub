/**
 * D12 (2026-10-20, job 2dc1ddd1): the APP decodes each RAW chunk when it verifies it,
 * and a READY artifact verified before per-chunk summaries existed is backfilled one
 * chunk per request, never in the completion request. In-memory fake of the client.
 */
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rawArtifactBytesSha256 } from "@/lib/pipeline/rawArtifactContract";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const objects = new Map<string, Uint8Array<ArrayBuffer>>();
const downloads: string[] = [];

function builder(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
  const api = {
    select: () => api,
    order: () => api,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return api;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return api;
    },
    update: (values: Row) => {
      patch = values;
      return api;
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
      const matched = rows();
      if (patch) matched.forEach((row) => Object.assign(row, patch));
      return Promise.resolve({ data: matched, error: null }).then(resolve);
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: null, error: null }),
    storage: {
      from: () => ({
        download: async (path: string) => {
          downloads.push(path);
          const bytes = objects.get(path);
          return bytes
            ? { data: new Blob([bytes]), error: null }
            : { data: null, error: { message: "missing" } };
        },
      }),
    },
  },
}));

const { initializeRawArtifact, prepareRawChunk, verifyRawChunk } =
  await import("@/lib/pipeline/durableBridge.server");

const claim = {
  jobId: "11111111-1111-4111-8111-111111111111",
  messageId: 7,
  attempt: 0,
  workerId: "w-1",
};
const prefix = "u1/up1/attempt-3";
const artifactId = "22222222-2222-4222-8222-222222222222";

function chunk(section: string, index: number, lines: string[], previous: string | null) {
  const bytes = new Uint8Array(gzipSync(Buffer.from(lines.join("\n") + "\n")));
  const storage_path = `${prefix}/${section}/chunk-${String(index).padStart(6, "0")}.jsonl.gz`;
  objects.set(storage_path, bytes);
  return {
    artifact_id: artifactId,
    section,
    chunk_index: index,
    storage_path,
    first_row: 0,
    last_row: lines.length - 1,
    row_count: lines.length,
    byte_size: bytes.byteLength,
    sha256: rawArtifactBytesSha256(bytes),
    previous_chunk_sha256: previous,
    status: "verified",
    physical_summary: null as unknown,
  };
}

function metadata(row: ReturnType<typeof chunk>) {
  return {
    ...claim,
    artifactId,
    section: row.section as never,
    chunkIndex: row.chunk_index,
    firstRow: row.first_row,
    lastRow: row.last_row,
    rowCount: row.row_count,
    byteSize: row.byte_size,
    sha256: row.sha256,
    previousChunkSha256: row.previous_chunk_sha256,
  };
}

let grenades: ReturnType<typeof chunk>;
let forensic: ReturnType<typeof chunk>;

beforeEach(() => {
  objects.clear();
  downloads.length = 0;
  grenades = chunk(
    "grenades",
    0,
    Array.from({ length: 30 }, (_, i) => JSON.stringify({ entity_id: i, tick: 100 + i })),
    null,
  );
  forensic = chunk("forensic", 0, [JSON.stringify({ field_mappings: [] })], grenades.sha256);
  tables["demo_jobs"] = [
    {
      id: claim.jobId,
      upload_id: "up1",
      user_id: "u1",
      demo_sha256: "a".repeat(64),
      attempt_number: 3,
      dispatch_attempt: 0,
      queue_message_id: 7,
      worker_id: "w-1",
      lease_expires_at: new Date(Date.now() + 600_000).toISOString(),
    },
  ];
  tables["raw_evidence_artifacts"] = [
    {
      id: artifactId,
      job_id: claim.jobId,
      upload_id: "up1",
      user_id: "u1",
      attempt_number: 3,
      demo_sha256: "a".repeat(64),
      storage_prefix: prefix,
      storage_bucket: "cs2-raw-evidence",
      manifest_storage_path: `${prefix}/manifest.json`,
      schema_version: 1,
      status: "ready",
    },
  ];
  tables["raw_evidence_chunks"] = [grenades, forensic];
});

describe("RAW per-chunk physical summary in the bridge", () => {
  it("asks the worker to walk a READY artifact again only while summaries are missing", async () => {
    const first = (await initializeRawArtifact(claim)) as Row;
    expect(first).toMatchObject({
      id: artifactId,
      status: "verifying",
      physical_summary_backfill: true,
    });
    // The database keeps the artifact READY: nothing about its lifecycle changed.
    expect(tables["raw_evidence_artifacts"]![0]!["status"]).toBe("ready");

    const prepared = await prepareRawChunk(metadata(grenades));
    expect(prepared).toEqual({ path: grenades.storage_path, alreadyVerified: true });
    expect(grenades.physical_summary).toMatchObject({
      version: 1,
      chunk_sha256: grenades.sha256,
      section: "grenades",
      rows: 30,
    });
    expect(grenades.status).toBe("verified");
    // Forensic is decoded again at completion: no summary is ever recorded for it.
    await prepareRawChunk(metadata(forensic));
    expect(forensic.physical_summary).toBeNull();

    const second = (await initializeRawArtifact(claim)) as Row;
    expect(second["status"]).toBe("ready");
    expect(second["physical_summary_backfill"]).toBeUndefined();
  });

  it("refuses to re-present a different chunk for a READY artifact", async () => {
    await expect(
      prepareRawChunk({ ...metadata(grenades), sha256: "b".repeat(64) }),
    ).rejects.toMatchObject({ detail: "RAW chunk identity conflict" });
    tables["raw_evidence_chunks"] = [forensic];
    await expect(prepareRawChunk(metadata(grenades))).rejects.toMatchObject({
      detail: "READY RAW artifact is immutable",
    });
  });

  it("never records a summary for bytes that do not match the chunk digest", async () => {
    objects.set(grenades.storage_path, new Uint8Array(gzipSync(Buffer.from('{"x":1}\n'))));
    await expect(prepareRawChunk(metadata(grenades))).rejects.toMatchObject({
      detail: "RAW chunk verification failed",
    });
    expect(grenades.physical_summary).toBeNull();
  });

  it("decodes and records the summary when the chunk is verified the first time", async () => {
    tables["raw_evidence_artifacts"]![0]!["status"] = "uploading";
    grenades.status = "uploading";
    grenades.physical_summary = null;
    expect(
      await verifyRawChunk({ ...claim, artifactId, section: "grenades", chunkIndex: 0 }),
    ).toEqual({ verified: true });
    expect(grenades.status).toBe("verified");
    expect(grenades.physical_summary).toMatchObject({ rows: 30, chunk_sha256: grenades.sha256 });
    expect(downloads).toEqual([grenades.storage_path]);
  });

  it("fails verification closed when the decoded rows disagree with the declared count", async () => {
    tables["raw_evidence_artifacts"]![0]!["status"] = "uploading";
    grenades.status = "uploading";
    grenades.row_count = 31;
    await expect(
      verifyRawChunk({ ...claim, artifactId, section: "grenades", chunkIndex: 0 }),
    ).rejects.toMatchObject({ detail: "RAW physical chunk row count mismatch" });
    expect(grenades.status).toBe("uploading");
  });
});
