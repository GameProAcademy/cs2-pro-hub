# FASE 2.5 — Steam Identity Foundation

## What Steam is, and what it is not

Steam **proves who a player is**. It does not tell us how they played: Valve
publishes no CS2 match history, so Steam never becomes a match or statistics
source. That distinction is encoded, not just documented:

- `src/lib/sources/availability.ts` → `steam: { state: "unavailable", reason: "identity_only" }`,
  so `isSourceCollectable("steam")` is `false`.
- `src/lib/sources/sourceCapabilities.ts` → `operations.identity: "supported"`,
  everything else `unsupported`.
- `src/lib/steam/steam.constants.ts` → `STEAM_MATCH_DATA_SUPPORTED = false`.

## Why OpenID 2.0 and not OAuth

Steam publishes **no OAuth2 authorization server** for account linking. The
official, permitted mechanism is Steam Community OpenID 2.0
(`https://steamcommunity.com/openid/login`). It hands us **no token at all**,
which is exactly what we want: there is nothing to store, nothing to refresh and
nothing to leak. `connection_type` gained the value `openid` for this reason —
calling it `oauth` would be a lie in the data model.

## Trust model

| Step | Guarantee |
| --- | --- |
| Start | `steam_link_attempts` row: only the **SHA-256 hash** of a 32-byte state, bound to the authenticated user, TTL 10 min, single-use. Starting a new attempt cancels the previous ones. |
| Redirect | OpenID 2.0 has no `state` parameter, so ours travels inside `return_to`, which Steam echoes **and signs**. |
| Callback | Structural checks first: namespace, `mode`, presence of `sig`, and that `openid.signed` actually covers `claimed_id`, `identity` and `return_to`. `return_to` must match our configured URL byte for byte, including the state. |
| Validation | `check_authentication` posted back to Steam. Only an explicit `is_valid:true` is accepted; anything unparsable is a failure. The claimed id is **never** trusted before this. |
| Consumption | The attempt is consumed with a conditional `UPDATE ... WHERE status = 'pending'`, so exactly one caller can win a race. Failure paths burn the attempt too — no replay window. |
| Persistence | `player_connections` (source `steam`, type `openid`) + `player_identities` (`STEAM`), identity `verified` with method `openid`. |

The browser never chooses which Steam account gets linked: the SteamID64 comes
from a validated assertion, never from a query parameter.

## Unique ownership

A Steam account belongs to exactly one GamePro player. Checked in the
application first, then enforced by partial unique indexes as the last line of
defence (Postgres `23505` → `STEAM_DUPLICATE_ACCOUNT`):

- `player_connections_steam_external_uniq` on `(source, external_id)`
- `player_identities_steam_external_uniq` on `(platform, external_id)`

## Canonical structures only

No `steam_accounts`, `steam_users` or `steam_profiles` identity table exists, and
none may be created. Steam reuses `player_connections`, `player_identities` and
`identity_correlation_evidence`. `steam_link_attempts` is not an identity table —
it is a short-lived CSRF/replay ledger with RLS enabled, **zero policies** and no
GRANT to `anon`/`authenticated`.

## Correlation

Linking Steam records:

1. `authenticated_link` evidence (weight 1) between the GamePro user and the
   Steam identity — the only attribute that can ever justify `verified`;
2. `steam_id64` evidence (weight 0.95) against every other source that
   independently reports a SteamID64 (e.g. FACEIT's public `steam_id_64`).

A match promotes the other identity to `strongly_correlated` at most — never to
`verified`, which is reserved for a source that authenticated the user itself. A
mismatch is recorded as a **conflict** and is never resolved silently. A
`verified` identity is never downgraded by heuristic evidence.

## Privacy

- The full SteamID64 is returned only to the **owner** of the account, and the UI
  shows it masked until the owner asks to reveal it.
- Audit records (`admin_audit_logs`, actions `steam_connection_created` /
  `steam_connection_removed`) and every log line carry a **masked** id.
- Logs contain error CODES only: no signature, no state, no upstream body.
- Connection metadata is non-sensitive by construction and validated twice
  (`assertSafeConnectionMetadata` + the `jsonb_has_sensitive_key` trigger). The
  OpenID flow produces no credential to store in the first place.

## Unlink

Non-destructive. Matches, metrics, analyses, training plans and the identity row
all survive; what is revoked is trust (`is_verified = false`, status
`correlated`, verification method cleared). Pending attempts are cancelled. A
relink must go through Steam again.

## Environment

See `ENVIRONMENT.md`. With an empty environment the integration reports
`not_configured`, the UI states plainly that linking is unavailable and **no
button is rendered** — no key is ever requested from the player and no value is
hardcoded.

## Not implemented in this phase (deliberately)

- Any collection of Steam match/statistics data (it does not exist publicly).
- Steam inventory, friends, bans or playtime reads.
- Automatic identity promotion from weak evidence.
- Email delivery from app code (the email design system renders; it does not send).


## FASE 2.5.2C — closure (atomicity, transport, throttle)

1. **Atomic link/unlink.** `finalizeSteamConnection` and `unlinkSteamAccount` no
   longer write four times in a row. They call `public.steam_link_commit` /
   `public.steam_unlink_commit` (SECURITY DEFINER, `search_path=''`, EXECUTE for
   `service_role` only), so connection, identity, correlation evidence and the
   mandatory audit record land in ONE transaction — or none of them does. Both
   routines re-verify that the player profile belongs to the caller and refuse a
   takeover of a SteamID64 that already belongs to another player; the partial
   unique indexes stay as the last line of defence. An unlink never rewrites a
   recorded `conflict`, so conflict history survives.
2. **Atomic state consumption.** The winning `UPDATE ... WHERE status='pending'
   AND expires_at > now()` row is now the ONLY source of the user binding — the
   fallback to the earlier read is gone. The loser of the race gets the new
   `STEAM_STATE_ALREADY_USED` code.
3. **Atomic start throttle.** Counting attempts and deciding used to be two
   observations, so simultaneous requests could all pass. `public.claim_steam_link_slot`
   takes a per-user advisory lock inside the transaction and answers once.
4. **Real transport.** Transactional email goes through the **Hostinger Mail API
   over HTTPS** (`email.config.server.ts` + `email.transport.server.ts`). There is
   no SMTP path anywhere: Cloudflare Workers cannot open a raw TCP socket to
   25/465/587. HTTP 202 is recorded as `accepted` (queued by the provider) and is
   never presented as inbox delivery. A 4xx is permanent, a 429/5xx is transient,
   and `Retry-After` is honoured and capped.
5. **Leased idempotency.** `public.claim_email_delivery` decides atomically per
   key: `accepted`/`sent` is never re-sent, `failed`/`skipped` may be retried, a
   live lease blocks a concurrent worker (`in_progress`), an expired lease is
   recovered so no row is abandoned in `pending`.
