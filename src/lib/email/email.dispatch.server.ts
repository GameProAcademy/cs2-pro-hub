/**
 * FASE 2.5.2 — transactional email DISPATCH (SERVER ONLY).
 *
 * One entry point for the whole product: `sendTransactionalEmail`. It owns
 * PERSISTENT idempotency, bounded retry with exponential backoff + jitter, the
 * delivery log and structured observability, then delegates the actual delivery
 * to an `EmailProvider` (HTTPS transport — see `email.transport.server.ts`).
 *
 * Honesty rules encoded here:
 *  - With no provider configured the call resolves `skipped / not_configured`.
 *    It never claims a delivery that did not happen.
 *  - `sent` is returned only after the provider ACCEPTED the message. "Queued
 *    locally" is never `sent`.
 *  - A delivery failure never fails the feature that triggered it: linking a
 *    Steam account must not break because an email could not go out.
 *  - Idempotency lives in the database (`email_delivery_logs.idempotency_key` is
 *    UNIQUE), so it survives a worker restart, a deploy and multiple instances.
 *  - Logs carry the kind, the idempotency key, the outcome and a MASKED
 *    address. Never a body, never a token, never a full SteamID64.
 */
import {
  maskEmailAddress,
  type EmailSendOutcome,
  type EmailProvider,
  type TransactionalEmailMessage,
} from "./email.provider";
import { resolveEmailProvider } from "./email.transport.server";

/** Retry ceiling for a retryable provider failure. */
export const MAX_EMAIL_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter, so parallel retries do not synchronise. */
function backoffFor(attempt: number): number {
  const base = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * BASE_BACKOFF_MS);
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const UNIQUE_VIOLATION = "23505";

export interface DispatchOptions {
  /** Injected in tests; production resolves from the environment. */
  provider?: EmailProvider | null;
  /** Skip the database log (used by unit tests of the retry logic only). */
  persist?: boolean;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Attempts a delivery with retry. Pure with respect to the database: the caller
 * owns the delivery log row.
 */
export async function attemptDelivery(
  provider: EmailProvider,
  message: TransactionalEmailMessage,
  sleepImpl: (ms: number) => Promise<void> = sleep,
): Promise<{ outcome: EmailSendOutcome; attempts: number }> {
  let lastFailure: EmailSendOutcome = {
    status: "failed",
    reason: "EMAIL_NOT_ATTEMPTED",
    retryable: false,
  };

  for (let attempt = 1; attempt <= MAX_EMAIL_ATTEMPTS; attempt += 1) {
    let outcome: EmailSendOutcome;
    try {
      outcome = await provider.sendTransactionalEmail(message);
    } catch {
      // A thrown transport error is a temporary condition, never a success.
      outcome = { status: "failed", reason: "EMAIL_PROVIDER_ERROR", retryable: true };
    }

    console.info(
      `[email] kind=${message.kind} provider=${provider.id} attempt=${attempt}` +
        ` outcome=${outcome.status} to=${maskEmailAddress(message.to)}` +
        ` idempotency=${message.idempotencyKey}`,
    );

    if (outcome.status !== "failed" || !outcome.retryable) return { outcome, attempts: attempt };

    lastFailure = outcome;
    if (attempt < MAX_EMAIL_ATTEMPTS) await sleepImpl(backoffFor(attempt));
  }

  return { outcome: lastFailure, attempts: MAX_EMAIL_ATTEMPTS };
}

/** Process-local ledger; see the comment at its single use site. */
const deliveredKeys = new Set<string>();

export async function sendTransactionalEmail(
  message: TransactionalEmailMessage,
  options: DispatchOptions = {},
): Promise<EmailSendOutcome> {
  const resolved =
    options.provider !== undefined
      ? { provider: options.provider, reason: "not_configured" as const }
      : resolveEmailProvider();
  const persist = options.persist ?? true;

  // First layer: same-isolate duplicate (a retried request). The authoritative
  // layer is the UNIQUE index below, which survives a restart.
  if (deliveredKeys.has(message.idempotencyKey)) {
    return { status: "skipped", reason: "duplicate" };
  }

  let logId: string | null = null;

  if (persist) {
    const supabase = await db();
    const insert = await supabase
      .from("email_delivery_logs")
      .insert({
        user_id: message.userId ?? null,
        kind: message.kind,
        recipient: message.to,
        locale: message.locale ?? "pt-BR",
        subject: message.subject,
        provider: resolved.provider?.id ?? "none",
        idempotency_key: message.idempotencyKey,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (insert.error) {
      // UNIQUE(idempotency_key): this exact notice was already handled.
      if ((insert.error as { code?: string }).code === UNIQUE_VIOLATION) {
        console.info(
          `[email] duplicate kind=${message.kind} idempotency=${message.idempotencyKey}`,
        );
        return { status: "skipped", reason: "duplicate" };
      }
      // The log is not a reason to lose the notice, but we cannot claim a send.
      console.warn(`[email] log_unavailable kind=${message.kind}`);
    } else {
      logId = insert.data?.id ?? null;
    }
  }

  const finish = async (
    outcome: EmailSendOutcome,
    attempts: number,
    providerId: string,
  ): Promise<EmailSendOutcome> => {
    if (!logId) return outcome;
    const supabase = await db();
    await supabase
      .from("email_delivery_logs")
      .update({
        status: outcome.status === "sent" ? "sent" : outcome.status,
        provider: providerId,
        provider_message_id: outcome.status === "sent" ? outcome.messageId : null,
        attempt_count: attempts,
        last_error: outcome.status === "failed" ? outcome.reason : null,
        sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", logId);
    return outcome;
  };

  if (!resolved.provider) {
    console.info(`[email] not_configured kind=${message.kind}`);
    return finish({ status: "skipped", reason: "not_configured" }, 0, "none");
  }

  const { outcome, attempts } = await attemptDelivery(
    resolved.provider,
    message,
    options.sleepImpl ?? sleep,
  );
  if (outcome.status === "sent") deliveredKeys.add(message.idempotencyKey);
  return finish(outcome, attempts, resolved.provider.id);
}
