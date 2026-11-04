/**
 * FASE 2.5.2C — transport contract tests.
 *
 * What is asserted here is honesty, not optimism: HTTP 202 means ACCEPTED, a 4xx
 * is permanent, a 429 is transient and bounded by `Retry-After`, and a missing
 * configuration never activates a provider by accident.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOSTINGER_MAIL_API_ME,
  emailConfigStatus,
  hostingerSendEndpoint,
  resolveEmailConfig,
} from "../email.config.server";
import {
  MAX_RETRY_AFTER_SECONDS,
  hostingerMailApiTransport,
  parseRetryAfterSeconds,
  resetHostingerMailboxCache,
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
  sender: { address: "hub@gamepro.academy", name: "GamePro" },
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
    process.env["EMAIL_FROM_EMAIL"] = "hub@gamepro.academy";
    expect(resolveEmailConfig()).toBeNull();
  });

  it("refuses an unknown provider instead of guessing", () => {
    process.env["EMAIL_PROVIDER"] = "smtp";
    process.env["HOSTINGER_MAIL_API_TOKEN"] = "t";
    process.env["EMAIL_FROM_EMAIL"] = "hub@gamepro.academy";
    expect(resolveEmailConfig()).toBeNull();
    expect(emailConfigStatus().provider).toBe("none");
  });

  it("resolves Hostinger when token and sender are present", () => {
    process.env["EMAIL_PROVIDER"] = "hostinger";
    process.env["HOSTINGER_MAIL_API_TOKEN"] = "t";
    process.env["EMAIL_FROM_EMAIL"] = "hub@gamepro.academy";
    process.env["EMAIL_FROM_NAME"] = "GamePro";
    expect(resolveEmailConfig()?.provider).toBe("hostinger");
    expect(resolveEmailProvider().provider?.id).toBe("hostinger");
    const status = emailConfigStatus();
    expect(status.state).toBe("configured");
    expect(status.senderAddress).toBe("hub@gamepro.academy");
  });

  it("exposes booleans only — never the token", () => {
    process.env["EMAIL_PROVIDER"] = "hostinger";
    process.env["HOSTINGER_MAIL_API_TOKEN"] = "super-secret";
    process.env["EMAIL_FROM_EMAIL"] = "hub@gamepro.academy";
    expect(JSON.stringify(emailConfigStatus())).not.toContain("super-secret");
  });
});

const ME = "https://api.mail.hostinger.com/api/v1/me";
const SEND = "https://api.mail.hostinger.com/api/v1/mailboxes/ACsupport123/send";
const ME_BODY = {
  data: {
    orderResourceId: "OR1",
    mailboxes: [
      { resourceId: "ACbug456", address: "bug@gamepro.academy" },
      { resourceId: "ACsupport123", address: "hub@gamepro.academy" },
    ],
  },
};

/** Routes /me and /send separately; the send handler decides the send outcome. */
function hostinger(
  send: (init: RequestInit) => Response | Promise<Response>,
  me = () => response(200, ME_BODY),
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === ME) return me();
    if (url === SEND) return send(init);
    return response(404, { error: "x", code: "ERR_NOT_FOUND" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("hostinger transport (official contract: /api/v1/me + /api/v1/mailboxes/{id}/send)", () => {
  beforeEach(() => resetHostingerMailboxCache());

  it("reports ACCEPTED on 204 No Content and never claims delivery", async () => {
    const calls = hostinger(() => response(204, null));
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({ status: "accepted", providerId: "hostinger", messageId: null });
    expect(calls.map((c) => c.url)).toEqual([ME, SEND]);
  });

  it("sends the official payload: to[], subject, html, text, displayName — no from", async () => {
    const calls = hostinger(() => response(204, null));
    await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    const body = JSON.parse(String(calls[1]?.init.body));
    expect(body).toEqual({
      to: ["player@example.com"],
      subject: "Steam",
      html: "<p>ok</p>",
      text: "ok",
      displayName: "GamePro",
    });
    expect(body).not.toHaveProperty("from");
    expect(calls[1]?.init.method).toBe("POST");
  });

  it("uses the mailbox of the configured sender, never another mailbox of the token", async () => {
    const calls = hostinger(() => response(204, null));
    await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(calls[1]?.url).toBe(SEND);
    expect(calls.some((c) => c.url.includes("ACbug456"))).toBe(false);
  });

  it("refuses to send when the token is not scoped to the sender (no fallback)", async () => {
    const calls = hostinger(
      () => response(204, null),
      () =>
        response(200, {
          data: {
            orderResourceId: "OR1",
            mailboxes: [{ resourceId: "ACbug456", address: "bug@gamepro.academy" }],
          },
        }),
    );
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({
      status: "failed",
      reason: "EMAIL_SENDER_NOT_AUTHORIZED",
      retryable: false,
    });
    expect(calls.map((c) => c.url)).toEqual([ME]);
  });

  it("matches the sender address case-insensitively and caches the mailbox id", async () => {
    const calls = hostinger(() => response(204, null));
    const upper = { ...config, sender: { ...config.sender, address: "HUB@gamepro.academy" } };
    await hostingerMailApiTransport(upper).sendTransactionalEmail(message);
    await hostingerMailApiTransport(upper).sendTransactionalEmail(message);
    expect(calls.filter((c) => c.url === ME)).toHaveLength(1);
    expect(calls.filter((c) => c.url === SEND)).toHaveLength(2);
  });

  it("sends the token in the Authorization header only", async () => {
    const calls = hostinger(() => response(204, null));
    await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer secret-token",
      );
      expect(String(call.init.body ?? "")).not.toContain("secret-token");
      expect(call.url).not.toContain("secret-token");
    }
  });

  it("401 invalid token: permanent, with the provider code only", async () => {
    hostinger(
      () => response(204, null),
      () => response(401, { error: "Missing or invalid credentials.", code: "ERR_UNAUTHORIZED" }),
    );
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({
      status: "failed",
      reason: "EMAIL_PROVIDER_ERROR_401_ERR_UNAUTHORIZED",
      retryable: false,
      retryAfterSeconds: null,
    });
  });

  it("403 mailbox not authorized: permanent, and the cached mailbox is forgotten", async () => {
    const calls = hostinger(() => response(403, { error: "Forbidden.", code: "ERR_FORBIDDEN" }));
    const first = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(first).toMatchObject({
      reason: "EMAIL_PROVIDER_ERROR_403_ERR_FORBIDDEN",
      retryable: false,
    });
    await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(calls.filter((c) => c.url === ME)).toHaveLength(2);
  });

  it("422 invalid payload/recipient: permanent, provider message never echoed", async () => {
    hostinger(() =>
      response(422, {
        error: "player@example.com is invalid",
        code: "ERR_VALIDATION_FAILED",
        params: { to: ["player@example.com is invalid"] },
      }),
    );
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toMatchObject({
      reason: "EMAIL_PROVIDER_ERROR_422_ERR_VALIDATION_FAILED",
      retryable: false,
    });
    expect(JSON.stringify(outcome)).not.toContain("player@example.com");
  });

  it("ignores a malformed provider code instead of echoing it", async () => {
    hostinger(() => response(400, { code: "<script>secret-token</script>" }));
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toMatchObject({ reason: "EMAIL_PROVIDER_ERROR_400", retryable: false });
  });

  it("429 is transient and reads Retry-After", async () => {
    hostinger(() => response(429, {}, { "Retry-After": "7" }));
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toMatchObject({ retryable: true, retryAfterSeconds: 7 });
  });

  it("500/502 are transient", async () => {
    for (const status of [500, 502]) {
      resetHostingerMailboxCache();
      hostinger(() => response(status, { error: "x", code: "ERR_INTERNAL_SERVER_ERROR" }));
      const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
      expect(outcome).toMatchObject({ retryable: true });
    }
  });

  it("504 on send: outcome unknown, NOT retried automatically (no duplicate email)", async () => {
    hostinger(() => response(504, { error: "x", code: "ERR_GATEWAY_TIMEOUT" }));
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({
      status: "failed",
      reason: "EMAIL_PROVIDER_OUTCOME_UNKNOWN",
      retryable: false,
    });
  });

  it("timeout after the send left: outcome unknown, not retried", async () => {
    vi.useFakeTimers();
    try {
      hostinger(
        (init) =>
          new Promise<Response>((_, reject) => {
            const abort = () => reject(new DOMException("aborted", "AbortError"));
            if (init.signal?.aborted) abort();
            init.signal?.addEventListener("abort", abort);
          }),
      );
      const pending = hostingerMailApiTransport(config).sendTransactionalEmail(message);
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await pending).toEqual({
        status: "failed",
        reason: "EMAIL_PROVIDER_OUTCOME_UNKNOWN",
        retryable: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("API unavailable (network error before sending): transient, never a success", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network down");
    });
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({ status: "failed", reason: "EMAIL_TRANSPORT_ERROR", retryable: true });
  });

  it("an invalid /me body is a transient provider failure", async () => {
    hostinger(
      () => response(204, null),
      () => new Response("not json", { status: 200 }),
    );
    const outcome = await hostingerMailApiTransport(config).sendTransactionalEmail(message);
    expect(outcome).toEqual({
      status: "failed",
      reason: "EMAIL_PROVIDER_INVALID_RESPONSE",
      retryable: true,
    });
  });

  it("the endpoint is the official one, not the legacy /v1/emails", () => {
    expect(hostingerSendEndpoint("ACx")).toBe(
      "https://api.mail.hostinger.com/api/v1/mailboxes/ACx/send",
    );
    expect(HOSTINGER_MAIL_API_ME).toBe("https://api.mail.hostinger.com/api/v1/me");
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
