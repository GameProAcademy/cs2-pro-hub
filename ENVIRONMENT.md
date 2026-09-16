# Environment variables

Rules that apply to every variable below:

- **No secret is ever committed.** `.env` is git-ignored; `.env.example` holds
  keys with empty values only.
- Server-only values are read with `process.env[...]` **inside** a server
  function / server route handler, never at module scope, and never returned to
  a browser. Only `VITE_*` values reach client code.
- A missing value never becomes a guess. The affected integration reports
  `not_configured` and the UI says so honestly instead of rendering a button
  that cannot work.
- Diagnostics expose **booleans only** (`steamConfigStatus()`,
  `faceitConfigStatus()`), so an admin screen can show "configured / missing"
  without ever reading a value.

## Backend (managed automatically)

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | server / client | backend endpoint |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | server / client | publishable key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | privileged operations; bypasses RLS |
| `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` | server / client | project reference |

## Demo parser worker (server only)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DEMO_PARSER_URL` | yes | HTTPS `/v1/parse` endpoint of the external parser worker |
| `DEMO_PARSER_TOKEN` | yes | **secret** bearer token, never logged, returned, or sent to the browser |
| `DEMO_PARSER_EXPECTED_NAME` | yes | expected parser name (`demoparser2`) |
| `DEMO_PARSER_EXPECTED_VERSION` | yes | expected parser version (`0.42.0`) |
| `DEMO_PARSER_EXPECTED_REVISION` | yes in production | exact worker build revision; the revision lock fails closed on any divergence |
| `DEMO_PARSER_REVISION_REQUIRED` | optional | `true`/`false` override of the lock; defaults to `true` when `NODE_ENV=production` |
| `DEMO_PARSER_EXPECTED_BUILD_REVISION` | during exact-build promotion | exact `git:<40-hex>` Railway build identity; separate from the semantic compatibility lock |
| `DEMO_PARSER_BUILD_REVISION_REQUIRED` | optional | `true` requires the worker to report and match the exact build identity |
| `DEMO_PIPELINE_BRIDGE_SECRET` | yes for durable dispatch | shared bearer secret used only between the app and Railway queue consumer |

The official endpoint value is the canonical parse URL, never the bare origin:
`https://cs2-demo-parser-production.up.railway.app/v1/parse`.

All values are read server-side. None may use the `VITE_` prefix. A missing
or insecure URL, or a missing token, keeps the adapter unavailable.

The Railway service additionally receives `DEMO_PIPELINE_BRIDGE_URL` pointing to
`https://gamepro.network/api/public/pipeline-worker`, the same
`DEMO_PIPELINE_BRIDGE_SECRET`, a stable `DEMO_PIPELINE_WORKER_ID`, and optional
poll/heartbeat intervals. RAW artifacts use short-lived, object-scoped upload
URLs created by the APP; the Railway worker never receives a database or Storage
credential.

Railway may additionally set `PARSER_BUILD_REVISION=git:<40-hex>`. The worker
reports `semantic_revision` from `PARSER_REVISION` and `build_revision` from this
exact deployment variable. During coordinated rollout, build identity remains
optional; setting both APP variables above activates fail-closed exact-build pinning.

`MAX_PAYLOAD_BYTES` on Railway may be set up to `8388608`; the code always
enforces the 8 MiB hard maximum for the complete `{hot, raw}` body. The target is
4 MiB. Queue delivery attempts remain separate from the logical demo attempt
used in RAW artifact identity and paths.

Production also sets `PARSER_CONTRACT_VERSION=1`, `ENVIRONMENT=production`,
`MAX_DEMO_BYTES=1610612736`, download/parse timeouts, a stable worker ID, and
positive poll/heartbeat intervals. `PARSER_REVISION` must use the exact
`git:<40 lowercase hex>` build identity. Audit presence without printing values.
The complete Railway alignment, deployment, rollback, and smoke-test gates are
documented in `docs/PHASE-2.7.2D.4-RAILWAY-ALIGNMENT.md`.

## Transactional email — Hostinger Mail API (server only)

The runtime is Cloudflare Workers, which cannot open a raw outbound TCP socket to
port 25/465/587. Classic SMTP is therefore not implementable here and no SMTP
relay exists in this codebase: transactional email goes through the Hostinger
Mail API over HTTPS.

| Variable | Required | Purpose |
| --- | --- | --- |
| `EMAIL_PROVIDER` | yes, for delivery | `hostinger` or unset. Unset keeps delivery dark (`skipped / not_configured`). |
| `HOSTINGER_MAIL_API_TOKEN` | yes, for delivery | **secret**. Hostinger Mail API token, read inside the send call, never logged or returned. |
| `EMAIL_FROM_EMAIL` | yes, for delivery | visible sender address on the verified domain |
| `EMAIL_FROM_NAME` | no | visible sender name |

`emailConfigStatus()` exposes booleans only (`tokenConfigured`,
`senderConfigured`) plus the public sender address, so an admin screen can show
"configured / missing" without ever reading the token.

Provider acceptance (HTTP 202) is recorded as `accepted`, which means queued by
Hostinger — never as proof that the message reached the inbox.

## FACEIT (server only)

| Variable | Required | Purpose |
| --- | --- | --- |
| `FACEIT_CLIENT_ID` | yes, for linking | OAuth2 client |
| `FACEIT_CLIENT_SECRET` | yes, for linking | OAuth2 client secret |
| `FACEIT_API_KEY` | yes, for sync | Data API reads |
| `FACEIT_OAUTH_REDIRECT_URI` | yes, for linking | must match the registered redirect |

## Steam identity linking — FASE 2.5 (server only)

Steam publishes no OAuth2 server for account linking; the official mechanism is
OpenID 2.0, which returns **no token**. Nothing below is a Steam credential
except the optional Web API key.

| Variable | Required | Purpose |
| --- | --- | --- |
| `STEAM_INTEGRATION_ENABLED` | yes | master switch, **default off**. Only `true`/`1`/`yes`/`on` enables the integration; anything else keeps it `not_configured`. |
| `STEAM_OPENID_REALM` | yes | public origin of the app, e.g. `https://app.example.com`. HTTPS required (`localhost` tolerated in development). |
| `STEAM_OPENID_RETURN_URL` | yes | must be **inside the realm** and point at `/api/public/integrations/steam/callback` |
| `STEAM_OPENID_ENDPOINT` | no | override of `https://steamcommunity.com/openid/login`; must be HTTPS |
| `STEAM_WEB_API_KEY` | no | **optional**; enables PUBLIC profile enrichment only (nickname, avatar, country, visibility). Linking and identity verification work fully without it. |

Resulting states (`steamConfigStatus().state`):

| State | Meaning | UI |
| --- | --- | --- |
| `not_configured` | realm/return URL missing, insecure, or return URL outside the realm | no sign-in button; "unavailable" message |
| `configured` | linking works; no profile enrichment | sign-in button; profile fields shown as "—" |
| `available` | linking + public profile enrichment | full card |
| `error` | configured, last interaction failed | error state with a stable reason |

The Web API key is obtained by the operator at
<https://steamcommunity.com/dev/apikey>. The application never asks a player for
it, never stores it in the database and never sends it to a browser.
