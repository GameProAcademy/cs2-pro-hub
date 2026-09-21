# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Current state (September 2026)

### Client-side parser audit

The isolated, authenticated client-parser POC contains the exact upstream demoparser2 0.42.0 browser artifact and a bounded, fail-closed field/parity/determinism harness. No authorized real `.dem` is present, so real API execution, Python×WASM parity and determinism are `NOT_RUN`; overall status is `POC_NOT_READY`. Browser Canonical admission remains blocked and the feature flag remains off by default.

Implemented and proven against the real database:

- **Steam Identity Foundation** — OpenID 2.0 account linking. Steam is an **identity
  source only**; Valve publishes no CS2 match history, so no match data comes from it.
- **FACEIT integration + hardening** — OAuth connection, bounded history pagination,
  job lifecycle with heartbeat/stale recovery, API call budget and worker deadline.
- **Player Identity Graph** — `player_identities` + `identity_correlation_evidence`
  with an evidence hierarchy; identities are server-controlled and never self-promoted.
- **Canonical Match Engine** — source-neutral `match_series` / `matches` /
  `match_sources` / `match_participants` / `match_rounds` / `round_players`, a Match
  Identity Resolver (only `EXACT_MATCH` attaches automatically) and transactional
  persistence (`persist_canonical_observation_attached`).
- **Production FACEIT pipeline** — a FACEIT payload becomes canonical data only through
  `persistFaceitObservation()`. Proof: `bun scripts/faceit-pipeline-proof.ts`.
- **Demo ingestion pipeline** — uploads, jobs, cron worker and canonical projection.
  The real `.dem` parser worker itself is behind `FEATURES.realDemoParser = false`.

Not implemented yet (do not read the UI as real): **Pro Score**, **Player DNA**,
**diagnosis/analysis**, **AI Coach** and **training plans** still render mock content
gated by `DEMO_DATA`. There are no payments.

**Gamers Club — UNAVAILABLE (blocked externally).** There is no official public API and
unauthenticated requests answer `HTTP 403` with a Cloudflare challenge. No collector is
implemented, and no anti-bot circumvention will be.

## Security & data model notes

- **Single administrator**: only `ia@gamepro.academy` holds `admin_master`. The legacy
  `admin` enum value is retained for history but grants no access anywhere.
- **Roles** live exclusively in `public.user_roles` and are evaluated through
  `SECURITY DEFINER` helpers (`is_admin_master`, `is_staff`, `owns_*`). Those helpers
  must stay executable by authenticated users because RLS policies call them — this is
  the source of the known "signed-in users can execute SECURITY DEFINER function"
  linter warnings, which are expected for this design.
- **Players cannot write generated data**: matches, metrics, analyses, findings,
  Player DNA, score snapshots and training plans are read-own only. Uploads are
  insert/read-own; pipeline fields (`status`, `processed_at`, `error_message`) are
  backend-controlled.
- **Canonical data is server-written only**: canonical persistence routines are
  `SECURITY DEFINER` with `search_path = ''` and executable only by
  `postgres` / `service_role`; `anon` has no access to canonical tables.
- **Audit log** (`admin_audit_logs`) is administrator-only, append-only and written in
  the administrator's own name.
- **Avatars are the only real Storage feature**: private `avatars` bucket, path
  `{user_id}/avatar.webp`, JPEG/PNG/WebP input, resized and compressed to ≤ 200 KB,
  owner-scoped RLS, `profiles.avatar_url` stores the stable path (never a signed URL),
  fallback `src/assets/gamepro-symbol.png`.
- **Persistent security suite**: `supabase/tests/security_checks.sql` — every row must
  report `PASS`.

