/**
 * FASE 2.5.2C — REAL transactional transport: HOSTINGER MAIL API (SERVER ONLY).
 *
 * Transactional email is sent through the Hostinger Mail API over HTTPS. That is
 * the only production transport: this runtime is Cloudflare Workers, which offers
 * no raw outbound TCP socket, so classic SMTP is not implementable here and no
 * SMTP relay exists in this codebase.
 *
 * Contract (official OpenAPI spec v1.3.0, see email.config.server.ts):
 *  1. GET /api/v1/me lists the mailboxes the token may manage. The configured sender
 *     (EMAIL_FROM_EMAIL) must be one of them; otherwise nothing is sent and the outcome
 *     is a permanent `EMAIL_SENDER_NOT_AUTHORIZED` (the token scope must be fixed in the
 *     Hostinger panel; it is never worked around).
 *  2. POST /api/v1/mailboxes/{resourceId}/send with {to[], subject, html, text,
 *     displayName}. HTTP 204 = the provider SENT the message and saved it to INBOX.Sent.
 *     That is reported as `accepted`: inbox delivery at the recipient is not observable.
 *
 * Duplicate protection: a timeout or a 504 means the provider may have sent the message.
 * Those are reported as non-retryable `EMAIL_PROVIDER_OUTCOME_UNKNOWN`, so the automatic
 * retry loop never sends a second copy; a person may resend explicitly.
 *
 * The token is read from `process.env` inside the call. It never appears in a log line,
 * in a thrown error, in a response body or in a browser bundle. Provider error codes are
 * reduced to a safe `ERR_*` token; provider messages are never echoed.
 */
import {
  HOSTINGER_MAIL_API_ME,
  hostingerSendEndpoint,
  resolveEmailConfig,
  type EmailConfig,
} from "./email.config.server";
import type { EmailSendOutcome, EmailTransport, TransactionalEmailMessage } from "./email.provider";

export type { EmailProviderId, EmailSenderIdentity } from "./email.config.server";

const REQUEST_TIMEOUT_MS = 10_000;
/** Mailbox ids are stable; re-check the token scope at most this often per isolate. */
const MAILBOX_CACHE_MS = 10 * 60_000;
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

/** Only a SCREAMING_SNAKE `ERR_*` code from the provider envelope; never its message. */
export async function providerErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { code?: unknown } | null;
    const code = body && typeof body === "object" ? body.code : null;
    return typeof code === "string" && /^ERR_[A-Z0-9_]{1,60}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

async function failure(response: Response): Promise<EmailSendOutcome> {
  const code = await providerErrorCode(response);
  if (response.status === 504) {
    // The provider timed out upstream: the message may or may not have been sent.
    return { status: "failed", reason: "EMAIL_PROVIDER_OUTCOME_UNKNOWN", retryable: false };
  }
  return {
    status: "failed",
    reason: `EMAIL_PROVIDER_ERROR_${response.status}${code ? `_${code}` : ""}`,
    retryable: retryableStatus(response.status),
    retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("Retry-After")),
  };
}

function hostingerBody(message: TransactionalEmailMessage, config: EmailConfig) {
  return {
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(config.sender.name ? { displayName: config.sender.name } : {}),
  };
}

interface MailboxCacheEntry {
  key: string;
  resourceId: string;
  at: number;
}
let mailboxCache: MailboxCacheEntry | null = null;

/** Test hook: forget the cached mailbox resolution. */
export function resetHostingerMailboxCache(): void {
  mailboxCache = null;
}

async function cacheKey(config: EmailConfig): Promise<string> {
  // A digest, so the cache never holds the token itself.
  const bytes = new TextEncoder().encode(`${config.token}\u0000${config.sender.address}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type MailboxResolution =
  { ok: true; resourceId: string } | { ok: false; outcome: EmailSendOutcome };

/** Finds the mailbox resource id of the configured sender among the token's mailboxes. */
export async function resolveSenderMailbox(
  config: EmailConfig,
  signal?: AbortSignal,
): Promise<MailboxResolution> {
  const key = await cacheKey(config);
  if (mailboxCache && mailboxCache.key === key && Date.now() - mailboxCache.at < MAILBOX_CACHE_MS) {
    return { ok: true, resourceId: mailboxCache.resourceId };
  }
  const response = await fetch(HOSTINGER_MAIL_API_ME, {
    method: "GET",
    headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) return { ok: false, outcome: await failure(response) };
  let mailboxes: Array<{ resourceId?: unknown; address?: unknown }> = [];
  try {
    const body = (await response.json()) as { data?: { mailboxes?: unknown } };
    if (Array.isArray(body?.data?.mailboxes)) mailboxes = body.data.mailboxes as typeof mailboxes;
  } catch {
    return {
      ok: false,
      outcome: { status: "failed", reason: "EMAIL_PROVIDER_INVALID_RESPONSE", retryable: true },
    };
  }
  const wanted = config.sender.address.toLowerCase();
  const match = mailboxes.find(
    (m) =>
      typeof m.address === "string" &&
      m.address.toLowerCase() === wanted &&
      typeof m.resourceId === "string" &&
      /^AC[A-Za-z0-9]+$/.test(m.resourceId),
  );
  if (!match) {
    // The token's scope does not include the configured sender. Never fall back to
    // another mailbox: the owner must authorize this sender in the Hostinger panel.
    return {
      ok: false,
      outcome: { status: "failed", reason: "EMAIL_SENDER_NOT_AUTHORIZED", retryable: false },
    };
  }
  mailboxCache = { key, resourceId: match.resourceId as string, at: Date.now() };
  return { ok: true, resourceId: match.resourceId as string };
}

/** Hostinger Mail API transport. HTTPS only, no SMTP, no TCP. */
export function hostingerMailApiTransport(config: EmailConfig): EmailTransport {
  return {
    id: "hostinger",
    async sendTransactionalEmail(message: TransactionalEmailMessage): Promise<EmailSendOutcome> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let sendStarted = false;
      try {
        const mailbox = await resolveSenderMailbox(config, controller.signal);
        if (!mailbox.ok) return mailbox.outcome;

        sendStarted = true;
        const response = await fetch(hostingerSendEndpoint(mailbox.resourceId), {
          method: "POST",
          headers: {
            // The token is used here and nowhere else. Only the STATUS is logged.
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(hostingerBody(message, config)),
          signal: controller.signal,
        });

        if (!response.ok) {
          // A revoked mailbox scope: forget the cached id so the next call re-checks.
          if (response.status === 401 || response.status === 403) mailboxCache = null;
          return failure(response);
        }
        // 204 No Content = sent by the provider (copy in INBOX.Sent). Not "delivered".
        return { status: "accepted", providerId: "hostinger", messageId: null };
      } catch {
        if (sendStarted && controller.signal.aborted) {
          // Timed out after the send request left: the provider may have sent it.
          return { status: "failed", reason: "EMAIL_PROVIDER_OUTCOME_UNKNOWN", retryable: false };
        }
        // A thrown transport error (DNS, TLS, connection) is transient, never success.
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
