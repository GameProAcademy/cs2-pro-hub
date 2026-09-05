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
