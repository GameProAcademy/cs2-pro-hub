# CS2 PRO AI COACH — GamePro

This repository is the source of truth for the application code. Lovable is used for product development; GitHub CI and Railway are authoritative for committed/deployed runtime state.

## Development

This project uses Bun and the committed \`bun.lock\` as the reproducible JavaScript dependency lockfile.

```sh
git clone <this-repository-url>
cd <repository-name>
bun install --frozen-lockfile
bun run dev
```

## Current state (September 2026)

### Real foundations

- **Steam Identity Foundation** — OpenID 2.0 account linking. Steam is an identity source only; Valve publishes no CS2 match history.
- **FACEIT integration + hardening** — OAuth connection, bounded history pagination, job lifecycle with heartbeat/stale recovery, API call budget and worker deadline.
- **Player Identity Graph** — \`player_identities\` + \`identity_correlation_evidence\` with server-controlled promotion.
- **Canonical Match Engine** — source-neutral match/match-series/participant/round structures, Match Identity Resolver, and transactional server-side persistence.
- **Production FACEIT pipeline** — FACEIT observations reach Canonical only through the reviewed persistence boundary.
- **Demo ingestion infrastructure** — uploads, jobs, queue/cron, Railway parser worker, RAW artifact/evidence, HOT projection and reconciliation controls.
- **Python demoparser2 0.42.0** — the Railway parser is pinned to 0.42.0 and is the current real DEM parsing runtime.
- **Browser/WASM parser POC** — isolated, authenticated, feature-flagged and fail-closed; it remains untrusted and cannot write Canonical.

### Current demo/browser gate

The browser POC is **not production-ready**.

- \`F.2.10-A\` — browser runtime/Worker contracts hardened, but the auditable demoparser2 0.42.0 WASM artifact is still \`UNAVAILABLE\`.
- \`F.2.10-B\` — real browser/WASM DEM execution is \`NOT_RUN\`.
- \`F.2.10-C\` — Python × WASM same-DEM parity is \`NOT_RUN\`.
- \`F.2.10-D\` — large-demo/memory testing is \`NOT_RUN\`; the conservative browser POC ceiling is 128 MiB.
- **Canonical admission from browser output remains BLOCKED.**
- **AI-data readiness from the browser path remains BLOCKED.**

### Product-data readiness

The following product layers still use demonstration data and must not be presented as real player analysis until their upstream data contracts are live:

- Pro Score
- Player DNA
- diagnosis/analysis
- AI Coach
- training plans

Payments are not implemented.

**Gamers Club — UNAVAILABLE (blocked externally).** No official public API is available to the project; unauthenticated access is challenged. No anti-bot circumvention is implemented or planned.

## Security and data model

- Canonical data is server-written only.
- Player clients cannot self-write generated metrics/analyses/score/training data.
- Canonical persistence uses reviewed server-side security boundaries.
- Browser DEM parsing is isolated and untrusted; it has no direct Canonical write path.
- Historical parser/reconciliation evidence remains forensic unless it passes the current admission gates.
