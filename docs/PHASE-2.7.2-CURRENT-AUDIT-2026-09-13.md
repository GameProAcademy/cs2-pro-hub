# FASE 2.7.2 — Current Audit / Closure Gate

Date: 2026-09-13

## Verdict

**FASE 2.7.2 remains IMPLEMENTED / NOT CLOSED.**

The architecture and hardening are substantially implemented, but there is still no production-grade proof that a real `.dem` has completed the complete path:

`TUS upload -> private storage -> demo_job -> Railway -> demoparser2 -> RAW evidence -> CanonicalMatch -> identity attachment -> metrics -> features -> persistence -> idempotent reprocessing`.

Therefore **FASE 2.8 must not start**.

## Evidence audited

- GitHub repository `GameProAcademy/cs2-pro-hub`
- APP branch `main`
- Worker branch `infra/cs2-parser-worker-v8`
- Railway project `CS2 Pro Parser Worker`
- Railway service `cs2-demo-parser`
- Current Worker deployment commit: `e6c4257864b0b77416838d09acd0b92032fbb55d`
- Worker parser: `demoparser2 0.42.0`
- Worker build gate: `python -m pytest -q`
- Current worker test result observed in Railway after the integrity fix: build test suite is expected to be re-run after the environment revision update; previous build reached `96 passed, 4 failed, 3 skipped`, and the four failures were traced to the PBDEMS2 frame-reader bug fixed in commit `e6c4257...`.

## What is proven

### APP / domain

- Canonical Match Engine exists and is separated from player projection.
- Match identity resolver is deterministic and fail-closed.
- `NULL` is preserved as unknown; no zero fabrication.
- Demo parser is isolated behind the parser adapter.
- Parser contract version and parser identity/revision are checked at the APP boundary.
- Canonical persistence and demo projection are separate writes.
- RAW evidence is persisted before normalization/canonicalization.
- TUS upload precedes job creation.
- SHA-256 is computed/validated at the upload/processing boundary.
- Demo history uses real `uploads`, `demo_jobs` and `matches` data.
- User declaration is explicit; nickname matching is exact-normalized only and never fuzzy.
- UX progress is stage-derived and monotonic.

### Worker

- Railway source is connected to `GameProAcademy/cs2-pro-hub`, branch `infra/cs2-parser-worker-v8`.
- Root directory is `services/cs2-demo-parser`.
- Dockerfile path is `Dockerfile` relative to the root.
- Docker builder is used; Railpack fallback/import error is no longer the active issue.
- Worker runs non-root.
- Structural PBDEMS2 validation is streaming and fail-closed.
- `demoparser2` is isolated to Railway and never runs in the web runtime.
- Event discovery, selected event extraction, tick sampling, grenade extraction and semantic post-processing are implemented.
- RAW evidence has explicit mapping statuses and coverage gates.
- Real-demo fixture tests exist, but they are intentionally skipped when a real `.dem` fixture is absent.

## Findings / corrections made during this audit

### 1. Railway deployment source problem — RESOLVED

Railway previously kept redeploying an old commit because `Redeploy` reuses the existing deployment commit. The service is now actually building the worker branch's current commit `e6c4257...`.

### 2. PBDEMS2 integrity validator bug — FIXED

The frame reader originally failed to seek to the next frame payload boundary. The correction is present in `demo_integrity.py` and covered by `test_demo_integrity.py`.

### 3. Parser revision pin drift — CORRECTED

The Railway `PARSER_REVISION` was updated to:

`git:e6c4257864b0b77416838d09acd0b92032fbb55d`

The APP fallback revision was also updated so an absent environment override cannot silently fall back to the obsolete `790eaed...` worker revision.

### 4. Player identity precedence bug — FIXED

A confirmed profile Steam ID that was absent from a demo could previously be overridden by a user declaration, potentially attaching metrics to the wrong player. The resolver now returns `steam_id_not_in_demo` and refuses the declaration override. A regression test was added.

## Important remaining blockers

### BLOCKER A — Real `.dem` E2E

Still unproven in the deployed system. The three valid local demos are known:

- Cache: `473,748,061` bytes, SHA-256 `0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d`
- Mirage: `382,007,151` bytes, SHA-256 `1d98f8b6d937ddbd5b2cc486b4830b63dfa85fd6b17b0767b96aa011c0ac7a7f`
- Dust2: `311,024,457` bytes, SHA-256 `1c2710967417153a3fa9a9ae09b1c320d032a176a4317f0cbaf904df638f1259`

At least Cache must pass end-to-end before the phase can be considered closeable; all three should pass before final closure.

### BLOCKER B — Real RAW evidence gate

Unit tests prove the evidence schema and gate logic, but no deployed real demo has yet proven that the observed event/player/tick/grenade inventory produces only accepted mapping statuses and no unexpected `UNMAPPED_BUT_AVAILABLE` entries.

### BLOCKER C — Database persistence proof on a real parsed match

Unit-level persistence tests exist, but production proof must show, for one real demo:

- `matches` / canonical observation created
- `rounds > 0`
- `round_players > 0`
- `match_metrics > 0`
- `match_features > 0`
- user projection attached to the correct participant
- raw evidence row exists
- reprocessing is idempotent

### BLOCKER D — APP/Worker deployment convergence

The Worker revision is now pinned to `e6c4257...`, but the APP's deployed environment must be verified to use the same expected revision after the main-branch change. Source code alone is not sufficient proof of the deployed APP configuration.

## Non-blocking technical debt

1. RAW evidence stores selected raw events in JSONB. This is acceptable for the current audit layer but may require compression/artifact storage before high-volume production.
2. Tick evidence is deterministic sampled evidence, not continuous behavioral telemetry. Full continuous tick/usercommand analysis belongs to a later behavioral-analysis phase.
3. Some raw mapping aliases can remain `RAW_ONLY_INTENTIONAL` even when upstream fields are present; these must remain explicitly documented rather than silently promoted.
4. Worker request timeout uses a thread boundary around the parser; the timeout stops the request but cannot forcibly terminate native parser work already running in the thread. Concurrency/retry limits must remain conservative until production load testing.
5. GitHub currently has no repository CI workflow. Railway's Docker pytest gate protects the Worker build, but APP tests/typecheck/build are not independently enforced by GitHub Actions.

## Closure checklist

- [ ] Railway current deployment SUCCESS on `e6c4257...`
- [ ] `/health` 200
- [ ] `/version` reports demoparser2 0.42.0 and revision `git:e6c4257...`
- [ ] APP expected parser revision matches Worker revision
- [ ] Cache real demo completes end-to-end
- [ ] Cache RAW evidence gate PASS
- [ ] Cache canonical persistence PASS
- [ ] Cache player attachment PASS
- [ ] Cache metrics/features PASS
- [ ] Cache idempotency PASS
- [ ] Mirage real demo completes end-to-end
- [ ] Dust2 real demo completes end-to-end
- [ ] No unexpected `UNMAPPED_BUT_AVAILABLE`
- [ ] No fabricated Steam IDs/entities
- [ ] No duplicate canonical observation on reprocessing
- [ ] Final admin E2E gate PASS
- [ ] Only after all above: close FASE 2.7.2 and start FASE 2.8

## Decision

**DO NOT ADVANCE TO FASE 2.8 YET.**

The correct next milestone is not another feature. It is the first complete production E2E with a real demo, followed by the three-demo regression set and final gate review.
