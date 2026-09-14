/**
 * FASE 2.7.2 — GATE 1E — PARSER WORKER ↔ APP CONTRACT ALIGNMENT.
 *
 * These tests prove the transport contract only. No real `.dem` is parsed and no
 * successful parse is mocked as a substitute for the real E2E gate.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { isPermanentError, PipelineError } from "@/lib/pipeline/errors";
import { assertRawParserOutput, mapParserErrorCode } from "@/lib/pipeline/parser/adapter";
import {
  classifyWorkerFailure,
  extractWorkerError,
  isParserEndpointConfigured,
  PARSER_PARSE_PATH,
  parseWorkerIdentity,
  resolveParserEndpoints,
} from "@/lib/pipeline/parser/parserEndpoint";

const ORIGIN = "https://cs2-demo-parser-production.up.railway.app";
const FULL = `${ORIGIN}${PARSER_PARSE_PATH}`;
const DEPLOYED_REVISION = "git:790eaed77eb8cbed8efaa98e1a4f5f0ac33a8bdd";

afterEach(() => vi.unstubAllEnvs());

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof PipelineError) return error.code;
    return `NOT_PIPELINE_ERROR:${String(error)}`;
  }
  return "NO_ERROR";
}

const validOutput = {
  parser: { name: PARSER_NAME, version: PARSER_VERSION, revision: DEPLOYED_REVISION },
  contract_version: PARSER_CONTRACT_VERSION,
  header: { map: "de_mirage" },
  players: [],
  rounds: [],
  events: [],
};

describe("GATE 1E — endpoint configuration", () => {
  it("accepts only the full /v1/parse endpoint", () => {
    const endpoints = resolveParserEndpoints(FULL);
    expect(endpoints.parse).toBe(FULL);
    expect(endpoints.health).toBe(`${ORIGIN}/health`);
    expect(endpoints.version).toBe(`${ORIGIN}/version`);
    expect(endpoints.origin).toBe(ORIGIN);
  });

  it("tolerates a trailing slash without concatenating a second path", () => {
    expect(resolveParserEndpoints(`${FULL}/`).parse).toBe(FULL);
  });

  it("rejects a missing URL as PARSER_CONFIG_ERROR", () => {
    expect(code(() => resolveParserEndpoints(undefined))).toBe("PARSER_CONFIG_ERROR");
    expect(code(() => resolveParserEndpoints(""))).toBe("PARSER_CONFIG_ERROR");
  });

  it("rejects a URL without /v1/parse instead of appending it", () => {
    expect(code(() => resolveParserEndpoints(ORIGIN))).toBe("PARSER_CONFIG_ERROR");
    expect(code(() => resolveParserEndpoints(`${ORIGIN}/parse`))).toBe("PARSER_CONFIG_ERROR");
  });

  it("rejects non-https and malformed URLs", () => {
    expect(code(() => resolveParserEndpoints(`http://worker.local${PARSER_PARSE_PATH}`))).toBe(
      "PARSER_CONFIG_ERROR",
    );
    expect(code(() => resolveParserEndpoints("not-a-url"))).toBe("PARSER_CONFIG_ERROR");
  });

  it("reports configuration validity without throwing", () => {
    expect(isParserEndpointConfigured(FULL)).toBe(true);
    expect(isParserEndpointConfigured(ORIGIN)).toBe(false);
  });

  it("treats configuration failures as permanent", () => {
    expect(isPermanentError("PARSER_CONFIG_ERROR")).toBe(true);
  });
});

describe("GATE 1E — worker error envelope", () => {
  it("reads FastAPI detail.error_code / detail.message", () => {
    expect(
      extractWorkerError({ detail: { error_code: "INVALID_DEMO_FORMAT", message: "bad magic" } }),
    ).toEqual({ errorCode: "INVALID_DEMO_FORMAT", message: "bad magic" });
  });

  it("still reads a flat error_code body", () => {
    expect(extractWorkerError({ error_code: "TIMEOUT" })).toEqual({
      errorCode: "TIMEOUT",
      message: null,
    });
  });

  it("returns nulls for unknown or textual bodies", () => {
    expect(extractWorkerError({ detail: "Unprocessable Entity" })).toEqual({
      errorCode: null,
      message: null,
    });
    expect(extractWorkerError(null)).toEqual({ errorCode: null, message: null });
  });
});

describe("GATE 1E — error matrix", () => {
  const cases: Array<[number, unknown, string, boolean]> = [
    [401, null, "PARSER_UNAUTHORIZED", true],
    [403, null, "PARSER_FORBIDDEN", true],
    [409, null, "PARSER_CONTRACT_MISMATCH", true],
    [408, null, "PARSER_TIMEOUT", false],
    [504, null, "PARSER_TIMEOUT", false],
    [413, null, "DEMO_TOO_LARGE", true],
    [502, null, "PARSER_UNAVAILABLE", false],
    [503, null, "PARSER_UNAVAILABLE", false],
    [500, null, "PARSER_ERROR", false],
    [422, { detail: { error_code: "INVALID_DEMO_FORMAT" } }, "INVALID_DEMO_FORMAT", true],
    [422, { detail: { error_code: "HASH_MISMATCH" } }, "PARSER_HASH_MISMATCH", true],
    [422, { detail: { error_code: "FILE_SIZE_MISMATCH" } }, "PARSER_FILE_SIZE_MISMATCH", true],
    [422, { detail: { error_code: "DOWNLOAD_ERROR" } }, "PARSER_DOWNLOAD_ERROR", false],
    [409, { detail: { error_code: "CONTRACT_MISMATCH" } }, "PARSER_CONTRACT_MISMATCH", true],
    [422, null, "PARSER_INVALID_RESPONSE", true],
  ];

  for (const [status, body, expected, permanent] of cases) {
    it(`maps ${status} ${JSON.stringify(body)} to ${expected}`, () => {
      const error = classifyWorkerFailure(status, body);
      expect(error.code).toBe(expected);
      expect(error.permanent).toBe(permanent);
    });
  }

  it("never turns a transport failure into an invalid demo", () => {
    for (const status of [500, 502, 503, 504, 408, 429]) {
      expect(["INVALID_DEMO_FORMAT", "CORRUPTED_DEMO", "UNSUPPORTED_DEMO"]).not.toContain(
        classifyWorkerFailure(status, null).code,
      );
    }
  });

  it("keeps the legacy mapper on the same single matrix", () => {
    expect(mapParserErrorCode("TIMEOUT").code).toBe("PARSER_TIMEOUT");
    expect(mapParserErrorCode("CORRUPTED_DEMO").code).toBe("CORRUPTED_DEMO");
    expect(mapParserErrorCode("UNSUPPORTED_DEMO").code).toBe("UNSUPPORTED_DEMO");
    expect(mapParserErrorCode("INVALID_DEMO_FORMAT").code).toBe("INVALID_DEMO_FORMAT");
    expect(mapParserErrorCode("something-else").code).toBe("PARSER_ERROR");
  });

  it("never leaks a token-looking secret into the error detail", () => {
    const error = classifyWorkerFailure(401, { detail: { error_code: "UNAUTHORIZED" } });
    expect(error.detail ?? "").not.toContain("Bearer");
  });
});

describe("GATE 1E — response contract", () => {
  it("accepts a structurally valid payload", () => {
    expect(assertRawParserOutput({ ...validOutput }).parser.name).toBe(PARSER_NAME);
    expect(assertRawParserOutput({ ...validOutput, warnings: ["x"] }).warnings).toEqual(["x"]);
  });

  it("rejects a contract mismatch deterministically", () => {
    expect(code(() => assertRawParserOutput({ ...validOutput, contract_version: 2 }))).toBe(
      "PARSER_CONTRACT_MISMATCH",
    );
    expect(isPermanentError("PARSER_CONTRACT_MISMATCH")).toBe(true);
  });

  it("rejects structurally invalid payloads as PARSER_INVALID_RESPONSE", () => {
    expect(code(() => assertRawParserOutput(null))).toBe("PARSER_INVALID_RESPONSE");
    expect(code(() => assertRawParserOutput({ ...validOutput, parser: {} }))).toBe(
      "PARSER_INVALID_RESPONSE",
    );
    const { header: _header, ...noHeader } = validOutput;
    expect(code(() => assertRawParserOutput(noHeader))).toBe("PARSER_INVALID_RESPONSE");
    expect(code(() => assertRawParserOutput({ ...validOutput, rounds: undefined }))).toBe(
      "PARSER_INVALID_RESPONSE",
    );
    expect(code(() => assertRawParserOutput({ ...validOutput, warnings: "nope" }))).toBe(
      "PARSER_INVALID_RESPONSE",
    );
  });

  it("rejects an incompatible parser identity (GATE 1E.1 fail closed)", () => {
    expect(
      code(() =>
        assertRawParserOutput({
          ...validOutput,
          parser: { name: "other", version: PARSER_VERSION },
        }),
      ),
    ).toBe("PARSER_IDENTITY_MISMATCH");
    expect(
      code(() =>
        assertRawParserOutput({ ...validOutput, parser: { name: PARSER_NAME, version: "9.9.9" } }),
      ),
    ).toBe("PARSER_IDENTITY_MISMATCH");
    expect(isPermanentError("PARSER_IDENTITY_MISMATCH")).toBe(true);
  });
});

describe("GATE 1E — /version identity", () => {
  it("parses parser name/version/revision and contract version", () => {
    expect(
      parseWorkerIdentity({
        parser: { name: PARSER_NAME, version: PARSER_VERSION, revision: "abc123" },
        contract_version: PARSER_CONTRACT_VERSION,
      }),
    ).toEqual({
      name: PARSER_NAME,
      version: PARSER_VERSION,
      revision: "abc123",
      contractVersion: PARSER_CONTRACT_VERSION,
    });
  });

  it("keeps a missing revision as null instead of inventing one", () => {
    expect(
      parseWorkerIdentity({
        parser: { name: PARSER_NAME, version: PARSER_VERSION },
        contract_version: 1,
      }).revision,
    ).toBeNull();
  });

  it("rejects an incomplete /version payload", () => {
    expect(code(() => parseWorkerIdentity({}))).toBe("PARSER_INVALID_RESPONSE");
    expect(code(() => parseWorkerIdentity({ parser: { name: PARSER_NAME } }))).toBe(
      "PARSER_INVALID_RESPONSE",
    );
  });
});

describe("GATE 1E — transport request/response", () => {
  const FIXTURE = {
    parser: { name: PARSER_NAME, version: PARSER_VERSION, revision: DEPLOYED_REVISION },
    contract_version: PARSER_CONTRACT_VERSION,
    header: { map: "de_mirage" },
    players: [],
    rounds: [],
    events: [],
  };

  const request = {
    storagePath: "user/upload.dem",
    signedUrl: "https://storage.example/demo.dem?token=signed",
    uploadId: "upload-1",
    fileSize: 1024,
    demoSha256: "a".repeat(64),
  };

  async function withWorker(
    handler: (url: string, init: RequestInit) => Response | Promise<Response>,
    url: string = FULL,
  ) {
    const previousUrl = process.env["DEMO_PARSER_URL"];
    const previousToken = process.env["DEMO_PARSER_TOKEN"];
    const calls: Array<{ url: string; init: RequestInit }> = [];
    process.env["DEMO_PARSER_URL"] = url;
    process.env["DEMO_PARSER_TOKEN"] = "test-token";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
      calls.push({ url: String(input), init });
      return handler(String(input), init);
    }) as typeof fetch;
    const { remoteDemoparser2Adapter } = await import("@/lib/pipeline/parser/remoteParser.server");
    try {
      const result = await remoteDemoparser2Adapter
        .parseDemo(request)
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }));
      return { result, calls, adapter: remoteDemoparser2Adapter };
    } finally {
      globalThis.fetch = originalFetch;
      if (previousUrl == null) delete process.env["DEMO_PARSER_URL"];
      else process.env["DEMO_PARSER_URL"] = previousUrl;
      if (previousToken == null) delete process.env["DEMO_PARSER_TOKEN"];
      else process.env["DEMO_PARSER_TOKEN"] = previousToken;
    }
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("posts to /v1/parse with the full documented request body", async () => {
    const { result, calls } = await withWorker(() => json(FIXTURE));
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(FULL);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.redirect).toBe("manual");
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      contract_version: PARSER_CONTRACT_VERSION,
      upload_id: request.uploadId,
      demo_url: request.signedUrl,
      demo_sha256: request.demoSha256,
      file_size: request.fileSize,
    });
  });

  it("classifies worker failures through the shared matrix", async () => {
    const expectations: Array<[number, unknown, string]> = [
      [401, { detail: { error_code: "UNAUTHORIZED" } }, "PARSER_UNAUTHORIZED"],
      [422, { detail: { error_code: "INVALID_DEMO_FORMAT" } }, "INVALID_DEMO_FORMAT"],
      [422, { detail: { error_code: "HASH_MISMATCH" } }, "PARSER_HASH_MISMATCH"],
      [500, { detail: { error_code: "PARSER_ERROR" } }, "PARSER_ERROR"],
      [503, null, "PARSER_UNAVAILABLE"],
    ];
    for (const [status, body, expected] of expectations) {
      const { result } = await withWorker(() => json(body, status));
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : (result.error as PipelineError).code).toBe(expected);
    }
  });

  it("reports a non-JSON 200 body as PARSER_INVALID_RESPONSE", async () => {
    const { result } = await withWorker(() => new Response("<html>oops</html>", { status: 200 }));
    expect(result.ok ? "" : (result.error as PipelineError).code).toBe("PARSER_INVALID_RESPONSE");
  });

  it("reports an aborted request as PARSER_TIMEOUT", async () => {
    const { result } = await withWorker(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    expect(result.ok ? "" : (result.error as PipelineError).code).toBe("PARSER_TIMEOUT");
  });

  it("reports a network failure as PARSER_UNAVAILABLE, never as an invalid demo", async () => {
    const { result } = await withWorker(() => {
      throw new TypeError("fetch failed");
    });
    expect(result.ok ? "" : (result.error as PipelineError).code).toBe("PARSER_UNAVAILABLE");
  });

  it("refuses a misconfigured endpoint before any request is made", async () => {
    const { result, calls } = await withWorker(() => json(FIXTURE), ORIGIN);
    expect(calls).toHaveLength(0);
    expect(result.ok ? "" : (result.error as PipelineError).code).toBe("PARSER_CONFIG_ERROR");
  });

  it("keeps the bearer token out of the request body and off the URL", async () => {
    const { calls } = await withWorker(() => json(FIXTURE));
    expect(calls[0]?.url).not.toContain("test-token");
    expect(String(calls[0]?.init.body)).not.toContain("test-token");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer test-token");
  });
});

describe("GATE 02 — mandatory worker preflight", () => {
  async function runProbe(
    fetcher: (url: string) => Response | Promise<Response>,
  ): Promise<{ code: string | null; calls: Array<{ url: string; init: RequestInit }> }> {
    vi.stubEnv("DEMO_PARSER_URL", FULL);
    vi.stubEnv("DEMO_PARSER_TOKEN", "server-only-token");
    vi.stubEnv("DEMO_PARSER_EXPECTED_REVISION", DEPLOYED_REVISION);
    vi.stubEnv("DEMO_PARSER_REVISION_REQUIRED", "true");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, init });
      return fetcher(url);
    }) as typeof fetch;
    try {
      const { assertParserWorkerReady } = await import("@/lib/pipeline/parser/remoteParser.server");
      const code = await assertParserWorkerReady()
        .then(() => null)
        .catch((error: unknown) => (error instanceof PipelineError ? error.code : String(error)));
      return { code, calls };
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("accepts only the live worker's exact identity and contract", async () => {
    const { code, calls } = await runProbe((url) =>
      url.endsWith("/health")
        ? response({ status: "ok" })
        : response({
            parser: {
              name: PARSER_NAME,
              version: PARSER_VERSION,
              revision: DEPLOYED_REVISION,
            },
            contract_version: PARSER_CONTRACT_VERSION,
          }),
    );
    expect(code).toBeNull();
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/health`, `${ORIGIN}/version`]);
    expect(calls.every((call) => call.init.redirect === "manual")).toBe(true);
  });

  it("blocks before parsing when health fails", async () => {
    const { code, calls } = await runProbe(() => response({ status: "error" }, 503));
    expect(code).toBe("PARSER_UNAVAILABLE");
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/health`]);
    expect(calls[0]?.init.redirect).toBe("manual");
  });

  it("blocks a different deployed revision", async () => {
    const { code } = await runProbe((url) =>
      url.endsWith("/health")
        ? response({ status: "ok" })
        : response({
            parser: {
              name: PARSER_NAME,
              version: PARSER_VERSION,
              revision: "git:62c37147a64c4037f9825253cdb041baafab6fe3",
            },
            contract_version: PARSER_CONTRACT_VERSION,
          }),
    );
    expect(code).toBe("PARSER_IDENTITY_MISMATCH");
  });
});
