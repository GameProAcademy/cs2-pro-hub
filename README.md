# CS2 PRO AI COACH — GamePro

This repository is the application source of truth. Lovable is used for product development; GitHub CI and Railway are authoritative for committed/deployed runtime state.

## Development

This project uses Bun and the committed `bun.lock` as the JavaScript dependency lockfile.

```sh
git clone <this-repository-url>
cd <repository-name>
bun install --frozen-lockfile
bun run dev
```

## Current state — September 2026

### Real foundations

- Steam Identity Foundation and FACEIT integration/hardening are implemented.
- Player Identity Graph and the source-neutral Canonical Match Engine are implemented with server-side persistence boundaries.
- The production FACEIT pipeline is wired through the reviewed Canonical persistence boundary.
- Demo ingestion infrastructure exists: uploads, jobs, queue/cron, Railway parser worker, RAW artifact/evidence, HOT projection and reconciliation controls.
- Railway uses Python `demoparser2==0.42.0`.
- Browser/WASM demo parsing is an isolated, authenticated, feature-flagged POC. Browser output is untrusted and cannot write Canonical.

### Current demo/browser gate

The browser POC is **not production-ready** and the Canonical browser admission gate remains closed.

- **F.2.10-E — REAL WASM ARTIFACT:** PASS for exact upstream-source artifact identity; bit-reproducibility is PARTIAL because upstream does not pin Rust/wasm-pack/protoc.
- **F.2.10-F — REAL RUNTIME:** BLOCKED. Chromium initialized the exact artifact and exposed the four required execution APIs, but no authorized real DEM was available, so real API calls were not executed.
- **F.2.10-G — REAL DEM:** NOT_RUN.
- **F.2.10-H — FIELD AUDIT:** NOT_RUN.
- **Python × WASM parity:** NOT_RUN.
- **DEM determinism:** NOT_RUN.
- **Firefox/Safari compatibility:** NOT_RUN.
- **128 MiB boundary and 400 MB testing:** NOT_RUN.
- **Canonical admission from browser output:** MUST REMAIN BLOCKED.
- **AI-data readiness from the browser path:** MUST REMAIN BLOCKED.

The full audit is in `docs/F2_10_WASM_REAL_RUNTIME_AUDIT.md` and the evidence-ready matrix in `docs/F2_10_FIELD_MATRIX.md`.

### Product-data readiness

These product layers still use demonstration data and must not be presented as real player analysis:

- Pro Score
- Player DNA
- diagnosis/analysis
- AI Coach
- training plans

Payments are not implemented.

**Gamers Club — UNAVAILABLE (blocked externally).** No official public API is available to the project; no anti-bot circumvention is implemented.

## Security and data model

- Canonical data is server-written only.
- Browser DEM parsing is isolated and untrusted; it has no direct Canonical write path.
- Historical parser/reconciliation evidence remains forensic unless it passes the current admission gates.
- The persistent security suite is `supabase/tests/security_checks.sql`.

## Railway

The production parser service is `cs2-demo-parser` on branch `infra/cs2-parser-worker-v8`. Its current successful deployment is kept unchanged while browser/WASM work remains isolated.
