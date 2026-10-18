# CS2 PRO Hub — release closure report

Living engineering record (one row per defect, updated after every phase). States: `PASS`, `FAIL`, `BLOCKED`, `NOT_PROVEN`. Evidence is linked by SHA, run ID, deployment ID or query time; nothing here is a release approval by itself.

## Phase A — reconnaissance (2026-10-18, 04:05–04:15Z)

| Item | Observed | Source |
|---|---|---|
| `main` | `7b88f68c1797f8a81cacb9b00c140a49a52df978` | `git fetch` |
| PR #151 | open, head `bec14cd1645607f88725863aa302843c750b76be`, base `7b88f68c`, mergeable clean | GitHub API |
| Quality Gates 39094173514 / Queue Semantics 39094173522 | `success`, `head_sha` = `bec14cd1` (exact PR head); 7/7 PR checks green | GitHub API |
| R5.8.3 39041686075 (attempt 3) | `failure` on `7b88f68c` | GitHub API |
| R5.8.4 39093401587 | `failure` on `7b88f68c` (`EXPECTED_ONE_R583_ARTIFACT_GOT_3`) | GitHub API |
| H.3-E 39043542007 (attempt 3) | `failure` on `7b88f68c` | GitHub API |
| PRs #137, #138 (Admission V3) | merged 2026-10-14 / 2026-10-15 | GitHub API |
| PRs #139, #140 (identity-RPC order) | closed unmerged — the historical HTTP 400 must be re-verified | GitHub API |
| PR #148 | open, `dirty`; superseded by #147/#150 on main | GitHub API |
| Worker tree | `bee23155…` identical at `eaaa2c8d`, `7b88f68c` and `bec14cd1`; 5 critical blobs equal the pins | `git rev-parse` |
| Lovable project | `91478977-16c3-4839-ae28-6796024bcfc9`, latest synced commit `7b88f68c` | Lovable API |

## Defects

| # | Defect | Root cause | Fix | Regression evidence | State |
|---|---|---|---|---|---|
| D1 | Worker `/version` `declared_revision_matches=false` (R5.8.3 BLOCKED, H.3-E `DECLARED_REVISION_MISMATCH`) | Railway `PARSER_BUILD_REVISION` held the semantic revision `git:c2e045b0…`; `settings.py` takes `build_revision` only from that variable | Variable set to `git:eaaa2c8d…` (skipDeploys) + redeploy of `ce9b760d` image → deployment `ece1c582` | Both hosts after the change: `build_revision=git:eaaa2c8d…`, `build.commit=eaaa2c8d…`, `declared_revision_matches=true`, `/health ok` (04:17Z) | Runtime `PASS`; R5.8.3 `NOT_PROVEN` until a fresh run |
| D2 | Attestation pins name the replaced deployment `ce9b760d` | D1's redeploy necessarily created deployment `ece1c582` | R5.8.13 forward-only migration + spec/rollback + repository pins (in PR #151) | `test_r5_8_13_committed_artifacts.py` (generator targets, forward-only, fail-closed), probes: idempotence, unknown/mixed pins rejected | `NOT_PROVEN` (CI pending) |
| D3 | App parser lock optional in production (`PARSER_LOCK_NOT_REQUIRED`) | `adapter.ts` detected production with `NODE_ENV`, absent from the published bundle | PR #152: lock mandatory unless `NODE_ENV` is `test`/`development` | 2 tests fail on the old code, pass on the new | `NOT_PROVEN` (CI pending, not published) |
| D4 | Managed DB behind the repository (`SNAPSHOT_FROM_UNEXPECTED_DATABASE_STATE`) | Migrations `20261016100000`, `20261016100100`, `20261016140000`, `20261017180000` never applied; functions at R5.8.10 targets | Apply in order with R5.8.13 after merge | Read-only state 04:13Z | `BLOCKED` |
| D5 | App env overrides `DEMO_PARSER_EXPECTED_REVISION` / `_BUILD_REVISION` = `git:60099ed3…` (stale) | Lovable secrets set for an older worker | Owner sets `git:c2e045b0…` / `git:eaaa2c8d…` in Lovable → Cloud → Secrets | Published `parserLock.*Source = env` | `BLOCKED` (owner action) |
| D6 | R5.8.4 `EXPECTED_ONE_R583_ARTIFACT_GOT_3` | Same-name artifacts from three attempts | Attempt-aware selection in PR #151 | PR #151 tests; needs a full run | `NOT_PROVEN` |
| D7 | `record_demo_identity_event` HTTP 400 after Canonical (job stuck in `processing`) | To re-verify: PRs #139/#140 closed unmerged; migration `20261015040000` applied | — | — | `NOT_PROVEN` |
| D7 → | Re-verified: fixed inside PR #138 (`17ee6ca9`, `ee6f2843`, `d6e39d3d`) + migration `20261015040000` (applied in production) | — | — | PR #138 head `c80f86fd`: Queue recovery E2E `PASS` 16/16, including `admission_v3_limited_demo_persists_real_metrics_readable_only_by_its_owner` and `admission_v3_projection_failure_writes_no_partial_metrics_and_the_retry_persists_once` | Disposable `PASS`; production `NOT_PROVEN` |
| D8 | Jobs `7f7cf6f1`, `ecfa53c2`, `2dc1ddd1` (16/10) ended `JOB_STALE` with **zero** ledger events (parser never ran) | Worker log (deployment `ce9b760d`, #144 diagnostics): delivery 1 `H3E91_RECORDING_FAILED_503_H3E91_EXPECTED_WORKER_BUILD_COMMIT_UNCONFIGURED` (app secret not set then; now `configured=true`, `eaaa2c8d`); deliveries 2–3 `H3E91_RECORDING_UNAVAILABLE` = writer RPC error before `20261016120000` reconciled the 18-argument writer | `20261016120000` (applied); `20261016140000` removes the remaining legacy overload | Proof required: a fresh real `EXECUTION_INTENT` row | `NOT_PROVEN` |
| D9 | Job `2dc1ddd1` reached attempt 11 (sha `0caa7c97`, user `348b6f66`) with **no** row in `h3e_attempt_authorizations` → gate semantics v2 `AUTHORIZED_ATTEMPTS_V2` cannot pass | Started on 2026-10-16 outside this session; no owner decision recorded | Owner confirmation required before any registry row (never fabricated) | Read-only query 2026-10-18 | `BLOCKED` (owner decision) |

### Restore point before managed migrations (2026-10-18 04:2xZ, read-only)
`pg_get_functiondef`, comment, owner, `SECURITY DEFINER`, `search_path`, ACL captured for: recorder `4ee7be9d…` (R5.8.10 target), `assert_verified_parser_provenance` `57e41961…`, `enforce_approved_attestation_workflow` `f95e6a50…`, `h3e91_record_execution_event` 18-arg `7c5189db…` (service_role EXECUTE) and legacy 17-arg `7032fe9f…` (postgres only). Each is reproducible byte-for-byte from committed generators/rollbacks (R5.8.10 targets; legacy writer from the pre-`20261012100000` chain), so the rollbacks in `docs/reference/r5_8_1{1,2,3}/` restore every intermediate state. HMAC: `app.settings.parser_attestation_hmac_secret` is not a persistent setting by design — `record_parser_runtime_attestation_with_secret` sets it transaction-locally from the app server secret; proof = a fresh VERIFIED attestation.
