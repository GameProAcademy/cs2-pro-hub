/**
 * FASE 2.5.1 — transactional email PROVIDER ABSTRACTION.
 *
 * Rendering (`email.templates.ts`) and delivery are separate concerns on
 * purpose: the templates are pure functions with no I/O, and delivery goes
 * through this single interface. Swapping the operator's provider must never
 * require touching a template or a feature.
 *
 * Nothing here reads a secret. `email.dispatch.server.ts` resolves the concrete
 * provider on the server, inside a handler, and is the only module allowed to
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
  /** Accepted by the provider. */
  | { status: "sent"; providerId: string; messageId: string | null }
  /** Deliberately not sent (no provider configured, or duplicate). */
  | { status: "skipped"; reason: "not_configured" | "duplicate" }
  /** Provider refused; `retryable` decides whether the caller may try again. */
  | { status: "failed"; reason: string; retryable: boolean };

export interface EmailProvider {
  /** Stable identifier used in logs; never a secret. */
  readonly id: string;
  sendTransactionalEmail(message: TransactionalEmailMessage): Promise<EmailSendOutcome>;
}

/**
 * The default provider when the operator configured nothing. It is honest: it
 * reports `not_configured` instead of pretending a message was delivered, and it
 * logs metadata only — never a body, never an address in full.
 */
export const noopEmailProvider: EmailProvider = {
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
