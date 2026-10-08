# CURRENT STATE RECONCILIATION — 2026-10-06

## GitHub / Lovable forensic reconciliation — 2026-10-08

- [ ] Verify live GitHub main against local tree without reverting externally implemented parser corrections.
- [ ] Audit app, parser/Worker, database/security and validated-data consumers read-only; record evidence and unknowns.
- [ ] Implement only necessary app-side compatibility corrections and run relevant no-DEM tests.
- [ ] Deliver A–L audit, risk register and next gate; keep real execution, Attempt 9+, Canonical, Railway and secrets locked.

## A9.1 Run #9 postmortem — independent correction pass — 2026-10-08

- [x] Independently confirmed GitHub Actions Run #9 (37663923729) failed in the isolated four-run execution step after 3m23s; the sanitized three-report artifact uploaded successfully, so the failure was not an artifact-upload/security-boundary failure.
- [x] Independently confirmed the Run #9 public log did not expose the normalized child failure reason; the artifact/private evidence boundary intentionally prevented raw stderr from appearing in public logs.
- [x] Audited the post-Run #9 WASM memory hardening and found a concrete implementation defect: run_wasm_reference.mjs attempted parser.memory, but the no-modules wasm-bindgen wrapper exposes memory through the object returned by initSync(), while parser is the wrapper function/object.
- [x] Corrected the A9.1 runner to retain the wasmExports returned by parser.initSync(wasm), validate wasmExports.memory, and pre-grow the actual WASM linear memory through that export.
- [x] Added a static regression guard proving the runner uses initSync exports and contains no parser.memory access.
- [ ] A9.1 real execution remains NOT RUN after this correction. No workflow dispatch was performed automatically; fresh Run #10 evidence must be generated separately.
- [ ] No conclusion is permitted yet that the original Run #9 failure was caused by WASM memory. The defect above is independently proven in the post-Run #9 code path, but causality for Run #9 itself remains NOT_PROVEN without its private report.
- [ ] A9.2 browser capability, Attempt 9+, production DEM, Canonical admission, Railway mutation and secret mutation remain LOCKED.

## A9.1 Run #9 postmortem — runner hardening — 2026-10-07

## A9.1 Run #9 postmortem and runner hardening — 2026-10-07

- [x] Run #9 completed as GitHub Actions run 37663923729 on main commit cf98cf715997a77da05f51cddbfcb62381864f81; execution failed after 3m23s while the sanitized three-report artifact uploaded successfully. The failure is therefore not an artifact-upload/security-layer failure.
- [x] Independent runner log review confirms the job used Ubuntu 24.04, Node.js 22.23.3, Python 3.12.14 and demoparser2 0.42.0; the old Node-20 action warnings were non-fatal but the action pins were outdated after GitHub's Node-20 retirement.
- [x] Correct the A9.1 workflow to pin Ubuntu 24.04, checkout v7.0.1, setup-python v7.0.0, upload-artifact v7.0.1 and Node 24.9.0 for reproducible WASM execution.
- [x] Add a bounded public-decision log line containing only status/reason/stage/failedStage/errorDigest; no raw stderr, DEM content, URL or private evidence is exposed.
- [x] Add runner resource telemetry (CPU, RAM, disk, ulimit) before the real execution.
- [ ] Run #9 exact normalized root cause remains NOT PROVEN from public logs alone because the execution step intentionally emitted only the generic final decision; the uploaded bounded artifact remains the authoritative failure evidence. The next run will print its allowlisted decision directly in the job log.
- [ ] No conclusion is permitted yet that the failure is WASM memory, parser corruption, parity mismatch or determinism mismatch.

## A9.1 post-Run #8 laboratory hardening — 2026-10-07

- [x] Separate bounded public/private evidence, capture private child diagnostics and WASM stage/memory telemetry, preserve all gate criteria, and validate regression tests: 106 files / 1426 tests PASS; lint 0 errors / 9 warnings; automatic build OK. Exact manual/main-only/read-only YAML and three-report upload allowlist verified.
- [x] Document the manual next-run prerequisites and conceptual A9.2 gate; no DEM execution, production changes or authorization. Run #8 root cause remains NOT PROVEN without private evidence.
- [x] Keep A9.1 and A9.2 independently gated: missing browser deployed-bundle proof (`H3E91_BROWSER_BUILD_OUTPUT_MISSING`) is an A9.2/browser-release blocker, not an A9.1 real-DEM parity blocker.

## A9.1 controlled real DEM harness

- [x] A9.1-R1.1: corrections IMPLEMENTED; synthetic suites and lint PASS; A9.1 is ready for its separate manual real-DEM execution gate. Browser-output proof is tracked separately under A9.2 and does not block A9.1.
- [ ] A9.2 Browser Large DEM Capability Gate — LOCKED; future 473 MB browser worker, memory/hash/parse/startup/WASM-load/result-size/UI responsiveness/abort/cleanup evidence; not executed here.
- [x] A9.1-R1: implement isolated manual workflow, validation, real WASM runner, final fail-closed decision, security/cleanup tests and documentation (no DEM execution). Local validation recorded in docs/A9_1_REAL_DEM_EXECUTION.md; deployed browser-bundle proof remains NOT PROVEN.
- [ ] A9.1-R2: real execution — LOCKED UNTIL MANUAL WORKFLOW DISPATCH.
- [ ] A9.1-R3: Python × WASM parity — LOCKED UNTIL REAL RUNS.
- [ ] A9.1-R4: determinism — LOCKED UNTIL REAL RUNS.
- [ ] A9.1-R5: independent gate decision — LOCKED.

## H.3-E.5-R FINAL RUNTIME PARITY CLOSURE — CURRENT TRUTH

- [x] PR #60 route-registration guard was corrected, Quality Gates #666 / run `37437527249` completed **SUCCESS**, and the corrected branch head `503b363a57de4b621ac2b8933d3d54d7d414fb84` was squash-merged.
- [x] Current GitHub `main` is `828b01b373cdb9afa6dbcd9bd536b3b4ed9cde7a`; compare against `a1e8f9b6d59c0936ffea86f0327ab252524c4a84` is fast-forward-only with PR #60 changes; no force merge was used.
- [x] PR #60 CI passed the route-registration test, web tests/lint/build, contract-sensitive parser tests and F553 R11.2 disposable execution, including browser isolation and production browser-output build/check.
- [x] Lovable project `91478977-16c3-4839-ae28-6796024bcfc9` is synchronized to `828b01b373cdb9afa6dbcd9bd536b3b4ed9cde7a`, published=true, status=ready, agentFinished=true.
- [x] A production publication was explicitly requested through the Lovable deploy operation; deployment id `4168ed02-5716-4665-a707-5b4b7dbba945` was returned as `pending`.
- [ ] The exact published runtime revision for `828b01b373cdb9afa6dbcd9bd536b3b4ed9cde7a` is **NOT INDEPENDENTLY PROVEN**. The available web/container environment cannot currently resolve/access the public domains, so no current fingerprint claim is being fabricated.
- [ ] Browser bundle/source-map security evidence remains **NOT PROVEN** as a distinct release subgate; the PR CI result proves the disposable/build checks, not a current public-production source-map inspection.
- [x] Historical Attestation #31 and all pre-A9.1 provenance remain preserved and are not reused as post-A9.1 evidence.
- [ ] Fresh post-A9.1 Runtime Attestation #36 remains **NOT RUN / NOT PROVEN**.
- [ ] Fresh real-DEM Python/WASM parity and determinism remain **NOT RUN / NOT PROVEN**.
- [x] Attempt 9/10+, production DEM, Canonical admission, Railway mutation, staged EnvironmentPatch acceptance and secret mutation remain locked/untouched.

## H.3-E.5-R — RUNTIME ATTESTATION #36 CLOSEOUT — 2026-10-06

- [x] Parser Runtime Attestation #36 manually executed on main; GitHub run 37443082666, attempt 1, job attest-runtime completed SUCCESS in 14s (19s total).
- [x] All attestation steps completed: approved-source checkout, frozen Railway branch ancestry check, Python evidence build, GitHub OIDC minting, evidence artifact upload, HMAC signing and server-side delivery.
- [x] Exactly one evidence artifact was produced: parser-runtime-attestation-37443082666-1, artifact id 11402146519, SHA-256 7df7923b0e66f667ec60dd013b9121cfde0f4530de1a69e3c56086c4f0f831b0.
- [x] Artifact payload status is VERIFIED with blockers=[]; attestation digest is 7f29380ac369c1f8915ac7982021680f54a4b7ef4de3b13bd51f20221e0436a6.
- [x] All five critical parser source hashes match, including services/cs2-demo-parser/worker.py = 50a53b607d26f00b4de05c5e8998611959e27bd1.
- [x] Railway deployment identity is independently verified as deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313, source commit 91aeee853200d0f461d0d36af1781d7fdfa40941, parser demoparser2 0.42.0, contract 1, semantic/build revision 5703b1d88f21ee57fdd1d83722edf30e0f0c6f76.
- [x] GitHub/OIDC identity is bound to repository GameProAcademy/cs2-pro-hub, branch main, trigger commit 3d9805643af6c8e99802f4f691edf1176c382c63, workflow path .github/workflows/parser-runtime-attestation.yml, workflow source SHA 3070d8bae6c3f02093bbb2595138c913646c2e31, run id 37443082666.
- [x] The live project DB now contains 3 provenance rows, 3 VERIFIED, and 3 nonces; the new row exactly matches attestation digest 7f29380..., nonce 9acd0b3c..., workflow run 37443082666, and app source commit 3d980564....
- [x] Historical provenance was not rewritten; the new attestation is a distinct digest-scoped record under R5.8.6.
- [x] The attestation release-gate payload correctly keeps unrelated gates BLOCKED: real DEM authorization, CI/release evidence, Canonical field gate, attempt sequencing, cleanup safety, tick-domain authority and mapping admission are not falsely promoted by runtime attestation.
- [ ] Runtime Attestation #36 therefore closes PASS for parser runtime provenance, but it does not authorize Attempt 9, production Cache execution or Canonical admission.
- [ ] The GitHub runner warnings about Node.js 20 deprecation / future Ubuntu 26 migration are non-blocking maintenance warnings; changing the attestor workflow now would invalidate the current workflow identity and require a new attestation, so no opportunistic change is made in this gate.

## NEXT GATE — A9.1 REAL DEM PYTHON × WASM PARITY + DETERMINISM

- [x] A real authorized Cache DEM is available in the Library: furia-vs-gamerlegion-m1-cache.dem, 473,748,061 bytes, SHA-256 0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.
- [x] The repository contains fail-closed parity/determinism comparators requiring the same DEM SHA, exact parser/catalog/contract identity, two Python runs, two WASM runs, four unique run IDs and stable digest equality; canonical authorization remains false.
- [ ] Execute the real 2×Python + 2×WASM harness against this DEM outside production ingestion, then independently reconcile all domain digests.
- [ ] Required domains include header, map, tickrate/playback ticks, players/identity, events, rounds, grenades, bomb, damage, deaths, weapons, economy, tick properties and game state.
- [ ] Require Python/WASM equality for normalized outputs and determinism across both repeated runs; any mismatch is fail-closed.
- [ ] Do not run Cache Attempt 9, do not enqueue/retry the production job, do not write Canonical, do not mutate Railway, and do not use the historical RAW artifact as a substitute for fresh A9.1 parity.
- [ ] After parity/determinism PASS, independently reconcile the real-Dem evidence and only then evaluate the next controlled execution gate.

**Current decision:** Runtime Attestation #36 is CLOSED / PASS. The project is now BLOCKED by the next evidence gate: fresh real-DEM Python/WASM parity + determinism. A9.2 browser capability remains separately locked until A9.1 PASS. Attempt 9 and Canonical remain locked.



## POST-LOVABLE COMPLETION RECONCILIATION — 2026-10-06

- [x] Lovable completed the H.3-E.2 / H.3-E.5 safe preflight on current project state; latest synced `main` commit is `3f3b6efaa627cae101bf5683da6322ecada33a53`.
- [x] Independent inspection confirms the HMAC bridge contract is now present on `main`, including structure-aware transaction-local `set_config(..., true)` coverage and service-only/non-persistent assertions.
- [x] Lovable reported full local validation PASS: 104 test files / 1,419 tests, TypeScript validation, lint and public-build validation PASS; no attestation secret names/values exposed in generated/browser output.
- [x] Safe production preflight returned HTTP 401 `UNAUTHORIZED` for an empty anonymous attestation request; this proves only the transport-auth boundary and does not constitute an attestation.
- [x] The stale PR #57 is now CLOSED without merge because its proposed test correction is already present on `main` in commit `3f3b6ef...`; no duplicate merge was performed.
- [x] Railway production remains unchanged and healthy: deployment `1b5778de-3eaf-46f1-9ea5-cba381d95313` SUCCESS; staged EnvironmentPatch `d66b5a12-a69b-4b9a-87b6-314f75c471cc` remains STAGED and was not accepted.
- [x] Live project-DB R5.8.6 reconciliation remains applied: attestation-digest uniqueness, digest-scoped recorder idempotency and current worker hash are reconciled; historical provenance/nonces remain preserved.
- [ ] Remote GitHub Quality Gates for the new `3f3...` main commit are NOT_PROVEN through the available connector; the 1,419-test result is independent local validation, not a fabricated remote CI result.
- [ ] Fresh post-A9.1 Runtime Attestation remains NOT RUN / NOT PROVEN.
- [ ] Fresh real-DEM Python/WASM parity and determinism remain NOT RUN / NOT PROVEN.
- [ ] Attempt 9/10+, production DEM processing and Canonical admission remain LOCKED.

**Current decision:** H.3-E.2/H.3-E.5 implementation and safe-preflight evidence are PASS; production execution remains BLOCKED until a separately authorized fresh Runtime Attestation is executed and independently reconciled, followed by the still-required real-DEM parity/determinism evidence.


## H.3-E.2 / H.3-E.5 FINAL SAFE PREFLIGHT — 2026-10-06

- [x] Register H.3-E.2 service-only, transaction-local HMAC bridge evidence without reading or exposing secret values.
- [x] Register H.3-E.5 scoped runtime binding evidence for only the endpoint, transport and HMAC attestation bindings.
- [x] Verify safe production preflight: anonymous empty recorder POST returns 401; no attestation payload, OIDC token, signature, nonce or release evidence was sent.
- [x] Verify local gates: TypeScript, lint, public-build validation and 104 test files / 1,419 tests pass; supervised build is green.
- [x] Preserve database state and locks: historical provenance 2, nonces 2, Attempt 9/10+ zero, Canonical 105/0/0/0; Railway and secrets unchanged.
- [x] PR #57 closed without merge because its proposed structural-aware test correction is already present on current `main`.
- [ ] Runtime Attestation, real DEM, Attempt 9/10+, Cache Run and Canonical admission remain NOT RUN/BLOCKED pending a separately authorized controlled phase.

## R5.8.5 / R5.8.6 / A9.1 CURRENT RECONCILIATION — 2026-10-05

- [x] Merge A9.1 fail-closed Python/WASM parity and determinism hardening (PR #52) into `main`; merge commit: `1a3b93376019989780f18868e3f0022d459a72de`.
- [x] Require exact parser version/revision, catalog version/digest, contract version/digest and WASM artifact identity across the four A9.1 runs; invalid artifact status is rejected.
- [x] Preserve A9.1 as a proof contract only: no DEM execution, persistence, Canonical authorization or Railway mutation is introduced.
- [x] Parser Runtime Attestation #31 completed successfully against the pre-A9.1 `main` revision `ee66714001fa9da1d9b55bfdcc452a30c2d07509`; the later A9.1 merge is `1a3b93376019989780f18868e3f0022d459a72de`, so #31 is evidence for the pre-merge runtime and must not be reused as proof of the post-A9.1 source state.
- [x] Railway parser deployment `1b5778de-3eaf-46f1-9ea5-cba381d95313` is independently observed as SUCCESS for branch `infra/cs2-parser-worker-v8`, with parser semantic/build revision `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76` and contract `1`.
- [x] Observe current-main R5.8.3 run `37390846678` and R5.8.4 run `37390871643` as successful, with immutable evidence artifacts bound to `9d330aea03bdc0142be431baca767151baed2d2c`.
- [x] Confirm Attestation #31 persisted one historical VERIFIED provenance row for pre-A9.1 source `ee66714001fa9da1d9b55bfdcc452a30c2d07509`; current-main provenance remains absent.
- [x] Reconfirm Attempt 9/10+ are zero and Canonical remains 105 total / 0 generic / 0 authorized / 0 verified through read-only database queries.
- [x] Repair current-main Quality Gates without weakening validation: stale OIDC fixtures, attestor-source fixture, and removed-migration reference were corrected in PR #53; Quality Gates #633 passed.
- [x] Add direct safe tests for the A9.1 script-level identity/status mismatch branches; PR #54 added synthetic fail-closed coverage and Quality Gates #640 passed.
- [ ] Reconcile the complete Attestation #31 artifact/release-gate payload independently before treating individual H.3-E/R5.8 gates as VERIFIED.
- [ ] Fresh A9.1 real-DEM parity/determinism proof remains NOT_RUN until explicit operator authorization is provided.
- [ ] Attempt 9/10+, production DEM processing, Canonical admission, Railway mutation, secret mutation and automatic Runtime Attestation remain prohibited.

## R5.8.3 EXTERNAL RETRY — 2026-10-05

- [x] Observed failed GitHub run `37295286546` on pre-repair commit `01d3da377299016fe7ba639c397ad62ba7c52a0f`: failure was the old `ModuleNotFoundError: No module named 'scripts'` before the repaired commit reached main.
- [x] Confirmed the repaired R5.8.3 entrypoint and 20/20 focused local tests are present in `f3230e4e6db0b9ff896bbfcfc3bb94946f82388d`.
- [x] Automatic R5.8.3 preflight run `37386788174` passed on repaired main revision `f85fcc07e15ea740d04d1b2005407208f2ed5779`; its evidence artifact exists with digest `sha256:0bdada5d6887f36df5aca6a6692b981d38ee585b559bb6e6821a4f605fdf4c96`.
- [ ] Fresh Runtime Attestation remains blocked until R5.8.3 external evidence is GREEN and all independent release gates are reconciled.

## R5.8.3 / R5.8.4 PREPARATION — 2026-10-05

- [x] Make the R5.8.3 workflow entrypoint resolve its shared attestation module without implicit `PYTHONPATH`.
- [x] Add direct-entrypoint regression coverage and include it in the read-only workflow.
- [x] Add a pure, fail-closed 32-gate R5.8.4 reconciler with no execution authority.
- [x] Observe the automatic R5.8.3 GitHub run and its uploaded evidence artifact after this change reaches `main`.
- [ ] Run a fresh Runtime Attestation only through a separately authorized manual operator action, then reconcile all 32 gates independently.
- [ ] Attempt 9, real DEM processing, RAW production persistence and Canonical admission remain blocked.

## BRIDGE CLAIM RECOVERY — 2026-10-05

- [x] Published authenticated claim returned HTTP 200 with `status=empty` repeatedly while `demo_parse` remained empty; invalid authentication and payloads remained 401/400.
- [x] Lovable Cloud, database, PGMQ 1.5.1, queue objects, installed durable RPC signatures, migrations and service-only privileges were verified healthy and aligned.
- [x] Attempt 9/10+ remain zero; Canonical remains 105 total, zero authorized, zero verified and zero generic; no DEM, job, message, RAW, Storage, secret or Railway mutation occurred.
- [x] Full TypeScript pipeline suite passed (56 files / 787 tests), focused parser/worker tests passed (53), and R11.2 attestation/storage tests passed (13).
- [x] Harden R11.2 post-completion attestation so duplicate `fixture_id` values fail closed, matching the existing duplicate `case_id` rule.
- [ ] Railway polling/log confirmation remains externally unobservable because no Railway connection or token is available in this environment; direct published endpoint polling is healthy, but worker-log absence of new 500s remains `NOT_PROVEN`.
- [ ] Current-main Quality Gates must run and complete successfully after the fail-closed verifier correction; the preceding run remains in progress and historical R11.2 Job B remains independently successful.

- [x] F.5.3-CLOSURE.8-R11.2: **CLOSED for disposable evidence.** GitHub Quality Gates run `36540857052` on commit `89878a5bda00a34d892722e7664902c71e1a1464` completed successfully. Job A proved the integrated disposable upload → queue → claim → demoparser2 0.42.0 → RAW → private Storage read-back → HOT → FINISHED → ACK lifecycle, Worker A SIGKILL recovery, ACK-loss redelivery without duplicated outputs, PROCESS_ABORTED terminalization, exactly-once recovery, 50 race cases, 50 failure cases and 16 RAW-corruption cases. Docker, browser and parser tests also passed in the same run.
- [x] F.5.3-CLOSURE.8-R11.2 Job B: **INDEPENDENT POST-COMPLETION ATTESTATION CLOSED.** Attestation run `36541969539` independently reconstructed and verified the exact source run, successful required sibling jobs, immutable evidence artifact and artifact digest `sha256:be1a8a8e0291bd1e15bf7cbdb384d6828671d42949937f9c57135eee6d363a11`, producing `final_ci=PASS` and `final_decision=CLOSED`.
- [x] F.5.3-CLOSURE.8-R11.2-R5/R6/R10/R11: **superseded and closed by the verified R11.2 execution + independent Job B seal above.**
- [ ] **NEXT:** FASE 2.7.2G.6-R.5.8 controlled attestation readiness. The R11.2 disposable gate is closed, but the first real production attestation has **not** been executed. R5.8 remains fail-closed until protected operator configuration and external preflight are independently GREEN.
- [ ] Real DEM / Attempt 9+ / final RAW production evidence / Canonical admission / Railway mutation remain **LOCKED**.
- [x] **R5.8 code repair cycle:** H.3-E.3 is now strictly diagnostic-only (no `actions: write`, no attestation dispatch); Parser Runtime Attestation is `workflow_dispatch`-only on `main`; the approved attestor workflow blob registry was refreshed after the source change; H.3-E.9.1 collector SHA pin was reconciled to the current collector workflow. No secrets, Railway state, DEM, provenance, nonce, Canonical, or production data were mutated.
- [ ] **R5.8 operational gate remains pending:** protected database HMAC setting, `RAILWAY_API_TOKEN`, live endpoint/runtime preflight, and then an explicit manual attestation dispatch are still required. The attestation workflow has not been executed by these repairs.

> This section is the authoritative current-state snapshot. Older phase sections below are retained as historical implementation records and may contain earlier `NOT_RUN` wording.

## Current milestone

**H.3-E — Controlled Cache Execution Envelope**

Status: `IMPLEMENTED / FAIL-CLOSED / PRE-EXECUTION`.

### H.3-E.2 — Protected Operator Configuration & Attestation Readiness

Status: `IMPLEMENTED / PRE-EXECUTION / FAIL-CLOSED`.

- [x] Keep the external recorder on the supported server-only `/api/public/parser-attestation` boundary.
- [x] Require transport authentication, cryptographic GitHub OIDC verification and exact claim binding.
- [x] Verify the exact workflow-supplied canonical bytes, SHA-256 digest, HMAC-SHA256 signature and signed release evidence.
- [x] Add a service-only database wrapper that injects the existing HMAC secret with transaction-local `set_config(..., true)` and delegates to the unchanged authoritative recorder.
- [x] Preserve private/RLS/immutable provenance and nonce storage and replay rejection.
- [x] Adapt the manual GitHub workflow to send `canonicalPayload` without dispatching it.
- [ ] Execute the first attestation: `NOT RUN`.

**Locks:** no real DEM, Cache DEM, Attempt 9/10+, final RAW evidence, Canonical authorization, Railway mutation, EnvironmentPatch, secret rotation, or attestation workflow execution occurred.

### H.3-E.5 — Server Runtime Configuration Repair

Status: `IMPLEMENTED / PUBLISHED / FAIL-CLOSED`.

- [x] Preserve the existing secret values and bridge only the two named server runtime bindings into the TanStack server environment.
- [x] Keep missing/invalid configuration at `503 ATTESTATION_SERVER_NOT_CONFIGURED` and preserve all cryptographic and database gates.
- [x] Add non-disclosure and binding-scope tests without using production secret values.
- [x] Republish the application and verify an anonymous POST advances to the expected `401 UNAUTHORIZED`.

**Observed state:** H.3-E.3 Final External Preflight #9 completed successfully on `main`. Parser Runtime Attestation #9 reached verified evidence generation and GitHub OIDC minting, then delivery failed with `503 ATTESTATION_SERVER_NOT_CONFIGURED`; that failed request wrote no parser provenance. H.3-E.3 remains a reachability-only check and must not be interpreted as endpoint readiness.

**Locks:** no attestation rerun, DEM execution, Canonical admission, Railway mutation, database migration, or secret value change is authorized by this repair.

### H.3-E.7 / H.3-E.8 — Attestation Envelope and Deployment Identity Repair

Status: `IMPLEMENTED / PRE-PUBLISH / FAIL-CLOSED`.

- [x] Identify the exact HTTP 400 cause: the workflow read `.release_gate_evidence` instead of `.payload.release_gate_evidence`, producing `null` at `releaseGateEvidence`.
- [x] Preserve the strict body schema and safe diagnostics (`invalid_type`, `releaseGateEvidence`, `Expected object, received null`).
- [x] Use one shared route/test envelope schema and add positive plus fail-closed negative coverage.
- [x] Align the application expectation to existing Railway deployment `7a540da0-3a69-44c0-9c42-40209f903fa7` without changing Railway.
- [ ] Publish the Lovable application and verify only an anonymous empty POST returns `401 UNAUTHORIZED`.

**Locks:** valid attestation delivery NOT RUN; real DEM, Cache DEM, Attempt 9/10+, ingestion, Canonical admission, Railway mutation, migration, secret change, and secret rotation remain prohibited.

### H.3-E.8.1 — Database Persistence Identity Reconciliation

Status: `PASS / FAIL-CLOSED`.

- [x] Apply the additive identity-only migration with zero-row and exact-old-pin preconditions.
- [x] Prove APP = WORKFLOW = DATABASE for deployment and approved workflow source.
- [x] Reconfirm RLS, immutable triggers, zero client privileges, service-only recorder execution, `SECURITY DEFINER`, and empty `search_path`.
- [x] Run synthetic/full verification and require an anonymous empty production POST to remain `401 UNAUTHORIZED`.
- [x] Leave H.3-E.9 as `READY / NOT EXECUTED` after every H.3-E.8.1 gate passes.

**Locks:** no valid attestation, DEM, Cache DEM, ingestion, Canonical admission, Railway mutation, or secret change is authorized.

### H.3-E.9 — Final Execution Readiness Gate

Status: `BLOCKED / NOT EXECUTED`.

- [x] Implement a deterministic, machine-readable `READY | BLOCKED` preflight with stable blocker codes.
- [x] Keep technical readiness, retention authorization, operator authorization, execution, and verified provenance as independent states.
- [x] Reconfirm the H.3-E.8.1 migration, zero provenance/nonces, RLS, client privilege isolation, service-only recorders, `SECURITY DEFINER`, and empty `search_path` by read-only inspection.
- [x] Reconfirm the approved workflow blob, structural OIDC policy, exact runtime identity on both live domains, and the anonymous `401` recorder boundary.
- [x] Prove the evaluator is pure, deterministic, diagnostic-only, and cannot dispatch workflows, parse DEMs, mutate Railway, write provenance/nonces, unlock Canonical, clean up data, or rotate secrets.
- [ ] Provide a current explicit retention authorization: `BLOCKED`.
- [ ] Provide a current explicit operator authorization for the first valid attestation: `BLOCKED`.

**Locks:** valid attestation, workflow dispatch, DEM/Cache DEM, Attempt 9+, final RAW, Canonical admission, cleanup, Railway/EnvironmentPatch mutation, secret changes, feature changes, and database writes remain prohibited.

### H.3-E.9.1 — Live Evidence Collector & Machine-Readable Preflight

Status: `IMPLEMENTED / DIAGNOSTIC-ONLY / FAIL-CLOSED`.

- [x] Add a GitHub-OIDC-protected server endpoint that accepts only strict safe external evidence and never trusts client-supplied database state.
- [x] Collect database counts, migration history and security invariants through one additive service-role-only read-only diagnostic RPC; missing evidence remains `UNKNOWN/BLOCKED`. Real DEM/Cache DEM execution counts remain unknown without a ledger.
- [x] Pin the manually dispatched collector workflow identity/SHA separately from the attestation blob; collect safe external claims and server-side anonymous `401` with before/after counts.
- [x] Feed collected evidence into the unchanged pure H.3-E.9 evaluator and emit canonical JSON evidence with a reproducible SHA-256 digest.
- [x] Keep retention and operator authorization explicitly `NOT_AUTHORIZED` unless separately supplied through a future reviewed authority.

**Locks:** FIRST VALID ATTESTATION = NOT RUN; DEM = NOT RUN; CACHE DEM = NOT RUN; ATTEMPT 9 = LOCKED; CANONICAL = LOCKED. One additive read-only diagnostic RPC migration; no provenance, nonce, cleanup, execution dispatch, Railway/EnvironmentPatch mutation or secret mutation.

### H.3-E.9.1-R2 / H.3-E.9.2 preparation

- [x] Capture a server baseline and read-only, baseline-relative **mutable job-row diagnostic**; preserve `UNKNOWN/BLOCKED` where absence of execution cannot be proven.
- [x] Check collector workflow structure and artifact freshness without changing the approved workflow SHA or authorizing execution.
- [x] Document the H.3-E.9.2 prerequisite contract and verify synthetic diagnostics. R2 closure remains **BLOCKED** pending an authoritative append-only execution ledger and reviewed live evidence.

### H.3-E.9.1-R3

- R3 is closed **only as diagnostic preparation**; the sealed ledger has no event writer and proves no absence of execution.
- [x] Correct mutable-job temporal diagnostic and distinguish historical, spanning, and post-baseline starts.
- [x] Prepare sealed append-only execution event structure and read-only inspector, without events or a writer.
- [x] Preserve UNKNOWN/BLOCKED for empty but uninstrumented evidence; include it in the signed diagnostic digest.
- [ ] Instrument and independently review all actual execution writers before the ledger can prove absence; blocked by separate operational authorization.
- [ ] R3 closure blocked by uninstrumented ledger and missing live evidence; no execution or operational mutation authorized.

### H.3-E.9.1-R4 — execution writer coverage

Status: **BLOCKED / FAIL-CLOSED / DIAGNOSTIC-ONLY**.

- [x] Inventory APP remote parser, Railway durable worker, Railway `/v1/parse`, and browser/WASM as four distinct potential entry points in a machine-readable, server-only diagnostic.
- [x] Report every surface as `NOT_COVERED`; unregistered surfaces and missing inventory entries block the diagnostic. Include the coverage report in the evidence digest and use a specific uncovered-surface blocker.
- [ ] Independently review a controlled, append-only event writer and all real execution paths, with fail-closed pre-parser writes and synthetic lifecycle/concurrency/security tests. No writer is enabled in this phase.
- [ ] Verify deployed Railway source parity and all execution surfaces before asserting `writerCoverageVerified=true` or `ledgerAuthority=AUTHORITATIVE`.

**Locks:** no valid attestation, DEM, Cache DEM, Attempt 9+, Canonical admission, RAW finalization, cleanup, Railway/EnvironmentPatch mutation, deployment, secret changes or workflow dispatch. R5.8 and H.3-E.9 remain blocked; retention and operator authorization remain absent.

### H.3-E.9.1-R4.1 — controlled writer and coverage closure

Current implementation update: migration `20260926030030_f488bae4-e05f-48cb-a00d-bd396e374e49.sql` installed the version-1 controlled writer in the live database. Read-only inspection confirms zero ledger rows, no direct `INSERT` for `sandbox_exec` or `service_role`, and `EXECUTE` on the writer only for `service_role` (not `authenticated`). Source instruments APP and both Railway parser entrypoints, with a bounded authenticated bridge and synthetic failure tests. Production APP dispatch and production bridge recording remain blocked on independently verified deployed-source parity; no Railway deployment was performed. Earlier checklist items below describe the previous checkpoint, not current activation. **BLOCKED / FAIL-CLOSED / DIAGNOSTIC-ONLY** remains the controlling status; disposable database concurrency passed 30 cases and 50 isolated stress executions, but exhaustive failure injection, deployed image parity and all 20 independent proofs have not passed.

Status: **BLOCKED / FAIL-CLOSED / DIAGNOSTIC-ONLY**. The database's observed `sandbox_exec` direct-write grant was revoked and checked again. Existing R4 diagnostics were formatted for CI. No event writer was activated: APP remote parsing, Railway durable parsing, the independent `/v1/parse` endpoint, and browser/WASM are still `NOT_COVERED`. An active Railway revision cannot be established as source-parity without a separate deployment audit, which is explicitly excluded here. No empty-ledger absence claim, first valid attestation, parser execution or operational authorization follows from this repair.

- [ ] Design and validate the controlled lifecycle writer, idempotency, concurrent transitions, pre-parser failure protection and exhaustive runtime/CI surface discovery.
- [ ] Reconcile database security inspector and writer privileges; validate applied schema and tests before any authority transition.
- [ ] Independently verify deployed Railway parity and all four surfaces before considering `AUTHORITATIVE`.

#### R4.1-C → F checkpoint — still BLOCKED

- [x] R4.1-C/F.4 source/synthetic checkpoint: stable retry identities across recorder reconstruction, 30 disposable PostgreSQL lifecycle disputes, terminal ordering, 15 injected transport failures, independent `/v1/parse` failure ordering, and CI gates. Live DB remains sealed and deployed Railway parity is UNKNOWN; operational authority stays BLOCKED.
- [ ] R4.1-C/F.5: prove whole-request retry identity, independent PostgreSQL lifecycle races, failure ordering, provenance matrix and CI/image security; deployed Railway parity remains externally blocked.
- [ ] R4.1-C/F.5.1: formalize safe retry reconciliation, prove ambiguous request and durable replay, expand disposable lifecycle races and failure matrix, reconcile coverage/report and verify external CI; Railway parity and operational parsing remain blocked.
- [ ] R4.1-C/F.5.2: close real per-state durable reconciliation, simultaneous HTTP retries, independent race and failure matrices, Docker isolation, and externally verified green CI. Local lost-response tests and lint cleanup passed; Railway remains frozen and operational execution blocked.
- [ ] R4.1-C/F.5.3-CLOSURE.3 BLOCKED: authoritative reader migration 20260926061355 is source-and-live; two source-only duplicates removed while live history preserved. Disposable PostgreSQL reader snapshot/ACL/DDL check and 30 writer scenarios + 50 stress executions PASS; live read-only inspection confirms writer/reader SECURITY DEFINER service-only, ledger RLS and zero rows. Current Quality Gates run 36223889087 is GREEN on 8dacb629217742238f2b655f5b946b5f3cc79dd2, including parser tests, web/lint/build, disposable PostgreSQL writer concurrency, Docker production-image isolation and browser production-output sealing. Outstanding: integrated PostgreSQL queue/HOT/RAW FINISHED ack-loss replay; integrated FAILED/ABORTED; full independent race and failure matrices. Railway untouched; `realDemAuthorized=false`; `canonicalAuthorized=false`.
- [ ] R4.1-C/F.5.3-CLOSURE.4 BLOCKED: processed FINISHED reconciliation now requires a complete Canonical demo-source result bound to the same upload/match and exact parser/schema identity; `blocked_raw_audit` is the only explicit no-HOT exception. Active `/` redirects to `/login`, rendered nonblank, and produced zero uncaught browser exceptions. Disposable PostgreSQL writer/reader proof remains 30/30 plus 50 stress executions, but source has no migration creating `raw_evidence_artifacts`/chunks and local pgmq/PostgREST/Storage integration is unavailable; therefore integrated FINISHED ACK-loss/FAILED/ABORTED, complete race and >=43 failure matrices, full-schema equivalence, final-commit CI, Docker and production-output browser sealing are not proven. Production/Railway/DEM/Attempt 9/Canonical remain frozen.
- [ ] R4.2/F.5.3-CLOSURE.5 BLOCKED: recover RAW schema from live read-only metadata into reproducible source, prove full schema equivalence and real disposable queue/RAW/HOT recovery; expand independent race and failure matrices and verify exact-final-revision CI, Docker, and production browser. Current source hardens FINISHED RAW identity (job/upload/attempt/DEM digest), but this is not integrated proof. Production/Railway/DEM/Attempt 9/Canonical remain frozen.
- [ ] R4.2-C/F.5.3-CLOSURE.6 BLOCKED: SOURCE_IMPLEMENTED: source-only RAW migration and deterministic catalog comparator. LIVE_READ_ONLY_PROVEN: RAW snapshot captured; bounded disposable comparison found four owner/grant mismatches, not equivalence. DISPOSABLE_PROVEN: 30 writer cases plus 50 stress runs only, not integrated recovery. DEPLOYED_PROVEN: none; final-commit CI, Docker and production browser unverified. REAL_DEM_PROVEN: none. Pending: clean full-schema lineage, actual pgmq/PostgREST/Storage, FINISHED fresh-worker ACK loss/FAILED/ABORTED, ≥50 executed race/failure cases and exact-final-revision CI. Railway, production, DEM/Attempt 9 and Canonical stay locked.
- [ ] R4.3/F.5.3-CLOSURE.7: execute clean disposable source-chain installation, real pgmq/Storage/RPC lifecycle including FINISHED ACK-loss fresh-worker, FAILED/ABORTED, identity and integrity checks, ≥50 distinct races and failures, production-output browser, Docker and exact-revision CI; mark each gate NOT_PROVEN until persisted independent evidence exists. Keep production read-only and Railway/DEM/Attempt 9/Canonical locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R1 BLOCKED: full-stack clean install and actual pgmq/PostgREST/Storage recovery, integrated FINISHED/ACK loss/fresh-worker/FAILED/ABORTED, 50 distinct race/failure cases, Docker/browser output and exact-revision CI remain unexecuted. Plain PostgreSQL auth error is not full-stack failure; 239 parser tests and 30+50 writer-only tests passed. Production/Railway/DEM/Attempt 9/Canonical locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R2 BLOCKED: CLI 2.118.0 stack start failed (no Docker/Podman); real local pgmq probe prepared but unexecuted; clean 145-migration reset, integrated lifecycle, 50 distinct race/failure cases, Docker/browser and exact-revision CI unproven. Production/Railway/DEM/Attempt 9/Canonical locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R3 BLOCKED: current synthetic parser suite passed (239/10); fresh matrix run-ID guard rejects stale cases. Full-stack integrated FINISHED/ACK-loss/FAILED/ABORTED and 50+50 executed scenarios are absent. The repository has no direct GitHub Actions dispatch access in this sandbox; exact-final-revision CI/Docker/browser evidence remains unverified. Production/Railway/DEM/Attempt 9/Canonical locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R4: execute all integrated gates in a Docker-enabled GitHub Actions run against the exact final commit, with 145 clean migrations and authenticated evidence; remain BLOCKED until a successful run and all lifecycle/matrix proofs exist. Production/Railway/DEM/Attempt 9/Canonical locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R5 BLOCKED: run disposable worker A/B PGMQ recovery probe in CI, then full 145-migration schema and real job/HOT/RAW/Storage/PostgREST lifecycle, 50+50 distinct executed scenarios, Docker/browser/parser and exact-final-commit CI. Queue-only recovery cannot authorize closure. Production/Railway/DEM/Attempt 9/Canonical locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R5.1 BLOCKED: execute the existing job dispatch, claim, permanent failure and cancellation paths on the disposable stack; require genuine FINISHED/HOT/RAW/Storage/PostgREST, 50/50 distinct executed matrices and a successful exact-revision CI run before closure. Production/Railway/DEM/Attempt 9/Canonical locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R6 BLOCKED: execute a full real disposable lifecycle with 50/50 independent scenarios and exact-revision successful GitHub Actions evidence. Current cancellation is not ABORTED, and no evidence can promote real DEM or Canonical; production and Railway remain untouched.
- [ ] R4.3/F.5.3-CLOSURE.8-R7 BLOCKED: execute local-only terminalization contract probe and actual integrated worker/RAW/HOT/Storage/ACK proof, 50/50 real cases, and same-revision final CI; keep Canonical admission, production and Railway locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R8 BLOCKED: repair disposable finalizer fixture, then execute genuine FINISHED/ACK-loss/ABORTED/RAW/HOT/Storage proof, 50 race and 50 failure cases, and independently confirm successful same-revision CI. Production, Railway, real DEM, Cache, Attempt 9 and Canonical stay locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R9 BLOCKED: execute the corrected fixture and process-kill queue probe on a clean disposable stack; build and verify full worker RAW/HOT/Storage lifecycle, real process abort, 50/50 independent cases and external final CI seal before closure. No production or Railway changes.
- [ ] R4.3/F.5.3-CLOSURE.8-R10 BLOCKED: require a same-commit GitHub Actions run with complete integrated worker/RAW/HOT/Storage FINISHED, job-bound ACK loss, process abort, exactly-once, 50/50 executed matrices, Docker/browser/parser and independent post-run seal. Partial queue/contract probes must not promote gates; production and Railway remain locked.
- [ ] R4.3/F.5.3-CLOSURE.8-R11 BLOCKED: execute a complete disposable pipeline engine and 16 RAW corruption, 50 race and 50 failure scenarios in one GitHub Actions run; independently attest that run after completion. Do not promote partial probes or self-attested CI; production, Railway, real DEM, Cache, Attempt 9/10+ and Canonical remain locked.
- [ ] F.5.3-CLOSURE.8-R11.1 BLOCKED: run disposable-only evidence producer and independent fail-closed verifier in CI; complete real parser→RAW/HOT/Storage, job-bound SIGKILL recovery, executed 16/50/50 matrices and external post-run seal. Standalone probes cannot establish integrated gates. No production or Railway operations.
- [ ] F.5.3-CLOSURE.8-R11.2 BLOCKED: GitHub run 36392737539 for d44ee382 failed; log identifies Storage HTTP 400 body code NoSuchBucket (not HTTP 404). Creation now recognizes only this exact error, but is not verified in CI. Job-bound disposable upload→queue→worker claim→parser boundary is prepared but not executed in CI. RAW/Storage/HOT→terminalization→ACK, Worker A/B SIGKILL, PROCESS_ABORTED, exactly-once across retries and operation-backed 16/50/50 matrices remain NOT_PROVEN. Local stack and Docker unavailable here; source run can be inspected via the connected GitHub service. Production and Railway remain locked.
- [x] R4.1-C/F.5 partial source checkpoint: reconstruct V1 identities from job/upload/attempt; fail closed on replay before a second parse; verify 30 races plus 50 isolated PostgreSQL stress executions; reconcile non-authorizing source coverage and per-proof provenance requirements. External CI, deployed Railway parity, exhaustive failure matrix and image build remain unverified.

- [x] R4.1-C/F.2: apply an idempotent live safety repair revoking direct ledger writes from sandbox_exec, service_role, anon, authenticated and PUBLIC, and execution of the mutation trigger function; verify effective permissions and zero production events. This is a security repair, not writer coverage.
- [ ] R4.1-C/F.2: implement and prove a real controlled writer in disposable PostgreSQL, then cover APP, durable worker, independent /v1/parse, terminal outcomes and bridge end-to-end before activation. The separate deployed Railway parity audit remains outstanding; no local/source-only evidence promotes authority.
- [x] Add optional `execution_id`, `event_id`, `event_at`, `upload_id`, `correlation_id`, `outcome_code` and `event_version` to the existing sealed ledger; retain historical rows and revocations. No execution rows were created.
- [x] Add a source-discovery regression check that enumerates existing parser invocations, including the standalone reference producer in the production image.
- [x] Restrict the parser Docker image to an explicit runtime file allowlist; add source and CI image-isolation checks. This does not establish parity with the deployed Railway revision.
- [x] Record a machine-readable, server-only coverage checkpoint with every executable production surface `NOT_COVERED` and writer authority false.
- [x] Remove the browser parser from its authenticated experimental route, hard-disable its configuration, reject production service calls and add source/build-output isolation checks to CI. Deployed bundle verification remains pending.
- [x] Add an application-source guard against direct ledger writes, without adding any writer or event rows.
- [ ] Complete the controlled writer, authenticated event bridge, lifecycle, failure injection, real disposable-Postgres concurrency harness, exhaustive security audit and all surface instrumentation before enabling any writer.
- [x] Add a strictly versioned, bounded, authenticated execution-event bridge contract that deliberately returns 503 for valid requests while the controlled writer is absent; synthetic tests confirm 401 anonymous and 503 authenticated, with no ledger writes.
- [x] Add a pure R4.1 proof-decision contract covering 20 independently required proofs; UNKNOWN/FAIL/BLOCKED each prevent even independent-audit readiness, and no result authorizes DEM or Canonical.
- [ ] Activate the bridge only after pre-parser instrumentation, disposable-PostgreSQL lifecycle/concurrency/security proofs, independently reviewed source parity, and a controlled writer all pass. Current endpoint is deliberately inactive.
- [ ] `H3E91_PREPARSER_WRITER_ABSENT`: no controlled lifecycle writer or confirmed INTENT/STARTED/terminal bridge. Keep actual parsing paths uninstrumented and blocked rather than enabling partial capture.
- [ ] `H3E91_EXECUTION_SURFACE_NOT_COVERED`: APP, durable worker, `/v1/parse`, and browser/WASM remain unproven; reference CLI is excluded from the new image recipe but the deployed image is unverified.
- [ ] `H3E91_BROWSER_NOT_SEALED`: source path removed and CI build check prepared, but the published bundle/runtime has not been independently verified; leave coverage `NOT_COVERED`.
- [ ] `H3E91_DEPLOYED_SOURCE_PARITY_UNKNOWN`: independent Railway parity, security audit, disposable database concurrency proof and final authority evaluation are outstanding.

### Confirmed current state

- H.1-R: implemented and CI verified.
- H.1-M: **ACCEPTED — 15/15 synthetic observations** (16/32/64/96/128 MiB × 3). This is synthetic browser materialization evidence only.
- H.2: **NOT RUN / BLOCKED** for real DEM parser measurement.
- H.3-R: implemented, merged, deployed; live Railway preflight observed.
- H.3-E: implemented as an exact Cache envelope gate; real Cache execution remains blocked.
- Exact Cache DEM: `furia-vs-gamerlegion-m1-cache.dem`, 473,748,061 bytes, SHA-256 `0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d`.
- Railway parser: demoparser2 0.42.0, revision/build `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`, contract 1.
- Railway cgroup memory limit observed: 3,999,997,952 bytes.
- Browser real DEM remains OFF and the 128 MiB conservative ceiling remains unchanged.
- Real parser memory, Python/WASM parity, determinism, tick authority and complete player identity are post-execution evidence and remain unverified until a controlled real run.
- Retention authorization, fresh execution attestation and explicit execution authorization remain pending.
- Attempt 9/10+ remains locked.
- Canonical admission remains locked.
- No cleanup or production Railway mutation is authorized by H.3-E.

### H.3-E post-merge reconciliation — 2026-09-24

- PR #19 was merged into `main` as `f4f1088ead0055566309f09a01d0dc870d6e94ac` after Quality Gates run #300 (`35967900425`) completed successfully.
- The H.3-E code/tests are therefore present on `main`; this merge does **not** authorize a real DEM execution.
- Railway production was re-audited after the merge: the parser service remains sourced from `infra/cs2-parser-worker-v8`, with latest successful deployment `ff0cc222f514c01eda6e26d7bb95271a8b0c9b04`. No production mutation was made by H.3-E.
- A pre-existing staged Railway `EnvironmentPatch` (`d66b5a12-a69e-4b9a-87b6-314f75c471cc`) remains untouched and is not part of H.3-E.
- Next gate is **H.3-E closure/readiness reconciliation**, not execution: close only independently evidenced retention authorization, fresh attestation, and explicit operator authorization. Do not infer any of these from CI, PR merge, Railway health, or synthetic memory evidence.

### Non-negotiable execution order

`EXACT DEM IDENTITY → RUNTIME IDENTITY/PREFLIGHT → RETENTION → FRESH ATTESTATION → EXPLICIT AUTHORIZATION → ONE CONTROLLED RUN → POST-RUN FORENSICS → PARITY/DETERMINISM/TICK/IDENTITY → Canonical remains locked`

### H.3-E hard lock

Until the pre-execution envelope is independently complete:

**DO NOT execute the real DEM, create Attempt 9, create final RAW evidence, promote Canonical, execute cleanup, mutate Railway production, expose/rotate secrets, or bypass attestation.**

---

# CURRENT IMPLEMENTATION — FASE 2.7.2H.1-M0

**Status:** `H.1-R PASS / H.1-M0 READY / H.1-M RUNTIME NOT_RUN / SYNTHETIC ONLY`.

- [x] Expor `/admin/memory-lab` sob autenticação e autorização administrativas existentes.
- [x] Controlar a superfície exclusivamente por `VITE_CLIENT_DEM_MEMORY_LAB`, independente do Parser POC.
- [x] Ocultar a navegação administrativa quando OFF e manter a rota inerte com `FEATURE_DISABLED`.
- [x] Remover o Memory Lab da composição do Parser POC.
- [x] Expor capacidades do navegador, locks reais, matriz local de 15 execuções e todos os metadados do protocolo.
- [x] Manter execução somente por clique, resultados em memória React e relatório metadata-only.
- [ ] H.1-M: executar manualmente 16/32/64/96/128 MiB × 3 em Preview experimental compatível: `NOT_RUN`.

**Locks:** defaults OFF, `FEATURES.realDemoParser=false`, teto de 128 MiB e DEM real, parser/WASM, backend, persistência, Railway, R5.8, attestation, Canonical, banco, migrations, secrets e analytics inalterados.

# CURRENT IMPLEMENTATION — FASE 2.7.2H.1-R

**Status:** `IMPLEMENTATION HARDENED / CI VERIFIED / H.1-M RUNTIME MEASUREMENT PENDING / SYNTHETIC ONLY`.

- [x] Implementar fixtures sintéticos determinísticos de 16/32/64/96/128 MiB, com teto fail-closed em 128 MiB.
- [x] Reutilizar a fronteira contígua exclusivamente em Worker dedicado, sem parser/WASM e sem retornar bytes à UI.
- [x] Exigir feature flag, contexto seguro, cross-origin isolation, Worker, File API e API de memória.
- [x] Implementar timeout de 60 s, cancelamento, encerramento do Worker, remoção de listeners e amostra pós-cleanup.
- [x] Remover a amostra concorrente e fixar a sequência determinística com amostra explícita pós-materialização.
- [x] Tornar `observedPeakBytes` o máximo das amostras observadas pré-cleanup, sem alegar pico absoluto.
- [x] Classificar cleanup de forma neutra e manter somente `observedCleanupDeltaBytes` como diferença observada.
- [x] Documentar o tamanho do fixture como tamanho lógico, sem alegação de footprint físico.
- [x] Manter resultados somente em memória e permitir cópia de relatório JSON textual classificado como diagnóstico sintético.
- [x] Confirmar todos os gates de CI da H.1-R: 1.181 testes web, 189 testes do parser, 66 testes contratuais, TypeScript, lint e build aprovados.
- [ ] H.1-M: executar manualmente a medição em navegador compatível: `NOT_RUN`.
- [ ] H.2: medir parser/DEM real: bloqueado e fora desta fase.
- [ ] Usar o resultado como prova de suporte, elevar o teto ou processar DEM real: proibido nesta fase.

**Locks:** teto de 128 MiB, `FEATURES.realDemoParser=false`, real DEM, parser, Canonical, Attempt 9/10+, Railway, banco, Storage, secrets e attestation inalterados.

# CURRENT IMPLEMENTATION — FASE 2.7.2H

**Status:** `ARCHITECTURAL_READINESS IMPLEMENTED / LARGE_DEM_REAL_EXECUTION_STATUS BLOCKED / REAL DEM NOT_RUN`.

- [x] Declarar demoparser2 0.42.0 como `CONTIGUOUS_BUFFER`, WASM, sem streaming comprovado.
- [x] Mover o SHA-256 local para Worker incremental de 8 MiB, com progresso, cancelamento e mensagens validadas.
- [x] Isolar a única materialização integral do arquivo no adapter executado pelo Worker do parser.
- [x] Adicionar gate determinístico e modelo de memória que mantém overhead WASM/parser e pico como desconhecidos.
- [x] Cobrir metadata-only de 0 byte até 500 MiB e o Cache de 473.748.061 bytes sem alocações gigantes.
- [x] Integrar capacidade, viabilidade, motivo factual e execução em Worker ao POC existente.
- [x] Validar 1.139 testes, TypeScript, lint sem erros e build automático.
- [ ] Executar DEM real, benchmark de memória, parity ou determinism: `NOT_RUN`.

**Locks:** teto de 128 MiB inalterado; `FEATURES.realDemoParser=false`; R5.8.1 `BLOCKED_OPERATOR_CONFIGURATION`; Attempt 9/10+ e Canonical `BLOCKED`; Railway, staging, secrets, migrations e attestation inalterados.

# CURRENT VALIDATION — FASE 2.7.2G.5-R

**Status:** `POC_BLOCKED_PENDING_REAL_DEM / POC_BLOCKED_WITH_FORENSIC_EVIDENCE`.

- [x] Audit browser/WASM 0.42.0 Worker, bounded manifest, server validator, parity and determinism contracts.
- [x] Confirm the POC remains off by default and Canonical admission is always fail-closed.
- [x] Confirm no authorized local `.dem` fixture exists in the repository or current uploads.
- [x] Expose the forensic section matrix and identity/performance evidence without presenting phase progress as parser percentage.
- [ ] Execute an authorized real DEM in browser/WASM: `NOT_RUN` because R5.8 still forbids DEM processing before attestation closure.
- [ ] Execute Python×WASM parity and repeated determinism: `NOT_RUN`, dependent on the same authorized bytes and gate release.
- [ ] Admit DEM evidence to Canonical: `BLOCKED`; no mapping was authorized or persisted.

**Preserved locks:** no DEM execution, Attempt 9+, RAW final evidence, Canonical promotion, Railway mutation, secret change, migration, cleanup, or AI feature work.

# CURRENT IMPLEMENTATION — FASE 2.7.2G.6-R.5.8.x

**Status:** `R5.8 BLOCKED / LARGE_DEM_FEASIBILITY_GATE NOT_RUN / 128 MiB UNCHANGED`.

- [x] Adicionar diagnóstico server-side Master Admin com 14 estados, sem retornar valor, comprimento, hash ou fragmento de secret.
- [x] Expor `DATABASE_HMAC_CONFIGURATION_REQUIRED` sem criar migration ou segunda fonte de verdade.
- [x] Implementar preflight machine-readable fail-closed; primeira attestation permanece `NOT_RUN`.
- [x] Criar gate de viabilidade com flag experimental OFF, estados explícitos e memória `MEMORY_UNAVAILABLE` sem API confiável.
- [x] Implementar SHA-256 incremental em Worker cancelável, 8 MiB por chunk, separado do parser.
- [x] Cobrir limites metadata-only de 128 MiB, 128 MiB+1, 300/400/500 MiB e 473.748.061 bytes.
- [x] Corrigir o harness PostgreSQL descartável para executar `psql` sob o mesmo usuário do cluster; 50/50 cenários passaram.
- [ ] Executar benchmark do DEM real: `NOT_RUN`; a rodada não autoriza leitura/processamento da DEM.
- [ ] Executar parity/determinism: `NOT_RUN`.

**Locks:** migrations 0; Railway/staging/secrets/DEM/Attempt 9/Canonical inalterados.

# CURRENT EXECUTION GATE — FASE 2.7.2G.6-R.5.8

**Status:** `BLOCKED_OPERATOR_CONFIGURATION / R5.7.6 CLOSED / FIRST ATTESTATION NOT RUN / ATTEMPT_9 LOCKED`.

R5.7.6 is formally closed: GitHub Quality Gates run `35848017260` passed on main commit `5245af872a8c7654d99a31797c956a1499b7a6c3`. The historical two-migration exception is documented and applied migration history must not be rewritten.

## R5.8 objective — first real attestation preflight

- [x] R5.7.4/R5.7.5 V3 contract hardened and reconciled.
- [x] Three SHA identities separated: trigger commit, workflow-file commit, approved workflow blob.
- [x] Approved attestor sourced from `main`; Railway runtime remains frozen at `infra/cs2-parser-worker-v8` / `5703b1d...`.
- [x] GitHub Quality Gates verified on latest main commit.
- [x] Real DEM staging preserved: exactly 1 `READY_FOR_EXECUTION` object.
- [x] Verify operator secrets by name only: transport/HMAC/endpoint present; Railway token requires GitHub operator verification.
- [ ] Configure protected database HMAC setting with the operator-supplied secret, without a migration and without persisting it in public tables.
- [ ] Configure/verify `RAILWAY_API_TOKEN` for the attestor workflow without exposing it.
- [x] Verify attestation endpoint/transport secret configuration safely: transport present; endpoint present but does not validate as the required production endpoint.
- [x] Run read-only staging, jobs, provenance, nonce, Canonical, function, constraint and security checks; direct gate execution remains unavailable to the read role.
- [ ] Only after the preflight is GREEN, manually dispatch the attestation workflow.
- [ ] Independently audit the resulting attestation/provenance/nonce; do not create Attempt 9.

## Hard locks for R5.8

**DO NOT:** execute Attempt 9; process the real DEM; run Python/WASM on the DEM; create RAW final evidence; promote Canonical; accept/deploy Railway; apply EnvironmentPatch; rotate or expose secrets; or bypass the attestation gate.

## Current live baseline before R5.8

- staging: 1 / READY_FOR_EXECUTION: 1
- provenance: 0 / VERIFIED: 0
- nonces: 0
- Attempt 9+: 0
- Canonical: 105 / 0 authorized / 0 verified / 0 generic
- database HMAC: NOT CONFIGURED
- pre-real-demo gate: BLOCKED_BEFORE_REAL_DEMO

`R5.8` ends before any DEM execution. The next permitted transition after independent attestation verification is the controlled R5.8.x/R5.9 readiness work.

`Locks: fail-closed.`

# CURRENT EXECUTION GATE — FASE 2.7.2G.6-R.5.7.4 + R.5.7.5

**Status:** `BLOCKED / ATTESTATION V3 FORENSIC CONTRACT HARDENED / FIRST ATTESTATION NOT RUN / ATTEMPT_9 BLOCKED`.

- [x] Confirmar staging real `READY_FOR_EXECUTION`, identidade observada e preservação do registro `61df7731-ec89-4fa3-8211-dd29128f3be8`.
- [x] Confirmar Attempt 9/10+=0, Canonical=105/0/0/0, provenance VERIFIED=0 e nonces=0.
- [x] Confirmar HMAC duplo, OIDC RS256, freshness, nonce, Railway API, runtime identity, hashes críticos e workflow aprovado já implementados.
- [x] Separar o attestor em `main` do runtime congelado em `infra/cs2-parser-worker-v8`, usando o Git blob aprovado `13ce10e95a508e62d832bb9dc432e1496499676c`.
- [x] Vincular `release_gate_evidence` ao payload assinado na rota e no limite de persistência, via migration aditiva.
- [x] Restringir `parser_runtime_provenance.attestation_version` a `3` no banco e cobrir a restrição com contrato de regressão.
- [x] Persistir somente `GITHUB_ACTIONS_SIGNED_ATTESTATION_V3` e exigir `workflow_sha = trigger_commit_sha`, `workflow_file_commit_sha` explícito e o blob aprovado independente.
- [x] Corrigir a constraint histórica de `verification_method` para aceitar exclusivamente v3; a descoberta após a primeira migration exigiu uma segunda migration aditiva, portanto migration hygiene não pode ser declarada limpa nesta rodada.
- [x] Validar TypeScript, 38 contratos focados, 1.106/1.106 testes web na execução final, build e lint dos arquivos alterados; pytest permanece `NOT_RUN` por indisponibilidade do runner.
- [ ] Configuração parcial: endpoint e secrets de transporte/HMAC existem no servidor Lovable; `RAILWAY_API_TOKEN` ainda exige configuração operacional.
- [ ] Configurar o mesmo segredo HMAC no setting protegido do banco, sem migration, código ou tabela pública (`DATABASE_HMAC_SECRET_CONFIGURATION_REQUIRES_OPERATOR_ACTION`).
- [ ] Executar o workflow real e aceitar uma nova attestation somente se toda prova independente passar.
- [ ] Revalidar provenance, invariantes e gates read-only; parar antes de Attempt 9 mesmo se o execution gate avançar.

**Locks:** nenhum parser, replay, upload/job/Attempt 9+, RAW, Canonical, cleanup, mutation Railway ou EnvironmentPatch é permitido.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R.5.6

**Status:** `READY_FOR_REAL_DEM_STAGING / REAL_DEM_NOT_PHYSICALLY_AVAILABLE / EXECUTION NOT_RUN / ATTEMPT_9 BLOCKED / CANONICAL BLOCKED / RAILWAY UNCHANGED`.

- [x] Preservar a migration efetivamente aplicada `20260923023058` e manter ausente a duplicada removida `20260923020200`.
- [x] Revalidar o banco real antes de qualquer staging: rows/objects=0, Attempt 9/10+=0, jobs>=9=0, Canonical=105/0/0/0, provenance VERIFIED=0 e nonces=0.
- [x] Aplicar hardening aditivo R5.6 para preflight atômico, progresso monotônico, cancelamento retomável e verificação server-side transacional.
- [x] Fazer o Worker retornar SHA/tamanho realmente observados e preservar TUS 6 MiB, retries 0/3/5/10/20s e resume estrito.
- [x] Registrar `R5_UPLOAD_CANCELLED` e telemetria segura de bytes, retries e resume sem conteúdo do DEM ou credenciais.
- [ ] Executar hash, TUS, cancelamento/resume, streaming e gate com o DEM real: `NOT_RUN — REAL_DEM_NOT_PHYSICALLY_AVAILABLE`.
- [ ] Executar R5.7, parser, Python/WASM, parity, determinism, tick authority, Attempt 9, RAW ou Canonical: proibido nesta fase.

**Locks:** nenhum staging/objeto foi criado; Railway, EnvironmentPatch, secrets, HMAC/OIDC, Canonical e cleanup permaneceram sem mutação.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R.5.5

**Status:** `READY_FOR_REAL_DEM_STAGING / REAL DEM NOT STAGED / EXECUTION NOT RUN / RELEASE BLOCKED / ATTEMPT_9 LOCKED`.

- [x] Aplicar o SQL corretivo oficial `20260923020200` com o SHA canônico de 64 caracteres, sem reescrever migrations históricas; o schema live está corrigido, embora o registry gerenciado o tenha consolidado sem uma linha de versão `20260923020200` independente.
- [x] Preservar stagings expirados por UUID e criar novo ciclo de 24h somente por ação Master Admin, com lock transacional e unicidade parcial.
- [x] Bloquear novo staging enquanto um objeto expirado permanecer no path; nenhum overwrite, DELETE ou cleanup automático.
- [x] Mover o SHA-256 local bounded-memory para Web Worker cancelável e manter TUS em chunks de 6 MiB com retries 0/3/5/10/20s.
- [x] Restringir retomada por release, SHA, nome, tamanho, bucket, path e content type; registrar progresso e gates na auditoria.
- [x] Expor bucket/path, identidade local/servidor e a espera explícita por upload físico na tela Master Admin.
- [ ] Receber fisicamente o DEM autorizado e provar upload interrompido/retomado; permanece `BLOCKED_REAL_DEM_NOT_STAGED`.
- [ ] Executar qualquer parser, Python/WASM, parity, determinism, tick authority, Attempt 9 ou Canonical; todos permanecem `NOT_RUN/BLOCKED`.

**Locks:** Railway, secrets, HMAC/OIDC/provenance, Attempt 9/10+, Canonical, RAW final e cleanup permanecem sem mutação. `REAL DEM NOT STAGED — NO EXECUTION PERFORMED.`

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R.5.2 → R5.4

**Status:** `IMPLEMENTATION COMPLETE / TRANSPORT NOT RUN / EXECUTION NOT RUN / RELEASE BLOCKED / ATTEMPT_9 LOCKED`.

- [x] Implementar transporte TUS resumível master-only para o bucket/path R5 fixo, com chunks de 6 MiB, retry, retomada, progresso e cancelamento.
- [x] Manter validação local bounded-memory e verificação final server-side por streaming incremental, sem `storage.download()`, buffer integral ou confiança em Content-Length.
- [x] Registrar estados de transporte/evidência, tentativas, timestamps e erros seguros, preservando identidade imutável e auditoria sem tokens/URLs privadas.
- [x] Criar `/admin/r5-forensic` e separar upload, verificação e prontidão; `READY_FOR_EXECUTION` nunca dispara parser ou Attempt 9.
- [x] Criar `r5_real_dem_execution_gate` read-only e manter `assert_attempt_9_authorized` inacessível/bloqueado nesta fase.
- [x] Aplicar e verificar a correção de caminho relativo no banco real; restaurar o SHA canônico de 64 caracteres e remover a constraint legada contraditória.
- [x] Tornar as transições de transporte atômicas e restringir retomadas TUS por tamanho, bucket, caminho e content type.
- [ ] Receber e verificar os bytes reais; enquanto ausentes, R5.2 = `BLOCKED_REAL_DEM_NOT_STAGED` e R5.3 = `BLOCKED`.
- [ ] Executar Python/WASM, parity, determinism, tick authority, OIDC/HMAC/nonce/provenance — todos permanecem `NOT_RUN/NOT_VERIFIED/BLOCKED`.

**Locks:** Attempt 9/10+, Canonical, cleanup, histórico, Railway production, EnvironmentPatch, secrets, provenance e nonce permanecem sem mutação.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R.5.1

**Status:** `IMPLEMENTATION COMPLETE / EXECUTION NOT RUN / VERIFICATION PARTIAL / RELEASE BLOCKED / ATTEMPT_9 LOCKED`.

- [x] Preservar as correções externas do main `893e24c64881f6fbd89be58097726a9fd5e1d926`: fixtures `5703...`, teto Python 1,5 GiB e `initdb` no CI.
- [x] Criar bucket privado e registro independente `R5_FORENSIC_STAGING`, sem vínculo com `uploads`, `demo_jobs`, fila ou attempts.
- [x] Criar gate read-only `R5_REAL_DEM_ACCESS_GATE` com SHA/tamanho/nome/release exatos e baseline Canonical/attempts fail-closed.
- [x] Criar fluxo master-admin para signed upload temporário e verificação streaming dos bytes, sem expor credenciais.
- [ ] Executar DEM real, Python/WASM, parity, determinism, tick authority, attestation, HMAC ou provenance — permanecem bloqueados até bytes e requisitos externos reais existirem.

**Locks:** Attempt 9/10+, Canonical, cleanup, Railway production, EnvironmentPatch, provenance e nonce continuam sem mutação.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R.4-C.10-R1.1

**Status:** `IMPLEMENTATION COMPLETE / C.10-R1.1 VERIFIED / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`.

- [x] Classificar `sandbox_exec` como role interno confiável de migrations/queries, com login e BYPASSRLS; manter somente SELECT/INSERT nas duas tabelas append-only.
- [x] Validar ACL/RLS/triggers/functions no banco live e fixar invariantes permanentes de paridade migration/live.
- [x] Pinar todas as GitHub Actions por SHA imutável e vincular a attestation ao Git blob aprovado da workflow sem autorreferência circular.
- [x] Criar gate read-only `BLOCKED_BEFORE_REAL_DEMO`, relatório machine-readable e auditoria C.10-R1.1.
- [x] Preservar 105 mappings, 0 autorizados/verificados/genéricos, nonce vazio, provenance VERIFIED=0 e attempts 9/10+=0.
- [x] C.10-R5 — REAL CACHE DEM FORENSIC EXECUTION: `IMPLEMENTATION COMPLETE / EXECUTION PARTIAL / VERIFICATION PARTIAL / RELEASE BLOCKED / ATTEMPT_9 LOCKED`.
  - [x] `IMPLEMENTATION`: nove relatórios obrigatórios gerados sem DEM bruto, token, secret ou HMAC.
  - [x] `EXECUTION`: preflight e gates oficiais executados; DEM físico não acessível, portanto Python/WASM permaneceram `NOT_RUN`.
  - [x] `VERIFICATION`: segurança `PASS`, workflow blob `PASS`, Vitest focado 10/10 e matriz de 40 eventos 2/2; pytest `NOT_RUN` por indisponibilidade no ambiente. Suite completa: 1.079 PASS/6 FAIL preexistentes; lint: 4 erros preexistentes/9 warnings.
  - [x] `AUTHORIZATION`: todos os asserts finais `BLOCKED`; Attempt 9=0, Attempt 10+=0, Canonical=105/0/0/0, cleanup não executado.

**Locks:** real DEM, Attempt 9, Canonical e cleanup continuam `LOCKED`; Railway permanece `FROZEN`; HMAC `NOT CONFIGURED`; provenance `NOT VERIFIED`. Próximo marco: restaurar os bytes do DEM autorizado pelo lifecycle privado oficial, obter evidência Railway/HMAC/GitHub real e repetir R5.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R.4-C.7 → C.10

**Status:** `IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`.

**Infrastructure:** `PRE_ATTEMPT_9_READY_INFRASTRUCTURE` — release imutável de 105 campos, attestation v3 com freshness/nonce anti-replay, quatro estados de tick authority, harnesses Python×WASM/determinismo e auditoria forense completa implementados em modo fail-closed.

**Next external evidence:** `REAL DEM + VERIFIED ATTESTATION + PYTHON/WASM PARITY + DETERMINISM + TICK AUTHORITY`.

- [x] Implementar attestation assinada, vinculada a OIDC/Git/Railway/runtime/release, com freshness e replay protection.
- [x] Formalizar `UNAVAILABLE / OBSERVED_ONLY / PROVISIONAL / VERIFIED`; somente `VERIFIED` satisfaz domínio completo.
- [x] Preparar harnesses do mesmo DEM/SHA e relatórios machine-readable; sem DEM, retornam somente `NOT_RUN`.
- [x] Reforçar release gate contra source genérico e expor diagnóstico de dois estados sem mutação.
- [x] Documentar checklist, matrizes e decisões C.7–C.10 sem promover mappings.
- [ ] Obter DEM real autorizado, attestation externa, CI remoto, paridade, determinismo e tick authority reais.

**Attempt 9:** `NOT EXECUTED`. **Fase 2.8:** `BLOCKED`.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R.4-C.3/C.4 — SEMANTIC RECONCILIATION

**Status:** `IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`.

- [x] Substituir os 98 mappings genéricos por um registro explícito de 105/105 campos, com 15 classes fail-closed e sem autorização fabricada.
- [x] Versionar inventário e gerador, registrar tipos/nullabilidade/origem/normalização/identidade/tick/persistência e manter parity/determinism como `NOT_RUN`.
- [x] Exigir no OIDC issuer/audience/repository/owner/ref/workflow/job-workflow/subject/run/freshness e preservar prova Railway API independente.
- [x] Impedir upload autenticado direto com `attempt_number` diferente de 1; attempts controlados permanecem exclusivos das rotinas service-role.
- [ ] Obter secrets externos, CI remoto, Git objects congelados, paridade Python×WASM, determinismo, tick authority e validação real de persistência.

**Decisão:** nenhum replay, DEM, cópia/exclusão de Storage, cleanup, Canonical, métricas, features, AI, deploy ou mutação Railway foi executado. Inventário: 105 total, 0 genéricos, 0 autorizados; o gate permanece deliberadamente bloqueado.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R.4-C.2 — OPERATIONAL CLOSURE

**Status:** `IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`.

- [x] Alinhar deterministicamente o inventário Canonical local e banco em 105 campos, sem autorizar mappings.
- [x] Preservar adapter parcial/não terminal, `winReason=unknown` e identidade correlacionada sem inferência silenciosa.
- [x] Substituir evidência Railway declarativa por consulta autenticada à API e validar runtime, Git blobs, OIDC, digest e HMAC.
- [x] Fechar recorder, provenance e release evidence em modo fail-closed.
- [x] Fechar workflow e guardas automáticos sem executar replay, DEM real, Attempt 9 ou mutações Canonical.
- [x] Executar validações locais/read-only e produzir relatório C.2.

**Restrições:** runtime Railway congelado; staged patch não aceito; Attempt 9/10+, cópia/processamento de DEM, cleanup, Canonical, métricas e features proibidos nesta fase.

**Blockers externos:** `RAILWAY_API_TOKEN` e secrets de transporte/assinatura ausentes; commit congelado indisponível no Git local; paridade Python×WASM, determinismo, tick authority e CI remoto não executados. Inventário: 105 total, 0 autorizado; Attempt 8=1, Attempt 9=0, Attempt 10+=0; provenance VERIFIED=0.

# CURRENT EXECUTION GATE — FASE 2.7.2G.6-R.4-C.1 — VERIFIED PARSER PROVENANCE

**Status:** `IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9` — attestation, release gate e reserva vinculada fail-closed aplicadas; replay não iniciado.

- [x] Confirmar read-only que o objeto do attempt 8 existe no bucket `demos` com 473.748.061 bytes.
- [x] Confirmar ausência de attempt 9 para o mesmo usuário/SHA e preservação dos attempts 7/8.
- [x] Confirmar `demo_jobs.quality_flags` como JSONB e a função publicada usando `_result->'quality_flags'`.
- [x] Confirmar `/health` e `/version` HTTP 200 com `demoparser2 0.42.0`, contrato 1 e revision/semantic/build `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`.
- [x] Aplicar migration incremental e validar no PostgreSQL real `quality_flags` vazio e preenchido como `jsonb`, sem conversão para `text[]`; ACL permanece service-role-only.
- [x] Implementar RPC exclusiva e atômica do attempt 9, defesa de banco contra attempt 10, provenance fail-closed e cópia server-side validada; retry admin usa o lifecycle oficial.
- [x] Fixar repository/branch/deployment/runtime, hashes críticos exatos, digest canônico e freshness ancorada no servidor.
- [x] Vincular reserva, cópia verificada, enqueue e auditoria por UUID opaco; ACL continua service-role-only.
- [x] Corrigir o vínculo para o branch real `infra/cs2-parser-worker-v8` e criar `assert_real_demo_release_ready()` com evidence imutável, service-role-only e chamada obrigatória dentro da reserva.
- [x] Consolidar os catálogos Python/WASM em matriz machine-readable determinística, preservando divergências como `BLOCKED` sem inferir equivalência; digest atual `a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702`.
- [x] Adicionar `compileall`, revision guard, typecheck e instalação reproduzível ao workflow existente, sem criar estratégia paralela.
- [x] Implementar attestor independente fail-closed, inventário Canonical formal e gate global de 22 condições.
- [x] Separar identidades workflow/runtime, verificar Git objects/blobs, exigir GitHub OIDC e prova Railway API, e restringir o recorder v2 ao service role.
- [x] Cobrir toda a superfície de saída do demo adapter sem bypass de autorização e impedir lifecycle terminal em parse parcial.
- [ ] Observar CI real, obter provenance independente GitHub↔Railway, autoridade integral de ticks e executar paridade/determinismo reais.
- [ ] Executar gates locais e preflight final imediatamente antes da mutação.
- [ ] Criar upload 9, copiar/verificar o objeto, enfileirar pelo lifecycle oficial e observar o E2E real até terminal.
- [ ] Auditar RAW/HOT/Canonical/fila, comparar attempts 8×9 e documentar evidência integral sem cleanup.

**Stop conditions:** qualquer divergência de objeto, tamanho, SHA, attempt, claim, parser, contrato, RAW, HOT, Canonical, fila ou cleanup interrompe a fase sem attempt 10.

**Blocker atual:** attestor e gates implementados; GitHub devolve 404 para o commit fixado e não há prova independente Railway API/source binding nem CI real observado. A matriz reconciliada mantém diferenças explícitas, tick authority/paridade/determinismo reais continuam não executados, e não existe registro `VERIFIED`; a RPC bloqueia antes de criar/copy/enqueue, mantendo attempt 9 em zero.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6-R — LEGACY CLEANUP SHUTDOWN + RAILWAY RUNTIME PARITY

**Status:** `BLOCKED` — contenção local PASS; paridade do runtime Railway não comprovável.

- [x] Incidente preservado: nove objetos/3.789.985.512 bytes passaram a três objetos/947.497.146 bytes por execução concorrente externa ao G.6.
- [x] `DEMO_CLEANUP_AUTHORITY = G6_VERIFIED_DELETE_ONLY` registrado no APP e no banco; execução física permanece fail-closed.
- [x] Cron, cancelamento, conclusão de job e ação administrativa não iniciam cleanup durante G.6-R.
- [x] Migration incremental preserva mismatch histórico, ACL service-role-only e `search_path=''`; baseline do linter permanece em 15 findings preexistentes.
- [x] Retenção `demo-retention-v1`, claims, ownership, pós-delete verification, RAW/Canonical gates e órfãos read-only preservados.
- [x] Candidato MAIN fixado em `2f8a76645c6030659f2ed0480469b1452e75f72e`, parser `demoparser2@0.42.0`, contrato `1`, com manifest SHA por arquivo.
- [ ] `RAILWAY_RUNTIME_PARITY`: BLOCKED — branch `infra/cs2-parser-worker-v8`, source tree, arquivos de isolamento, imagem e conexão Railway indisponíveis.
- [x] `/health` e `/version` respondem 200; runtime observado em semantic `git:40ae4977e174f9a21b1394fb047b53fba2505e8b` / build `git:684da207d6a35d14d5663b011966561b09d55703`.
- [ ] Identidade Railway alinhada ao candidato `2f8a76645c6030659f2ed0480469b1452e75f72e`: FAIL; source/deploy continuam indisponíveis.
- [x] Nenhum DEM, parsing, retry, Cache Run 2, attempt 9, cleanup físico, Canonical, AI, deploy, secret ou reescrita histórica.
- [x] Snapshot read-only final: 3 objetos/947.497.146 bytes; 2 vinculados/947.496.122 bytes; 1 órfão/1.024 bytes, sem delete.
- [x] Quality gates locais: APP 1.021/1.021, retenção 14/14, typecheck, lint (0 erros/9 warnings), compileall, formatting, diff check e preview build PASS; pytest `NOT_RUN — PYTEST_NOT_INSTALLED`.

**Decisão:** `BLOCKED`. `LEGACY_CLEANUP_DISABLED`, `RETENTION_CONTRACT`, `CLEANUP_AUTHORITY_SINGLE` e `NO_DESTRUCTIVE_EXECUTION` passam no candidato local; `RAILWAY_RUNTIME_PARITY` não passa sem acesso auditável ao runtime. Real DEM, Python×WASM, determinismo, Canonical e AI permanecem `NOT_RUN/BLOCKED`.

# PRIOR EXECUTION GATE — FASE 2.7.2G.6 — DEM RETENTION & VERIFIED DELETION

**Status:** `BLOCKED_BY_CONCURRENT_LEGACY_CLEANUP`; nenhum cleanup G.6 foi invocado pelo agente.

- [x] G.6-A/B: auditar estado real, lifecycle SQL, Storage e concorrência retry×cleanup.
- [x] G.6-C/D: versionar `demo-retention-v1`; 24h sucesso, 72h falha/RAW bloqueado, cancelamento imediato.
- [x] G.6-E/F: safety gate central, claim/lease transacional e ownership `{user_id}/{upload_id}.dem`.
- [x] G.6-G: delete somente via Storage API, com consulta anterior/posterior e ausência física obrigatória.
- [x] G.6-H: detectar `storage_deleted_at` divergente e classificar órfãos sem auto-delete.
- [!] G.6-I: o backfill não apagou dados, mas expôs retenções já vencidas à rotina legada publicada; seis objetos desapareceram entre leituras.
- [x] G.6-J: testes A–Q, métricas, documentação e ACL service-role-only.
- [x] Contenção: três objetos remanescentes colocados em quarentena de 24h, sem remoção ou substituição.
- [ ] Revisão operacional independente e publicação coordenada são obrigatórias antes de liberar cleanup.

**Decisão:** fail-closed. O código e schema novos não autorizam liberação operacional. Somente o `.dem` original temporário era elegível, mas a corrida de rollout viola a prova exigida. Uploads, jobs, SHA, provenance, RAW evidence e Canonical permanecem preservados; Real DEM, Cache Run, attempt 9, Railway, Canonical e AI continuam fora deste gate.

# CURRENT EXECUTION GATE — FASE 2.7.2G.5-R-F.2.10-F–H — REAL DEM + FIELD PARITY

**Status:** `POC_NOT_READY`; `NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE`.

- [x] Confirmar por busca no projeto, fixtures e uploads que nenhum DEM real autorizado está disponível.
- [x] Registrar duração, bytes e digest normalizado por chamada de API, além de presença/tentativa/sucesso/erro.
- [x] Auditar todos os eventos descobertos dentro dos limites existentes e registrar `parseGrenades` separadamente.
- [x] Expandir o catálogo executável para linhas individuais de header, state/ticks, combat, blind, rounds, bomb e grenades.
- [x] Preparar comparação field-by-field que preserva null, zero, tipos, valores divergentes e evidence refs.
- [x] Preparar determinismo com dois digests Python e dois WASM do mesmo SHA, retornando `NOT_RUN` sem execuções reais.
- [ ] F.2.10-F execução real: `BLOCKED`, sem DEM autorizado.
- [ ] F.2.10-G auditoria real: `NOT_RUN`.
- [ ] F.2.10-H paridade/determinismo: `NOT_RUN`.

**Decisão:** nenhum claim de parsing real; Canonical e AI Data Readiness permanecem bloqueados; nenhuma mutação de produção, Railway, Storage, histórico, fila ou migration.

# PRIOR EXECUTION GATE — FASE 2.7.2G.5-R-F.2.10-E–H — REAL WASM + PARITY

**Status:** artifact e inicialização comprovados; execução das APIs, DEM e paridade permanecem não executados.

- [x] Verificar artifact browser real no commit/tag exatos, registrar binding/WASM, hashes, tamanhos, licença e manifest independente.
- [x] Executar build isolado com lockfile; build concluiu, mas diferiu do artifact upstream porque Rust/wasm-pack/protoc não são pinados — reprodutibilidade `PARTIAL`.
- [x] Corrigir o gate mínimo para exigir `parseHeader`, `listGameEvents`, `parseEvent` e `parseTicks`.
- [x] Inicializar o artifact real em Chromium e observar sete exports reais; `parsePlayerInfo` e chat permanecem indisponíveis.
- [ ] F.2.10-F formal: `BLOCKED`, porque nenhum DEM autorizado permitiu provar chamadas reais das quatro APIs mínimas.
- [x] Preparar status por API, matriz campo a campo, normalização explícita e taxonomia completa de paridade sem liberar Canonical.
- [ ] F.2.10-G: `NOT_RUN`, pois não existe `.dem` real autorizado no repositório.
- [ ] F.2.10-H/paridade/determinismo: `NOT_RUN`, pois dependem do mesmo DEM real no Python e no WASM.
- [ ] Firefox/Safari, limite 128 MiB e 400 MB: `NOT_RUN`.

**Decisão:** F.2.10-E `PASS`; F.2.10-F `BLOCKED`; F.2.10-G/H `NOT_RUN`; `CANONICAL_ADMISSION` e `AI_DATA_READINESS` permanecem bloqueados.

# PRIOR EXECUTION GATE — FASE 2.7.2G.5-R-F.2.10-A — WASM RUNTIME HARDENING

**Status:** em validação; produção permanece congelada.

- [x] Corrigir a arquitetura Worker para o binding upstream `no-modules`, sem `importScripts` em Module Worker.
- [x] Separar runtime surface digest de hashes reais de binding/binário e registrar provenance upstream auditável sem fabricar artifact.
- [x] Derivar capabilities dos exports observados, usar `parsePlayerInfo` somente quando exportado e separar descoberta de eventos do inventário parseado.
- [x] Endurecer URLs same-origin, integridade SHA-256 e validator recursivo bounded contra payloads proibidos e objetos exóticos.
- [x] Reduzir o limite da POC para 128 MiB, sem claim de 400 MB, e preservar feature flag desligada.
- [ ] Executar Browser → Worker → WASM → DEM real: bloqueado pela ausência de artifact oficial/reprodutível 0.42.0 e fixture DEM autorizada.
- [ ] Gate final após quality gates: `POC_NOT_READY` ou `POC_RUNTIME_READY_FOR_F.2.10-B`.

# PRIOR EXECUTION GATE — FASE 2.7.2G.5-R-F.2.8–F.2.9 — FORENSIC CLOSURE

**Status:** `PASS_FOR_CODE_HARDENING` / operationally `BLOCKED`. No real v2 artifact was executed.

- [x] Separate the declared catalog, installed runtime surface and mapping surface, with independent provenance and digests.
- [x] Version the catalog as v2; retain exactly six v2 classifications and distinguish null-only observations, absence, unavailability and parse failure.
- [x] Keep tick-domain proof fail-closed: the installed `demoparser2==0.42.0` exposes no authoritative complete-domain API, so runtime status remains `UNAVAILABLE`.
- [x] Strengthen semantic gates for header, identities, rounds, bomb lifecycle, combat references, grenades, teams/score, usercmd, weapons/economy and aggregates.
- [x] Reconstruct physical gzip JSONL evidence and reconcile producer↔artifact fields, classifications, mappings, catalog, tick and semantic projections.
- [x] Add the named 36-dimension reconciliation registry, independent unsigned/final digests and strict Gate 22 finalization.
- [x] Remove legacy report fallback from demo Canonical persistence; an artifact-backed final v2 proof is mandatory.
- [x] Validate 939 APP tests, 171 parser tests (10 explicit skips), typecheck, lint (0 errors/9 baseline warnings), Python compilation and whitespace integrity without production, Railway, Storage, queue or historical mutation.
- [ ] Obtain an authoritative real tick-domain source and produce a real v2 artifact before any operational approval.

**Decision:** `PASS_FOR_CODE_HARDENING`; not `READY_FOR_CONTROLLED_V2_ARTIFACT`. Cache Run 1/2, retry, attempt 9 and Canonical execution remain prohibited.

# PRIOR EXECUTION GATE — FASE 2.7.2G.5-R-F.2.7 — EXHAUSTIVE RAW FORENSIC AUDIT

**Status:** PASS_FOR_CODE_HARDENING / BLOCKED FOR CACHE EXECUTION. Local gates PASS; authoritative real tick-domain source is unavailable and artifact v2 reconciliation was NOT RUN.

- [x] Catalogar 357 capabilities do demoparser2 0.42.0 em 24 categorias, com APIs públicas, provenance, seis classificações e digest determinístico.
- [x] Formalizar domínio esperado/observado e batching bounded-memory `PROPERTY_BATCH × TICK_INTERVAL`; sem fonte autoritativa, retornar `UNAVAILABLE/BLOCKED` sem usar `ticks=None`, `playback_ticks` ou 4096 como prova.
- [x] Implementar reauditoria independente de todos os chunks gzip JSONL, incluindo bytes comprimidos/descomprimidos, SHA, índices e inventários semânticos.
- [x] Reconciliar projeções producer↔artifact por conjuntos/digest e exigir os 22 gates fail-closed; Gate 22 só passa no verificador APP.
- [x] Executar testes APP/parser/contratos, typecheck, lint e compileall: APP 937/937, parser 171 PASS/10 skips, typecheck/compileall PASS, lint 0 erros/9 warnings preexistentes.
- [x] Documentar catálogo, semântica do gate físico, limitações e decisão em `docs/PHASE-2.7.2G.5-R-F.2.7-RAW-FORENSIC-AUDIT.md`.
- [ ] Obter uma fonte autoritativa independente do domínio total de ticks; a API pública inspecionada do demoparser2 0.42.0 não a fornece.
- [ ] Somente depois, produzir e reconciliar um artifact v2 real da demo Cache; sem essas provas, contagens concretas e os 22 gates permanecem NOT RUN.
- [x] Preservar produção: sem retry, attempt 9, Cache Run 1/2, escrita Canonical, mutation histórica, secrets ou deploy Railway.

**Decisão:** `PASS_FOR_CODE_HARDENING`, sem declarar `READY_FOR_CONTROLLED_V2_ARTIFACT`. Fixtures provam o mecanismo, não a demo real; a ausência de domínio autoritativo mantém Cache Run 1, Run 2, attempt 9, Canonical operacional e Fase 2.8 bloqueados.

# CURRENT EXECUTION GATE — FASE 2.7.2G.5-R-F.2.6 — CANONICAL INTEGRITY REMEDIATION

**Status:** BLOCKED_BEFORE_RETRY / RUN 2 STILL BLOCKED.

This section supersedes older execution notes below when they conflict with the latest forensic audit.

- [x] Identified and corrected the concrete `finish_demo_job_processed` JSONB/text[] type mismatch.
- [x] Added a postcondition: a demo job cannot become `processed` unless a committed demo `match_sources` row points to Canonical.
- [x] Added processed-idempotency support for an approved immutable `raw_evidence_artifacts` path even when `raw_demo_evidence_reports` is absent.
- [x] Corrected round reconstruction so lifecycle `round_end` rows before the first real `round_start` are ignored instead of shifting every round.
- [x] Changed event mapping to fail closed in inter-round gaps and on explicit round/tick contradictions.
- [x] Added Canonical bundle validation for round numbering, round count, tick ordering, overlap and event containment.
- [x] Added a future-row database CHECK preventing `end_tick < start_tick`; historical invalid rows remain preserved by design.
- [x] Prevented unapproved legacy demo Canonical matches from being identity-convergence targets.
- [x] Made post-Canonical durable finalization retryable: if Canonical has already committed, the durable job is kept processing for lease/stale recovery instead of being terminalized as failed.
- [x] Added regression tests for the round-boundary and Canonical semantic defects.
- [x] Applied the existing migration `20260919110000_g5_rf2_canonical_integrity.sql` to production without creating a duplicate.
- [x] Verified Railway read-only: `/health` and `/version` return 200 with `demoparser2 0.42.0`, contract 1, pinned semantic revision and corrected build revision.
- [x] Re-ran focused and complete gates after resolving type/test drift: APP 931/931, parser 165 PASS/10 skipped, typecheck, compileall, formatting and build PASS.
- [x] Correct the repository lint blocker with scoped formatting only: ESLint now passes with 0 errors and 9 pre-existing warnings; APP 931/931, focused RAW contract 43/43, parser 165 PASS/10 skipped, critical parser contracts 66 PASS/7 skipped, typecheck, compileall and automatic build PASS.
- [ ] Perform a controlled Cache Run 1 retry using the same physical demo/SHA, with no Run 2. The authorized execution stopped before mutation because the mandatory GitHub Quality Gates result was not independently available for the resulting commit.
- [ ] Only declare G5-R-F.2 PASS after RAW approval, valid Canonical intervals, event containment, terminal job finalization, idempotency and historical immutability are all proven.
- [ ] Run 2 / attempt 9 remains prohibited until the explicit PASS gate.
- [ ] Fase 2.8 AI Coach remains blocked.

**Current decision:** `BLOCKED_BEFORE_RETRY`. All local gates pass, including lint with 0 errors. The persistent GitHub workflow remains correctly defined, but its run/status could not be observed because this environment exposes no GitHub repository or Actions endpoint. Under the mandatory fail-closed rule, no Cache run, upload, enqueue, retry, attempt 9, historical mutation, Railway deployment or secret change occurred. Attempt 8 remains failed with retry_count 3/dispatch 2; attempts 7/8 and both RAW artifacts remain intact.

**Historical data policy:** attempt 7, attempt 8 RAW artifacts and existing Canonical rows are not deleted or rewritten by this remediation. The failed Run 1 Canonical state remains forensic evidence and is not an AI source until a fresh controlled run produces a valid Canonical state.

# Roadmap

## CURRENT SOURCE OF TRUTH — FASE 2.7.2G.5-R-F.2.1–2.5 — CACHE RUN 1 FAIL

- [x] SHA hardening e reconciliação de órfãos instalados; constraints, validação pré-mutation, lock e ACL service-role-only comprovados.
- [x] PostgreSQL descartável: 50/50 corridas PASS; pipeline 487/487; APP 928/928; parser 162 PASS/10 skips; typecheck/compileall/build PASS.
- [x] Attempt 8 real criado pelo lifecycle oficial: upload `d89b697f-c40d-42f4-ae51-040e4e8cabba`, job `d1851c49-820a-426b-86c6-0ea4623b4f41`, mesmo SHA/tamanho, supersedendo attempt 7 por `raw_audit_blocked`.
- [x] RAW 8 READY/audit APPROVED: 25/25 chunks, 373.778 linhas, 2.799.506 bytes, root `341eb88e1c5b1c4f6af8fd74e7a7af39333ff0c4a2108a8d9e05a5e9a8297b1c`; oito gates RAW PASS; HOT ~1,20 MiB.
- [ ] **CACHE RUN 1 FAIL:** terminal `PERSISTENCE_ERROR`; `finish_demo_job_processed` atribui `text[]` à coluna `demo_jobs.quality_flags jsonb`.
- [ ] **ATOMICIDADE FAIL:** handoff deixou source canônico parcial (10 participantes, 25 rounds, 4.397 eventos), sem round_players, métricas ou features.
- [x] Attempt 7/artifact 7 preservados; somente supersessão legítima registrada. Não existe attempt 9.
- [ ] Run 2, attempt 9 e Fase 2.8 permanecem proibidos até correção incremental e novo gate explícito.
- [x] Relatório: `docs/PHASE-2.7.2G.5-R-F.2-CACHE-RUN-1.md`.

## CURRENT SOURCE OF TRUTH — FASE 2.7.2G.5-R-F.2 — CACHE RUN 1 FAIL

- [x] Preflight completo PASS: migration/RPCs/ACLs/constraints, histórico, Storage e Railway foram comprovados sem mutação.
- [x] Demo histórico comprovado por stream read-only: 473.748.061 bytes e SHA de 64 caracteres registrado no relatório.
- [ ] **CACHE RUN 1 FAIL:** a primeira reserva recebeu por erro operacional um SHA digitado com 67 caracteres; criou somente o upload pendente isolado `5c514921-d32d-4058-9d34-bbb57c361b53`, attempt 1, sem job e sem objeto.
- [x] Interrupção fail-closed imediata: nenhum upload físico, enqueue, mensagem, claim, parse, RAW, HOT, Canonical, métrica ou feature novos.
- [x] Attempt 7 e artifact 7 permanecem intactos; `superseded_by_job_id` continua NULL e não existe attempt 8/9 para o SHA correto.
- [x] Nenhum retry, Run 2, deploy Railway, alteração de secret ou ajuste manual de estado foi executado.
- [x] Relatório: `docs/PHASE-2.7.2G.5-R-F.2-CACHE-RUN-1.md`.
- [ ] Decisão: `CACHE RUN 1 = FAIL`; `G5-R-F.2 = FAIL`; `RUN 2 = NOT READY`.

## FASE 2.7.2G.2 — RAW Coverage Closure — EM EXECUÇÃO

- [x] Criar leitura server-only, master-admin, do manifest RAW preservado com validação do digest de audit_evidence; a extração efetiva depende do próximo build/deploy do APP.
- [x] Classificar cada campo individualmente: corpus exato dos 178 campos preservado em fixture executável; projeção atual = 4 MAPPED, 174 RAW_ONLY_INTENTIONAL e 0 desconhecidos.
- [x] Implementar e testar os quatro mappings semânticos comprovados (`game_state.name`, `game_state.steamid`, `game_state.tick`, `player_death.attackerblind`); os demais campos têm razões RAW-only explícitas, sem wildcard.
- [x] Resolver localmente e documentar os 3 gates FAIL; campos futuros desconhecidos, parse failures, razões ausentes e evidência incompleta continuam fail-closed.
- [ ] Revalidar o artifact Cache original sem mutá-lo; somente após cobertura fechada executar novo Cache Run 1 oficial.
- [ ] Run 2/idempotência somente após Run 1 PASS; Fase 2.8 permanece bloqueada.
- [x] Revalidar read-only os 24 chunks preservados: 373.754 linhas físicas e 25 estados de rodada derivados de ticks; detalhes em `services/cs2-demo-parser/docs/cache-g2-raw-coverage.md`.

## FASE 2.7.2G — RAW forensic audit + Cache E2E — EM AUDITORIA

- [x] Auditar o estado real do job Cache e artifact sem alterar dados: tentativa lógica 7, dispatch 2, artifact READY/BLOCKED, 24 chunks verificados, 373.754 linhas, 2.799.488 bytes e zero Canonical.
- [x] Classificar o bloqueio preservado: 178 `UNMAPPED_BUT_AVAILABLE` e três gates FAIL; 176 `RAW_ONLY_INTENTIONAL` tinham justificativa presente.
- [x] Alinhar a admissão APP ao contrato completo `reason` e à projeção compacta legada `reason_present`, mantendo `UNMAPPED_BUT_AVAILABLE` sempre fail-closed.
- [x] Consolidar a decisão de finalize/verificação e rejeitar seções ou metadados físicos desconhecidos.
- [x] Validar contratos locais: 51 testes RAW focados, 475 testes de pipeline, 916 testes APP, typecheck, diff check e build PASS; lint global segue bloqueado por dívida preexistente fora do escopo.
- [ ] Executar Cache Run 1 pelo lifecycle oficial; Run 2 somente após Run 1 PASS.
- [x] Fechar diagnóstico G.1: artifact original preservado e nenhuma execução iniciada; estado BLOCKED até sincronização controlada do parser corrigido antes de um novo Run 1.

## FASE 2.7.2 FINAL — FOUNDATION BLOCKED NO RAW AUDIT REAL

- [x] Railway preflight real PASS: `/health` e `/version` HTTP 200; parser `demoparser2@0.42.0`, contract `1`, semantic revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b` e build `git:5d19890cdf8a018469761c597c650016791342d3`.
- [x] Cache original preservado e reenfileirado uma vez pela RPC oficial: job `a31f5c25-b0d8-41ac-8225-27814cd1732a`, upload `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043`, `attempt_number=7`, dispatch `2`, mensagem `15` consumida e arquivada.
- [x] RAW real preservado e fisicamente íntegro: artifact READY, 24 chunks verificados, 373.754 linhas, 2.799.488 bytes e root digest registrado.
- [ ] **Run 1 BLOCKED:** terminal `blocked_raw_audit` / `RAW_AUDIT_BLOCKED`; o manifest permaneceu semanticamente bloqueado e nenhum Canonical foi persistido.
- [ ] **Run 2/idempotência NOT_RUN:** proibidas até Run 1 PASS.
- [ ] **Performance PARTIAL:** 60,63 s e totais RAW observados; RSS/breakdown completo indisponíveis.
- [ ] **FASE 2.8 NÃO INICIADA:** depende do fechamento de G16–G18 e G21.

## FASE 2.7.2F.1–F FINAL — Data foundation closure — EM VALIDAÇÃO / E2E CACHE BLOQUEADO

- [x] `participantKey` source-neutral preservado mesmo sem Steam; nickname isolado nunca gera chave.
- [x] Polling durável finito aguarda o dispatch solicitado até estado terminal e classifica timeout/stall como BLOCKED.
- [x] Idempotência exige Run 1 processada e Run 2 realmente reenfileirada/aguardada; duas leituras não contam como duas execuções.
- [x] AIM, POSITION, ECONOMY e UTILITY permanecem player-scoped com disponibilidade explícita, sem alterar RAW/HOT.
- [x] Validação local PASS: 890 testes APP, 153 testes parser (3 skipped), 71 testes focados, typecheck, compileall, diff check e build automático.
- [x] **Railway preflight PASS (status atual):** `/version` comprova contract `1`, semantic revision e build revision pinadas.
- [ ] **Cache Run 1 BLOCKED / Run 2 NOT_RUN (status atual):** Run 1 chegou ao RAW READY, mas foi bloqueada pelo RAW audit semântico; idempotência não foi executada.

## FASE 2.7.2F — Player Identity + Player Data Integrity Closure — IMPLEMENTADA / E2E CACHE BLOQUEADO

- [x] **F1 PASS:** identidade, provenance, concorrência e histórico consolidados sem estruturas paralelas ou nickname como prova forte.
- [x] **F1 PASS:** `participantKey` resolve primeiro o participante; Steam permanece evidência externa opcional em Canonical, métricas e features.
- [x] **F2 PASS:** seleção player-scoped de AIM, posição, economia e utility com disponibilidade explícita e sem alterar RAW/HOT.
- [x] **F3 PASS:** retry de usuário e E2E administrativo usam `retry_demo_job`, preservando `attempt_number`, incrementando dispatch e acionando a fila durável; não há chamada direta a `processJob()`.
- [x] **Validação PASS:** 880 testes APP, 153 testes parser aprovados (3 skipped), 94 testes focados, typecheck, compileall, diff check e build automático.
- [x] **Segurança PARTIAL:** nova RPC acessível apenas por `service_role`; linter mantém os mesmos 15 findings legados previamente catalogados.
- [ ] **F4 BLOCKED:** job Cache reservado não foi executado nem reenfileirado; Railway ainda não provou `/version` com revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b` e contrato `1` no ambiente real.
- [ ] **AI Coach BLOCKED:** permanece fail-closed e não conectado a respostas reais; nenhum dado ou integração fictícia foi criado.

## FASES 2.7.2D.9–D.12 + início da 2.7.2E — IMPLEMENTADAS / E2E CACHE BLOQUEADO

- [x] Vocabulários de método, fonte, confiança e confirmação separados, com decisão append-only e confirmação transacional idempotente.
- [x] Fallback manual permitido quando Steam não existe ou não aparece na demo; nickname permanece contexto exato, nunca prova forte.
- [x] Rejeição de auto-match preservada no reprocessamento; concorrência stale e ownership continuam fail-closed.
- [x] Alvo analítico separado em perfil interno, participant key e Steam opcional; Canonical, métricas, features e projeção usam o participante resolvido.
- [x] State machine explícita na UX, histórico contextual e observabilidade admin com método/fonte/confiança/confirmação.
- [x] Contract 1, revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`, RAW/HOT e isolamento Railway preservados.
- [x] Suítes APP/pipeline/canonical, typecheck e parser validados sem regressão.
- [ ] E2E Cache real permanece BLOCKED: job reservado continua terminal `PARSER_IDENTITY_MISMATCH`, sem decisão, match ou projeção; nenhum retry/requeue/deploy foi executado.
- [ ] AI Coach real permanece fail-closed e não conectado; nenhuma resposta ou integração fictícia foi criada.

## FASE 2.7.2D.8 — Player identity resolution — IMPLEMENTADA / E2E CACHE BLOQUEADO

- [x] Consolidar auto-match forte, fallback manual, rejeição e conflitos no resolvedor existente.
- [x] Implementar histórico contextual de nicknames com ownership, RLS e idempotência.
- [x] Integrar confirmação e histórico à UI, aos cinco idiomas e ao histórico de demos.
- [x] Provar propagação para Canonical, métricas e features sem alterar RAW/HOT/Railway.
- [x] Executar testes locais completos e manter E2E Cache bloqueado até Railway sincronizado.

## FASE 2.7.2D.7 — E2E Cache + handoff sem perda — EM EXECUÇÃO

- [x] Plano aprovado para preservar AIM, posição e economia no handoff canônico sem misturar snapshots com eventos.
- [x] Implementado e validado handoff HOT → normalizer → `match_sources.metadata` com testes comportamentais; snapshots não são convertidos em eventos.
- [x] Bytes físicos do `/complete` medidos durante a leitura do stream; 413 acima de 8 MiB provado sem executar completion.
- [x] Testes de limites HOT corrigidos para não retornarem antes de validar AIM, posição e economia; NaN/digest/lifecycle/idempotência preservados pelas suítes existentes.
- [ ] Sincronizar/provar Railway e executar exclusivamente o job Cache existente até estado terminal; BLOCKED enquanto `/version` não expõe identidade e não há acesso de deploy.
- [ ] Publicar o APP quando houver uma operação de publicação disponível; CLI/gateway atuais expõem build/URLs, mas não publish/deploy.

## FASE 2.7.2D.4-B.0 — RAW streaming / HOT payload boundary — IMPLEMENTADA / E2E PENDENTE

- [x] Contratos `HotDemoPayloadV1` e `RawArtifactReferenceV1`, com limites e overflow explícitos.
- [x] Writer JSONL gzip em chunks, SHA físico, hash chain, manifest e root digest no artifact RAW existente.
- [x] Worker durável envia apenas HOT + referência READY; `/complete` limitado a 8 MiB e sem RAW legado.
- [x] APP valida identidade, lifecycle, chunks, manifest e root digest antes do Canonical, sem reler RAW completo.
- [x] Defesa Canonical aceita somente aprovação pelo artifact READY ou pelo caminho legado auditado.
- [x] Testes focados adicionados para HOT de alto volume, chunking, integridade e idempotência.
- [ ] Deploy/configuração Railway e E2E real com a demo Cache permanecem pendentes; nenhum secret, deploy ou dado foi alterado nesta fase.

## FASE 2.7.2D.4-B.1 — Contract hardening — IMPLEMENTADA / AUDITORIA EXTERNA PENDENTE

- [x] `dispatch_attempt` técnico separado de `demo_jobs.attempt_number` lógico em claim, lease, artifact, prefixo, manifest e admissão.
- [x] Eventos não classificados permanecem apenas no RAW e tornam HOT parcial sem erro estrutural.
- [x] Overflow HOT validado explicitamente; RAW dentro do HOT e truncamento silencioso são rejeitados.
- [x] Payload durable `{hot, raw}` com alvo de 4 MiB e hard maximum uniforme de 8 MiB.
- [x] Lifecycle/idempotência endurecidos: retry técnico reutiliza chunks verificados; READY não aceita novos chunks; nova tentativa lógica usa novo prefixo.
- [x] AIM, position e economy permanecem vazios e explicitamente `not_implemented`; nenhum dado ou métrica foi inventado.
- [ ] E2E real ainda NÃO aprovado: Railway sync/deploy, smoke test da demo real e validação Canonical real permanecem pendentes para B.2.

## FASE 2.7.2D.4-B.2–B.5 — Railway alignment — READY FOR RAILWAY SYNC

- [x] Contrato e matriz cirúrgica `MUST SYNC` / `MUST PRESERVE FROM RAILWAY` / `TEST ONLY` documentados; merge integral da `main` proibido.
- [x] Contratos de versão, HOT/RAW, limites, tentativa lógica/técnica, retry, signed upload e legacy `/v1/parse` explicitados.
- [x] Produção exige revision `git:<40-hex>` e a decisão de auditoria RAW é derivada pelo APP a partir da evidência, não aceita livremente do worker.
- [x] Runbook B.2–B.5 preparado com auditoria de ambiente, deploy controlado, rollback e medições obrigatórias do smoke test.
- [ ] B.3 ainda não executada contra valores Railway; nenhum secret foi lido ou alterado.
- [ ] B.4 não executada: nenhum sync, merge ou deploy Railway realizado.
- [ ] B.5 não executada: nenhuma demo real/job reservado foi processado; estado permanece NOT READY FOR REAL E2E.

## BLOCKER — Deployment público — CONCLUÍDO

- [x] Causa raiz confirmada: o build público não injetava a configuração pública do Lovable Cloud no cliente gerado.
- [x] Inicialização corrigida no build, preservando backend, dados, Railway e pipeline.
- [x] Código publicado e validado em `/`, `/login`, refresh, sessão e rotas protegidas nos dois domínios.
- [x] `gameprohub.lovable.app` e `gamepro.network` testados em navegador real, sem crash ou tela “This page didn't load”.

## FASE 2.7.2D-C — UX de duplicidade e seleção explícita — CONCLUÍDA

- [x] Mensagens distintas para demo nova, processada, em fila, falha e cancelada.
- [x] Histórico real invalidado após cada resultado, sem entradas artificiais.
- [x] Seleção explícita e acessível de participantes reais, sem escolha automática.
- [x] Estado vazio honesto e nickname manual preservado nos cinco idiomas.
- [x] Testes frontend de feedback, confirmação e ausência de participantes.

## FASE 2.7.2C — UX Hardening — CONCLUÍDA

- [x] Histórico de demos responsivo, sem compressão ou overflow em telas estreitas.
- [x] Status, progresso, stepper e cancelamento com hierarquia acessível.
- [x] Identificação do jogador com opções visuais e nickname manual responsivo.
- [x] Loader inicial, transição entre páginas e skeletons locais sem atraso artificial.
- [x] App Shell e upload endurecidos para mobile, preservando toda a lógica existente.
- [x] Validação visual em 320/360/390/430 px e desktop; TypeScript, lint, testes e build.

## Recuperação do Preview + player_blind RAW Evidence — CONCLUÍDA

- [x] Confirmar que o preview interno executa o commit esperado e que os erros Hero/Home vêm de uma instância antiga.
- [x] Preservar integralmente Lovable Cloud, Auth, Storage, banco e variáveis gerenciadas.
- [x] Incluir `player_blind` na allowlist única de eventos do RAW Evidence.
- [x] Validar worker, APP, build e rotas internas `/login`, `/admin` e `/dashboard`.
- [x] Registrar o 401 externo separadamente, sem alterar a aplicação para contorná-lo.

## FASE 2.7.2B — RAW Demo Evidence & Full Coverage — IMPLEMENTED / NOT CLOSED

- [x] Conexão oficial do Supabase/Lovable Cloud preservada e cliente fail-closed, sem fallback ou banco alternativo.
- [x] Histórico real de demos em `/analysis`, derivado de `uploads`, `demo_jobs` e `matches` sob RLS do utilizador.
- [x] Aba administrativa `Demos`, separada da visão técnica de uploads e protegida pela autorização existente.
- [x] Inventário integral de eventos separado da allowlist de extração; amostragem determinística limitada a 4096 ticks.
- [x] Estados explícitos de capacidade, `partial_parse` derivado de falhas reais e mapeamentos RAW-only justificados.
- [x] Evidência RAW permanece separada do Canonical Engine, preservando `NULL/UNKNOWN` e sem fabricar entidades.
- [ ] E2E real completo com uma demo privada válida (BLOCKED: arquivo `.dem` não disponível no ambiente).
- [ ] Fechamento da fase após aprovação de todos os gates reais; FASE 2.8 não iniciada.

## FASE — Correção do Lovable Preview + Loading Branding — CONCLUÍDA

- [x] Reassociar as variáveis oficiais do Lovable Cloud ao Preview, sem trocar o backend existente.
- [x] Corrigir o loader global: `GAME` em negrito, `PRO` regular e `GAMEPRO` sem itálico.
- [x] Validar Preview, sessão autenticada, logout e páginas protegidas sem alterar banco, Railway ou pipeline.

## FASE 2.7.2B-E2E — Reprocessamento forense Cache — EM EXECUÇÃO

- [x] Correção tipográfica isolada do loading para `GAMEPRO HUB`, com `GAME` em negrito, `PRO` regular e sem itálico.
- [x] Confirmar artefato original, tamanho, SHA-256 e revision lock antes da nova tentativa.
- [x] Criar uma nova tentativa usando o objeto original, sem apagar ou modificar o histórico.
- [ ] Acompanhar os gates Storage → PBDEMS2 → parser → RAW → digest → auditoria → Canonical → métricas. BLOCKED/PENDING: worker permanece em `processing/parsing`, sem RAW persistida.
- [ ] Verificar lifecycle e idempotência; manter a antiga match como LEGACY / UNVALIDATED. BLOCKED/PENDING até a tentativa atingir estado terminal.

## FASE — Diagnóstico do lifecycle da Tentativa 4 — MONITORANDO

- [x] Localizar o identificador canônico da Tentativa 4 e consultar job, lease, heartbeat, worker e mensagem sem alteração de dados.
- [x] Confirmar lease válido, heartbeat renovado e mensagem 6 preservada na fila sob visibilidade do worker `railway-parser-1`.
- [x] Não acionar recuperação stale enquanto houver posse ativa; nenhuma Tentativa 5 criada.
- [x] Classificação formal em 2026-09-16 05:10:58 UTC: `ACTIVE_VALID_LEASE`; heartbeat com 290 s, lease válido por mais 610 s e mensagem 6 invisível até o mesmo vencimento.
- [x] Regression guard do public build alinhado ao contrato real por verificações estruturais de configuração, fallback SSR/client e fail-closed.
- [x] `verify:public-build` PASS; suíte completa executada com 839/842 testes PASS e 3 falhas preexistentes de fixtures incompatíveis com o revision lock do parser, sem alteração por estarem fora do escopo deste marco.
- [ ] Aguardar estado terminal ou expiração simultânea do lease e heartbeat antes de qualquer recuperação oficial.

## FASE UX — Processamento de demo com progresso e etapas (concluída)

- [x] Progresso visual estimado derivado exclusivamente do stage real, com faixas determinísticas, monotonicidade e teto por etapa.
- [x] Painel premium com etapa atual, etapas concluídas/futuras, mensagens amigáveis e estados de conclusão/falha.
- [x] Polling existente de 4 segundos preservado, sem consulta paralela ou mudança no backend.
- [x] Acessibilidade da barra e anúncios de mudança de etapa; animações respeitam redução de movimento.
- [x] Novas mensagens disponíveis em pt-BR, pt-PT, inglês, espanhol e francês.
- [x] Testes de mapeamento, fallback, monotonicidade, falha, traduções, acessibilidade e polling.

## FASE 2.2.1C — Final FACEIT hardening (concluída)

- [x] (A) Execução fire-and-forget removida do callback OAuth e de `requestFaceitSync`.
- [x] (B) Job não pode mais ficar preso em `processing`: heartbeat + recuperação.
- [x] (C) `recover_stale_faceit_sync_jobs()` respeitando o teto de tentativas.
- [x] (D) Cron virou worker real, com claim atômico e orçamento de tempo.
- [x] (E) Orçamento de chamadas por job, concorrência global e espaçamento mínimo.
- [x] (F) Semântica BO1/BO2/BO3: score = mapas na série, rounds só de rounds reais.
- [x] (G) Convergência de partidas incompletas (`source_complete`, tentativas).
- [x] (H) Paginação sinaliza `truncated` + `stopReason`; página curta não é fim.
- [x] (I) Disconnect sempre lógico; DELETE do cliente só em conexão `pending`.
- [x] (J) HTTPS exigido no ponto de uso de userinfo e da Data API.
- [x] (L) Índice UNIQUE duplicado de `match_metrics` removido.
- [x] (M) Contadores honestos (inserted / updated / existed / skipped / failed / deferred).
- [x] (N) `fetchFaceitRecentMatchStats` (código morto) removido.

## Aberto (fases seguintes)

- [ ] Agendamento externo do cron (`/api/public/pipeline-cron`) com o segredo já configurado.
- [ ] Dashboard real, Pro Score, Player DNA, diagnóstico e AI Coach com dados reais (hoje mock sob `DEMO_DATA`).
- [ ] Worker real de parser de `.dem` (`FEATURES.realDemoParser = false`).
- [x] Gamers Club: INDISPONÍVEL por bloqueio externo (403/Cloudflare, sem API pública). Não haverá contorno de anti-bot.

## FASE 2.2.1D — FACEIT FINAL VALIDATION PATCH (concluída)

- `finished` baseado em `finished_at`/status terminal (`isFaceitMatchFinished`); `match_date` nunca é prova.
- Convergência isolada em `faceitMatchConverged`: partida ongoing nunca converge por tentativas.
- API call budget virou hard ceiling no `FaceitClient` (conta retries; erro `FACEIT_API_BUDGET_EXHAUSTED`).
- Worker deadline propagado ao client (abort = min(timeout, deadline); `FACEIT_WORKER_DEADLINE_EXCEEDED`).
- Disconnect race: update final de `player_connections` guardado por `status = 'connected'`.
- Testes novos: `faceit.validation.test.ts` (21) e `faceit.lifecycle.test.ts` (3). Total 169.

## FASE 2.3 — Gamers Club — PARCIAL / BLOQUEADA

**Bloqueio (Regra Zero).** Não existe API pública oficial da Gamers Club e todas as
requisições não autenticadas ao site público — inclusive a home — respondem
`HTTP 403` com desafio interstitial da Cloudflare (`cf-mitigated: challenge`).
Contornar isso exigiria cookie de sessão, stealth browser, proxy rotativo ou
bypass de CAPTCHA, todos explicitamente proibidos. Portanto NÃO há caminho de
coleta permitido e nada de collector foi implementado.

Implementado:

- [x] Validador/parser de URL pública (`src/lib/gamersclub/gamersclub.url.ts`): host allowlist,
      HTTPS obrigatório, rejeita userinfo/porta/`javascript:`/`data:`/sufixo falso, normaliza
      trailing slash, query e fragment, extrai `external_id` numérico ou slug.
- [x] Erros estruturados GC (somente códigos alcançáveis hoje).
- [x] `is_verified` nunca é promovido por URL informada (`GAMERS_CLUB_IDENTITY_VERIFIABLE = false`).
- [x] Estados de disponibilidade de fonte (`src/lib/sources/availability.ts`):
      implemented / available / degraded / unavailable / configuration_missing / unsupported.
      GC = `unavailable` (`anti_bot_challenge`), não colecionável.
- [x] Correção de honestidade: `IMPLEMENTED_SOURCES = ["demo", "faceit"]`;
      `getSourceAdapter` não devolve mais adapter falso para FACEIT; `FEATURES.faceitIntegration = true`.
- [x] Testes: 23 casos GC (URL + invariantes). Suíte total 212/212.

Bloqueado (não implementado, e não implementável sem acesso permitido):

- [ ] collector/HTTP client GC, parser de perfil, parser de histórico, normalizer canônico
- [ ] `gamers_club_sync_jobs`, `gamers_club_profile_snapshots`, worker/cron, cache, snapshots
- [ ] UI "Conectar Gamers Club", refresh manual, security checks GC, migrations

Desbloqueio possível: API/parceria oficial da Gamers Club, ou confirmação escrita
de um endpoint público sem autenticação e sem desafio anti-bot.

## FASE 2.3 — Gamers Club + Player Identity Graph — PARTIAL / BLOCKED_EXTERNAL_ACCESS

- Locator model (numeric_id vs slug, externalIdConfirmed), access classification, provider abstraction,
  HTTP/deadline/budget/retry semantics, bounded pagination, cache TTL + freshness, job lifecycle,
  identity correlation engine with evidence hierarchy — implemented and tested (265 tests).
- DB: identity state + locator columns, identity_correlation_evidence, gamers_club_profile_snapshots,
  gamers_club_sync_jobs, atomic claim + stale recovery (service_role only).
- UI: GamersClubPanel + PlayerIdentityPanel on /upload (honest blocked/correlated states).
- BLOCKED: collection itself — gamersclub.com.br answers HTTP 403 Cloudflare challenge; no official API.
  Collector/parser/worker remain unimplemented on purpose. Unblocks with an authorised provider.

## FASE 2.4 — Player Profile + Identity Graph + Verification Engine + CS2 Map Pool — DONE

- Perfil 100% persistente (nenhuma página lê `demoProfile`): `player_profiles`
  (nickname, country ISO-2 com CHECK, main_platform em STEAM_PREMIER/FACEIT/GAMERS_CLUB/OTHER,
  experience, team) + `player_profile_roles` (9 códigos estáveis) + `player_profile_goals`
  (6 códigos, único primário via índice parcial). RLS owner-only write, leitura owner/staff.
- Server fns `src/lib/profile.functions.ts` (`getPlayerProfile`/`savePlayerProfile`) sob
  `requireSupabaseAuth`; hook `usePlayerProfile`; `FEATURES.profilePersistence = true`.
- Cadastro e perfil compartilham a mesma taxonomia (`src/lib/profile/taxonomy.ts`),
  país detectado por navigator.language/locale/timezone (persistido sempre vence).
- Verification engine puro (`src/lib/profile/verification.ts`): `calculateIdentityConfidence`,
  `deriveIdentityStatus`, `evaluateVerification`, `profileCompleteness`. Termômetro e badge
  derivados de dados reais; badge só com prova de posse e perfil completo, sem conflito.
- Identidades externas read-only na UI; `guard_identity_verification()` impede auto-promoção
  (is_verified/identity_status/confidence_score/verification_method/verified_at/external_id/platform).
- Map pool CS2 versionado (`src/lib/cs2/maps.ts`): Cache no Active Duty desde 2026-07-08,
  Overpass fora; gráficos mostram "—" quando não há dados reais.
- Correção de UI encontrada em teste real: o `Select` do Radix espelha o valor num `select`
  nativo dentro do `<form>` e emite `""` na montagem, apagando país/plataforma/experiência
  recém-carregados. Handlers agora ignoram valor vazio; recarregar mantém os valores salvos.
- Checks: typecheck limpo, 287/287 testes, build OK, verificação end-to-end no navegador
  (salvar → reload → valores vindos do banco: nickname thg, BR, FACEIT, 1_3Y, IGL+AWPER, CLIMB_RATING primário).

## FASE 2.5 — Steam Identity Foundation (concluída)

- Steam entra como **fonte de identidade, nunca de partidas**: a Valve não publica
  histórico CS2. Codificado em `availability.ts` (`identity_only`, não coletável),
  `sourceCapabilities.ts` (só `identity: supported`) e
  `STEAM_MATCH_DATA_SUPPORTED = false`.
- OpenID 2.0 (não OAuth: a Steam não oferece servidor OAuth2 para vínculo) — nenhum
  token existe para guardar. `connection_type` ganhou o valor `openid`.
- Anti-CSRF/replay: `steam_link_attempts` guarda só o **hash** do state, TTL 10 min,
  uso único com `UPDATE ... WHERE status='pending'`; RLS com zero policies e sem GRANT
  para anon/authenticated. O state viaja dentro do `return_to`, que a Steam assina.
- Callback valida estrutura → `check_authentication` (só `is_valid:true`) → consumo.
  O SteamID64 nunca vem de query param confiável.
- Propriedade única: pré-checagem na aplicação + índices parciais únicos
  `player_connections_steam_external_uniq` / `player_identities_steam_external_uniq`
  (23505 → `STEAM_DUPLICATE_ACCOUNT`).
- Estruturas canônicas: `player_connections`, `player_identities`,
  `identity_correlation_evidence`. Nenhuma tabela Steam paralela de identidade.
- Correlação: `authenticated_link` (1.0) verifica a identidade Steam; `steam_id64`
  (0.95) cruza com FACEIT/Gamers Club promovendo no máximo a `strongly_correlated`;
  divergência grava **conflict**, nunca resolve em silêncio.
- Privacidade: SteamID64 completo só para o dono (mascarado até revelar); auditoria,
  logs, e-mails e o Admin usam sempre a forma mascarada.
- Desvincular é não destrutivo: partidas/análises/planos permanecem; revoga-se a
  confiança e cancelam-se as tentativas pendentes.
- Design system de e-mail (`src/lib/email/`): tema, componentes em tabela, layout dark,
  6 templates AUTH com placeholders do backend exportados em
  `docs/email/supabase-auth/` + avisos de segurança Steam. Renderiza, não envia.
- `.env.example` + `ENVIRONMENT.md`; `.env` no `.gitignore`. Sem chave configurada a
  integração diz `not_configured` e não desenha botão — nenhuma chave é pedida ao jogador.
- Checks: typecheck limpo, 354/354 testes, lint 0 erros, build OK, checks persistentes
  29a–29g PASS no banco.

## FASE 2.5.2C — Steam + e-mail transacional (fechamento)

- [x] Link e unlink do Steam viraram transação única (`steam_link_commit` / `steam_unlink_commit`, service_role): conexão + identidade + evidência + auditoria são atômicos.
- [x] Takeover e posse do perfil revalidados dentro do banco; índices UNIQUE seguem como última defesa.
- [x] Unlink nunca reescreve um `conflict` registrado (histórico preservado).
- [x] Consumo de state 100% atômico; vínculo de usuário vem só da linha vencedora (`STEAM_STATE_ALREADY_USED`).
- [x] Throttle de início do link atômico via `claim_steam_link_slot` (advisory lock por usuário).
- [x] Transporte real de e-mail: Hostinger Mail API (HTTPS). Nenhum caminho SMTP existe (Workers não abre TCP).
- [x] HTTP 202 = `accepted` (aceito/enfileirado), nunca "entregue"; 4xx permanente, 429/5xx transitório com `Retry-After` respeitado e limitado.
- [x] Idempotência com claim/lease no banco (`claim_email_delivery`): aceito nunca reenvia, falho pode retentar, lease vivo bloqueia concorrente, lease expirado é recuperado.
- [x] Checks permanentes 30a–30d e 17 novos testes de transporte/configuração.

## FASE 2.6.0 — hardening final da 2.5.2C

- [x] E-mail fail-closed: falha ao reservar o envio devolve `EMAIL_CLAIM_UNAVAILABLE` (retentável) em vez de seguir adiante.
- [x] Teto global de tentativas por e-mail (9) em `src/config/email.ts`; esgotado devolve `EMAIL_RETRY_BUDGET_EXHAUSTED` (não retentável).
- [x] Semântica única de corrida de state: qualquer state já usado sai como `STEAM_STATE_ALREADY_USED` (`publicSteamErrorCode`) no callback e nos server functions.
- [x] Correlação é suplementar: se a construção da evidência falhar, o vínculo de posse é mantido e o estado é registrado honestamente como `correlation_status=pending`.
- [x] Remetente das fixtures de e-mail alinhado a `hub@gamepro.academy`.

## FASE 2.6 — Canonical Match Engine (domínio)

- [x] `CANONICAL_SCHEMA_VERSION = 2` com três eixos independentes de versão (canônico, análise, contrato por fonte).
- [x] Domínio neutro: series opcional, match = um mapa jogável, observação por fonte, participantes sem `player_id`, rounds neutros vs estado por jogador, eventos preservando IDs externos.
- [x] Qualidade e cobertura por camada com motivos explícitos; NULL nunca vira ZERO.
- [x] Contrato único de adapter (`CanonicalSourceAdapter`); DEMO e FACEIT traduzidos; Gamers Club falha alto (`external_access_blocked`).
- [x] Match Identity Resolver com EXACT/PROBABLE/POSSIBLE/NO_MATCH/CONFLICT; só EXACT anexa automaticamente; prioridade de fonte não é merge.
- [x] Projeção por jogador (vitória/derrota/"meu placar") derivada, nunca gravada no match.
- [x] 37 testes novos (454 no total), typecheck limpo, lint limpo, build OK.
- [x] 2.6.2 banco (match_series/match_sources/match_participants/round_players) e 2.6.5 persistência transacional — APLICADOS e provados contra o banco real (ver 2.6.9 e 2.6.11.5).

## FASE 2.6.9 — persistência canônica: prova contra o banco real

- [x] Idempotência provada com dados de teste no banco real: a MESMA observação gravada
      duas vezes devolveu o mesmo `match_id`/`match_source_id`, `created=false` e manteve
      1 partida, 1 fonte, 4 participantes, 2 rounds, 8 estados por round, 1 evento
      (`observation_count` 1 → 2).
- [x] Precedência de fonte provada: uma observação FACEIT (nível de partida, sem rounds,
      placar 99–1, mapa nulo) convergiu para a MESMA partida pelo fingerprint e NÃO
      sobrescreveu mapa, placar, contagem de rounds nem qualidade vindos do demo;
      `canonical_source`/`round_source` seguem `demo` e a segunda fonte foi registrada.
- [x] `NULL ≠ FALSE` confirmado no banco: `survived` seguiu NULL nos 8 estados por round,
      `winning_team` NULL e `player_id` NULL (partida não pertence a um jogador).
- [x] Falha real encontrada e corrigida: um estado por round citando participante
      inexistente era aceito em silêncio (linha órfã). `persist_canonical_observation`
      agora recusa a observação inteira com `CANONICAL_PARTICIPANT_UNKNOWN` /
      `CANONICAL_ROUND_UNKNOWN`; reteste confirmou erro e ZERO linhas gravadas.
- [x] Fixtures de teste removidas do banco ao final (nenhum dado real tocado).
- [x] Fechado na FASE 2.6.11: `faceit.sync.server.ts` grava EXCLUSIVAMENTE por
      `persistFaceitObservation()` (adapter + resolver + persistência transacional);
      concorrência real e RLS negativa provadas na FASE 2.6.11.5.

## FASE 2.6.11.2 — erro de runtime do painel administrativo

- [x] Causa: o menu lateral consultava a sessão administrativa em TODAS as páginas
      autenticadas. Para um jogador comum a resposta era uma recusa (`ADMIN_FORBIDDEN`)
      e, quando ainda não havia sessão no navegador, `Unauthorized: No authorization
header provided` — dois erros visíveis no console em uso perfeitamente normal.
- [x] Correção: novo `getAdminSessionProbe()` (mesma verificação no servidor) devolve
      `null` para quem não é administrador e só falha em problema de infraestrutura;
      o hook só consulta quando existe sessão no navegador. O portão de `/admin`
      continua usando `getAdminSession()` estrito.
- [x] Prova em navegador real, sessão de jogador: `/login`, `/register`,
      `/reset-password`, `/dashboard`, `/matches`, `/profile`, `/upload` sem erros de
      `ADMIN_FORBIDDEN`/`Unauthorized`; `/admin` redireciona para `/dashboard`;
      recarregar `/dashboard` mantém a sessão.
- [x] Privilégios mínimos reconfirmados: tabelas canônicas só com leitura para usuário
      autenticado, zero acesso anônimo; rotinas de persistência canônica apenas
      `service_role`, SECURITY DEFINER com `search_path=''`.
- [x] O aviso de desenvolvimento do React em `/dashboard` foi eliminado na FASE 2.6.11.5:
      os portões de `/_authenticated` e `/admin` decidem em `beforeLoad` e navegam de
      forma declarativa (`<Navigate replace />`), sem atualizar estado durante o render.

## FASE 2.6.11.3 — Production cross-source identity closure

- [x] **Bloqueio P0 encontrado — descoberta de candidatos dependia do jogador.**
      `loadCandidates()` filtrava `matches.player_id = playerId`. Uma partida canônica
      NÃO pertence a um jogador (provado no banco: `player_id IS NULL`), portanto a
      descoberta ficava cega. Agora é neutra: encontra candidatos pelos participantes
      provados no Identity Graph (`match_participants.steam_id64`) e pela janela
      competitiva, nunca pelo dono.
- [x] **Bloqueio P0 encontrado — nenhuma evidência EXACT legítima entre fontes.**
      O demo tem fingerprint, a FACEIT não, e os ids externos das duas fontes não se
      relacionam: na prática nunca haveria convergência real. Regra nova e determinística:
      roster COMPLETO e IDÊNTICO de dez contas provadas pelo Identity Graph, mesmo mapa,
      mesma janela competitiva e sem placar contraditório ⇒ `EXACT_MATCH`
      (`cross_source_roster_identical`). Nada mais foi enfraquecido: parcial continua
      `PROBABLE`/`POSSIBLE`, contradição continua `CONFLICT`, e só EXACT anexa.
      Nenhum fingerprint é copiado, nenhum SteamID64 é inventado.
- [x] **Bloqueio P0 encontrado — erro técnico virava "identidade inexistente".**
      As consultas ao Identity Graph ignoravam `error`. Agora falha de banco/permissão
      levanta `FaceitIdentityResolutionError` (IDENTITY_RESOLUTION_ERROR) e a ausência
      real devolve `IDENTITY_UNRESOLVED` — estados distintos para quem chama.
- [x] Prova no banco real (fixtures isoladas, removidas ao final, zero dado real tocado):
      demo persistida (1 partida, 1 round, 2 eventos); FACEIT anexada ⇒ MESMA partida;
      6 repetições ⇒ 1 partida, 1 observação FACEIT, `observation_count = 7`, 10
      participantes sem duplicação; caso negativo (placar contraditório) ⇒ partida
      separada; anexo a partida inexistente ⇒ `CANONICAL_ATTACH_TARGET_NOT_FOUND` com
      ZERO sobras (rollback).
- [x] RLS reprovada em sessão simulada por papel: participante vê a partida; usuário
      autenticado não participante não vê partida, participantes nem observações;
      `admin_master` vê por política explícita `is_staff`; anônimo sem acesso;
      `INSERT` direto em `matches` negado; `EXECUTE` da rotina de persistência negado
      para `authenticated`. Rotinas canônicas: SECURITY DEFINER, `search_path=''`,
      EXECUTE só para `postgres`/`service_role`.
- [x] Runtime em navegador real: visitante em `/`, `/login`, `/register`,
      `/reset-password` sem erros; jogador em `/dashboard`, `/matches`, `/profile`,
      `/upload` sem erros; `/admin` redireciona para `/dashboard`.
- [x] Suíte: 461 → 480 testes, typecheck, lint e build OK. Novo teste
      `production-cross-source-identity-closure.test.ts` percorre as funções de produção
      (roster FACEIT → Identity Graph → descoberta de candidatos → resolvedor → anexo).
- [x] **Concorrência real PROVADA** (limitação anterior removida): `scripts/canonical-proof.ts`
      dispara SEIS gravações PARALELAS (`Promise.all`) da MESMA observação pelo caminho de
      produção (`persistCanonicalObservation` → `persist_canonical_observation_attached`).
      Resultado verificado no banco: 6/6 concluídas, 1 partida canônica, 1 linha de
      observação (`observation_count = 6`), roster com 10 participantes, zero duplicação.
- [x] **Prova canônica reexecutável e versionada:** `bun scripts/canonical-proof.ts` cria as
      fixtures, executa o caminho de produção contra o banco real e imprime PASS/FAIL por
      gate (observação demo, partida sem dono, `NULL ≠ FALSE`, convergência entre fontes,
      preservação de rounds da fonte forte, idempotência, rollback atômico do anexo,
      não-fusão de partida contraditória, concorrência paralela, leitura anônima negada,
      escrita negada ao usuário autenticado quando há token) e remove tudo ao final,
      confirmando zero sobras. Execução atual: 12 PASS / 0 FAIL / 1 SKIPPED
      (gate de usuário autenticado exige `PROOF_USER_ACCESS_TOKEN`).
- [x] **Aviso de hidratação eliminado:** o portão autenticado (`ssr: false`) não troca mais a
      rota durante a hidratação — decide em `beforeLoad`, renderiza nada e navega para
      `/login` após a primeira pintura. Console de visitante em rota protegida agora limpo;
      jogador autenticado continua entrando direto no `/dashboard`.

## FASE 2.6.11.4 — Prova final no banco real e fechamento da convergência temporal

- [x] **Semântica temporal corrigida.** `match_date` da FACEIT é `finished_at ?? started_at`:
      podia ser o FIM da partida sendo comparado com o INÍCIO do demo. Agora a identidade
      usa timestamps canônicos (`canonicalStartTimestamp`/`canonicalEndTimestamp`): quando
      só existe o instante final, o início é `null` — nunca inventado — e a convergência
      compara início com início.
- [x] **Ambiguidade nunca vira anexo arbitrário.** Dois candidatos EXACT ⇒ `CONFLICT` com
      `ambiguous_multiple_exact_candidates` e `candidate = null`.
- [x] **Prova reexecutável** em `scripts/canonical-proof.ts` (24 gates), sempre pelo caminho
      de produção, com fixtures próprias e limpeza verificada ao final.
- [x] **Concorrência real**: 6 escritores simultâneos da mesma observação ⇒ 1 partida
      canônica, 1 observação por fonte, roster sem duplicação, zero `match_sources` órfão.
      Introspecção de PIDs das sessões continua NÃO PROVADA (sem `dblink`/RPC privilegiada).
- [x] **RLS com sessão autêntica**: dono lê a própria partida (1 linha); autenticado não
      participante lê 0 linhas; anônimo recebe `permission denied`; escrita e execução da
      rotina negadas ao aplicativo.
- [x] **Runtime**: visitante e jogador validados em navegador headless, sem erros de console
      nem de hidratação; `/admin` redireciona não-admin para `/dashboard`.
- [x] 490/490 testes, typecheck limpo, lint sem erros, build OK.
- [x] Relatório: `docs/PHASE-2.6.11.4-FINAL-DATABASE-PROOF.md`.

## FASE 2.6.11.5 — Prova E2E do pipeline FACEIT real e fechamento

- [x] **Prova reexecutável no banco real** (`bun scripts/faceit-pipeline-proof.ts`, 19 gates)
      pelo caminho de produção (`persistFaceitObservation`), com contas e identidades reais,
      sem `fakeDb`, sem fingerprint/SteamID inventado e com limpeza verificada.
      Resultado: PASS=18, FAIL=0, BLOCKED=0, NOT_PROVEN=1.
- [x] **Convergência DEMO↔FACEIT** provada sem fingerprint e sem id externo compartilhado:
      1 partida canônica, 2 observações, 10 participantes vindos só do Identity Graph.
- [x] **Negativas provadas**: partida parecida mas diferente não converge; identidade
      irresolúvel bloqueia; falha de consulta é `IDENTITY_RESOLUTION_ERROR` (≠ ausência);
      dois candidatos EXACT ⇒ `CONFLICT`; attach a alvo inexistente faz rollback total.
- [x] **Descoberta neutra por jogador** provada: o alvo tinha `player_id = NULL` quando foi
      encontrado; `matches.player_id` é projeção por jogador, nunca sinal de identidade.
- [x] **Runtime corrigido**: gate autenticado e gate administrativo agora navegam de forma
      declarativa (`<Navigate>`), decidindo ainda fail-closed em `beforeLoad`. Fim do
      `Unauthorized: No authorization header provided`, do `ADMIN_FORBIDDEN` exibido como
      erro, do mismatch de hidratação em `/admin` e do aviso de update em componente
      desmontado. Navegador headless: zero erros deslogado e logado.
- [x] **Teste mock renomeado** para `unit-mock-cross-source-identity-closure.test.ts`, sem
      afirmar ser prova de produção.
- [x] 490/490 testes, typecheck limpo, lint sem erros, build OK, linter de banco sem
      achado novo.
- [ ] NOT_PROVEN: introspecção de PIDs do PostgreSQL (limitação do ambiente). Invariante
      garantida por lock advisory em transação + unicidade `match_sources(source, external_match_id)`.
- [x] Relatório: `docs/PHASE-2.6.11.5-FINAL-FACEIT-PRODUCTION-E2E-CLOSURE.md`.

## FASE 2.6.11.5A — Integridade das evidências e reconciliação do roadmap

- [x] **Gates frágeis reforçados** em `scripts/faceit-pipeline-proof.ts`: - gate 06 agora prova a convergência pelo conteúdo das observações (fingerprint
      FACEIT nulo, fingerprint do demo igual à fixture, ids externos distintos), e não
      apenas pela contagem de linhas; - gate 09 encadeia as asserções: exatamente 10 SteamIDs distintos gravados, cada um
      presente nas identidades resolvidas pelo Identity Graph e cada id externo FACEIT
      contabilizado no pareamento; - gate de limpeza verifica participantes, séries, conexões, perfis, identidades e
      observações — nenhuma linha órfã sobrevive à execução.
      Reexecução: PASS=18, FAIL=0, BLOCKED=0, NOT_PROVEN=1 (introspecção de PIDs do
      PostgreSQL, limitação do ambiente).
- [x] **Deficiência real de banco encontrada e corrigida**: o check permanente
      "23. all foreign keys have a supporting index" estava FAIL. Sete chaves
      estrangeiras não tinham índice de apoio (`gamers_club_profile_snapshots`,
      `gamers_club_sync_jobs`, `steam_link_attempts`, `match_sources` ×2,
      `round_players` ×2). Índices criados; nenhuma política, grant ou estrutura mudou.
- [x] **Suíte de segurança permanente 100% PASS**: 67/67 (63 via `psql`; os 4 checks
      `26a–26d` exigem execução privilegiada da função-guarda e foram provados pelo
      runner privilegiado — a própria negação de EXECUTE ao aplicativo é o check `25f`).
- [x] **Contradições do roadmap eliminadas**: 2.6.2/2.6.5 marcados como aplicados,
      pendência do `faceit.sync.server.ts` fechada (grava só por `persistFaceitObservation`),
      aviso de render do React marcado como resolvido, Gamers Club registrado como
      bloqueio externo definitivo.
- [x] **README reconciliado** com o estado real: Steam é fonte de identidade (Valve não
      publica histórico de CS2), FACEIT e Canonical Match Engine reais, Pro Score/DNA/
      diagnóstico/Coach/treino ainda mock sob `DEMO_DATA`, Gamers Club indisponível.
- [x] **Runtime revalidado** em navegador headless: deslogado (`/`, `/login`, `/register`,
      `/reset-password`, `/dashboard`, `/admin`) e logado como jogador (`/dashboard`,
      `/matches`, `/profile`, `/upload`, `/training`, `/admin` → `/dashboard`) — zero erros
      de console e zero erros de página nos dois cenários.
- [x] 490/490 testes, typecheck limpo, `eslint` sem erros (8 warnings preexistentes de
      react-refresh), build OK, linter de banco sem achado novo (14 conhecidos e
      justificados).

### Veredito

**FASE 2.6.11.5A — CLOSED. READY FOR PHASE 2.7.**

## FASE 2.7 — Real demo ingestion + canonical analytics foundation (EM ANDAMENTO)

Objetivo: `.dem` real → upload → job → parser real → normalização → identidade →
observação canônica → resolver → persistência transacional → métricas → features →
data quality. Fora de escopo: Pro Score, DNA, Diagnosis, AI Coach, Training.

- [x] **Dupla persistência do demo eliminada (GATE 28)**: a rotina canônica
      transacional roda primeiro e é a única escritora de fatos canônicos;
      `persistDemoProjection()` grava apenas a projeção por jogador
      (`matches` conveniência, `match_metrics`, `match_features`). Fim do risco de
      segunda linha de partida quando o demo converge com FACEIT.
- [x] **Auditoria semântica das features (GATE 20)**: catálogo
      `src/lib/pipeline/features.catalog.ts` com fórmula, unidade, intervalo,
      direção, significado, comportamento nulo, amostra e impacto na confiança.
      Inversões corrigidas: `early_death_rate`, `untraded_death_rate`,
      `damage_taken_per_round`; complementos passam a ter nome próprio
      (`early_death_avoidance`, `early_death_free_rate`).
- [x] **NULL nunca virá 0**: denominador zero devolve `null` em todas as razões
      (o antigo `Math.max(x, 1)` mascarava ausência de amostra como zero).
- [x] **Taxonomia de erros**: `DEMO_EMPTY`, `IDENTITY_RESOLUTION_ERROR`,
      `CANONICAL_RESOLUTION_CONFLICT`, `CANONICAL_PERSISTENCE_ERROR`,
      `METRICS_ERROR`, `FEATURES_ERROR`, `JOB_TIMEOUT`, `JOB_STALE`,
      `RESOURCE_LIMIT`, `STORAGE_ERROR` — com mensagens nos cinco idiomas.
- [x] **Limites e versões**: `PARSER_MAX_DURATION_MS`, `MAX_PARSER_PAYLOAD_BYTES`,
      `METRICS_VERSION`, `FEATURES_VERSION` (gravados na metadata da observação e
      em `matches.demo_metadata` para linhagem).
- [x] 500/500 testes, typecheck limpo, lint sem erros, build OK. Nenhuma
      migration, política, grant ou rotina de banco alterada.
- [x] **Worker externo configurado no app**: o parser nativo permanece fora do
      runtime edge; URL HTTPS e token server-only foram cadastrados no Gate 1D.
      A conectividade e o processamento de `.dem` real seguem NOT PROVEN.
- [ ] Pendência de infraestrutura: agendamento externo de `/api/public/pipeline-cron`.
- [x] **Hardening P1–P2 (rodada 2)**: resolver canônico ligado ao caminho demo
      (descoberta neutra + `canConvergeCrossSource`), fingerprint separado da
      identidade canônica, attach de demo sem `external_match_id`, flags de bomba
      `boolean | null`, métricas quality-aware, tickrate nunca assumido, clutch por
      participação comprovada, resposta do parser limitada por `Content-Length` e
      stream, SHA-256 incremental no cliente, política de demo curta
      (`DEMO_INSUFFICIENT_SAMPLE`), deadline absoluto do job
      (`JOB_DEADLINE_EXCEEDED`) e single writer preservado. 515/515 testes.
- [x] **FASE 2.7.1 — attach de demo corrigido (rodada 3)**: migration aplicada —
      `canonical_attach_source()` aceita `external_match_id` **ou** `fingerprint`
      (os dois ausentes continuam inválidos), reserva com chave determinística e
      advisory lock, nunca reaponta uma observação já anexada, e
      `persist_canonical_observation_attached()` mantém attach + persistência na
      mesma transação. FACEIT inalterado. Provado contra o banco real em transação
      abortada: fingerprint attach, idempotência, `CANONICAL_ATTACH_CONFLICT`,
      `CANONICAL_ATTACH_INVALID` e caminho FACEIT.
- [x] **Isolamento da projeção**: campos player-scoped só são escritos quando a
      projeção não tem dono ou pertence ao mesmo jogador (`projectionUpdate()`).
- [x] **Utility zero corrigido**: disponibilidade vem da classe de evidência
      (`availability.utilityEvents`), não dos contadores do jogador — zero
      observado é `0`, ausência de evidência é `null`.
- [x] Testes: `hardening271.test.ts` (A–O, assertions concretas) + H8/H9
      reforçados. 539/539 testes, typecheck (tsgo), lint e build OK.
- [ ] **NOT PROVEN**: atomicidade attach+persistência verificada estruturalmente,
      não provada em runtime; concorrência real de attach não provada neste
      ambiente.
- [x] Documento da fase: `docs/PHASE-2.7-REAL-DEMO-INGESTION-AND-CANONICAL-ANALYTICS.md`.

**FASE 2.7 — IN PROGRESS / HARDENING CORRECTIONS COMPLETED.** Não fechada: nenhum
`.dem` real ingerido, FASE 2.8 não iniciada. Próximo passo: E2E real do worker.

- [x] **FASE 2.7.1 — métricas quality-aware (rodada 4)**: classe de evidência
      definida uma única vez em `src/lib/pipeline/evidence.ts` (normalizer e
      `metricsAvailability()` compartilham a mesma lista, agora com `smoke` e
      `incendiary`); todos os sinais derivados em `extractFeatures()` passam por
      gate de disponibilidade — ausência de evidência é `NULL`, zero observado é
      `0`, denominador ausente é `NULL`; `sample_rounds` e `early_window_seconds`
      permanecem fatos sem gate.
- [x] **Identidade do parser configurável**: `expectedParserIdentity()` lê
      `DEMO_PARSER_EXPECTED_NAME` / `_VERSION` / `_REVISION` dentro da função, com
      fallback para `src/config/pipeline.ts`; revisão esperada, quando definida, é
      exigida. Compatibilidade major/minor não prova compatibilidade com build do
      CS2 (matriz fica para a 2.7.2).
- [x] Testes: `quality271.test.ts` (28 testes) — matriz NULL vs ZERO, coerência
      `missing_utility` ↔ `availability.utilityEvents`, matemática de tickrate,
      clutch por participação e contrato do parser. 567/567 testes, typecheck
      (tsgo), lint e build OK.
- [ ] **FASE 2.7.2 (pré-requisitos)**: worker HTTPS de parser
      (`DEMO_PARSER_URL`/`DEMO_PARSER_TOKEN`), identidade/revisão esperada
      configuradas, matriz de compatibilidade por build do CS2 e prova E2E com
      `.dem` real.

## FASE 2.7.1C

- [x] Rating (source/CT/T) exige kill + damage + cobertura completa; fórmula inalterada
- [x] KAST exige cobertura completa
- [x] Abertura só sobre rounds determináveis; instante desconhecido ≠ instante tardio; amostra NULL quando indeterminável
- [x] `completeCoverage` na matriz de disponibilidade (parse parcial nunca é cobertura completa)
- [x] Projeção do demo em UMA transação (`persist_demo_projection`, service_role only) — rollback real NÃO provado em runtime (nenhuma partida canônica no banco)
- [x] Deadline global desde a entrada do job, checado antes de storage, hash, signed URL, parser, persistência e projeção
- [ ] Parser real `.dem` (worker configurado; E2E ainda NOT PROVEN)
- [ ] FASE 2.8 não iniciada

## FASE 2.7.1D

- [x] `survival_rate` exige round-end evidence em TODOS os rounds do denominador (`metrics.survivalRounds`); cobertura incompleta = NULL, nunca parcial nem 0
- [x] `roundHasEndEvidence()` como definição única, reutilizada por `playerSurvivedRound()`
- [x] Parse parcial: taxas com denominador de rounds ficam NULL; contadores observados e razões sobre contagens observadas permanecem
- [x] Registro histórico: a versão era placeholder nessa rodada; o Gate 1D depois confirmou `0.42.0`. Contrato inalterado.
- [x] `quality271d.test.ts` (fixtures sintéticas). 587/587 testes, tsgo e lint OK

## FASE 2.7.1E

- [x] `src/lib/pipeline/roundEvidence.ts`: a ÚNICA definição de round-end evidence
      (`winnerSide` | `winnerTeam` | `endTick` | `durationSeconds`, presença por `!= null`).
- [x] Normalizer (`roundsValid`), metrics availability, `playerSurvivedRound()` e denominador
      passam a usar o mesmo helper; `roundHasEndEvidence()` virou re-export delegante.
- [x] `survivalRounds` conta apenas rounds participados com sobrevivência DETERMINÁVEL;
      indeterminável é excluído e nunca vira sobrevivência — denominador `NULL`, nunca `0`.
- [x] `features.catalog.ts` sincronizado: `denominator` + `roundDenominated` por feature,
      `survival_rate` documentada contra `survivalRounds`.
- [x] `quality271e.test.ts` (21 testes sintéticos). Rodada: 608/608 testes, tsgo e lint OK.
- [ ] FASE 2.7 permanece IN PROGRESS — parser real `.dem` e E2E real NÃO provados
- [ ] FASE 2.7.2 (próxima): matriz de compatibilidade CS2 e E2E real
- [ ] FASE 2.8 não iniciada

### FASE 2.7.1F — FINAL SEMANTIC CONTRACT CLEANUP — CLOSED

- `survivalRounds` documentado como denominador de determinabilidade (não `roundsPlayed`).
- `roundDenominated` = denominador derivado do conjunto de rounds (inclui `survivalRounds`).
- Fórmulas do catálogo sincronizadas com `features.ts`, com o clamp `[0,1]` explícito.
- Identidade do parser separada: nome / versão / revisão / versão de contrato (a versão foi confirmada no Gate 1D posterior).
- 23 novos testes numéricos de contrato (`quality271f.test.ts`).
- Verificação: 631/631 testes, `tsgo` OK, lint 0 erros (8 warnings preexistentes), build OK.
- FASE 2.7.1: **CLOSED**. FASE 2.7: **IN PROGRESS** (parser real e E2E `.dem` NOT PROVEN).
- FASE 2.7.2: próxima. FASE 2.8: não iniciada.

### FASE 2.7.2 — GATE 0 PASS / PARSER REAL BLOQUEADO

- [x] GATE 0 (auditoria de fechamento da 2.7.1F): 8 commits no escopo, sem regressão;
      round evidence PASS, survival PASS, NULL≠ZERO PASS, partial parse PASS,
      parser identity PASS; catálogo PASS nas features com prova numérica e
      NOT PROVEN nas demais (dívida de cobertura, sem divergência de comportamento).
- [x] Rodada de verificação: 631/631 testes.
- [ ] GATES posteriores (revision pinada, matriz CS2, E2E `.dem`, idempotência):
      **NOT PROVEN** — o worker foi configurado no Gate 1D, sem executar demo real.
- [ ] FASE 2.7 permanece IN PROGRESS. FASE 2.8 não iniciada.

### FASE 2.7.2 — GATE 1D

- [x] Upload grande migrado do envio padrão para TUS retomável, em chunks de 6 MiB,
      direto do browser ao bucket privado `demos`, preservando o path
      `{user_id}/{upload_id}.dem`, sessão do usuário, RLS e SHA-256 antes/depois.
- [x] Job continua sendo enfileirado somente após a conclusão inequívoca do TUS;
      falha ou cancelamento não enfileiram processamento; duplicata processada não
      reenvia o arquivo.
- [x] Parser esperado atualizado para `demoparser2 0.42.0`, contrato 1; revision
      permanece configurável e não foi inventada.
- [x] URL/identidade e `DEMO_PARSER_TOKEN` configurados server-only; revision real
      continua **CONFIGURATION REQUIRED**. O domínio informado respondeu 404 na
      verificação pública, portanto conectividade do worker está **NOT PROVEN**.
- [ ] E2E real e parse de `.dem` real: **NOT PROVEN**, reservados ao próximo Gate.
- **Estado do Gate 1D: BLOCKED** para fechamento total: implementação e testes
  locais passaram, mas revision e conectividade efetiva do domínio não foram
  comprovadas; nenhuma demo real foi processada por determinação deste Gate.

### FASE 2.7.2 — GATE 1E — CONTRATO APP ↔ WORKER

- [x] `src/lib/pipeline/parser/parserEndpoint.ts` como fonte única: `DEMO_PARSER_URL`
      exige HTTPS e o caminho completo `/v1/parse`, sem concatenação; `/health` e
      `/version` derivados da mesma origem apenas para diagnóstico.
- [x] Requisição alinhada ao worker: `contract_version`, `upload_id`, `demo_url`,
      `demo_sha256`, `file_size`; token só no header `Authorization`, nunca em URL,
      corpo ou log.
- [x] Envelope FastAPI `detail.error_code` lido corretamente, com compatibilidade
      para o formato plano.
- [x] Matriz única de classificação (HTTP + `error_code`), com códigos novos
      `PARSER_CONFIG_ERROR`, `PARSER_UNAUTHORIZED`, `PARSER_FORBIDDEN`,
      `PARSER_CONTRACT_MISMATCH`, `PARSER_INVALID_RESPONSE`, `PARSER_DOWNLOAD_ERROR`,
      `PARSER_HASH_MISMATCH`, `PARSER_FILE_SIZE_MISMATCH`; `mapParserErrorCode()`
      delega à mesma matriz. Falha de transporte nunca vira demo inválida.
- [x] Diagnóstico master-only `getAdminParserWorkerStatus` (`/health` + `/version`),
      fora do caminho de parsing, sem expor token nem URL assinada.
- [x] Mensagens dos novos códigos traduzidas em pt-BR, pt-PT, en, es, fr.
- [x] 42 testes em `src/lib/pipeline/__tests__/gate1e.test.ts`; suíte total 681/681,
      typecheck limpo, lint sem erros (8 warnings preexistentes).
- [ ] Verificação externa do worker: **BLOCKED**. `/health` e `/version` em
      `https://cs2-demo-parser-production.up.railway.app` respondem
      `HTTP 404 {"status":"error","code":404,"message":"Application not found"}`.
      Revision do deployment e E2E real com `.dem`: **NOT PROVEN**.
- **Estado do Gate 1E: BLOCKED** — lado app completo e provado; lado worker
  inacessível. FASE 2.8 não iniciada.

## FASE 2.7.2 — GATE 1E.1 — WORKER CONTRACT SYNC + REVISION LOCK — BLOCKED

- [x] `WORKER_ERROR_CODES` declara o protocolo oficial do worker num único lugar
- [x] `classifyWorkerFailure()` cobre todos os códigos oficiais (matriz única)
- [x] `mapParserErrorCode()` continua delegando (nenhum segundo switch)
- [x] `PARSER_IDENTITY_MISMATCH` (permanente) para name/version/revision divergentes
- [x] `assertParserIdentity()` usado por `/v1/parse` e pelo probe `/version`
- [x] revision lock fail-closed; obrigatório em produção (`DEMO_PARSER_REVISION_REQUIRED`)
- [x] revision vazia tratada como ausente, nunca inventada
- [x] integridade (hash/size) e transporte nunca viram "demo inválida"
- [x] testes: `gate1e1.test.ts` + suíte existente preservada
- [x] `PAYLOAD_TOO_LARGE` do worker → `PARSER_PAYLOAD_TOO_LARGE` (regra específica do app)
- [x] worker `services/cs2-demo-parser` no repositório: FastAPI, envelope único,
      taxonomia alinhada, download seguro, `/health`, `/version`
- [x] worker: fallback `pypi-0.42.0` removido; produção exige `PARSER_REVISION`
      imutável e falha closed; fora de produção usa `dev:unpinned` explícito
- [x] worker: suíte pytest (auth, contract, hash, size, download, parser error,
      timeout, health, version, revision, no-leak)
- [ ] deployment Railway alinhado, `/health` e `/version` 200, revision real pinada
      (BLOCKED: serviço responde HTTP 404 `Application not found`;
      `DEMO_PARSER_EXPECTED_REVISION` ainda não configurável)

## FASE 2.7.2 — GATE 02 — PRIMEIRO E2E `.dem` REAL — BLOCKED

- [x] Preflight real: endpoint HTTPS completo `/v1/parse`; `/health` 200;
      `/version` 200 com `demoparser2 0.42.0`, contrato 1 e revision
      `git:c1a87f68ccf84e99b3a8ae07133b4a686669d814`.
- [x] APP pinado à mesma revision imutável; token permanece server-side e não foi
      exibido. `DEMO_PARSER_EXPECTED_REVISION` está ausente no ambiente, portanto
      o fallback imutável do código continua sendo a expectativa efetiva.
- [x] Job agora reutiliza o probe oficial antes de criar a signed URL e antes do
      POST `/v1/parse`; falha de saúde/identidade/contrato bloqueia o parse.
- [x] Bucket `demos` confirmado privado; policy `demos_update_own` adicionada para
      permitir continuação TUS apenas na pasta autenticada e somente em `.dem`.
- [ ] Demo `.dem` real: **BLOCKED — nenhum artefato real foi fornecido nos uploads**.
- [ ] TUS, Storage, job, Worker POST, RawParserOutput, validação semântica,
      CanonicalMatch, persistência, projeção e idempotência reais: **NOT EXECUTED**.
- **Estado do Gate 02: BLOCKED**, não PASS. Retomar exclusivamente quando uma demo
  real completa (mínimo 8 rounds e contendo o Steam ID vinculado do usuário de
  real completa (mínimo 8 rounds e contendo o Steam ID vinculado do usuário de
  teste) for fornecida ao upload oficial em `/upload`.

## FASE 2.7.2 — WORKER ADAPTER → RawParserOutput — DONE (Gate 02 segue BLOCKED)

- [x] `services/cs2-demo-parser/adapter.py`: camada única de tradução
      demoparser2 → contrato do APP (`normalize_header/players/rounds/events`,
      `resolve_event_round`, posições).
- [x] Eventos finais planos (`{type, round, ...}`); o aninhamento `{type, data}`
      foi eliminado. `steamid` → `steam_id`, com validação de Steam ID.
- [x] Rounds derivados de ticks reais de `round_start`/`round_end`, `number`
      inteiro positivo, `duration_seconds` apenas com tickrate real.
- [x] Round de cada evento resolvido por janela de ticks determinística; eventos
      sem round são omitidos e contabilizados em warning (`round = 0` nunca).
- [x] NULL ≠ FALSE preservado: stream ilegível fica ausente, stream lido sem
      ocorrência vira `false`; economia ausente é omitida com warning.
- [x] `player_hurt` e `bomb_exploded` incluídos (damage e bomba) sem inventar
      dados; `players_flashed` documentado como indisponível.
- [x] Container non-root (`parser`, UID 10001, `TMPDIR=/tmp/parser`).
- [x] `__pycache__`/`*.pyc` removidos do versionamento e bloqueados no
      `.gitignore`; fixtures `.dem` ignoradas.
- [x] Testes: adapter (players/header/rounds/eventos/round resolution/posições/
      NULL semantics/determinismo) + contrato completo do `RawParserOutput`.
      Worker 78 passed / 3 skipped; APP 716 passed; tipos, lint e build OK.
- [ ] `tests/test_real_demo.py` pronto porém **SKIPPED**: nenhuma demo `.dem`
      real disponível. **Gate 02 permanece BLOCKED.**

## FASE 2.7.2 — UX de demos incompletas / corrompidas

- [x] `CORRUPTED_DEMO` continua **permanente**: o job falha, sem retry
      automático e sem `CanonicalMatch`, projeção, métricas ou features
      (o erro é lançado antes de qualquer persistência canônica).
- [x] Retry server-side (`retryMyDemoJob`) recusa re-enfileirar qualquer job cuja
      falha seja permanente (`JOB_NOT_RETRYABLE`).
- [x] UI: estado dedicado de FALHA com título "Não conseguimos analisar esta
      demo", orientação para reenviar a demo original/completa e CTA
      "Enviar outra demo" que devolve o usuário ao fluxo de upload.
- [x] Botão "Tentar novamente" oculto para falhas permanentes; aviso de extração
      parcial nunca aparece em job falhado (PROCESSANDO → FALHOU).
- [x] Nenhum detalhe técnico exposto (código, parser, hash, Storage, stack).
- [x] Matriz de erros preservada por categoria (formato, corrompida, não
      suportada, timeout, indisponível, interno, integridade).
- [x] Testes: `src/lib/pipeline/__tests__/corrupted272.test.ts`; APP 723 passed,
      tipos, lint e build OK.

## FASE 2.7.2 — GATE 02-A — HARDENING COMPORTAMENTAL (DONE; GATE 02 REAL E2E segue BLOCKED)

- Novo teste runtime `src/lib/pipeline/__tests__/corrupted272.runtime.test.ts`: executa o
  `processJob()` REAL com apenas banco, storage e parser mockados. Prova por execução que
  `CORRUPTED_DEMO` (HTTP 422 do worker) aborta antes de normalização, métricas, features,
  bundle/resolver canônico, `persistCanonicalObservation()` e `persistDemoProjection()`.
- Prova de estado: job `status=failed`, `stage=failed`, `error_code=CORRUPTED_DEMO`, sem requeue
  automático mesmo com retries disponíveis; upload `failed` e nunca `processed`.
- Prova de ausência de parcial: nenhum update carrega `partial_parse`, `match_id`, `quality_flags`
  ou valor `partial`.
- Idempotência: job já `failed` com `CORRUPTED_DEMO` não inicia novo parse; `PARSER_TIMEOUT`
  (transitório) continua sendo reenfileirado — taxonomy preservada.
- `corrupted272.test.ts` (classificação 422 → permanente) mantido intacto.
- Auditoria SCHEMA_VERSION: mantido `1`. É a versão da camada de ingestão de demo
  (`demo_jobs.schema_version`/`uploads.schema_version`), eixo distinto de
  `CANONICAL_SCHEMA_VERSION = 2` (`canonical_schema_version`, DEFAULT 2 nas migrations).
  Nenhuma migration alterou a forma dessas linhas de ingestão. Documentado em `src/config/pipeline.ts`.
- Worker (`services/cs2-demo-parser/`) e contratos não foram alterados.
- Bloqueio remanescente para GATE 02 REAL E2E: execução com as demos reais (Mirage truncada,
  Cache, Dust2) contra o worker Railway.

## FASE 2.7.2 — GATE 02-B — Runner E2E de demo real (protegido)

- `src/lib/pipeline/e2e.ts` — regras puras de veredito: `BLOCKED` quando o preflight
  do worker falha ou o job não é terminal; cenário negativo exige falha PERMANENTE
  e zero escrita canônica/projeção; cenário positivo exige exatamente 1 match
  canônico + participantes + rounds + eventos + 1 métrica + 1 features + revisão do
  parser registrada; idempotência compara a evidência antes/depois.
- `src/lib/pipeline-e2e.functions.ts` — server functions master-only
  (`getDemoE2EPreflight`, `runDemoE2E`, `getDemoE2EEvidence`). `runDemoE2E` chama o
  `processJob()` REAL (mesmo caminho do cron, mesmo worker Railway), lê a evidência
  direto do banco antes/depois via `match_sources` (fingerprint/upload) e grava
  auditoria `DEMO_E2E_RUN`. Rerun de job terminal exige `rerun: true` explícito.
- `src/routes/_authenticated/admin/demo-e2e.tsx` — console interno: preflight
  (Gate 1E.1), upload da demo real, run 1, reprocessamento para idempotência e
  evidência bruta. Nenhum dado sintético.
- `src/lib/pipeline/__tests__/e2e.verdict.test.ts` — 13 testes das regras do gate.
- Status: infraestrutura do Gate 02-B PRONTA. O E2E positivo/negativo real
  permanece **BLOCKED** até que arquivos `.dem` reais (Mirage inválida, Cache/Dust2
  válida) sejam fornecidos — nenhum `.dem` existe no projeto.

## FASE 2.7.2A — INGESTÃO CANÔNICA + IDENTIFICAÇÃO FLEXÍVEL DO JOGADOR — DONE

Causa do FAIL do Run 1 (`PLAYER_IDENTITY_UNRESOLVED / no steam id on profile`)
removida: o vínculo do jogador deixou de ser pré-condição do parse.

- `processJob()` agora canonicaliza e persiste a observação ANTES de qualquer
  exigência de Steam ID; `ownerPlayerId` continua sendo o dono do upload.
- `resolveOwnParticipant()` retorna estado + motivo real
  (`no_player_profile` | `no_steam_id_on_profile` | `steam_id_not_in_demo`)
  em vez de lançar. `resolveOwnSteamId()` permanece para quem exige jogador.
- Métricas, features e projeção só rodam com Steam ID PROVADO na demo.
- `demo_jobs` ganhou `attachment_state`, `attachment_method`,
  `attachment_confidence`, `attachment_reason` (com constraints de coerência).
- Gate 02-B passou a medir duas dimensões: CANONICAL (obrigatório) e
  PLAYER PROJECTION (condicional) → `PASS (canonical) / NOT_ATTACHED`.
- Resolver intocado (só EXACT auto-anexa; CONFLICT ainda falha o job).
- UI do jogador e console admin mostram o estado/motivo; i18n nos 5 locales.

Estado: 761/761 testes, typecheck, lint e build OK. O E2E real da demo depende
apenas de uma nova execução do Run 1 pelo usuário.

### Identificação explícita do jogador (fechamento)

- `src/lib/pipeline/attachment.ts`: domínio puro separando MATCH IDENTITY,
  PLAYER IDENTITY, USER ATTACHMENT e IDENTITY METHOD. Estados `attached` /
  `unattached` / `conflict`; métodos `steam_id_confirmed`,
  `self_declared_player`, `self_declared_nickname`; origem `system`/`user`;
  confiança `high` / `user_confirmed` / `low` / `unresolved`.
- Nickname: normalização conservadora (NFKC, espaços, case). Sem fuzzy, sem
  inferir Steam ID a partir de nickname. Nickname duplicado → `ambiguous`.
- Steam ID confirmado tem precedência; declaração divergente → `conflict`,
  nunca sobrescrita silenciosa.
- `demo_jobs` ganhou `attachment_source`, `attachment_confidence_label`,
  `attachment_participant_key`, `declared_participant_key`,
  `declared_nickname`, `observed_nickname`, `attachment_declared_at`,
  `attachment_declared_by` + constraints de forma da declaração.
- `src/lib/pipeline-identity.functions.ts`: `getDemoIdentity()` lista os
  jogadores detectados sob RLS do dono; `declareDemoPlayer()` valida posse,
  resolve pelo domínio, grava auditoria e reprocessa o MESMO CanonicalMatch
  (idempotente) apenas quando a declaração resolve um jogador.
- `DemoPlayerIdentity.tsx`: "Quem é você nesta demo?" com seleção de jogador,
  nickname, desambiguação e opção de deixar para depois; i18n nos 5 locales.
- Testes: `attachment.identity.test.ts` (13 casos) cobrindo perfil ausente,
  Steam ausente/não encontrado, seleção explícita, nickname único/ambíguo/
  inexistente, precedência e conflito. 776/776 testes, typecheck, lint, build OK.
- E2E real da demo NÃO reexecutado nesta fase (fora do escopo); FASE 2.8 não
  iniciada.

## FASE 2.7.2B — RAW DEMO EVIDENCE & FULL COVERAGE — IMPLEMENTADA / E2E REAL BLOCKED

- Evidência parser-native separada do APP Raw Contract e do Canonical Engine.
- Inventário dinâmico via `list_game_events()`, com distinção explícita entre stream indisponível, vazio e falho.
- Eventos brutos preservam `raw_fields`; propriedades desconhecidas são catalogadas como `UNMAPPED_BUT_AVAILABLE`.
- Capacidades `parse_ticks()` e `parse_grenades()` são testadas e amostradas separadamente do canônico.
- Evidência de player, round, economia, posições, movimento, armas, granadas e campos ausentes usa `NULL/UNKNOWN`, sem coerção para zero/false/string vazia.
- `raw_demo_evidence_reports` recebe upsert idempotente antes da normalização e é consultável somente pelo owner/staff; escrita permanece `service_role`.
- `round_players` só pode surgir de sides/economia observados em snapshots reais nos ticks de início/fim; nenhum registro artificial foi criado.
- Console `/admin/demo-e2e` mostra manifest, event/player/tick/grenade coverage, matriz RAW→CONTRACT→CANONICAL e gates.
- Gates `RAW-EVIDENCE-01`, `EVENT-COVERAGE`, `PLAYER-COVERAGE`, `ROUND-COVERAGE`, `ECONOMY-COVERAGE`, `TICK-COVERAGE`, `GRENADE-COVERAGE` e `RAW→CANONICAL` são calculados sem relaxar o Gate 02-B.
- Testes determinísticos cobrem inventário, vazio versus falha, campos nativos, NULL semantics, digest, mapeamento e projeção por evidência.
- O E2E real de `furia-vs-gamerlegion-m1-cache.dem` não foi executado nesta rodada porque o artefato privado não está disponível no ambiente. Portanto os gates baseados na demo real permanecem **BLOCKED**, e a FASE 2.8 não foi iniciada.

## FASE 2.7.2C — Demo Pipeline Recovery — EM ANDAMENTO

- [ ] Lifecycle persistente com `cancel_requested` e `cancelled`.
- [ ] Requeue pós-attachment com timestamps antigos limpos e `match_id` preservado.
- [ ] Cancelamento real, idempotente, protegido por ownership e checkpoints seguros.
- [ ] Claim/recovery/retry sem ressuscitar cancelamentos.
- [ ] Progresso e polling derivados do estado persistido.
- [ ] Scheduler real comprovado ou bloqueio de plataforma documentado.
- [ ] Testes de lifecycle, cancelamento, concorrência, attachment e RAW Evidence.
- [ ] E2E real e validação final do banco; manter NOT CLOSED se algum elo não for comprovado.

### Scheduler — bloqueio externo confirmado

O repositório expõe somente `POST /api/public/pipeline-cron`, protegido por
`Authorization: Bearer <LOVABLE_CRON_SECRET>`. Não existe scheduler no Railway,
no banco ou no repositório, e o agente não possui acesso ao Cloud Jobs. A fase
permanece **IMPLEMENTED / NOT CLOSED** até a plataforma configurar e comprovar
uma chamada por minuto, sem criar um segundo consumidor concorrente.

## FASE 2.7.2D — Scheduler + Cancellation Concurrency + Real E2E — IMPLEMENTADA / NOT CLOSED

- [x] Finalização do job e projeção do jogador protegidas pelo mesmo lock/transação;
      cancelamento concorrente vence antes do commit ou é recusado depois do commit.
- [x] Falha concorrente não sobrescreve `cancel_requested`/`cancelled`; requeue pós-attachment
      não ressuscita job cancelado.
- [x] Loading inicial reutilizado no boundary raiz, sem atraso ou consulta artificial.
- [x] Cards de entrada permanecem lado a lado no mobile; "Tenho uma demo" leva e foca a
      área real de upload, respeitando `prefers-reduced-motion`.
- [ ] BLOCKER externo: criar/ativar exatamente um Cloud Job a cada minuto para
      `POST /api/public/pipeline-cron`, autenticado por `LOVABLE_CRON_SECRET`.
- [ ] BLOCKER: nenhuma chamada real do scheduler foi observada nos logs consultáveis.
- [ ] BLOCKER: artefato `.dem` real indisponível no ambiente; E2E e segunda execução
      idempotente não foram executados.

**Veredito:** FASE 2.7.2D e FASE 2.7.2 permanecem **NOT CLOSED**; FASE 2.8 não iniciada.

### FASE 2.7.2D.1 — Diagnóstico APP → parser — EM ANDAMENTO

- [x] Diagnóstico de transporte sanitizado e limitado, preservando `PARSER_UNAVAILABLE`.
- [x] Probes independentes de `/health` e `/version` nos domínios customizado e Railway.
- [x] Resultado exposto somente na resposta autenticada do scheduler existente.
- [x] Gate fail-closed preservado; diagnóstico não reivindica nem processa demos.
- [x] Publicação e execução real do scheduler observada às 07:26 UTC.
- [x] Causa exata registrada: o runtime rejeita `redirect: "error"` antes de enviar os quatro fetches; aceita somente `follow` ou `manual`. FASE 2.7.2D permanece **NOT CLOSED**.

### FASE 2.7.2D.1.1 — Correção do transporte APP → parser — VALIDADA / EVIDÊNCIA EXTERNA PARCIAL

- [x] Transporte do parser alterado de `redirect: "error"` para `redirect: "manual"` no POST real, preflight e probes diagnósticos.
- [x] Redirects não são seguidos automaticamente e respostas 3xx continuam não-OK; gate fail-closed preservado.
- [x] Regressão coberta para POST, preflight e quatro probes, sem autenticação ou dados de demo nos probes.
- [x] Publicação em produção e execução real do scheduler observada às 07:35 UTC: preflight saudável, identidade exata reconhecida e `parserGate = PASS`.
- [x] Quatro probes responderam HTTP 200 sem diagnóstico: `/health` e `/version` nos domínios customizado e Railway.
- [x] Nenhum job foi reivindicado (`jobId = null`, `processed = null`); portanto nenhum POST `/v1/parse` ocorreu nesta execução.
- [ ] Logs internos do Railway não acessíveis neste ambiente; os HTTP 200 do domínio Railway provam alcance real, mas não substituem a evidência pedida nos logs do serviço.
- [ ] FASE 2.7.2D permanece **NOT CLOSED**; 2.8 não iniciada.

### FASE 2.7.2D.2 — Async demo dispatch — BLOQUEADA POR RUNTIME

- [x] Causa-raiz confirmada: o scheduler aguarda `processJob()` e o cliente `pg_net`
      encerra a requisição em 60 segundos, abandonando o job durante o parse remoto.
- [x] O runtime publicado foi identificado como Worker HTTP. O mecanismo nativo
      `waitUntil()` mantém trabalho por no máximo 30 segundos depois da resposta;
      portanto não garante o parse de vários minutos e não será usado como fire-and-forget.
- [x] O worker de aplicação mantém limite de 128 MB e não oferece, na configuração
      publicada deste projeto, binding de Queue, Workflow ou Durable Object para um
      consumidor durável separado.
- [x] O job Cache foi consultado sem mutação às 08:24 UTC: continuava
      `processing/parsing`, `retry_count = 1/2`, com heartbeat em 08:16 UTC. Ele não foi
      recuperado nem duplicado porque ainda não havia ultrapassado a janela stale de 30 minutos.
- [ ] Implementação bloqueada: é necessário provisionar uma execução durável fora do
      request HTTP — preferencialmente tornar o serviço Railway assíncrono, com dispatch
      idempotente por `jobId`, processamento persistente e callback autenticado (ou polling)
      para conclusão. Isso exige alteração coordenada do serviço/contrato e configuração
      de infraestrutura, fora do transporte atual do APP.
- [ ] Nenhum timeout foi aumentado; nenhum segundo scheduler, fila paralela, migration,
      reprocessamento, recuperação manual ou alteração de dados foi criado.
- [ ] A validação E2E real permanece pendente. A FASE 2.7.2D.2 está **BLOCKED / NOT CLOSED**;
      a FASE 2.7.2D continua **NOT CLOSED** e a FASE 2.8 continua bloqueada.

### Correção pós-auditoria — lifecycle/idempotência

- [x] Reserva de upload serializada por usuário + SHA-256; upload cancelado gera novo
      `upload_id` e caminho, preservando o histórico terminal.
- [x] Duplicatas ativas/processadas não sobrescrevem o arquivo; falhas permanecem no
      fluxo explícito de Retry.
- [x] Enqueue transacional sem upsert destrutivo e sem ressurreição de estados terminais.
- [x] Dois artefatos de teste identificados restaurados aos estados terminais coerentes.
- [ ] Scheduler e E2E real permanecem bloqueados; FASE 2.7.2D continua **NOT CLOSED** e
      FASE 2.8 não iniciada.

### FASE 2.7.2D.3-H — Durable worker hardening + RAW forensic admission gate — IMPLEMENTED / SUPERSEDED BY 2.7.2D.3-I

- [x] Preservar RAW desconhecido e produzir inventário forense campo a campo.
- [x] Bloquear Canonical sem auditoria e aprovação explícitas, com defesa em profundidade na persistência.
- [x] Endurecer lease, heartbeat, stale completion, cancelamento, retry e finalização idempotente.
- [x] Cobrir os 20 cenários obrigatórios por testes de comportamento e contrato, sem processar demo real nem alterar Railway.
- [x] Documentar que RAW é evidência imutável, Canonical é derivado e exige aprovação RAW explícita.
- [ ] E2E forense com novo `.dem`, Canonical real e deployment Railway permanecem **NOT PROVEN / PENDING**; 2.7.2D.3 continua **NOT CLOSED**.
- [ ] Métricas, features, DNA, diagnóstico e AI Coach permanecem **BLOCKED** até essa prova real.

### FASE 2.7.2D.3-I — RAW forensic exhaustiveness + independent auditor hardening — IMPLEMENTED / NOT CLOSED UNTIL REVIEW

- [x] Preservar todos os eventos e campos efetivamente retornados, separando capability, seleção, retorno e mapping.
- [x] Tornar a auditoria independente e fail-closed para audit/manifest/inventory vazios ou incompletos.
- [x] Versionar RAW por tentativa sem overwrite silencioso e exigir `APPROVED` nas duas defesas Canonical.
- [x] Cobrir cenários RAW/Canonical/worker focados e fluxos sintéticos, sem processar demo real.
- [ ] Revisão técnica final pendente; E2E real e Railway permanecem fora desta fase.

### FASE 2.7.2D.3-I.1 — Final forensic integrity hardening — IMPLEMENTED / NOT CLOSED UNTIL FINAL REVIEW

- [x] Recomputar o digest RAW independentemente no APP e na defesa Canonical, com representação canônica equivalente em Python e TypeScript.
- [x] Vincular aprovação ao digest auditado e tornar evidência, decisão e inventários imutáveis e não excluíveis no banco.
- [x] Separar campos de evento retornados, não nulos, somente nulos e preservados; separar capability, requested, returned, preserved e observed do game state.
- [x] Cobrir adulteração, ordem de chaves, invariantes do banco e defesa Canonical com testes sintéticos.
- [ ] Revisão técnica final pendente; nenhum demo real, job histórico ou deployment Railway foi alterado.

### FASE 2.7.2D.3 — Durable dispatch APP → Queue → Railway Worker — IMPLEMENTATION COMPLETE / REAL E2E NOT YET PROVEN

- [x] Habilitar `pgmq` e criar `demo_parse` de forma idempotente, sem tabela de fila paralela.
- [x] Manter `demo_jobs` como fonte de verdade e garantir enqueue/claim/lease/ACK por `job_id + attempt`.
- [x] Remover o parse longo da requisição do scheduler sem criar segundo cron ou usar `waitUntil()`.
- [x] Adicionar consumer persistente no Railway, preservando `/health`, `/version` e `/v1/parse`.
- [x] Reutilizar a persistência APP existente, sem duplicar ou avançar o Canonical.
- [x] Cobrir contratos, heartbeat, stale claims, retry/cancelamento e ausência de segredo/URL na mensagem.
- [x] Manter o job Cache fora da ativação automática; nenhum job existente foi backfilled.
- [x] Documentar arquitetura e implantação.
- [ ] Configurar o segredo compartilhado no APP e no Railway e publicar ambos os lados.
- [ ] Executar E2E somente com um novo `.dem` autorizado; fase permanece **NOT CLOSED** até essa prova.

### FASE 2.7.2D.3-J — Stale recovery + demo replacement + attempt-aware UX — IMPLEMENTED / HARDENED IN CODE / REAL E2E NOT PROVEN

- [x] Separar SHA-256 dos bytes, tentativa visível e retry interno do worker.
- [x] Preservar tentativas processadas e ativas saudáveis sem overwrite ou requeue.
- [x] Detectar stale somente por lease expirada mais heartbeat/start antigo e arquivar a mensagem antiga.
- [x] Criar upload, storage path e job distintos para replacement stale/failed/cancelled, com relação bidirecional.
- [x] Serializar reserva por usuário + SHA e limitar cada tentativa antiga a um único replacement.
- [x] Retornar o novo `jobId`, mover o polling para ele e mostrar tentativas/relações no histórico em cinco idiomas.
- [x] Preservar retries internos, RAW imutável, auditoria independente e gate Canonical sem alteração.
- [x] Validar contratos focados, tipos e integridade do diff; schema e RPCs aplicados no banco.
- [x] Corrigir a UI do histórico: estado vazio sem CTA, falhas de consulta explícitas e `legacy_unvalidated` preservado no client.
- [ ] Nenhuma demo real foi enviada e nenhum job histórico foi alterado; E2E real e publicação permanecem pendentes.

## FASE 2.7.2D.4-C — Final APP hardening + RAW recovery + release gate

- [x] C.1 Separar revisão semântica do parser e identidade exata do build, sem quebrar o lock atual.
- [x] C.2 Tornar artifacts FAILED recuperáveis idempotentemente para a mesma tentativa lógica.
- [x] C.3 Endurecer auditoria RAW, manifest, chain e root com decisão final do APP.
- [x] C.4 Congelar e validar a matriz HOT sem truncamento silencioso.
- [x] C.5 Congelar /complete em HOT + referência RAW, máximo 8 MiB.
- [x] C.6 Congelar matriz de chunks e integridade determinística.
- [x] C.7 Ampliar testes de contrato, identidade, lifecycle, auditoria e segurança.
- [x] C.8 Garantir observabilidade bounded e sanitizada.
- [x] C.9 Documentar os 16 gates de promoção sem autorizar E2E real.
- [x] Validar parser, testes focados, tipos e diff: TS 861/861; Python 138/138; release segue BLOCKED no gate 16.

## FASE 2.7.2D.5 — Durable claim + primeiro E2E real Cache — EM EXECUÇÃO

- [x] Confirmar no banco real que `user_id` e `attempt_number` pertencem ao `demo_jobs` reclamado e são distintos do dispatch attempt.
- [x] Aplicar migration incremental do RPC e adicionar validação fail-closed no APP, sem fallback ou valores inventados.
- [ ] Validar imagem Railway (Docker indisponível neste ambiente).
- [x] Validar testes TypeScript/Python e compileall: APP completo aprovado; parser 146 passed/3 skipped; imagem depende de Docker disponível.
- [x] Publicar APP e comprovar o contrato `/claim` atualizado.
- [x] Retomar somente o job Cache pelo claim oficial, preservando mensagem 14, logical attempt 7 e dispatch attempt 0.
- [ ] Acompanhar os gates até estado terminal real; bloqueado até a imagem Railway receber a normalização JSON estrita.

## FASE 2.7.2D.5-A — Strict JSON numeric sanitization + E2E Cache — EM EXECUÇÃO

- [x] Confirmar que o contrato live de claim já entrega `user_id`, `attempt` e `attempt_number` com semânticas distintas e validação fail-closed.
- [x] Normalizar `NaN`, `Infinity` e `-Infinity` para `null` somente na fronteira JSON RAW, preservando valores finitos e bytes determinísticos.
- [x] Cobrir todas as estruturas RAW, determinismo, serialização estrita e registro realista de tick com testes Python.
- [x] Validar APP/parser/compileall, publicar APP e reconciliar apenas o job Cache existente pelo mecanismo oficial; Docker indisponível para validar a imagem.
- [ ] Observar RAW, HOT, auditoria, Canonical, fila, job e upload até estado terminal, sem novo upload, duplicação ou exclusão. Bloqueado pelo Railway ainda executar a imagem anterior.

## FASE 2.7.2D.6 — Fechamento HOT/RAW + dados essenciais + Railway + E2E Cache — EM EXECUÇÃO

- [ ] Implementar no HOT representações compactas, determinísticas e baseadas somente em evidência real para AIM, posição e economia, preservando combat, utility e objective.
- [ ] Preservar o RAW integral, chunked JSONL gzip, NaN estrito, hashes físicos, chain, root digest, idempotência e path por `attempt_number`.
- [ ] Validar contratos APP↔Railway, limites HOT 4/8 MiB, claim e distinção entre logical attempt e dispatch attempt.
- [ ] Sincronizar cirurgicamente o worker Railway, preservar isolamento/RSS/bounded parsing, publicar e provar revision, contract 1 e health.
- [ ] Continuar somente o job Cache existente e observar os 20 gates até estado terminal, sem novo upload, mensagem, reset ou exclusão.
- [ ] Medir parser, RAW, HOT e pipeline antes de qualquer otimização.
- [ ] Ajustar somente os dois textos portugueses solicitados em “Analisar meu jogo” e validar em mobile.

## FASE 2.7.2G.3 — Independent RAW manifest ↔ 178 closure + Railway parity gate — PARTIAL / OPERATIONALLY BLOCKED

- [x] Re-read the immutable Cache manifest from private Storage and verify identity, contract 1, audit digest, root digest, 24 chunks, 373,754 rows, and 2,799,488 compressed bytes without mutation.
- [x] Reconcile exactly 178/178 legacy `UNMAPPED_BUT_AVAILABLE` fields against the independent fixture: 4 `MAPPED`, 174 `RAW_ONLY_INTENTIONAL`, 0 unknown, 0 duplicates, and no set difference.
- [x] Audit events, event fields, players, rounds, ticks, bombs, damage, deaths, grenades, teams/score, usercmd, and forensic inventories without inventing absent evidence.
- [x] Preserve the historical artifact as READY/RAW READY/audit BLOCKED with its three stored FAIL gates; current-code projection does not retroactively approve it.
- [x] Validate fail-closed RAW→Canonical admission and duplicate/empty/unknown mapping defenses.
- [x] Validate parser 169 passed/3 skipped, pipeline+Canonical 554 passed, APP 918 passed, plus typecheck, compileall, and diff check.
- [x] Publish the complete 178-row matrix and G3-01..G3-20 status in `services/cs2-demo-parser/docs/cache-g3-independent-raw-audit.md`.
- [ ] G3-18 Railway parity remains PENDING/BLOCKED: `infra/cs2-parser-worker-v8` is unavailable in accessible refs and the secondary remote cannot be authenticated.
- [ ] Cache Run 1, Run 2, Canonical persistence, Railway deploy, secrets, artifact, database, and Storage were not changed or executed.

## FASE 2.7.2G.4 — Controlled Railway parity sync — BLOCKED ON SOURCE REFS

- [x] Freeze MAIN baseline at `595e26badda495d6e4eb5be383681f4a535f7064` and record the required parser file hashes/classifications.
- [x] Validate MAIN parser/RAW/HOT/worker contracts: Python 169 passed/3 skipped; pipeline+Canonical 554 passed; APP 918 passed; typecheck, compileall, diff check, and preview build PASS.
- [x] Confirm the running Railway service read-only: health 200, durable-worker role, demoparser2 0.42.0, contract 1, valid semantic/build revisions.
- [x] Publish the surgical sync design, security matrix, G4-01..G4-24 statuses, and exact blockers in `services/cs2-demo-parser/docs/cache-g4-railway-parity-audit.md`.
- [ ] Obtain auditable refs for `infra/cs2-parser-worker-v8` and `infra/cs2-parser-worker-v8-parity-g4`; neither is exposed by the accessible remote.
- [ ] Apply and audit the staging patch only after both refs are available, preserving `parser_isolated.py`, `parser_child.py`, `worker_main.py`, Railway worker lifecycle, and build identity.
- [ ] G4 deployment readiness remains BLOCKED; no Cache run, retry/requeue, Canonical write, artifact mutation, data/config/secret change, or Railway deploy occurred.

## FASE 2.7.2G.4-R — Railway controlled deployment — CONCLUÍDA

- [x] Railway atualizado e validado no deployment `19e443dd-7e34-4b9d-82dd-463ef5ca9bdd`, com demoparser2 0.42.0, contract 1, semantic revision e build revision pinadas.
- [x] `/health` e `/version` responderam 200; processo isolado, durable worker e identidade de build preservados.
- [x] Nenhum deploy Railway adicional faz parte da G.5-R.

## FASE 2.7.2G.5-R — Lifecycle pós-RAW bloqueado — CONCLUÍDA / CACHE NOT RUN

- [x] Auditar schema, constraints, índices, funções e tentativa Cache histórica por leitura.
- [x] Aplicar migration incremental para `blocked_raw_audit → raw_audit_blocked`, sem reabrir a tentativa anterior.
- [x] Preservar lock por usuário+SHA, incremento de `attempt_number`, `supersedes_job_id`, `superseded_by_job_id` e `ATTEMPT_ALREADY_SUPERSEDED`.
- [x] Propagar o novo motivo no contrato TypeScript sem alterar o retorno público imutável de `submitDemo()`.
- [x] Validar lifecycle/RAW/HOT/Canonical focado (157 PASS), APP completa (921 PASS), parser (162 PASS/10 SKIP), typecheck, compileall e diff check.
- [x] Confirmar as RPCs como `SECURITY DEFINER`, `search_path=''` e executáveis somente por `service_role`; preservar o baseline de 15 achados legados do linter.
- [x] Documentar riscos e gates em `docs/PHASE-2.7.2G.5-R-BLOCKED-RAW-ATTEMPT-LIFECYCLE.md`; concorrência real permanece PARTIAL por não criar dados de teste em produção.
- [x] Cache Run 1 e Run 2 permanecem NOT RUN; Railway, Storage, secrets, artifact e Canonical permanecem intocados.

## FASE 2.7.2G.5-R-F — Final verification — PARTIAL/BLOCKED

- [x] Auditar migration, schema real, constraints, índices, RPCs, ACLs, diff e histórico Cache.
- [x] Confirmar tentativa máxima 7, zero attempts posteriores e artifact histórico intacto com 24/24 chunks verificados.
- [x] Validar frontend atual por auditoria estática e smoke público/autenticado em 13 rotas, sem erros críticos.
- [x] Validar APP 921 PASS, foco lifecycle/RAW/HOT/Canonical/identity 179 PASS, parser 162 PASS/10 SKIP, typecheck, compileall, build e diff check.
- [x] Confirmar lint dos arquivos G.5-R PASS; lint global permanece `BLOCKED_BY_BASELINE` fora do escopo.
- [ ] G5-R-F-19 REAL CONCURRENCY TEST bloqueado: não há Postgres descartável nem sessões transacionais concorrentes com rollback; produção não será usada para criar fixtures.
- [x] Railway permaneceu inalterado; Cache Run 1/Run 2 não executados; Fase 2.8 permanece bloqueada.
- [x] Relatório: `docs/PHASE-2.7.2G.5-R-F-FINAL-VERIFICATION.md`.
- [ ] Decisão: `G5-R-F = PARTIAL/BLOCKED — NOT READY FOR CACHE RUN 1` até a prova concorrente real segura.

## FASE 2.7.2G.5-R-F.1 — Concorrência descartável — CLOSED / PASS

- [x] Executar PostgreSQL 17.9 descartável com duas sessões reais, estado persistido consultado e teardown.
- [x] Provar 50/50 disputas `blocked_raw_audit → attempt 8`, sem attempt 9, duplicação, deadlock ou timeout.
- [x] Provar enqueue concorrente idempotente, supersessão, stale fencing, estados terminal/processed e unicidade ativa.
- [x] Corrigir o cliente para resolver `pending` sem job por enqueue idempotente, sem overwrite, ou falhar fechado.
- [x] Confirmar ACL service-role-only e `SECURITY DEFINER`/`search_path` no banco local.
- [x] Confirmar Cache histórico por leitura: attempt máximo 7, zero posteriores e artifact 24/24 intacto.
- [x] Confirmar Railway por probes read-only; nenhum deploy, secret ou staged change alterado.
- [x] Relatório: `docs/PHASE-2.7.2G.5-R-F.1-CONCURRENCY-HARDENING.md`.
- [x] Decisão: `G5-R-F = CLOSED — READY FOR CACHE RUN 1`; Cache Run 1 NOT EXECUTED.

## FASE 2.7.2G.5-R-F.2.10 — Client-side parser POC

- `POC_IMPLEMENTED`: isolated Worker protocol, transferable local DEM, compact result/manifest, deterministic SHA-256/digest, dry-run authenticated validation, parity comparator, feature-gated UI, and fail-closed Canonical proof binding.
- `ARTIFACT VERIFIED`: the exact browser/WASM files checked into upstream v0.42.0 are pinned and hash-verified; bit-reproducibility remains partial because the upstream toolchain is not fully pinned.
- `NOT_EXECUTED`: real browser/WASM test, real ~400 MB DEM, memory benchmark, and WASM↔Python corpus parity.
- Production Python/Railway ingestion remains unchanged. No Cache run, retry, Attempt 9, enqueue, Canonical write, Storage mutation, migration, Railway deploy, secret change, or historical mutation occurred.
- Final gate: `POC_NOT_READY`.

### Consolidated F.2.10 A–D closure

- [x] Added separate source, binding, binary, runtime-surface, capability, audit-catalog, contract, result, and manifest identities.
- [x] Hardened Classic Worker initialization, same-origin/hash checks, explicit event outcomes, bounded tick samples, cancellation cleanup, and validator invariants.
- [x] Added 22-dimension Python×WASM parity reporting and the browser/provenance/admission documentation set.
- `F.2.10-A WASM ARTIFACT & WORKER HARDENING: PASS` — exact source artifact, hashes and Chromium initialization verified; bit-reproducibility remains partial.
- `F.2.10-B REAL BROWSER DEM: NOT_RUN`.
- `F.2.10-C PYTHON × WASM PARITY: NOT_RUN`.
- `F.2.10-D 400MB MEMORY: NOT_RUN`.
- `CANONICAL ADMISSION: MUST REMAIN BLOCKED`; `HOT READINESS: PARTIAL`; `AI DATA READINESS: BLOCKED`.
- No production, Railway, Cache, retry, Attempt 9, RAW, Canonical, Storage, migration, secret, deployment, or historical mutation occurred.

### F.2.10-I/J/K — Harness ready for an authorized real DEM

- [x] Separated upstream support, project catalog, runtime export, requestability, execution, semantic validation, normalization, parity and Canonical eligibility.
- [x] Added 38 event-specific request definitions and per-call evidence for actual `parseEvent` arguments, returned/missing/unexpected fields and digests while preserving discovery order and duplicates.
- [x] Added bounded grenade raw/normalized evidence, observed round pairing, explicitly non-authoritative tick-domain evidence and recursive rejection of `NaN`/`Infinity` before serialization.
- [x] Added executable Python reference producer requiring an explicit authorized `.dem`; with no input it returns `NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE` and performs no discovery or persistence.
- [x] Added SHA-bound 2×Python + 2×WASM determinism contracts, field-matrix summaries and negative tests preserving null, zero, false, types, array order and duplicates.
- [x] Calculated matrix: 175 fields, 151 requestable, 0 executed, 0 parity PASS, 175 blocked/NOT_RUN; 22 parity dimensions.
- [ ] `REAL DEM VERIFIED = NO`; `PYTHON × WASM VERIFIED = NO`; `DETERMINISM VERIFIED = NO`; `CANONICAL READY = NO`; `AI DATA READY = NO`.
- Final implementation status: `HARNESS READY FOR AUTHORIZED REAL DEM`; evidence status remains `POC_NOT_READY / NO_AUTHORIZED_REAL_DEM_FIXTURE`.

### F.2.10-L/M/N — Shared provenance and execution contracts

- [x] Added a machine-readable upstream manifest for pinned commit `d3767705dc5846d73ed29db50eaeda58778dc934`, with independent API/field/event states and source references.
- [x] Replaced runtime category heuristics with 38 explicit event request entries carrying reasons, semantic purposes and upstream evidence.
- [x] Bound Python and WASM to the same catalog/contract digests; mismatch blocks before field comparison.
- [x] Added unique run identities, exact 2×Python + 2×WASM identity checks, conservative grenade normalization, bounded round metadata and non-authoritative tick-probe metadata.
- [x] Added structured local DEM authorization verified against filename, size and SHA-256; no DEM was executed.
- Contract gate: `PASS_FOR_AUTHORIZED_REAL_DEM`.
- Evidence gate: `POC_NOT_READY / NO_AUTHORIZED_REAL_DEM_FIXTURE`; `REAL DEM VERIFIED = NO`; `PYTHON × WASM VERIFIED = NO`; `DETERMINISM VERIFIED = NO`; `CANONICAL READY = NO`; `AI DATA READY = NO`.
- No Cache run, attempt, Railway, Storage, migration, secret, Canonical, production, or historical mutation occurred.

## Fase G.6-R.4-C.5/C.6 — 2026-09-22

- Estado: `IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`.
- Autoridade versionada: release `cf0549c2-dfbd-c4df-25b4-2ce8204edf87`, inventário `canonical-demo-v2`, 105 campos únicos, 0 genéricos, 0 autorizados e 0 verificados.
- Digests: inventário `cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1`; matriz `a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702`.
- Autoridade histórica `canonical_mapping_inventory` foi preservada e desclassificada como fonte atual; nenhuma linha histórica foi alterada nesta fase.
- OIDC exige subject imutável por owner/repository IDs, `repository_owner_id=323426481`, `repository_id=1358428146`, branch congelada e somente `workflow_dispatch`.
- Gate final: 32 condições, provenance vinculado à release, ausência de Attempt 9/10+, e Canonical fail-closed.
- Estado de dados verificado: Attempt 8=1, Attempt 9=0, Attempt 10+=0, provenance=0, provenance VERIFIED=0.
- Provas externas ausentes: Railway API, endpoint/HMAC/transport, OIDC real, CI remoto, Python×WASM, determinismo, persistência, identidade e tick authority. Nenhuma foi fabricada.
- Nenhum replay, processamento/cópia/exclusão de DEM, cleanup, Canonical, métricas, features, AI Coach ou mutação Railway ocorreu.

## Fase G.6-R.4-C.10-R1 — 2026-09-22

- Estado: `IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`.
- [x] Restringir as ACLs efetivas de `parser_attestation_nonces` e `parser_runtime_provenance` a `service_role: SELECT, INSERT`, sem UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES.
- [x] Preservar RLS e triggers imutáveis; adicionar regressões de catálogo para anon/authenticated/PUBLIC/service_role e `TRUNCATE`.
- [x] Tornar explícito que o gate é exclusivo do replay controlado Cache attempt 8 → 9, com identidade fixa e fail-closed.
- [x] Reconciliar os 40 eventos do catálogo, incluindo `bullet_damage` e `inferno_extinguish`, sem promovê-los.
- [x] Adicionar comparação automática entre catálogo e documentação, detectando ausências, extras e duplicatas.
- [ ] HMAC, OIDC, provenance, parity, determinismo, identidade, integridade forense e tick authority reais continuam ausentes ou não verificados.
- [ ] Attempt 9/10+, DEM real, Canonical, cleanup, Railway, secrets e histórico não foram executados ou alterados.

## A9.1 + R5.8 — POST-MERGE CORRECTION CLOSEOUT — 2026-10-06

- [x] PR #53 merged by squash as `d7c1b3370dc5a3f0e9eaef45390eed8d7ecef5de`.
- [x] Repaired stale OIDC test fixtures so trigger commit SHA and workflow-file SHA remain distinct and correctly bound.
- [x] Repaired `attestor_source_identity` fixture to use the required `branch` field and explicit source identity shape.
- [x] Removed the stale test reference to deleted migration `20261005195000_r58_5_live_attestation_pin_reconciliation.sql`; no migration was recreated.
- [x] Reconciled the critical `worker.py` hash with the actual Railway deployment source: `50a53b607d26f00b4de05c5e8998611959e27bd1`.
- [x] Post-correction Quality Gates #633 / run `37395367754`: **SUCCESS**. Web tests/lint/build and contract-sensitive parser tests passed; F553 R11.2 disposable execution completed successfully.
- [x] No production DEM, Attempt 9/10+, Canonical admission, provenance mutation, secret mutation, or production database migration was executed.
- [x] Railway production remained unchanged: deployment `1b5778de-3eaf-46f1-9ea5-cba381d95313` remains **SUCCESS**, 1/1 replica online, zero recent failures/issues.
- [x] Historical Railway staged patch `d66b5a12-a69b-4b9a-87b6-314f75c471cc` remains uncommitted and was not accepted because it is unrelated to the approved correction scope.
- [ ] Post-A9.1 real DEM parity/determinism evidence and a new Runtime Attestation remain **NOT RUN / NOT PROVEN** and require separate explicit authorization.
- [ ] Canonical admission and Attempt 9 remain locked.


## A9.1 SCRIPT-LEVEL COVERAGE CLOSEOUT — 2026-10-06

- [x] Add synthetic direct coverage for A9.1 Python/WASM parity fail-closed branches: no authorized DEM, parser/catalog/contract identity mismatch, DEM SHA mismatch, invalid artifact status, run identity/status mismatch, and digest mismatch.
- [x] PR #54 merged by squash as `34b6f7d355c4cf69505c7d45acaf56dc5d9a10b9`.
- [x] Quality Gates #640 / run `37397218059`: **SUCCESS**. Contract-sensitive parser tests passed; web tests/lint/build passed; browser parser isolation passed; F553 R11.2 disposable execution passed; CS2 parser tests remained expected SKIPPED.
- [x] Test fixtures are synthetic and do not authorize or execute a production DEM, Canonical admission, provenance mutation, secret mutation, Railway mutation, or Runtime Attestation.
- [x] Railway remains unchanged and healthy: deployment `1b5778de-3eaf-46f1-9ea5-cba381d95313` SUCCESS; 1/1 replica; no recent failures/issues.
- [x] Historical staged Railway EnvironmentPatch `d66b5a12-a69b-4b9a-87b6-314f75c471cc` remains unaccepted.
- [ ] Fresh post-A9.1 Runtime Attestation remains NOT RUN / NOT PROVEN and requires separate explicit operator authorization.
- [ ] Fresh real-DEM Python/WASM parity and determinism remain NOT RUN / NOT PROVEN and require separate explicit operator authorization.
- [ ] Attempt 9/10+, production DEM processing, Canonical admission, and production data/secret/provenance mutation remain LOCKED.
- [ ] PR #46 remains conflict-blocked and must not be force-merged.


## POST-A9.1 RUNTIME ATTESTATION READINESS — 2026-10-06

- [x] Re-read `.github/workflows/parser-runtime-attestation.yml` from current `main`: workflow is **manual-only** via `workflow_dispatch`, restricted to repository `GameProAcademy/cs2-pro-hub` and `main`.
- [x] Reconfirm approved attestor workflow blob SHA remains `3070d8bae6c3f02093bbb2595138c913646c2e31`; no workflow-source drift was introduced by the A9.1 correction/documentation commits.
- [x] Reconfirm the attestor still requires the frozen Railway parser revision `5703b1d88f21ee57fdd1d83722edf30e0f0c6f76` as an ancestor of `infra/cs2-parser-worker-v8`.
- [x] Reconfirm the attestor still requires the protected Railway/OIDC/HMAC secrets and uploads evidence before delivery.
- [x] Reconfirm Railway production remains healthy and unchanged at deployment `1b5778de-3eaf-46f1-9ea5-cba381d95313`.
- [x] No workflow dispatch was simulated, substituted, or triggered indirectly.
- [ ] Fresh post-A9.1 Runtime Attestation remains **NOT RUN / NOT PROVEN** because the available GitHub connector exposes no `workflow_dispatch` operation. A historical attestation rerun would not be valid evidence for current `main` and must not be used.
- [ ] Real DEM parity/determinism, Attempt 9/10+, Canonical admission, provenance mutation, secret mutation and Railway mutation remain LOCKED.


## A9.1 + R5.8.6 — POST-MERGE CLOSEOUT — 2026-10-06

- [x] PR #56 merged by squash after Quality Gates #652 completed successfully.
- [x] Quality Gates #652 / run 37415911896: Web tests/lint/build PASS; Contract-sensitive parser tests PASS; F553 R11.2 disposable execution PASS through artifact completeness, evidence preservation and teardown.
- [x] R5.8.6 migration correction validated against the disposable schema; absence of the legacy deployment-wide constraint is now tolerated, while presence is still safely removed before the attestation-digest uniqueness boundary is installed.
- [x] Attestation provenance idempotency is now scoped to `attestation_digest`; exact digest replay resolves the existing provenance row, while distinct attestations may prove the same frozen Railway deployment.
- [x] PR #56 merge commit: `5385b7d16edd3f4574c39fd9015775b5c36aa903`.
- [x] No provenance/nonce DELETE, UPDATE or TRUNCATE; no DEM, Attempt 9+, Canonical admission, secret mutation, Railway mutation or Lovable interaction was performed.
- [ ] Live project-database application of R5.8.6 remains NOT PROVEN because the authoritative DB is Lovable-managed and no independent authorized live-DB evidence is available in this execution context.
- [ ] Post-A9.1 Runtime Attestation remains NOT RUN / NOT PROVEN.
- [ ] Fresh real-DEM Python/WASM parity and determinism remain NOT RUN / NOT PROVEN.
- [ ] Attempt 9/10+, production DEM processing and Canonical admission remain LOCKED.

**Current decision: repository + disposable CI gate CLOSED/PASS; production execution gate remains BLOCKED pending independent live-DB reconciliation and separately authorized post-A9.1 Runtime Attestation.**
