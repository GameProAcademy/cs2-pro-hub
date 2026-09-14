import { afterEach, describe, expect, it, vi } from "vitest";

import {
  diagnoseParserConnectivity,
  parserTransportDiagnostic,
  probeParserWorker,
} from "@/lib/pipeline/parser/remoteParser.server";

const CUSTOM = "https://parser.gamepro.network";
const RAILWAY = "https://cs2-demo-parser-production.up.railway.app";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parser connectivity diagnostics", () => {
  it("reduces known transport failures to safe operational codes", () => {
    const error = Object.assign(new TypeError("fetch failed for https://secret.test?a=1"), {
      cause: { code: "ENOTFOUND", message: "host https://secret.test" },
    });
    expect(parserTransportDiagnostic(error)).toBe("ENOTFOUND");
  });

  it("does not echo unknown error content", () => {
    const diagnostic = parserTransportDiagnostic(
      new Error(`failure at https://example.test/path?token=secret ${"x".repeat(500)}`),
    );
    expect(diagnostic).toBe("unknown_transport_error");
    expect(diagnostic.length).toBeLessThanOrEqual(300);
  });

  it("probes health and version independently on both origins without headers", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: String(input), init });
        if (String(input) === `${CUSTOM}/health`) throw new TypeError("fetch failed");
        if (String(input) === `${RAILWAY}/version`) return new Response(null, { status: 503 });
        return new Response("{}", { status: 200 });
      }),
    );

    const result = await diagnoseParserConnectivity();

    expect(calls.map((call) => call.url).sort()).toEqual(
      [CUSTOM, RAILWAY].flatMap((origin) => [`${origin}/health`, `${origin}/version`]).sort(),
    );
    expect(calls.every((call) => call.init.method === "GET" && call.init.headers == null)).toBe(
      true,
    );
    expect(result.customDomain.health).toEqual({
      ok: false,
      status: null,
      diagnostic: "fetch_failed",
    });
    expect(result.customDomain.version.ok).toBe(true);
    expect(result.railwayDomain.version).toEqual({
      ok: false,
      status: 503,
      diagnostic: "http_503",
    });
  });

  it("keeps the preflight fail-closed and exposes a safe transport diagnostic", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("fetch", vi.fn(async () => {
      const error = Object.assign(new TypeError("fetch failed"), {
        cause: { code: "UND_ERR_CONNECT_TIMEOUT" },
      });
      throw error;
    }));

    const result = await probeParserWorker();

    expect(result).toMatchObject({
      endpoint: CUSTOM,
      healthy: false,
      identity: null,
      error: "PARSER_UNAVAILABLE",
      diagnostic: "UND_ERR_CONNECT_TIMEOUT",
    });
  });
});