# Support email — Hostinger Mail API

Audit of 2026-11-04. Covers the "Reportar problema" email and the transactional email transport.

## Official contract (evidence)

Sources consulted on 2026-11-04:

- Official OpenAPI spec: `github.com/hostinger/mail-api`, file `openapi.json`, `info.version` 1.3.0,
  server `https://api.mail.hostinger.com`.
- `docs.hostinger.com/emails/mail-api` (authentication, envelope, errors).
- `docs.hostinger.com/api-reference/email-sdks` (official SDKs: `sendEmail(mailboxResourceId, request)`).
- Release v1.2.1 notes. They added a `504` response to `POST /api/v1/mailboxes/{mailboxResourceId}/send`.

Contract facts:

| Item | Official contract |
| --- | --- |
| Send endpoint | `POST /api/v1/mailboxes/{mailboxResourceId}/send` |
| Mailbox ids | `GET /api/v1/me` → `data.mailboxes[] = {resourceId: "AC…", address}`. These are the mailboxes the token may manage. |
| Auth | `Authorization: Bearer <Mail API token>`. The token is created in hPanel → Emails → Agentic Mail → API access. It is scoped to one email order and optionally to selected mailboxes. hPanel "API tokens" for the general Hostinger API do **not** work. |
| Request body | `to: string[]` (at least one of to/cc/bcc), `subject`, `text`, `html`, `displayName` (From name), optional cc/bcc/attachments/inReplyTo/forwardOf. **No `from` field**: the sender is the mailbox in the path. |
| Success | `204 No Content`: "Message sent and saved to sent folder." There is no message id. |
| Errors | `{error, code: "ERR_*", params}`. `401 ERR_UNAUTHORIZED`, `403 ERR_FORBIDDEN` (token not authorized for that mailbox), `422 ERR_VALIDATION_FAILED`, `429`, `500`, `502`, `504`. |

**Decision.** The previous transport called `POST https://api.mail.hostinger.com/v1/emails` with a `from` field and
treated 200/202 as success. That path is not part of the official API, and `from` is not a field of the
send schema. The transport now follows the official contract:

1. `GET /api/v1/me`, then pick the mailbox whose address equals `EMAIL_FROM_EMAIL`, compared case-insensitively.
   The result is cached per isolate for 10 minutes; the cache key is a SHA-256 digest, never the token.
2. If the sender is not among the token's mailboxes, nothing is sent and the outcome is
   `EMAIL_SENDER_NOT_AUTHORIZED` (permanent). The transport never falls back to another mailbox.
3. `POST /api/v1/mailboxes/{id}/send` with `{to:[recipient], subject, html, text, displayName}`.
4. `204` is reported as `accepted`. It means Hostinger sent the message; arrival in the recipient's inbox is
   not observable from the API, so a real test confirms receipt in the mailbox.
5. Failures are reported as `EMAIL_PROVIDER_ERROR_<status>[_<ERR_CODE>]`. The provider's message text is never
   echoed. 401/403/422 are permanent; 429/5xx are transient.
6. Duplicate protection: a `504` or a timeout after the send request left means the message may already have
   been sent. Both become `EMAIL_PROVIDER_OUTCOME_UNKNOWN`, which is not retried automatically. A person can
   resend explicitly ("Enviar novamente"). The persistent idempotency (`claim_email_delivery`) is unchanged.

## Configuration (Lovable Cloud → Secrets, then Publish)

| Secret | Value |
| --- | --- |
| `EMAIL_PROVIDER` | `hostinger` |
| `EMAIL_FROM_EMAIL` | `support@gamepro.academy` |
| `EMAIL_FROM_NAME` | `CS2 PRO Support` |
| `HOSTINGER_MAIL_API_TOKEN` | Mail API token whose mailbox scope **includes `support@gamepro.academy`**. Set only in Lovable Cloud; never paste it anywhere else. |

The report recipient is fixed in code: `bug@gamepro.academy`. It does not need to be in the token's scope,
because only the sender mailbox does. The app domain is `https://gamepro.network`. `hub.gamepro.academy` is the
WordPress course site and is used only for course links. Support emails contain no app links.

## Verifying the token scope without sending

Admin → Overview → **E-mail de suporte (Hostinger)** shows:

- configured yes/no and the sender;
- whether the token authorizes the sender, from `GET /api/v1/me`;
- a safe reason code when the check fails.

No token value is ever shown.

If "Token autoriza o remetente" is **não**:

1. hPanel → Emails → `gamepro.academy` → Agentic Mail → API access → create a new token that includes the
   mailbox `support@gamepro.academy`.
2. Lovable Cloud → Secrets → delete `HOSTINGER_MAIL_API_TOKEN` and create it again with the new value. Lovable
   secrets cannot be edited in place.
3. Publish the app. Then press "Verificar de novo" in the admin card.
4. Revoke the old token only after the new one is validated.

## Real send test

The same admin card has **Enviar e-mail de teste**. It sends one audited message (`SUPPORT_EMAIL_TEST` in the
admin audit log) to `bug@gamepro.academy`, at most one per 10-minute window. The window is enforced by persistent
idempotency. The integration counts as validated only when:

- the card shows "Aceito e enviado pela Hostinger";
- `email_delivery_logs` has the row `status = accepted`;
- the message is seen in the `bug@gamepro.academy` inbox, with From `CS2 PRO Support <support@gamepro.academy>`.
