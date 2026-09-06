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

## Delivery (FASE 2.5.2C)

Rendering stays pure; delivery lives in four server-only modules:

| Module | Responsibility |
| --- | --- |
| `email.config.server.ts` | Reads the operator configuration inside a call. Exposes **booleans only** as diagnostics; never returns or logs a token. |
| `email.transport.server.ts` | The real transport: **Hostinger Mail API over HTTPS**. |
| `email.dispatch.server.ts` | Atomic claim/lease idempotency, bounded retry with backoff + jitter and `Retry-After`, delivery log, masked observability. |
| `email.events.server.ts` | Turns an application event into an email. Called **after** the state is committed and audited. |

### Why there is no SMTP

This app runs on Cloudflare Workers, which cannot open an arbitrary outbound TCP
socket to port 25/465/587. A classic SMTP client (`nodemailer` and friends)
therefore cannot work here, and pretending otherwise would produce an
integration that fails silently in production. The Hostinger Mail API over HTTPS
is the transport, and no SMTP relay exists anywhere in this codebase.

### Environment

| Variable | Secret | Purpose |
| --- | --- | --- |
| `EMAIL_PROVIDER` | no | `hostinger`, or unset. Unset = no delivery. |
| `HOSTINGER_MAIL_API_TOKEN` | **yes** | Hostinger Mail API token. Server-only; never reaches a browser or a log. |
| `EMAIL_FROM_EMAIL` | no | Visible sender address (must be a mailbox on the verified domain). |
| `EMAIL_FROM_NAME` | no | Visible sender name. |

With nothing configured, every send resolves `skipped / not_configured`. The app
never claims a delivery it did not make, and a delivery failure never breaks the
feature that triggered it (linking Steam still succeeds).

### Language

`resolveEmailLocale()` decides the language in this order: saved preference →
browser locale → country → `pt-BR`. A country is never treated as a language on
its own; it is only the last fallback.

### Delivery log and idempotency

`email_delivery_logs` is server-role only (RLS on, zero policies, no `anon` /
`authenticated` grant). One row per event, keyed by a UNIQUE `idempotency_key`.

The claim is atomic — `public.claim_email_delivery` (service_role only) takes a
per-key advisory lock and decides:

| Current state | Decision |
| --- | --- |
| no row | claimed, row created with a lease |
| `accepted` / `sent` | **never re-sent** (permanent idempotency) |
| `failed` / `skipped` | claimed again; a new attempt is allowed |
| `pending`, live lease | refused (`in_progress`) — another worker owns it |
| `pending`, expired lease | recovered — no abandoned row |

`status` is one of `pending | accepted | sent | failed | skipped`.
**`accepted` means the provider accepted/queued the message (HTTP 202) — it is
not proof of inbox delivery**, and no UI copy may claim otherwise. `sent_at`
records when the provider accepted it.

