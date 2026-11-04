/**
 * FASE 2.5.2C — transactional email CONFIGURATION (SERVER ONLY).
 *
 * Production transport is the **Hostinger Mail API over HTTPS**. This runtime is
 * Cloudflare Workers: it cannot open a raw TCP socket to port 25/465/587, so
 * there is no SMTP relay anywhere in this codebase and none may be added.
 *
 * Rules encoded here:
 *  - every value is read from `process.env` INSIDE a call, never at module scope;
 *  - a token is never returned to a caller, never logged, never sent to a browser;
 *  - diagnostics expose BOOLEANS only, so an admin screen can say
 *    "configured / missing" without ever reading a value;
 *  - no cross-provider fallback: an SMTP password is not an API token, and a
 *    missing Hostinger token never silently activates another provider.
 */

export type EmailProviderId = "none" | "hostinger";

/**
 * Hostinger Mail API — HTTPS, Workers-compatible.
 *
 * Contract source: the official OpenAPI spec (github.com/hostinger/mail-api, openapi.json,
 * v1.3.0) and docs.hostinger.com/emails/mail-api. Sending is mailbox-scoped:
 *   GET  /api/v1/me                                   -> mailboxes the token may use
 *   POST /api/v1/mailboxes/{mailboxResourceId}/send   -> 204 No Content when sent
 * There is no `from` field: the sender IS the mailbox; `displayName` sets the From name.
 * (The former `/v1/emails` path is not part of the official API.)
 */
export const HOSTINGER_MAIL_API_BASE = "https://api.mail.hostinger.com";
export const HOSTINGER_MAIL_API_ME = `${HOSTINGER_MAIL_API_BASE}/api/v1/me`;
export function hostingerSendEndpoint(mailboxResourceId: string): string {
  return `${HOSTINGER_MAIL_API_BASE}/api/v1/mailboxes/${encodeURIComponent(mailboxResourceId)}/send`;
}

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

export function emailSenderIdentity(): EmailSenderIdentity | null {
  const address = env("EMAIL_FROM_EMAIL");
  if (!address || !address.includes("@")) return null;
  return { address, name: env("EMAIL_FROM_NAME") };
}

export function formatEmailFrom({ address, name }: EmailSenderIdentity): string {
  return name ? `${name} <${address}>` : address;
}

export interface EmailConfig {
  provider: EmailProviderId;
  token: string;
  sender: EmailSenderIdentity;
}

export type EmailConfigState = "not_configured" | "configured";

export interface EmailConfigStatus {
  state: EmailConfigState;
  provider: EmailProviderId;
  /** Booleans only — never the value. */
  tokenConfigured: boolean;
  senderConfigured: boolean;
  senderAddress: string | null;
}

/**
 * Reads the operator configuration. Returns `null` when transactional email is
 * not configured — never a guess, never a different provider than the requested
 * one.
 */
export function resolveEmailConfig(): EmailConfig | null {
  const requested = (env("EMAIL_PROVIDER") ?? "").toLowerCase();
  if (requested !== "hostinger") return null;

  const token = env("HOSTINGER_MAIL_API_TOKEN");
  const sender = emailSenderIdentity();
  if (!token || !sender) return null;

  return { provider: "hostinger", token, sender };
}

/** Safe diagnostics for an admin screen: booleans and the public sender only. */
export function emailConfigStatus(): EmailConfigStatus {
  const requested = (env("EMAIL_PROVIDER") ?? "").toLowerCase();
  const provider: EmailProviderId = requested === "hostinger" ? "hostinger" : "none";
  const sender = emailSenderIdentity();
  const tokenConfigured = Boolean(env("HOSTINGER_MAIL_API_TOKEN"));
  return {
    state: provider === "hostinger" && tokenConfigured && sender ? "configured" : "not_configured",
    provider,
    tokenConfigured,
    senderConfigured: Boolean(sender),
    senderAddress: sender?.address ?? null,
  };
}
