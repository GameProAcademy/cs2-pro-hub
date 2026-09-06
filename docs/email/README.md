# GamePro email design system

Everything in `src/lib/email` is **pure rendering**: no delivery, no connection,
no secret. One dark-mode shell (`email.layout.ts`), one token file
(`email.theme.ts`), table-based building blocks (`email.components.ts`) and the
copy (`email.templates.ts`).

Email clients support none of the app's modern CSS, so every value is a literal
inlined at render time. `email.theme.ts` is the single source of truth for those
literals.

## Authentication emails (backend-delivered)

The auth family is delivered by the platform, not by app code. The exported HTML
keeps the Go placeholders (`{{ .ConfirmationURL }}`, `{{ .Token }}`) so a file can
be pasted into the auth email settings unchanged.

| Template | Placeholder used |
| --- | --- |
| `confirm_signup` | `{{ .ConfirmationURL }}` |
| `magic_link` | `{{ .ConfirmationURL }}` |
| `invite` | `{{ .ConfirmationURL }}` |
| `recovery` | `{{ .ConfirmationURL }}` |
| `email_change` | `{{ .ConfirmationURL }}` |
| `reauthentication` | `{{ .Token }}` |

Exported files live in `docs/email/supabase-auth/<template>.<locale>.html`
(pt-BR and en). Regenerate them from `renderAuthEmail(id, locale)` after any copy
or theme change — do not hand-edit the HTML.

## Product emails

`renderSteamLinkedEmail` / `renderSteamUnlinkedEmail` are **security notices**,
not marketing. They state what happened, when, and what to do if it was not the
account owner.

Rendered samples: `docs/email/preview/*.html`.

## Non-negotiable rules

- Never place a password, session token, one-time link, API key or a **full
  SteamID64** in an email body. Account identifiers are masked
  (`maskSteamId64`) before they reach a template.
- Every interpolated value goes through `escapeHtml`.
- Every message carries a plain-text alternative (`RenderedEmail.text`) built
  from the copy, never scraped from the HTML.
- Every CTA is followed by a copy-and-paste fallback URL, because buttons get
  stripped.

## Delivery (FASE 2.5.2)

Rendering stays pure; delivery lives in three server-only modules:

| Module | Responsibility |
| --- | --- |
| `email.transport.server.ts` | Real transports over the provider **HTTPS API** (Resend, SendGrid). SMTP is refused honestly (`EMAIL_TRANSPORT_UNSUPPORTED`): raw TCP is not available in the Workers runtime. |
| `email.dispatch.server.ts` | Persistent idempotency, bounded retry with exponential backoff + jitter, delivery log, masked observability. |
| `email.events.server.ts` | Turns an application event into an email. Called **after** the state is committed and audited. |

### Environment

| Variable | Secret | Purpose |
| --- | --- | --- |
| `EMAIL_PROVIDER` | no | `resend`, `sendgrid`, `smtp` or unset. Unset = no delivery. |
| `RESEND_API_KEY` | yes | Required for `resend`. |
| `SENDGRID_API_KEY` | yes | Required for `sendgrid`. |
| `SMTP_FROM_EMAIL` | no | Visible sender address. |
| `SMTP_FROM_NAME` | no | Visible sender name. |

With nothing configured, every send resolves `skipped / not_configured`. The app
never claims a delivery it did not make, and a delivery failure never breaks the
feature that triggered it (linking Steam still succeeds).

### Language

`resolveEmailLocale()` decides the language in this order: saved preference →
browser locale → country → `pt-BR`. A country is never treated as a language on
its own; it is only the last fallback.

### Delivery log

`email_delivery_logs` is server-role only (RLS on, zero policies, no `anon` /
`authenticated` grant). One row per event, keyed by a UNIQUE `idempotency_key`,
so a retry after a restart cannot send twice. `status` is one of
`pending | sent | failed | skipped`; `sent` is only written after the provider
confirms.
