import { describe, expect, it } from "vitest";

import {
  accessStatusToErrorCode,
  classifyGamersClubResponse,
  recordGamersClubProbe,
} from "../gamersclub.access";
import { getGamersClubProvider } from "../gamersclub.provider";
import { GamersClubError, safeGamersClubStep } from "../gamersclub.errors";

describe("gamers club access classification", () => {
  it("classifies a Cloudflare challenge as blocked, NEVER as not_found", () => {
    const status = classifyGamersClubResponse({
      status: 403,
      headers: { "cf-mitigated": "challenge", server: "cloudflare" },
      bodySample: "<title>Just a moment...</title>",
    });
    expect(status).toBe("blocked_external_access");
    expect(accessStatusToErrorCode(status)).toBe("GC_BLOCKED_EXTERNAL_ACCESS");
  });

  it("classifies a plain 403 as blocked", () => {
    expect(classifyGamersClubResponse({ status: 403 })).toBe("blocked_external_access");
  });

  it("classifies 404 as not_found", () => {
    expect(classifyGamersClubResponse({ status: 404 })).toBe("not_found");
  });

  it("classifies 429 as rate_limited, unless it is a challenge", () => {
    expect(classifyGamersClubResponse({ status: 429 })).toBe("rate_limited");
    expect(
      classifyGamersClubResponse({ status: 429, headers: { "cf-mitigated": "challenge" } }),
    ).toBe("blocked_external_access");
  });

  it("classifies timeouts, invalid responses and server errors", () => {
    expect(classifyGamersClubResponse({ status: 504 })).toBe("timeout");
    expect(classifyGamersClubResponse({ status: 422 })).toBe("invalid_response");
    expect(classifyGamersClubResponse({ status: 500 })).toBe("unknown_error");
    expect(classifyGamersClubResponse({ status: 200 })).toBe("available");
  });

  it("records a sanitized probe and drops a malformed request id", () => {
    const probe = recordGamersClubProbe({
      operation: "getProfile",
      facts: { status: 403, headers: { "cf-mitigated": "challenge" } },
      latencyMs: 120,
      requestId: "bad id with spaces and a very long tail".repeat(4),
    });
    expect(probe.status).toBe("blocked_external_access");
    expect(probe.httpStatus).toBe(403);
    expect(probe.requestId).toBeNull();
    expect(probe.errorCode).toBe("GC_BLOCKED_EXTERNAL_ACCESS");
    expect(JSON.stringify(probe)).not.toMatch(/cookie|token|authorization/i);
  });
});

describe("gamers club provider", () => {
  it("returns a structured block for every operation and performs no request", async () => {
    const provider = getGamersClubProvider();
    expect(await provider.accessStatus()).toBe("blocked_external_access");
    for (const result of [
      await provider.getProfile({ profile: null as never }),
      await provider.getMatchHistory({ profile: null as never }),
      await provider.getPlayerStats({ profile: null as never }),
      await provider.getMatchDetails({ profile: null as never, sourceMatchId: "x" }),
    ]) {
      expect(result.status).toBe("blocked_external_access");
      expect(result.data).toBeNull();
      expect(result.metadata.errorCode).toBe("GC_BLOCKED_EXTERNAL_ACCESS");
      expect(result.metadata.source).toBe("gamers_club");
      expect(result.metadata.provenance).toBe("public_profile");
    }
  });
});

describe("control errors are never swallowed", () => {
  it("rethrows deadline and budget errors from a safe step", async () => {
    for (const code of [
      "GC_WORKER_DEADLINE_EXCEEDED",
      "GC_API_BUDGET_EXHAUSTED",
      "GC_CANCELLED",
    ] as const) {
      await expect(
        safeGamersClubStep(() => Promise.reject(new GamersClubError(code)), "fallback"),
      ).rejects.toThrow(code);
    }
  });

  it("still absorbs an ordinary source failure", async () => {
    await expect(
      safeGamersClubStep(() => Promise.reject(new GamersClubError("GC_INVALID_RESPONSE")), "fb"),
    ).resolves.toBe("fb");
  });
});
