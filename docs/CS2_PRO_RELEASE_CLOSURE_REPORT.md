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

## Phase B/F — PR #151 merged (2026-10-18)

- PR #151 head `b6d4e486c65804f78c78ce8314fcdcce8b8a3172`: all 7 checks green on the exact SHA (Quality Gates incl. F553 R11.2 and Main required gates; Queue Semantics run [39097391585](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39097391585): queue 12/12, recovery protocol 22/22, canonical idempotency 17/17, Gate Semantics V2 11/11, recorder reconciliation 21/21, RLS two users 1/1; queue recovery E2E green).
- Previous head `1b2fc26e` failed `r5_8_12_idempotence_and_fail_closed_states` (run 39097037763): the R5.8.12 migration rewrites function comments, so it is idempotent only in its own state; the probe now rewinds R5.8.13 with its rollback, validates R5.8.12 there and re-applies R5.8.13 requiring the exact head state (commit `b6d4e486`).
- Merged as `22718d3d60e9a0d262e68971ce90751518f03dab`; no `services/` file in the diff (Railway build skipped by watch pattern; Lovable syncs code only).

## Phase D — managed database migrations applied (2026-10-18)

Each migration ran inside one DO block that aborts unless `md5(text)` equals the committed file, executes it (transaction-control lines removed only where the file has its own `BEGIN;`/`COMMIT;`, exactly one each), then records `schema_migrations` with the full file text — all atomically.

| Version | Result after apply | Stored text md5 = file |
|---|---|---|
| `20261016100000` R5.8.11 | recorder `72df9c51…` | `73835949…` ✔ |
| `20261016100100` R5.8.11b | assert `f5e27fc3…`, enforce `f95e6a50…` | `2591eee6…` ✔ |
| `20261016140000` overload cleanup | only the 18-arg `h3e91_record_execution_event` (`7c5189db…`, service_role EXECUTE) | `d42e7c7e…` ✔ |
| `20261017180000` R5.8.12 | recorder `321d649a…`, assert `e62a11f9…`, enforce `f74d8af9…` | `10f08c3a…` ✔ |
| `20261018050000` R5.8.13 | recorder `d4df5708…`, assert `f070c124…` (owner, SECURITY DEFINER, search_path, ACL unchanged) | `2e49ba96…` ✔ |

Observation: `20261016120000` (applied before this session) has a `schema_migrations` row without stored statements.

## Phase E — post-merge gates on `22718d3d`

- **R5.8.3** run [39098741937](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39098741937): `GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT`, failures `[]` — **PASS** (D1 runtime identity coherent and verified by the preflight itself).
- **R5.8.4** run [39098759506](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39098759506): all **32** gates evaluated (artifact selection fixed — D6 **PASS**); 14 VERIFIED; `own_scope_blockers: []`; decision `BLOCKED` with pending external collectors: fresh attestation of the active runtime, managed snapshot, H.3-E activation gate, A9.1 real-DEM lab run. Not a PASS.

## Phase E — H.3-E Activation Gate on `22718d3d` (run [39100058543](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39100058543)) = **FAIL**

| Stage | Result | Meaning |
|---|---|---|
| runtime, bridge_identity, persistence, transport, r5_8_3, r5_8_4, queue_semantics, r5_8_4_artifact, r5_8_4_decision | PASS | D1 confirmed by an independent evaluator |
| quality_gates | BLOCKED | main Quality Gates still running at evaluation time |
| r5_8_3_artifact | BLOCKED `ARTIFACT_NOT_FOUND` | **D10** (gate defect, below) |
| parser_lock | FAIL `PARSER_LOCK_NOT_REQUIRED` + revision/build mismatch (`60099ed3`) | D3 (PR #152) + D5 (owner secrets) + published app stale |
| managed_snapshot | FAIL only `attempt_9_absent` (recorder `d4df5708` = R5.8.13 target) | D9 |
| predem_matrix | BLOCKED (`attempt_9_absent`, `hmac_configured`, `oidc_operational`, `provenance_verified`, `remote_ci`) | needs fresh attestation after app publish |

### D10 — H.3-E gate looked up the R5.8.3 artifact by its pre-#151 name
- **Symptom:** `r5_8_3_artifact` BLOCKED `ARTIFACT_NOT_FOUND` although run 39098741937 uploaded its artifact.
- **Root cause:** #151 renamed the upload to `r5-8-3-preflight-<sha>-<run>-attempt-<n>`; `scripts/ci/h3e_activation_gate.py` still searched `r5-8-3-preflight-<sha>-<run>`.
- **Fix:** PR #153 (`83cdfec5`): `r583_artifact_name(sha, run_id, run_attempt)` from the selected run's attempt (same convention as `scripts/r5_8_4_gate_reconciliation.py`).
- **Regression tests:** unsuffixed name → BLOCKED; earlier attempt → BLOCKED; selected attempt → PASS; name mirrors the workflow YAML. Against the old code: 11 failures + 1 error; new code 60/60.
- **Production impact:** none (CI evaluator only). **Rollback:** revert the merge commit.
- **Status:** `NOT_PROVEN` until #153 is merged and a new H.3-E run shows `r5_8_3_artifact` PASS.

## Phase F — PR #152 merged and app published (2026-10-18)

- PR #152 head `43c1a8c3`: 7/7 checks green on the exact SHA (Main required gates, F553 R11.2, CS2 parser, contract-sensitive parser, web, queue semantics, queue recovery E2E); 0 files under `services/` (no Railway build). Merged as `f767c397e5105fafcaab346be8714169324cc2b8` (merge commit).
- Lovable synced `latest_commit_sha = f767c397…`; published via `deploy_project` (deployment `c8c51428-e137-4b79-b6ee-81659ca338b5`). No prompt sent to Lovable.
- **Expected effect, fail-closed:** the published bundle now always requires the parser revision/build lock in production. While the app secrets `DEMO_PARSER_EXPECTED_REVISION` / `DEMO_PARSER_EXPECTED_BUILD_REVISION` still hold `git:60099ed3…` (D5), the app expects a parser identity the worker does not report, so demo processing stays blocked until the owner sets `git:c2e045b0…` / `git:eaaa2c8d…`. No demo is authorized before the gates anyway.
- D3 status: `NOT_PROVEN` until the runtime route `/api/public/parser-attestation-runtime` shows `revisionRequired=true`, `buildRevisionRequired=true` (read by the H.3-E gate `parser_lock` stage).

### D11 — duplicate Steam ID in one demo attached silently (PR #154, `536d1e15`)
- **Symptom (code review against the identity contract):** `resolvePlayerAttachment` used `find()`; a demo with the user's SteamID64 on two participants attached the first one.
- **Fix:** returns `state=conflict`, `reason=identity_conflict` (already allowed by `demo_jobs_attachment_reason_check`; no migration), no participant/Steam/method, whatever the declaration. The ambiguous-nickname candidate list uses the resolver's `normalizeNickname()`.
- **Regression:** new test (with and without declaration); 25/25; `tsc` clean. **Rollback:** revert. **Status:** `NOT_PROVEN` until merged.

### Identity contract — mapping to code (read 2026-10-18)
| Contract state | Code (`src/lib/pipeline/attachment.ts`) | Personal metrics |
|---|---|---|
| EXACT | `attached` · `steam_id_confirmed` · `high` (Steam ID proven on profile, present once in demo) | yes, after user confirmation flow (`pending_confirmation`) |
| PROBABLE / POSSIBLE | not emitted automatically — a nickname alone never attaches; a unique exact normalized nickname **explicitly declared by the user** attaches as `manual_user_selection` · `medium` | yes (manual, audited via `demo_identity_decisions` with `expected_latest_event_key`) |
| NO_MATCH | `unattached` (`no_steam_id_on_profile`, `steam_id_not_in_demo`, `self_declared_nickname_not_found`, `user_not_selected`) | no |
| AMBIGUOUS | `unattached` · `ambiguous_nickname` (candidates returned for explicit selection) | no |
| CONFLICT | `conflict` · `identity_conflict` (declaration contradicts Steam; Steam ID duplicated — D11) | no |
No fuzzy distance, no inference from kills/score/behaviour. Live proof of each state in production: `NOT_PROVEN` (Phase G).

## Phase D/E — fresh attestation of the active runtime (2026-10-18 05:30Z) — **PASS**

- Workflow `parser-runtime-attestation.yml` dispatched on main `f767c397` → run [39100740388](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39100740388) **success** (all steps green, including "Sign and deliver verified evidence to the server-side recorder").
- New row `parser_runtime_provenance.id = 50aa3e42-a5fd-406e-a69a-88b15a32604d`: `status=VERIFIED`, `GITHUB_ACTIONS_SIGNED_ATTESTATION_V3`, deployment `ece1c582…`, deployment_commit/semantic `c2e045b0…`, build `git:eaaa2c8d…`, `app_source_commit=f767c397…` (proves the published app is the new main), attestor `github_actions_oidc`, workflow source `f5e8ffb1…`, 64-hex HMAC signature accepted by the recorder.
- `assert_verified_parser_provenance('50aa3e42…')` (STABLE, md5 `f070c124…` = R5.8.13 target) → `VERIFIED`, digest `aa75f0d0…`.
- **Proves by runtime behaviour:** `PARSER_ATTESTATION_HMAC_SECRET` configured and matching the GitHub signer; OIDC operational; R5.8.13 recorder/assert pins coherent with the app pins and the Railway runtime. No secret value was read or logged.
- No prior provenance row was changed (append-only).

### Note — F553 post-completion run 39100510898 (BLOCKED) is a trigger artefact
It was triggered by the completion of the **cancelled** Quality Gates run of `22718d3d` (cancel-in-progress after the #152 merge); `workflow_run` runs carry the default-branch head (`f767c397`), whose own Quality Gates was still running → `R11_EXECUTION_JOB_NOT_SUCCESSFUL`. The evaluation of `f767c397` happens when its Quality Gates run 39100378766 completes; the gates select the newest run.

## Phase E — H.3-E on `f767c397` after publish + attestation (run [39101653080](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39101653080)) = FAIL, narrowed

- **parser_lock:** problems now only `PARSER_LOCK_REVISION_MISMATCH`, `PARSER_LOCK_BUILD_MISMATCH` — `PARSER_LOCK_NOT_REQUIRED` is gone, i.e. the published bundle enforces the lock without `NODE_ENV` (**D3 PASS** by runtime behaviour). Expected comes from env (`revisionSource=env`) = `git:60099ed3…`; both worker hosts serve `c2e045b0…` / `eaaa2c8d…` → remaining cause is **D5** (owner secrets).
- **predem_matrix:** 26 verified; blockers reduced from 5 to `attempt_9_absent` (D9) and `remote_ci` — `hmac_configured`, `oidc_operational`, `provenance_verified` now verified.
- **managed_snapshot:** only `attempt_9_absent` (D9).
- **r5_8_3_artifact:** BLOCKED — D10, fixed in PR #153 (not merged yet).
- **quality_gates / f553_post_completion / main_required_gates:** evaluated while Quality Gates 39100378766 was still running (trigger artefact noted above).

## Phase E — D10 closed; H.3-E down to D5 + D9

- H.3-E run 39101741510 (`f767c397`, after its Quality Gates 39100378766 = success): quality_gates, f553_post_completion, main_required_gates, r5_8_3, r5_8_4, queue_semantics, r5_8_4_artifact/decision, persistence, transport, runtime, bridge_identity = **PASS**; predem **27/28 VERIFIED** — sole blocker `attempt_9_absent` (D9); `remote_ci` now VERIFIED.
- PR #153 (D10) head `83cdfec5`: 5/5 checks green on the exact SHA; only `scripts/ci/` changed; merged as `6a3faf1b60601737110e2d97bf56fbccbc113f69`.
- H.3-E run [39103073331](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39103073331) on `6a3faf1b`: `r5_8_3_artifact=PASS`, `r5_8_3_decision=PASS` → **D10 PASS** (proven in production CI). Quality Gates of `6a3faf1b` was still running at that evaluation.
- Remaining FAIL/BLOCKED: `parser_lock` (D5 — owner secrets), `managed_snapshot` + `predem_matrix` (D9 — owner decision).

## Phase F — PR #154 (D11) merged and published

- PR #154 head `536d1e15`: 7/7 checks green on the exact SHA; files only `src/lib/pipeline/attachment.ts`, `src/lib/pipeline-identity.functions.ts`, test. Merged as `39b8317e14448e9817685713f5a9972307c96670`.
- main `39b8317e`: Quality Gates 39103547284 success, Queue Semantics 39103547355 success, R5.8.3 39103547302 success, R5.8.4 39103564096 success. (F553 39103566515 and H.3-E 39103580294 were fired by the cancelled Quality Gates of `6a3faf1b`, same trigger artefact as before.)
- Lovable synced `39b8317e`; published (deployment `b42dae33-ef12-41c2-bd2c-ad4ebd4627aa`). D11 code-level PASS (unit test in CI); production behaviour `NOT_PROVEN` until a real demo exercises it (Phase G).
