/**
 * FASE 2.5.1 / 2.5.2C — transactional email TRANSPORT ABSTRACTION.
 *
 * Rendering (`email.templates.ts`) and delivery are separate concerns on
 * purpose: the templates are pure functions with no I/O, and delivery goes
 * through this single interface. Swapping the operator's provider must never
 * require touching a template or a feature.
 *
 * Nothing here reads a secret. `email.config.server.ts` resolves the concrete
 * transport on the server, inside a handler, and is the only module allowed to
 * touch the environment.
 */

export type TransactionalEmailKind = "steam_linked" | "steam_unlinked" | "security_notice";

export interface TransactionalEmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Always present: every message carries a plain-text alternative. */
  text: string;
  /** Stable key so a retry can never deliver the same notice twice. */
  idempotencyKey: string;
  kind: TransactionalEmailKind;
  /** Owner of the notice, for the delivery log. Never used for delivery. */
  userId?: string | null;
  /** Language the message was rendered in (see `resolveEmailLocale`). */
  locale?: string;
}

export type EmailSendOutcome =
  /**
   * ACCEPTED BY THE PROVIDER — nothing more. Hostinger answers HTTP 202, which
   * means the message was queued by the mail service. It is NOT proof that the
   * message reached the recipient's inbox, and no UI copy may claim delivery.
   */
  | { status: "accepted"; providerId: string; messageId: string | null }
  /** Deliberately not sent (no transport configured, duplicate, or in flight). */
  | { status: "skipped"; reason: "not_configured" | "duplicate" | "in_progress" }
  /** Provider refused; `retryable` decides whether the caller may try again. */
  | {
      status: "failed";
      reason: string;
      retryable: boolean;
      /** From `Retry-After`, when the provider supplied one. */
      retryAfterSeconds?: number | null;
    };

export interface EmailTransport {
  /** Stable identifier used in logs; never a secret. */
  readonly id: string;
  sendTransactionalEmail(message: TransactionalEmailMessage): Promise<EmailSendOutcome>;
}

/** Historical name kept so existing imports and tests keep compiling. */
export type EmailProvider = EmailTransport;

/**
 * The default transport when the operator configured nothing. It is honest: it
 * reports `not_configured` instead of pretending a message was delivered, and it
 * logs metadata only — never a body, never an address in full.
 */
export const noopEmailProvider: EmailTransport = {
  id: "noop",
  async sendTransactionalEmail(message) {
    console.info(
      `[email] not_configured kind=${message.kind} idempotency=${message.idempotencyKey}`,
    );
    return { status: "skipped", reason: "not_configured" };
  },
};

/** Masks an address for logs: `j***@example.com`. */
export function maskEmailAddress(address: string): string {
  const at = address.indexOf("@");
  if (at <= 0) return "***";
  const first = address[0] ?? "*";
  return `${first}***${address.slice(at)}`;
}
