/**
 * FASE 2.5.2 — REAL transactional transport (SERVER ONLY).
 *
 * Runtime reality check, done before writing a line of transport code: this app
 * runs on Cloudflare Workers. Workers cannot open an arbitrary outbound TCP
 * socket to port 25/465/587, so `nodemailer` and any classic SMTP client cannot
 * work here — and pretending otherwise would produce an integration that fails
 * silently in production. Therefore:
 *
 *   - the effective transport is the provider's official HTTPS API;
 *   - `EMAIL_PROVIDER=smtp` is accepted as configuration, but reported as
 *     `EMAIL_TRANSPORT_UNSUPPORTED` (a hard, non-retryable failure) instead of
 *     being faked;
 *   - the `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` values are reused as the sender
 *     identity regardless of provider, so operators configure one set of names.
 *
 * Secrets are read from `process.env` INSIDE the send call, never at module
 * scope, never returned to a caller, never logged.
 */
import type { EmailProvider, EmailSendOutcome, TransactionalEmailMessage } from "./email.provider";

export type EmailProviderId = "noop" | "resend" | "sendgrid" | "smtp";

function env(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface EmailSenderIdentity {
  address: string;
  name: string | null;
}

function senderIdentity(): EmailSenderIdentity | null {
  const address = env("SMTP_FROM_EMAIL");
  if (!address || !address.includes("@")) return null;
  return { address, name: env("SMTP_FROM_NAME") };
}

function formatFrom({ address, name }: EmailSenderIdentity): string {
  return name ? `${name} <${address}>` : address;
}

/** 4xx from a provider is a permanent refusal; 429/5xx/timeouts are retryable. */
function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function postJson(
  url: string,
  token: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        // The token never appears in a log line; only the status does.
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timer);
  }
}

function messageIdOf(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Resend — HTTPS API, Workers-compatible. */
function resendProvider(apiKey: string, sender: EmailSenderIdentity): EmailProvider {
  return {
    id: "resend",
    async sendTransactionalEmail(message: TransactionalEmailMessage): Promise<EmailSendOutcome> {
      const result = await postJson("https://api.resend.com/emails", apiKey, {
        from: formatFrom(sender),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: { "X-Entity-Ref-ID": message.idempotencyKey },
      });
      if (!result.ok) {
        return {
          status: "failed",
          reason: `EMAIL_PROVIDER_ERROR_${result.status}`,
          retryable: retryableStatus(result.status),
        };
      }
      // Only an accepted request counts as sent. "Queued by us" never does.
      return { status: "sent", providerId: "resend", messageId: messageIdOf(result.payload, "id") };
    },
  };
}

/** SendGrid — HTTPS API, Workers-compatible. */
function sendgridProvider(apiKey: string, sender: EmailSenderIdentity): EmailProvider {
  return {
    id: "sendgrid",
    async sendTransactionalEmail(message: TransactionalEmailMessage): Promise<EmailSendOutcome> {
      const result = await postJson("https://api.sendgrid.com/v3/mail/send", apiKey, {
        personalizations: [{ to: [{ email: message.to }] }],
        from: sender.name
          ? { email: sender.address, name: sender.name }
          : { email: sender.address },
        subject: message.subject,
        content: [
          { type: "text/plain", value: message.text },
          { type: "text/html", value: message.html },
        ],
        custom_args: { idempotency_key: message.idempotencyKey },
      });
      if (!result.ok) {
        return {
          status: "failed",
          reason: `EMAIL_PROVIDER_ERROR_${result.status}`,
          retryable: retryableStatus(result.status),
        };
      }
      return { status: "sent", providerId: "sendgrid", messageId: null };
    },
  };
}

/**
 * Configured SMTP, honestly refused. Classic SMTP needs raw TCP, which this
 * runtime does not offer; the operator must pick the provider's HTTPS API.
 */
const smtpUnsupportedProvider: EmailProvider = {
  id: "smtp",
  async sendTransactionalEmail() {
    return { status: "failed", reason: "EMAIL_TRANSPORT_UNSUPPORTED", retryable: false };
  },
};

export interface ResolvedEmailProvider {
  provider: EmailProvider | null;
  /** Why no provider is available, for the delivery log. */
  reason: "not_configured" | null;
}

/**
 * Reads the operator configuration and returns a provider, or `null` when
 * nothing is configured. Never guesses, never falls back to a different
 * provider than the one requested.
 */
export function resolveEmailProvider(): ResolvedEmailProvider {
  const requested = (env("EMAIL_PROVIDER") ?? "").toLowerCase() as EmailProviderId | "";
  const sender = senderIdentity();

  if (requested === "" || requested === "noop") return { provider: null, reason: "not_configured" };
  if (!sender) return { provider: null, reason: "not_configured" };

  if (requested === "smtp") return { provider: smtpUnsupportedProvider, reason: null };

  if (requested === "resend") {
    const key = env("RESEND_API_KEY") ?? env("SMTP_PASSWORD");
    if (!key) return { provider: null, reason: "not_configured" };
    return { provider: resendProvider(key, sender), reason: null };
  }

  if (requested === "sendgrid") {
    const key = env("SENDGRID_API_KEY") ?? env("SMTP_PASSWORD");
    if (!key) return { provider: null, reason: "not_configured" };
    return { provider: sendgridProvider(key, sender), reason: null };
  }

  return { provider: null, reason: "not_configured" };
}
