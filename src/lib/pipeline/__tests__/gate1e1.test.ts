/**
 * FASE 2.7.2 — GATE 1E.1 — WORKER CONTRACT SYNC + REVISION LOCK.
 *
 * Proves, without parsing any real `.dem`:
 *   1. every OFFICIAL worker `error_code` maps deterministically to exactly one
 *      pipeline error (one matrix, no second switch);
 *   2. integrity failures are NEVER reported as an invalid demo;
 *   3. the parser identity lock fails closed on name/version/revision/contract.
 */
import { describe, expect, it, vi } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { isPermanentError, PipelineError } from "@/lib/pipeline/errors";
import {
  expectedParserContract,
  isParserRevisionRequired,
  mapParserErrorCode,
} from "@/lib/pipeline/parser/adapter";
import {
  assertParserIdentity,
  classifyWorkerFailure,
  parserMajorMinor,
  parseWorkerIdentity,
  WORKER_ERROR_CODES,
  type WorkerErrorCode,
} from "@/lib/pipeline/parser/parserEndpoint";

function thrown(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof PipelineError) return error.code;
    return `NOT_PIPELINE_ERROR:${String(error)}`;
  }
  return "NO_ERROR";
}

const expected = () => ({
  name: PARSER_NAME,
  version: PARSER_VERSION,
  revision: "build-1",
  revisionRequired: true,
  contractVersion: PARSER_CONTRACT_VERSION,
});

const worker = (over: Partial<ReturnType<typeof expected>> = {}) => ({
  name: over.name ?? PARSER_NAME,
  version: over.version ?? PARSER_VERSION,
  revision: over.revision === undefined ? "build-1" : over.revision,
  contractVersion: over.contractVersion ?? PARSER_CONTRACT_VERSION,
});

describe("GATE 1E.1 — official worker protocol codes", () => {
  /** HTTP status the worker uses for each official code. */
  const matrix: Array<[WorkerErrorCode, number, string, boolean]> = [
    ["UNAUTHORIZED", 401, "PARSER_UNAUTHORIZED", true],
    ["FORBIDDEN", 403, "PARSER_FORBIDDEN", true],
    ["CONTRACT_MISMATCH", 409, "PARSER_CONTRACT_MISMATCH", true],
    ["UNSUPPORTED_CONTRACT_VERSION", 409, "PARSER_CONTRACT_MISMATCH", true],
    ["INVALID_DEMO_FORMAT", 422, "INVALID_DEMO_FORMAT", true],
    ["CORRUPTED_DEMO", 422, "CORRUPTED_DEMO", true],
    ["UNSUPPORTED_DEMO", 422, "UNSUPPORTED_DEMO", true],
    ["HASH_MISMATCH", 422, "PARSER_HASH_MISMATCH", true],
    ["FILE_SIZE_MISMATCH", 422, "PARSER_FILE_SIZE_MISMATCH", true],
    ["DEMO_TOO_LARGE", 413, "DEMO_TOO_LARGE", true],
    ["PAYLOAD_TOO_LARGE", 413, "DEMO_TOO_LARGE", true],
    ["DOWNLOAD_ERROR", 502, "PARSER_DOWNLOAD_ERROR", false],
    ["DOWNLOAD_FAILED", 503, "PARSER_DOWNLOAD_ERROR", false],
    ["TIMEOUT", 504, "PARSER_TIMEOUT", false],
    ["PARSE_TIMEOUT", 504, "PARSER_TIMEOUT", false],
    ["DOWNLOAD_TIMEOUT", 504, "PARSER_TIMEOUT", false],
    ["PARSER_ERROR", 500, "PARSER_ERROR", false],
  ];

  it("covers every declared worker code exactly once", () => {
    expect(matrix.map(([code]) => code).sort()).toEqual([...WORKER_ERROR_CODES].sort());
  });

  for (const [workerCode, status, pipelineCode, permanent] of matrix) {
    it(`${status} ${workerCode} -> ${pipelineCode}`, () => {
      const error = classifyWorkerFailure(status, {
        detail: { error_code: workerCode, message: "worker detail" },
      });
      expect(error.code).toBe(pipelineCode);
      expect(error.permanent).toBe(permanent);
      // The APP mapper must reach the SAME verdict — one matrix, not two.
      expect(mapParserErrorCode(workerCode).code).toBe(pipelineCode);
    });
  }

  it("keeps integrity failures out of the invalid-demo family", () => {
    for (const workerCode of ["HASH_MISMATCH", "FILE_SIZE_MISMATCH"]) {
      const code = classifyWorkerFailure(422, { detail: { error_code: workerCode } }).code;
      expect(code).not.toBe("INVALID_DEMO_FORMAT");
      expect(code).not.toBe("CORRUPTED_DEMO");
    }
  });

  it("never degrades a contract mismatch to a generic parser error", () => {
    expect(classifyWorkerFailure(409, { detail: { error_code: "CONTRACT_MISMATCH" } }).code).toBe(
      "PARSER_CONTRACT_MISMATCH",
    );
    // Even if the worker answers with a wrong status, the code decides.
    expect(classifyWorkerFailure(500, { detail: { error_code: "CONTRACT_MISMATCH" } }).code).toBe(
      "PARSER_CONTRACT_MISMATCH",
    );
  });

  it("treats a download failure as transient, never as a broken demo", () => {
    const error = classifyWorkerFailure(502, { detail: { error_code: "DOWNLOAD_ERROR" } });
    expect(error.code).toBe("PARSER_DOWNLOAD_ERROR");
    expect(isPermanentError(error.code)).toBe(false);
  });

  it("never echoes the bearer token or a signed URL into the detail", () => {
    const error = classifyWorkerFailure(401, {
      detail: { error_code: "UNAUTHORIZED", message: "invalid credentials" },
    });
    expect(error.detail ?? "").not.toContain("Bearer");
    expect(error.detail ?? "").not.toContain("token=");
  });
});

describe("GATE 1E.1 — revision lock", () => {
  it("accepts the exact expected build", () => {
    expect(() => assertParserIdentity(worker(), expected())).not.toThrow();
  });

  it("accepts a patch release of the pinned version", () => {
    const [major, minor] = PARSER_VERSION.split(".");
    expect(parserMajorMinor(`${major}.${minor}.99`)).toBe(parserMajorMinor(PARSER_VERSION));
    expect(() =>
      assertParserIdentity(worker({ version: `${major}.${minor}.99` }), expected()),
    ).not.toThrow();
  });

  it("fails closed on a different parser, version or revision", () => {
    expect(thrown(() => assertParserIdentity(worker({ name: "awpy" }), expected()))).toBe(
      "PARSER_IDENTITY_MISMATCH",
    );
    expect(thrown(() => assertParserIdentity(worker({ version: "9.9.9" }), expected()))).toBe(
      "PARSER_IDENTITY_MISMATCH",
    );
    expect(thrown(() => assertParserIdentity(worker({ revision: "other" }), expected()))).toBe(
      "PARSER_IDENTITY_MISMATCH",
    );
  });

  it("refuses a worker that reports no revision when the lock is required", () => {
    expect(thrown(() => assertParserIdentity(worker({ revision: null }), expected()))).toBe(
      "PARSER_IDENTITY_MISMATCH",
    );
  });

  it("refuses to run locked without a pinned revision (configuration error)", () => {
    expect(thrown(() => assertParserIdentity(worker(), { ...expected(), revision: null }))).toBe(
      "PARSER_CONFIG_ERROR",
    );
  });

  it("still rejects a contract mismatch from /version", () => {
    expect(thrown(() => assertParserIdentity(worker({ contractVersion: 2 }), expected()))).toBe(
      "PARSER_CONTRACT_MISMATCH",
    );
  });

  it("allows an unpinned revision only when the lock is not required", () => {
    expect(() =>
      assertParserIdentity(worker({ revision: null }), {
        ...expected(),
        revision: null,
        revisionRequired: false,
      }),
    ).not.toThrow();
  });

  it("never invents a revision from an empty string", () => {
    expect(
      parseWorkerIdentity({
        parser: { name: PARSER_NAME, version: PARSER_VERSION, revision: "  " },
        contract_version: PARSER_CONTRACT_VERSION,
      }).revision,
    ).toBeNull();
  });

  it("makes the revision requirement explicit and production-safe", () => {
    vi.stubEnv("DEMO_PARSER_REVISION_REQUIRED", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isParserRevisionRequired()).toBe(true);
    vi.stubEnv("DEMO_PARSER_REVISION_REQUIRED", "false");
    expect(isParserRevisionRequired()).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_PARSER_REVISION_REQUIRED", "true");
    expect(isParserRevisionRequired()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("exposes the deployment expectation as one object", () => {
    vi.stubEnv("DEMO_PARSER_EXPECTED_REVISION", "build-42");
    const contract = expectedParserContract();
    expect(contract.name).toBe(PARSER_NAME);
    expect(contract.revision).toBe("build-42");
    expect(contract.contractVersion).toBe(PARSER_CONTRACT_VERSION);
    vi.unstubAllEnvs();
  });
});
