import { afterEach, describe, expect, it, vi } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import {
  DemoUploadError,
  precheckDemo,
  submitDemoWithDependencies,
  type SubmitDemoDependencies,
} from "@/lib/pipeline/client";
import {
  assertRawParserOutput,
  DEPLOYED_WORKER_REVISION,
  expectedParserIdentity,
} from "@/lib/pipeline/parser/adapter";
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

  it("uses the dedicated storage resumable endpoint and 6 MiB chunks", () => {
    expect(resumableStorageEndpoint("https://example.supabase.co")).toBe(
      "https://example.storage.supabase.co/storage/v1/upload/resumable",
    );
    expect(resumableStorageEndpoint("https://storage.acme.dev")).toBe(
      "https://storage.acme.dev/storage/v1/upload/resumable",
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
          newAttempt: false,
          attemptNumber: 1,
          supersedesJobId: null,
          replacementReason: null,
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

  for (const status of ["pending", "processed"] as const) {
    it(`does not overwrite storage or enqueue an existing ${status} duplicate`, async () => {
      const { calls, dependencies } = flow({
        create: async () => {
          calls.push("create");
          return {
            uploadId: "11111111-1111-4111-8111-111111111111",
            storagePath: "user-id/11111111-1111-4111-8111-111111111111.dem",
            duplicate: true,
            duplicateStatus: status,
            existingJobId: "existing-job",
            newAttempt: false,
            attemptNumber: 1,
            supersedesJobId: null,
            replacementReason: null,
          };
        },
      });
      await expect(
        submitDemoWithDependencies(file("match.dem", 64 * 1024), {}, dependencies),
      ).resolves.toMatchObject({ jobId: "existing-job", duplicate: true, newAttempt: false });
      expect(calls).toEqual(["hash", "create"]);
    });
  }

  it("recovers a reserved upload without overwriting its private object", async () => {
    const { calls, dependencies } = flow({
      create: async () => {
        calls.push("create");
        return {
          uploadId: "11111111-1111-4111-8111-111111111111",
          storagePath: "user-id/11111111-1111-4111-8111-111111111111.dem",
          duplicate: true,
          duplicateStatus: "pending",
          existingJobId: null,
          newAttempt: false,
          attemptNumber: 8,
          supersedesJobId: "old-job",
          replacementReason: "raw_audit_blocked",
        };
      },
      enqueue: async () => {
        calls.push("enqueue");
        return { jobId: "recovered-job" };
      },
    });
    await expect(
      submitDemoWithDependencies(file("match.dem", 64 * 1024), {}, dependencies),
    ).resolves.toMatchObject({ jobId: "recovered-job", duplicate: true, attemptNumber: 8 });
    expect(calls).toEqual(["hash", "create", "enqueue"]);
  });

  it("fails closed while a reservation has neither complete bytes nor a job", async () => {
    const { calls, dependencies } = flow({
      create: async () => {
        calls.push("create");
        return {
          uploadId: "11111111-1111-4111-8111-111111111111",
          storagePath: "user-id/11111111-1111-4111-8111-111111111111.dem",
          duplicate: true,
          duplicateStatus: "pending",
          existingJobId: null,
          newAttempt: false,
          attemptNumber: 8,
          supersedesJobId: "old-job",
          replacementReason: "raw_audit_blocked",
        };
      },
      enqueue: async () => {
        calls.push("enqueue");
        throw new Error("DEMO_NOT_FOUND");
      },
    });
    await expect(
      submitDemoWithDependencies(file("match.dem", 64 * 1024), {}, dependencies),
    ).rejects.toMatchObject({ code: "PROCESSING_ERROR" });
    expect(calls).toEqual(["hash", "create", "enqueue"]);
  });

  it("uploads isolated bytes and polls the new job for a stale replacement", async () => {
    const { calls, dependencies } = flow({
      create: async () => {
        calls.push("create");
        return {
          uploadId: "22222222-2222-4222-8222-222222222222",
          storagePath: "user-id/22222222-2222-4222-8222-222222222222.dem",
          duplicate: true,
          duplicateStatus: "failed",
          existingJobId: null,
          newAttempt: true,
          attemptNumber: 2,
          supersedesJobId: "old-job",
          replacementReason: "stale",
        };
      },
      enqueue: async () => {
        calls.push("enqueue");
        return { jobId: "new-job" };
      },
    });
    await expect(
      submitDemoWithDependencies(file("match.dem", 64 * 1024), {}, dependencies),
    ).resolves.toMatchObject({
      jobId: "new-job",
      duplicate: true,
      newAttempt: true,
      attemptNumber: 2,
      supersedesJobId: "old-job",
      replacementReason: "stale",
    });
    expect(calls).toEqual(["hash", "create", "upload", "enqueue"]);
  });
});

describe("Gate 1D parser identity", () => {
  const deployedRevision = DEPLOYED_WORKER_REVISION;
  const payload = () => ({
    parser: { name: PARSER_NAME, version: PARSER_VERSION, revision: deployedRevision },
    contract_version: PARSER_CONTRACT_VERSION,
    header: { map: "de_mirage", tickrate: 64 },
    players: [],
    rounds: [],
    events: [],
  });

  it("defaults to demoparser2 0.42.0 and the deployed worker revision", () => {
    expect(expectedParserIdentity()).toEqual({
      name: "demoparser2",
      version: "0.42.0",
      revision: deployedRevision,
    });
    expect(PARSER_CONTRACT_VERSION).toBe(1);
  });

  it("reads and enforces the configured revision", () => {
    vi.stubEnv("DEMO_PARSER_EXPECTED_REVISION", "worker-revision");
    expect(expectedParserIdentity().revision).toBe("worker-revision");
    expect(
      assertRawParserOutput({
        ...payload(),
        parser: { ...payload().parser, revision: "worker-revision" },
      }).parser.revision,
    ).toBe("worker-revision");
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
