/**
 * FASE 2.5.2C — transactional email DISPATCH (SERVER ONLY).
 *
 * One entry point for the whole product: `sendTransactionalEmail`. It owns
 * PERSISTENT idempotency with an atomic claim/lease, bounded retry with
 * exponential backoff + jitter (honouring `Retry-After`), the delivery log and
 * structured observability, then delegates the actual delivery to an
 * `EmailTransport` (Hostinger Mail API over HTTPS).
 *
 * Honesty rules encoded here:
 *  - with no transport configured the call resolves `skipped / not_configured`;
 *    it never claims a delivery that did not happen;
 *  - `accepted` means the provider ACCEPTED/queued the message (HTTP 202). It is
 *    never presented as inbox delivery;
 *  - a delivery failure never fails the feature that triggered it;
 *  - idempotency lives in the database through `public.claim_email_delivery`:
 *      accepted/sent            -> permanently idempotent, never re-sent
 *      failed / skipped         -> a new attempt is allowed
 *      pending with live lease  -> a concurrent worker owns it (`in_progress`)
 *      pending with dead lease  -> recovered, no abandoned row
 *  - logs carry the kind, the idempotency key, the outcome and a MASKED address.
 *    Never a body, never a token, never a full SteamID64.
 */
import {
  maskEmailAddress,
  type EmailSendOutcome,
  type EmailTransport,
  type TransactionalEmailMessage,
} from "./email.provider";
import { resolveEmailProvider } from "./email.transport.server";
import {
  EMAIL_BACKOFF_BASE_MS,
  EMAIL_LEASE_SECONDS as LEASE_SECONDS,
  MAX_EMAIL_ATTEMPTS_PER_CALL,
  MAX_TOTAL_EMAIL_ATTEMPTS,
} from "@/config/email";

/** Retry ceiling for a retryable provider failure INSIDE one call. */
export const MAX_EMAIL_ATTEMPTS = MAX_EMAIL_ATTEMPTS_PER_CALL;
const BASE_BACKOFF_MS = EMAIL_BACKOFF_BASE_MS;
/** Lease held while an attempt is in flight; an abandoned row expires with it. */
export const EMAIL_LEASE_SECONDS = LEASE_SECONDS;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter, so parallel retries do not synchronise. */
export function backoffFor(attempt: number, retryAfterSeconds?: number | null): number {
  if (typeof retryAfterSeconds === "number" && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }
  const base = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * BASE_BACKOFF_MS);
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface DispatchOptions {
  /** Injected in tests; production resolves from the environment. */
  provider?: EmailTransport | null;
  /** Skip the database claim/log (used by unit tests of the retry logic only). */
  persist?: boolean;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Attempts a delivery with retry. Pure with respect to the database: the caller
 * owns the delivery log row.
 */
export async function attemptDelivery(
  provider: EmailTransport,
  message: TransactionalEmailMessage,
  sleepImpl: (ms: number) => Promise<void> = sleep,
  /**
   * FASE 2.6.0 — attempts allowed in THIS call. The caller narrows it to the
   * message's remaining GLOBAL budget, so a message can never restart 1..3
   * forever, one call at a time.
   */
  maxAttempts: number = MAX_EMAIL_ATTEMPTS,
): Promise<{ outcome: EmailSendOutcome; attempts: number }> {
  let lastFailure: EmailSendOutcome = {
    status: "failed",
    reason: "EMAIL_NOT_ATTEMPTED",
    retryable: false,
  };
  const ceiling = Math.max(1, Math.min(maxAttempts, MAX_EMAIL_ATTEMPTS));

  for (let attempt = 1; attempt <= ceiling; attempt += 1) {
    let outcome: EmailSendOutcome;
    try {
      outcome = await provider.sendTransactionalEmail(message);
    } catch {
      // A thrown transport error is a temporary condition, never a success.
      outcome = { status: "failed", reason: "EMAIL_TRANSPORT_ERROR", retryable: true };
    }

    console.info(
      `[email] kind=${message.kind} provider=${provider.id} attempt=${attempt}` +
        ` outcome=${outcome.status} to=${maskEmailAddress(message.to)}` +
        ` idempotency=${message.idempotencyKey}`,
    );

    // A permanent refusal stops immediately: no infinite loop on a 4xx.
    if (outcome.status !== "failed" || !outcome.retryable) return { outcome, attempts: attempt };

    lastFailure = outcome;
    if (attempt < ceiling) {
      await sleepImpl(backoffFor(attempt, outcome.retryAfterSeconds ?? null));
    }
  }

  return { outcome: lastFailure, attempts: ceiling };
}

interface ClaimResult {
  claimed: boolean;
  log_id: string | null;
  attempts: number | null;
  reason: string | null;
}

export async function sendTransactionalEmail(
  message: TransactionalEmailMessage,
  options: DispatchOptions = {},
): Promise<EmailSendOutcome> {
  const resolved =
    options.provider !== undefined
      ? { provider: options.provider, reason: "not_configured" as const }
      : resolveEmailProvider();
  const persist = options.persist ?? true;
  const providerId = resolved.provider?.id ?? "none";

  let logId: string | null = null;
  let previousAttempts = 0;

  if (persist) {
    const supabase = await db();
    // ATOMIC claim/lease in the database. This is what makes idempotency
    // restart-safe and concurrency-safe across instances.
    const claim = await supabase.rpc("claim_email_delivery", {
      _idempotency_key: message.idempotencyKey,
      _kind: message.kind,
      _recipient: message.to,
      _locale: message.locale ?? "pt-BR",
      _subject: message.subject,
      _provider: providerId,
      ...(message.userId ? { _user_id: message.userId } : {}),
      _lease_seconds: EMAIL_LEASE_SECONDS,
    });

    if (claim.error) {
      // The log is not a reason to lose the notice, but we cannot claim a send.
      console.warn(`[email] claim_unavailable kind=${message.kind}`);
    } else {
      const result = claim.data as unknown as ClaimResult;
      if (!result.claimed) {
        console.info(
          `[email] not_claimed kind=${message.kind} reason=${result.reason}` +
            ` idempotency=${message.idempotencyKey}`,
        );
        return {
          status: "skipped",
          reason: result.reason === "in_progress" ? "in_progress" : "duplicate",
        };
      }
      logId = result.log_id;
      previousAttempts = result.attempts ?? 0;
    }
  }

  const finish = async (
    outcome: EmailSendOutcome,
    attempts: number,
    resolvedProviderId: string,
  ): Promise<EmailSendOutcome> => {
    if (!logId) return outcome;
    const supabase = await db();
    await supabase
      .from("email_delivery_logs")
      .update({
        status: outcome.status,
        provider: resolvedProviderId,
        provider_message_id: outcome.status === "accepted" ? outcome.messageId : null,
        attempt_count: previousAttempts + attempts,
        last_error: outcome.status === "failed" ? outcome.reason : null,
        // `sent_at` records WHEN THE PROVIDER ACCEPTED the message.
        sent_at: outcome.status === "accepted" ? new Date().toISOString() : null,
        lease_expires_at: null,
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
  return finish(outcome, attempts, resolved.provider.id);
}
