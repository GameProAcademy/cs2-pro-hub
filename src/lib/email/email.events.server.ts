/**
 * FASE 2.5.2 — product email EVENTS (SERVER ONLY).
 *
 * The only place that turns an application event into a transactional email.
 * Ordering is deliberate and non-negotiable: the caller has already committed
 * the identity state and written the audit record before calling in here, so a
 * player can never receive "your Steam account was linked" for a link that was
 * not persisted. Conversely, a delivery failure never propagates: it is recorded
 * in the delivery log and the feature stays successful.
 */
import { resolveEmailLocale, type EmailLocale } from "./email.locale";
import { renderSteamLinkedEmail, renderSteamUnlinkedEmail } from "./email.templates";
import { sendTransactionalEmail } from "./email.dispatch.server";
import type { EmailSendOutcome } from "./email.provider";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface EmailRecipient {
  email: string;
  name: string | null;
  locale: EmailLocale;
}

/**
 * Resolves address, display name and LANGUAGE for one user. Language follows the
 * saved preference first; the country is only a fallback (see
 * `resolveEmailLocale`).
 */
export async function resolveRecipient(userId: string): Promise<EmailRecipient | null> {
  const supabase = await db();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, display_name, nickname, locale, country")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.email) return null;

  const row = profile as {
    email: string;
    display_name?: string | null;
    nickname?: string | null;
    locale?: string | null;
    country?: string | null;
  };

  return {
    email: row.email,
    name: row.display_name ?? row.nickname ?? null,
    locale: resolveEmailLocale({
      preferredLocale: row.locale ?? null,
      country: row.country ?? null,
    }),
  };
}

export interface SteamNoticeInput {
  userId: string;
  /** MASKED SteamID64 only. The full value never reaches an email. */
  steamIdMasked: string;
  personaName: string | null;
  /** Distinguishes repeated unlink/relink cycles for idempotency. */
  eventId: string;
  occurredAt?: string;
}

async function dispatchSteamNotice(
  kind: "steam_linked" | "steam_unlinked",
  input: SteamNoticeInput,
): Promise<EmailSendOutcome> {
  const recipient = await resolveRecipient(input.userId);
  if (!recipient) return { status: "skipped", reason: "not_configured" };

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const render = kind === "steam_linked" ? renderSteamLinkedEmail : renderSteamUnlinkedEmail;
  const rendered = render({
    name: recipient.name,
    steamIdMasked: input.steamIdMasked,
    personaName: input.personaName,
    occurredAt,
    locale: recipient.locale,
  });

  return sendTransactionalEmail({
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    kind,
    locale: recipient.locale,
    userId: input.userId,
    // Persistent, restart-safe key: the UNIQUE index in the delivery log is what
    // guarantees exactly one delivery attempt per event.
    idempotencyKey: `${kind}:${input.userId}:${input.steamIdMasked}:${input.eventId}`,
  });
}

export function notifySteamLinked(input: SteamNoticeInput): Promise<EmailSendOutcome> {
  return dispatchSteamNotice("steam_linked", input);
}

export function notifySteamUnlinked(input: SteamNoticeInput): Promise<EmailSendOutcome> {
  return dispatchSteamNotice("steam_unlinked", input);
}
