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
