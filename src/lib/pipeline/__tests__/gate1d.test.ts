import { afterEach, describe, expect, it, vi } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import {
  DemoUploadError,
  precheckDemo,
  submitDemoWithDependencies,
  type SubmitDemoDependencies,
} from "@/lib/pipeline/client";
import { assertRawParserOutput, expectedParserIdentity } from "@/lib/pipeline/parser/adapter";
import { resumableStorageEndpoint, TUS_CHUNK_BYTES } from "@/lib/pipeline/resumableUpload";

function file(name: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type: "application/octet-stream" });
}

afterEach(() => vi.unstubAllEnvs());

describe("Gate 1D upload boundaries", () => {
  it("accepts .dem and rejects extension and size violations", () => {
    expect(() => precheckDemo(file("match.dem", 64 * 1024))).not.toThrow();
    expect(() => precheckDemo(file("match.zip", 64 * 1024))).toThrowError(DemoUploadError);
    expect(() => precheckDemo(file("match.dem", 64 * 1024 - 1))).toThrowError("DEMO_TOO_SMALL");
    expect(() => precheckDemo(file("match.dem", 1_500 * 1024 * 1024 + 1))).toThrowError(
      "DEMO_TOO_LARGE",
    );
  });

  it("uses the official resumable endpoint and 6 MiB chunks", () => {
    expect(resumableStorageEndpoint("https://example.supabase.co")).toBe(
      "https://example.supabase.co/storage/v1/upload/resumable",
    );
    expect(TUS_CHUNK_BYTES).toBe(6 * 1024 * 1024);
    expect(() => resumableStorageEndpoint("http://example.supabase.co")).toThrow("STORAGE_ERROR");
  });

  function flow(overrides: Partial<SubmitDemoDependencies> = {}) {
    const calls: string[] = [];
    const dependencies: SubmitDemoDependencies = {
      hash: async () => {
        calls.push("hash");
        return "a".repeat(64);
      },
      create: async () => {
        calls.push("create");
        return {
          uploadId: "11111111-1111-4111-8111-111111111111",
          storagePath: "user-id/11111111-1111-4111-8111-111111111111.dem",
          duplicate: false,
          duplicateStatus: null,
          existingJobId: null,
        };
      },
      upload: async () => {
        calls.push("upload");
      },
      enqueue: async () => {
        calls.push("enqueue");
        return { jobId: "job-id" };
      },
      ...overrides,
    };
    return { calls, dependencies };
  }

  it("orders hash, registration, completed TUS upload, then enqueue", async () => {
    const { calls, dependencies } = flow();
    await submitDemoWithDependencies(file("match.dem", 64 * 1024), {}, dependencies);
    expect(calls).toEqual(["hash", "create", "upload", "enqueue"]);
  });

  it("does not enqueue after upload failure or cancellation", async () => {
    for (const error of [new Error("network"), new DOMException("cancelled", "AbortError")]) {
      const { calls, dependencies } = flow({
        upload: async () => {
          calls.push("upload");
          throw error;
        },
      });
      await expect(
        submitDemoWithDependencies(file("match.dem", 64 * 1024), {}, dependencies),
      ).rejects.toThrow("STORAGE_ERROR");
      expect(calls).toEqual(["hash", "create", "upload"]);
    }
  });

  it("does not upload or enqueue an already processed duplicate", async () => {
    const { calls, dependencies } = flow({
      create: async () => {
        calls.push("create");
        return {
          uploadId: "11111111-1111-4111-8111-111111111111",
          storagePath: "user-id/11111111-1111-4111-8111-111111111111.dem",
          duplicate: true,
          duplicateStatus: "processed",
          existingJobId: "existing-job",
        };
      },
    });
    await expect(
      submitDemoWithDependencies(file("match.dem", 64 * 1024), {}, dependencies),
    ).resolves.toEqual({ jobId: "existing-job", duplicate: true });
    expect(calls).toEqual(["hash", "create"]);
  });
});

describe("Gate 1D parser identity", () => {
  const payload = () => ({
    parser: { name: PARSER_NAME, version: PARSER_VERSION, revision: "worker-revision" },
    contract_version: PARSER_CONTRACT_VERSION,
    header: { map: "de_mirage", tickrate: 64 },
    players: [],
    rounds: [],
    events: [],
  });

  it("defaults to demoparser2 0.42.0 and contract 1", () => {
    expect(expectedParserIdentity()).toEqual({
      name: "demoparser2",
      version: "0.42.0",
      revision: null,
    });
    expect(PARSER_CONTRACT_VERSION).toBe(1);
  });

  it("reads and enforces the configured revision", () => {
    vi.stubEnv("DEMO_PARSER_EXPECTED_REVISION", "worker-revision");
    expect(expectedParserIdentity().revision).toBe("worker-revision");
    expect(assertRawParserOutput(payload()).parser.revision).toBe("worker-revision");
    expect(() =>
      assertRawParserOutput({ ...payload(), parser: { ...payload().parser, revision: "other" } }),
    ).toThrow("PARSER_IDENTITY_MISMATCH");
  });

  it("rejects wrong name, major/minor, contract, and missing arrays", () => {
    expect(() =>
      assertRawParserOutput({ ...payload(), parser: { name: "other", version: "0.42.0" } }),
    ).toThrow();
    expect(() =>
      assertRawParserOutput({ ...payload(), parser: { name: PARSER_NAME, version: "0.41.9" } }),
    ).toThrow();
    expect(() => assertRawParserOutput({ ...payload(), contract_version: 2 })).toThrow();
    const { events: _events, ...missingEvents } = payload();
    expect(() => assertRawParserOutput(missingEvents)).toThrow();
  });
});
