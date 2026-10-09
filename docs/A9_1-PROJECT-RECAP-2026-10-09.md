# CS2 PRO AI Coach — project continuation brief (2026-10-09)

## Immutable operating rules
1. Do not send any prompt, message, plan, audit, instruction, or request automatically to Lovable. Read-only status inspection is permitted; mutations and messages require explicit user instruction.
2. Perform independent technical audits from GitHub, Railway, and available evidence. Never assume Lovable execution proves correctness.
3. The authoritative application database is created and managed by Lovable Cloud. The personal Supabase account connected to this ChatGPT session is unrelated and empty. Never use it as evidence about production.
4. GitHub and Railway changes are authorized as needed, but no production deployment, staged Railway acceptance, real DEM execution, Attempt 9, or Canonical admission may bypass the explicit security gates and authorization evidence described below.
5. Do not claim real parsing, parity, determinism, runtime attestation or live DB migrations are proven without corresponding current evidence.

## Product and architecture
CS2 Pro Hub / AI Coach is intended to ingest CS2 demos, build canonical match/player/round observations and generate metrics, Player DNA, diagnosis, training plans and AI Coach guidance. Stack includes TanStack Start, TypeScript, React, Tailwind; backend capabilities include Lovable-managed database/Edge Functions, FACEIT integration, and a separate Python parser worker deployed on Railway.

Steam OpenID is an identity source only; it does not provide match history. FACEIT OAuth and bounded history ingestion exist, with player identity correlation and canonical persistence routines. Gamers Club is externally blocked by unauthenticated HTTP 403/Cloudflare; do not implement anti-bot circumvention. The real DEM parser production feature flag remains false. README says Pro Score, Player DNA, diagnosis/analysis, AI Coach and training plans are still mock content gated by DEMO_DATA; payments are not implemented. Do not mistake the UI for proof the data/AI pipeline is production ready.

Security invariants include server-controlled roles, only `ia@gamepro.academy` as `admin_master`, owner-scoped player data, server-only canonical writes, service-role-only canonical persistence routines with empty search_path, append-only admin audit logs, RLS, and fail-closed gates. Historical linter warnings from SECURITY DEFINER functions used by RLS are documented as expected for that design. Preserve current controls.

## Current pipeline decision
### A9.1 controlled WASM large-demo gate
GitHub Actions run 37889202183 / job 113686045967 failed at `parse_ticks`, normalized as `WASM_PARSE_FAILURE`. Rust, wasm-pack, wasm-bindgen installation, the WASM build, initialization and earlier parser API calls succeeded. Parity and determinism did not run. The public artifact intentionally retains sanitized diagnostics and only error digests, so the exact low-level exception is not yet proven.

Artifact: ID 11598221085, `a91-wasm-remediation-evidence-37889202183-1`, SHA-256 `9daa5880cc109f0ac1ea0790b37fa3d33fed7b7457586b602e19f75508f95ba8`.
Safety latches in the failure report were false: `canonicalAuthorization=false`, `attempt9Authorization=false`, `productionAuthorization=false`, `canonicalEligible=false`.

### Current correction proposal
PR #61, draft: https://github.com/GameProAcademy/cs2-pro-hub/pull/61
Branch: `fix/a91-wasm-tick-failure-20261009`
The current manifest has project-catalogued fields that are `runtimeRequestable=true` while `upstreamSupported=false` (including the synthetic `tick` alias). The branch changes the WASM tick selection to require both requestable and upstream-supported fields, adds a synthetic regression assertion, and records failure evidence. This is a conservative contract correction, not confirmed resolution until CI passes; it is not evidence the real demo will parse.

The branch CI is Quality Gates run 37892175528 at https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/37892175528. At brief creation it was still running; inspect the current status before proceeding.

**Promotion risk:** `.github/workflows/a91-wasm-large-demo-remediation.yml` has `contents: write`, defaults `promote_on_pass=true`, and if executed successfully copies the rebuilt WASM/binding/manifest into the checked-in browser parser and pushes to `main`. Do not dispatch the real gate or enable promotion until its security boundary is independently reviewed and the user explicitly authorizes a real-Demo execution. Never use a real-Demo run merely as a speculative unit test.

## Railway — current confirmed inventory
Project `CS2 Pro Parser Worker`: `aa2176ec-0e35-45f0-8cfa-9f8c0707dca4`
Production environment: `2385d707-795d-4e32-a00b-0afaba0a9b7e`
Service `cs2-demo-parser`: `706fa246-a263-484f-a986-c74516be862b`
Source `GameProAcademy/cs2-pro-hub`, branch `infra/cs2-parser-worker-v8`, root `services/cs2-demo-parser`; Dockerfile build; start `python worker_main.py`; healthcheck `/health`; 4 CPU / 4,000,000,000-byte memory cap; sfo region, one replica.
Latest live deployment `1b5778de-3eaf-46f1-9ea5-cba381d95313` is SUCCESS, created 2026-10-05, 1/1 replica online. Worker revision `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`, contract 1. No current health incidents.
Historical staged patch `d66b5a12-a69e-4b9a-87b6-314f75c471cc` has one staged deploy change since 2026-09-16. It is unrelated to current gate correction and remains unaccepted; do not apply without separate reconciliation.

## Roadmap / phase gates
- Earlier phases built identity graph, FACEIT ingestion, canonical match schema and server-only persistence.
- Phase 2.7.2G.5 lifecycle/RAW/HOT/Canonical hardening: disposable concurrency test achieved 50/50 races without duplicate attempts/deadlocks; this never authorized a real Cache attempt.
- F.2.10 client-side parser POC: Web Worker and local-file architecture, artifact identities, catalog/contract provenance, bounded results and parity/determinism harness implemented; real-browser ~400MB DEM, parity and memory benchmark remain unproven at earlier closure.
- G.6-R.4-C.*: canonical field inventory/release attestations remain release-blocked; do not infer the numerous inventoried fields are authorized/verified.
- R5.8.6 PR #56 merged (commit `5385b7d16edd3f4574c39fd9015775b5c36aa903`) with attestation-digest idempotency changes tested against disposable schema. Application to Lovable's live DB remains NOT PROVEN because the managed DB is not directly accessible from this independent audit.
- Post-A9.1 runtime attestation remains NOT RUN / NOT PROVEN. Real Python×WASM parity and determinism remain NOT RUN / NOT PROVEN. Attempt 9/10+, production DEM processing, Canonical admission and generated AI data remain LOCKED.
- Do not force-merge PR #46; it is conflict-blocked.

## Current next steps
1. Read current status of PR #61 Quality Gates and fix only concrete failures with synthetic/local tests.
2. Independently review diagnostics and runtime request contract; preserve enough bounded sanitized evidence to diagnose the exact API failure, without leaking raw data or credentials.
3. Review the real-Demo workflow's default promotion and contents-write capability. Add a safer explicit promotion gate before any future dispatch.
4. Keep Railway unchanged while the failure is in the isolated CI runner.
5. Only after current code CI is green and release/promotion safety is reviewed, present the separate real-Demo gate and obtain explicit authorization before running it.
6. After a separately authorized successful real run, independently evaluate result artifact, 2x Python / 2x WASM identities, full parity, determinism, memory/resource behavior, artifact provenance, and no unsafe leakage. Only then propose later gates, still keeping production/Canonical locked pending their own attestation.
