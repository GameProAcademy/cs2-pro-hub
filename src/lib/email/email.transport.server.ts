/**
 * FASE 2.5.2C — REAL transactional transport: HOSTINGER MAIL API (SERVER ONLY).
 *
 * Transactional email is sent through the Hostinger Mail API over HTTPS. That is
 * the only production transport: this runtime is Cloudflare Workers, which offers
 * no raw outbound TCP socket, so classic SMTP is not implementable here and no
 * SMTP relay exists in this codebase.
 *
 * Status semantics (see PARTE 8 of the phase brief): Hostinger answers HTTP 202
 * when it ACCEPTS/queues a message. That is reported as `accepted`, never as
 * "delivered" — inbox delivery is not observable from the API response.
 *
 * The token is read from `process.env` inside the send call. It never appears in
 * a log line, in a thrown error, in a response body or in a browser bundle.
 */
import {
  HOSTINGER_MAIL_API_ENDPOINT,
  formatEmailFrom,
  resolveEmailConfig,
  type EmailConfig,
  type EmailSenderIdentity,
} from "./email.config.server";
import type { EmailSendOutcome, EmailTransport, TransactionalEmailMessage } from "./email.provider";

export type { EmailProviderId, EmailSenderIdentity } from "./email.config.server";

const REQUEST_TIMEOUT_MS = 10_000;
/** Never wait longer than this between attempts, whatever `Retry-After` says. */
export const MAX_RETRY_AFTER_SECONDS = 30;

/** 408/425/429 and 5xx are transient. Every other 4xx is a permanent refusal. */
export function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
  }
  const when = Date.parse(value);
  if (Number.isNaN(when)) return null;
  const delta = Math.ceil((when - Date.now()) / 1000);
  if (delta <= 0) return 0;
  return Math.min(delta, MAX_RETRY_AFTER_SECONDS);
}

function messageIdOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["id", "message_id", "messageId"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function hostingerBody(message: TransactionalEmailMessage, sender: EmailSenderIdentity) {
  return {
    from: formatEmailFrom(sender),
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
}

/** Hostinger Mail API transport. HTTPS only, no SMTP, no TCP. */
export function hostingerMailApiTransport(config: EmailConfig): EmailTransport {
  return {
    id: "hostinger",
    async sendTransactionalEmail(message: TransactionalEmailMessage): Promise<EmailSendOutcome> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(HOSTINGER_MAIL_API_ENDPOINT, {
          method: "POST",
          headers: {
            // The token is used here and nowhere else. Only the STATUS is logged.
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(hostingerBody(message, config.sender)),
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            status: "failed",
            reason: `EMAIL_PROVIDER_ERROR_${response.status}`,
            retryable: retryableStatus(response.status),
            retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("Retry-After")),
          };
        }

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        // HTTP 200/202 = ACCEPTED / queued by Hostinger. Not "delivered".
        return { status: "accepted", providerId: "hostinger", messageId: messageIdOf(payload) };
      } catch {
        // A thrown transport error (abort, DNS, TLS) is transient, never success.
        return { status: "failed", reason: "EMAIL_TRANSPORT_ERROR", retryable: true };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface ResolvedEmailProvider {
  provider: EmailTransport | null;
  /** Why no transport is available, for the delivery log. */
  reason: "not_configured" | null;
}

/**
 * Resolves the configured transport, or `null` when transactional email is not
 * configured. There is exactly one production provider (Hostinger) and no
 * cross-provider key fallback.
 */
export function resolveEmailProvider(): ResolvedEmailProvider {
  const config = resolveEmailConfig();
  if (!config) return { provider: null, reason: "not_configured" };
  return { provider: hostingerMailApiTransport(config), reason: null };
}
