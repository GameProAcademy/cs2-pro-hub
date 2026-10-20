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

## Phase E — H.3-E on `39b8317e` (run [39105116041](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39105116041)) — FAIL, only owner-dependent stages left

PASS (15/18): target, quality_gates, f553_post_completion, r5_8_3, r5_8_4, queue_semantics, main_required_gates, r5_8_3_artifact, r5_8_3_decision, r5_8_4_artifact, r5_8_4_decision, persistence, transport, runtime, bridge_identity.

| Stage | Result | Cause | Owner |
|---|---|---|---|
| parser_lock | FAIL `PARSER_LOCK_REVISION_MISMATCH`/`BUILD_MISMATCH` | app env expects `git:60099ed3…`; both hosts serve `c2e045b0…`/`eaaa2c8d…` (D5) | set Lovable secrets |
| managed_snapshot | FAIL `attempt_9_absent` | D9 | decision on `2dc1ddd1` attempt 11 |
| predem_matrix | BLOCKED, 27/28 VERIFIED, blocker `attempt_9_absent` | D9 | same |

Phase G (real E2E, Canonical) remains **not started** by design: blocked by these gates.

## 2026-10-20 — D5 and D9 closed by the owner; **H.3-E Activation Gate PASS**

### D5 — app parser-lock secrets (owner action)
- Owner reported (chat, 2026-10-20T01:39-03:00) that `DEMO_PARSER_EXPECTED_REVISION` / `DEMO_PARSER_EXPECTED_BUILD_REVISION` were updated in Lovable production. Values not re-sent; not read by me.
- Proof by runtime behaviour: H.3-E run [39370718660](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39370718660) (dispatch, 04:39Z) → `parser_lock=PASS` (previously FAIL `PARSER_LOCK_REVISION_MISMATCH`/`BUILD_MISMATCH` with expected `60099ed3…`). **D5 PASS.**

### D9 — authorization of `2dc1ddd1` attempt 11 (owner decision, recorded)
- Owner decision (chat, 2026-10-20T01:39-03:00): attempt 11 was the owner's / authorized as a test; record it auditably without changing `JOB_STALE` or inventing parser events.
- Operator script `docs/ops/h3e_attempt_authorizations_2026-10-20.sql` (md5 `180e6356…`, PR #156) executed once at 2026-10-20 04:40:21Z. It asserts job identity (upload `989288d2`, attempt 11, DEM `0caa7c97…`, supersedes `4b5e3530`, created_at, `failed`/`JOB_STALE`, `raw_audit_blocked`) and writes only one registry row.
- Before → after: `demo_jobs` row md5 `99baf491…` → `99baf491…` (unchanged); H3E91 ledger events 0 → 0; registry rows 2 → 3; unauthorized jobs at attempt ≥ 9: 1 → 0. **D9 PASS.**

### H.3-E Activation Gate on `39b8317e` — run [39370837112](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39370837112) = **PASS**
All 18 stages PASS: target, quality_gates, f553_post_completion, r5_8_3, r5_8_4, queue_semantics, main_required_gates, r5_8_3_artifact, r5_8_3_decision, r5_8_4_artifact, r5_8_4_decision, persistence, transport, runtime, bridge_identity, parser_lock, managed_snapshot, predem_matrix. Evidence artifact `h3e-activation-gate-39b8317e…-39370837112-1`, digest `sha256:628f1463df2d440f7a8b1e235e3fe02245440ceb4424ca28af245663e31c198b`.
(Run 39370718660, 04:39Z, FAILed only `managed_snapshot`/`predem` because its snapshot, 04:39:41Z, preceded the authorization, 04:40:21Z.)

### What this does and does not prove
- Proven: pre-DEM readiness of the release `39b8317e` — runtime identity, fresh VERIFIED attestation, parser lock, managed DB pins, queue/persistence probes, authorization registry.
- **Not proven (Phase G, awaiting owner approval):** real upload → parse → identity → persistence → dashboard; RLS with 2 users on real data; retry/idempotency on real data; negative ambiguous-identity case; D7, D8, D11 in production; Canonical. R5.8.4 stays `BLOCKED` on its post-DEM collector (A9.1 real-DEM lab run) until then.

## Phase G — real E2E (owner-authorized, 2026-10-20)

Main `39b8317e`; worker deployment `ece1c582` (semantic `c2e045b0`, build `eaaa2c8d`); H.3-E run 39370837112 PASS. Canonical **not** requested and not executed as an explicit step (see note on job finalization below).

### Preconditions for `406df30a` (read-only, 04:5xZ)
- `406df30a` (user `348b6f66`, attempt 2, `failed/PARSER_IDENTITY_MISMATCH`, DEM `1d98f8b6…` 382,007,151 B, storage object present, `retry_count 1/2`), supersedes `e21e10fb` (attempt 1, `PARSER_UNAVAILABLE`); `demo_parse` queue empty; protected jobs md5 `98dda0f8:1852e536…`, `4b5e3530:f30585e6…`, `e3f93688:9dfab97b…`; 3 ledger events on `406df30a`.
- `retry_demo_job` (both the user and admin paths, `_allow_permanent=false`) refuses `PARSER_IDENTITY_MISMATCH` as permanent and would overwrite the attempt-2 row. Not forced. The supported path is a re-upload of the same file → new attempt.

### Attempt 11 — job `2dc1ddd1` (m1-cache, `0caa7c97…`, 473,748,061 B), retried by the owner 04:58:27Z
| Step | Evidence | Status |
|---|---|---|
| Intent / start | ledger `EXECUTION_INTENT` 04:58:31Z, `EXECUTION_STARTED` 04:58:43Z (build `eaaa2c8d`, revision `c2e045b0`) | PASS (D8 worker side) |
| Real parse | `EXECUTION_FINISHED/PARSE_SUCCEEDED` 05:16:06Z | PASS |
| RAW | artifact `d216adf8` ready/approved, 167 chunks, 4,586,562 rows (grenades 4,550,843; ticks 4,096; events 31,484; rounds 24; players 10), root `0b2a1b1c…` | PASS |
| App completion | app log: `complete_start bytes=3846798` 05:16:06Z → `Error: Worker exceeded CPU time limit.` 05:17:05Z → 502 05:17:07Z; worker `durable job interrupted type=HTTPStatusError` 05:17:14Z | **FAIL → D12** |
| Terminal | lease expiry → `demo_job_dispatch_closures#8` `abandoned_execution at FINISHED` → `failed/JOB_STALE` 05:31:57Z; nothing persisted | terminal |
- Authorization row of 10/20 still matches the job (identity unchanged).

### Attempt 3 — job `9572a234` (m2-mirage, the authorized DEM)
| Step | Evidence | Status |
|---|---|---|
| File | upload `23e4cda8`, SHA-256 `1d98f8b6d937ddbd5b2cc486b4830b63dfa85fd6b17b0767b96aa011c0ac7a7f`, 382,007,151 B (storage object 382,007,151 B) | PASS |
| Link | `supersedes_job_id = 406df30a…`; only change on `406df30a`: `superseded_by_job_id = 9572a234…` (status/error/attempt/ledger preserved); attempts 1–2 intact; protected jobs unchanged | PASS |
| Parse | ledger INTENT 05:31:58Z, STARTED 05:32:08Z, `FINISHED/PARSE_SUCCEEDED` 05:42:32Z | PASS |
| RAW | artifact `fff733be` ready/approved, 100 chunks, 2,582,139 rows, root `0e436f77…` | PASS |
| App completion | completed (no CPU abort at this size); admission v3 decision `d410e643` (digest `60af8c7c…`) recorded 05:43:14Z | PASS (mechanics) |
| Admission | **BLOCKED**: sole blocking reason `v3:RAW-V2-12-rounds:round_boundary_unknown` (facts: 23 rounds, 4,299 events, 0 outside rounds). Limitations L01–L04 (teams/score: `map_score_unknown`, `round_winner_unknown`, `team_assignment_not_two_teams`). Header `de_mirage` PASS, bomb 14 plants PASS, combat 158 kills / 638 damage PASS | **BLOCKED → D13** |
| Terminal | `blocked_raw_audit / RAW_AUDIT_BLOCKED`, `finished_at` 05:43:14Z, `match_id` null, attachment `unattached` | terminal |
- Identity, persistence, dashboard, RLS, idempotency, cleanup on real data: **NOT_PROVEN** (blocked before admission).

### D12 — completion exceeds the app runtime CPU limit (PR #157)
- Root cause: `auditPhysicalRawChunks` re-decoded every RAW row inside the single `complete` request; production code on the same volume: 15.1 s CPU.
- Fix: decode per chunk at verification (`raw_evidence_chunks.physical_summary`, migration `20261020060000`), completion still downloads and re-hashes every object and merges the summary bound to that sha256; forensic/header always re-decoded; summary-less READY artifacts are backfilled one chunk per request on retry. Measured: completion 66 ms CPU, ≤ 148 ms per verification request. Status: `NOT_PROVEN` until merged, migrated, published and a real job completes.

### D13 — admission v3 blocks the authorized DEM on round boundaries (PR #158 diagnostics)
- Which round lacks a boundary is only in the private RAW rounds/events sections. PR #158 adds bounded, read-only round-boundary diagnostics to the authenticated operator route (numbers/ticks only). Root cause: `NOT_PROVEN` until read.

### Observations
- The worker heartbeat loop keeps writing `stage=parsing` during app completion, so `stage` is not reliable during finalization.
- App logs show an external scanner probing 40+ secret paths at 02:33Z (all 404/cancelled).

## 2026-10-20 06:0x–06:3xZ — D12 shipped, D13 root cause proven

### D12 shipped (production code; production behaviour NOT_PROVEN)
- PR #157 head `8c833ea5`: 7/7 checks green on the exact SHA (incl. queue semantics on a disposable DB and the real worker/bridge/storage E2E); merged as `e945a564f006cd9d1419df9851c7c10a894d03d8`; no `services/` file.
- Migration `20261020060000` applied before publish in one guarded DO block (file md5 `46e8028e…` asserted, not previously recorded, 0 active jobs); read back: column `jsonb`, CHECK present, stored statement md5 `46e8028e…`. Rollback: `ALTER TABLE public.raw_evidence_chunks DROP COLUMN physical_summary` (nullable; old code ignores it).
- PR #158 (round diagnostics) head `0ab84e2b`: 7/7 green; merged as `35e588389db527d0eab03a27344b1ce96b7847d1`.
- Lovable synced `35e58838`; published (deployment `2a9d511d-7bd9-45da-be06-214c4fc5842f`).
- D12 in production stays `NOT_PROVEN` until a real job of the large demo completes within the CPU limit.

### D13 — root cause (RAW audit reasons runs 39380210774 and 39380306461)
| Job / DEM | RAW round rows | `round_start` | `round_end` | `round_officially_ended` | `round_freeze_end` | `cs_win_panel_match` | rounds without end tick | winners |
|---|---|---|---|---|---|---|---|---|
| `9572a234` m2-mirage | 23 | 0 | 0 | 0 | 23 (= round start ticks) | 1 @193184 | 23/23 | none |
| `2dc1ddd1` m1-cache | 24 | 0 | 0 | 0 | 24 | 1 @253444 | 24/24 | none |

- These demos do not advertise `round_start`/`round_end`. The parser (`derive_round_streams_from_tick_evidence`, parser.py) derives start ticks from `round_start_time` and, by design, leaves end ticks and winners unknown ("no winner, score, or team is invented").
- Admission v3 RAW-V2-12 requires closed intervals → `round_boundary_unknown` for every round; RAW-V2-16 → L04 (no winners/score).
- Consequence: with the current parser and contract, **no demo of this kind can be admitted**. Not a pairing bug; a missing observed source for round ends.
- Status: `BLOCKED` — needs an owner decision between a parser capability (observed round ends from game-state transitions; worker release cycle) and a contract change (new limitation). No gate was relaxed.

## 2026-10-20 07:1x–08:3xZ — D13 parser release (R5.8.14), controlled

| Step | Evidence | Status |
|---|---|---|
| Parser fix | PR #159 head `fc0ea994`, 7/7 green; observed round boundaries (freeze-time entry; `total_rounds_played` +1; winner only when `round_win_status` and score delta agree). Real fixture: derived == real events (10/10 starts/ends/winners/reasons); blind parse == normal parse (rounds 10/10, events 2,707/2,707) | PASS (code) |
| Deploy freeze | Railway `watchPatterns` → `/services/cs2-demo-parser/.release-freeze-r5-8-14` before merge; merge `7f70141b` produced SKIPPED `7409cff7` | PASS |
| Controlled deploy | `PARSER_REVISION`/`PARSER_BUILD_REVISION` = `git:7f70141b…` (skipDeploys); one deployment of the exact commit → `3acb47c5-d9a4-43f2-acff-9ead7cb12b30` SUCCESS 07:18:36Z | PASS |
| Runtime identity | both `/version`: revision/semantic/build `git:7f70141b…`, `build.commit 7f70141b`, `declared_revision_matches: true`; `/health` ok; critical blob change only `parser.py` `981f6261`→`8f75eb61` | PASS |
| Re-pin | PR #160 head `8da80485` 7/7 green (GSv2 11/11 incl. R5.8.14 idempotence/tamper and R5.8.13/12 under rewound head; recorder reconciliation 21/21); merged `ece1a040` | PASS |
| Managed DB | `20261020080000` applied (guarded; file md5 `f7048299…`; 0 active jobs): recorder `19a352c2…`, assert `df0dc1b3…`, workflow guard `f74d8af9…` unchanged; owner/definer/search_path/ACL unchanged; recorded | PASS |
| App | published from `ece1a040` (deployment `11ae2250`) | PASS |
| Attestation | run 39390466614 → provenance `aafc259e…` VERIFIED (deployment `3acb47c5`, `7f70141b`, parser.py `8f75eb61`); `assert_verified_parser_provenance` VERIFIED | PASS |
| Freeze removed | `watchPatterns` restored to `/services/cs2-demo-parser/**` | PASS |
| R5.8.3 / R5.8.4 on `ece1a040` | `GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT`, failures [] / success | PASS |
| H.3-E 39393875678 | 17/18 PASS incl. `parser_lock` (owner updated the expected-revision secrets); **`bridge_identity` FAIL `BRIDGE_EXPECTED_BUILD_MISMATCH`** (app secret `H3E91_EXPECTED_WORKER_BUILD_COMMIT` = `eaaa2c8d…`, worker serves `7f70141b…`) | **BLOCKED (owner secret)** |

No demo is started while `bridge_identity` fails (the bridge would refuse the worker's H3E91 events; D8 symptom).
