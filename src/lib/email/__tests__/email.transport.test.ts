/**
 * FASE 2.5.2C — transport contract tests.
 *
 * What is asserted here is honesty, not optimism: HTTP 202 means ACCEPTED, a 4xx
 * is permanent, a 429 is transient and bounded by `Retry-After`, and a missing
 * configuration never activates a provider by accident.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { emailConfigStatus, resolveEmailConfig } from "../email.config.server";
import {
  MAX_RETRY_AFTER_SECONDS,
  hostingerMailApiTransport,
  parseRetryAfterSeconds,
  resolveEmailProvider,
  retryableStatus,
} from "../email.transport.server";
import { attemptDelivery, backoffFor } from "../email.dispatch.server";

const message = {
  to: "player@example.com",
  subject: "Steam",
  html: "<p>ok</p>",
  text: "ok",
  idempotencyKey: "k-1",
  kind: "steam_linked" as const,
};

const config = {
  provider: "hostinger" as const,
  token: "secret-token",
  sender: { address: "no-reply@gamepro.academy", name: "GamePro" },
};

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["EMAIL_PROVIDER"];
  delete process.env["HOSTINGER_MAIL_API_TOKEN"];
  delete process.env["EMAIL_FROM_EMAIL"];
  delete process.env["EMAIL_FROM_NAME"];
});

describe("email configuration", () => {
  it("is not configured when the operator set nothing", () => {
    expect(resolveEmailConfig()).toBeNull();
    expect(emailConfigStatus().state).toBe("not_configured");
    expect(resolveEmailProvider()).toEqual({ provider: null, reason: "not_configured" });
  });

  it("never activates a provider with a token but no sender", () => {
    process.env["EMAIL_PROVIDER"] = "hostinger";
    process.env["HOSTINGER_MAIL_API_TOKEN"] = "t";
    expect(resolveEmailConfig()).toBeNull();
    const status = emailConfigStatus();
    expect(status.tokenConfigured).toBe(true);
    expect(status.senderConfigured).toBe(false);
    expect(status.state).toBe("not_configured");
  });

  it("never activates a provider with a sender but no token", () => {
    process.env["EMAIL_PROVIDER"] = "hostinger";
    process.env["EMAIL_FROM_EMAIL"] = "no-reply@gamepro.academy";
    expect(resolveEmailConfig()).toBeNull();
  });

  it("refuses an unknown provider instead of guessing", () => {
    process.env["EMAIL_PROVIDER"] = "smtp";
    process.env["HOSTINGER_MAIL_API_TOKEN"] = "t";
    process.env["EMAIL_FROM_EMAIL"] = "no-reply@gamepro.academy";
    expect(resolveEmailConfig()).toBeNull();
    expect(emailConfigStatus().provider).toBe("none");
  });

  it("resolves Hostinger when token and sender are present", () => {
    process.env["EMAIL_PROVIDER"] = "hostinger";
    process.env["HOSTINGER_MAIL_API_TOKEN"] = "t";
    process.env["EMAIL_FROM_EMAIL"] = "no-reply@gamepro.academy";
    process.env["EMAIL_FROM_NAME"] = "GamePro";
    expect(resolveEmailConfig()?.provider).toBe("hostinger");
    expect(resolveEmailProvider().provider?.id).toBe("hostinger");
    const status = emailConfigStatus();
    expect(status.state).toBe("configured");
    expect(status.senderAddress).toBe("no-reply@gamepro.academy");
  });

  it("exposes booleans only — never the token", () => {
    process.env["EMAIL_PROVIDER"] = "hostinger";
    process.env["HOSTINGER_MAIL_API_TOKEN"] = "super-secret";
    process.env["EMAIL_FROM_EMAIL"] = "no-reply@gamepro.academy";
    expect(JSON.stringify(emailConfigStatus())).not.toContain("super-secret");
  });
});

describe("hostinger transport", () => {
  it("reports ACCEPTED on 202 and never claims delivery", async () => {
    const fetchMock = vi.fn(async () => response(202, { id: "msg-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({ status: "accepted", providerId: "hostinger", messageId: "msg-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the token in the Authorization header only", async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return response(202, {});
    });
    await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    const init = calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret-token");
    expect(String(init.body)).not.toContain("secret-token");
  });

  it("treats a 4xx as a PERMANENT refusal", async () => {
    vi.stubGlobal("fetch", async () => response(422, { error: "bad" }));
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({
      status: "failed",
      reason: "EMAIL_PROVIDER_ERROR_422",
      retryable: false,
      retryAfterSeconds: null,
    });
  });

  it("treats a 429 as transient and reads Retry-After", async () => {
    vi.stubGlobal("fetch", async () => response(429, {}, { "Retry-After": "7" }));
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toMatchObject({ retryable: true, retryAfterSeconds: 7 });
  });

  it("treats a 5xx as transient", async () => {
    vi.stubGlobal("fetch", async () => response(503, {}));
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toMatchObject({ retryable: true, reason: "EMAIL_PROVIDER_ERROR_503" });
  });

  it("turns a thrown network error into a transient failure, never a success", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network down");
    });
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({
      status: "failed",
      reason: "EMAIL_TRANSPORT_ERROR",
      retryable: true,
    });
  });

  it("never leaks the recipient body into the log-safe reason", async () => {
    vi.stubGlobal("fetch", async () => response(400, { error: "player@example.com is invalid" }));
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(JSON.stringify(outcome)).not.toContain("player@example.com");
  });
});

describe("retry policy", () => {
  it("classifies statuses", () => {
    expect(retryableStatus(408)).toBe(true);
    expect(retryableStatus(425)).toBe(true);
    expect(retryableStatus(429)).toBe(true);
    expect(retryableStatus(500)).toBe(true);
    expect(retryableStatus(400)).toBe(false);
    expect(retryableStatus(401)).toBe(false);
    expect(retryableStatus(422)).toBe(false);
  });

  it("caps Retry-After and understands both formats", () => {
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("3")).toBe(3);
    expect(parseRetryAfterSeconds("9999")).toBe(MAX_RETRY_AFTER_SECONDS);
    expect(parseRetryAfterSeconds(new Date(Date.now() - 5000).toUTCString())).toBe(0);
    expect(parseRetryAfterSeconds("not-a-date")).toBeNull();
  });

  it("honours Retry-After over exponential backoff", () => {
    expect(backoffFor(1, 5)).toBe(5000);
    expect(backoffFor(1, null)).toBeGreaterThanOrEqual(250);
    expect(backoffFor(3, null)).toBeGreaterThanOrEqual(1000);
  });

  it("waits the provider-requested delay between attempts", async () => {
    const waits: number[] = [];
    let calls = 0;
    const outcome = await attemptDelivery(
      {
        id: "test",
        async sendTransactionalEmail() {
          calls += 1;
          return {
            status: "failed",
            reason: "EMAIL_PROVIDER_ERROR_429",
            retryable: true,
            retryAfterSeconds: 2,
          };
        },
      },
      message,
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(calls).toBe(3);
    expect(waits).toEqual([2000, 2000]);
    expect(outcome.outcome.status).toBe("failed");
  });
});
