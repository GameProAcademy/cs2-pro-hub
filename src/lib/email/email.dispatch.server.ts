/**
 * FASE 2.5.1 — transactional email DISPATCH (SERVER ONLY).
 *
 * One entry point for the whole product: `sendTransactionalEmail`. It applies
 * idempotency, bounded retry with backoff and structured observability, then
 * delegates the actual delivery to an `EmailProvider`.
 *
 * Honesty rules encoded here:
 *  - With no provider configured the call resolves `skipped / not_configured`.
 *    It never claims a delivery that did not happen, and it never fails the
 *    feature that triggered it (linking a Steam account must not break because
 *    an email could not go out).
 *  - Logs carry the kind, the idempotency key, the outcome and a MASKED
 *    address. Never a body, never a token, never a full SteamID64 (templates
 *    already receive it masked).
 */
import {
  maskEmailAddress,
  noopEmailProvider,
  type EmailProvider,
  type EmailSendOutcome,
  type TransactionalEmailMessage,
} from "./email.provider";

/** Retry ceiling for a retryable provider failure. */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [250, 1000];

/**
 * Process-local idempotency ledger. It stops the obvious duplicate (a retried
 * request inside the same instance). Cross-instance idempotency is delegated to
 * the provider through the `idempotencyKey` we always send.
 */
const delivered = new Set<string>();

function resolveProvider(): EmailProvider {
  // No provider is configured for this project yet: there is no delivery
  // credential in the environment, so the honest answer is the noop provider.
  // A future provider is registered HERE, and nowhere else.
  return noopEmailProvider;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTransactionalEmail(
  message: TransactionalEmailMessage,
  provider: EmailProvider = resolveProvider(),
): Promise<EmailSendOutcome> {
  if (delivered.has(message.idempotencyKey)) {
    return { status: "skipped", reason: "duplicate" };
  }

  let lastFailure: EmailSendOutcome = {
    status: "failed",
    reason: "EMAIL_NOT_ATTEMPTED",
    retryable: false,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let outcome: EmailSendOutcome;
    try {
      outcome = await provider.sendTransactionalEmail(message);
    } catch {
      outcome = { status: "failed", reason: "EMAIL_PROVIDER_ERROR", retryable: true };
    }

    if (outcome.status === "sent") delivered.add(message.idempotencyKey);

    console.info(
      `[email] kind=${message.kind} provider=${provider.id} attempt=${attempt}` +
        ` outcome=${outcome.status} to=${maskEmailAddress(message.to)}` +
        ` idempotency=${message.idempotencyKey}`,
    );

    if (outcome.status !== "failed" || !outcome.retryable) return outcome;

    lastFailure = outcome;
    const delay = BACKOFF_MS[attempt - 1];
    if (attempt < MAX_ATTEMPTS && delay !== undefined) await sleep(delay);
  }

  return lastFailure;
}
