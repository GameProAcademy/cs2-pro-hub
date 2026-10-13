# H.3-E operator procedure — containment, identity, re-pin, attestation (prepared, not executed)

Decisions recorded on 2026-10-13 (operator):

| ID  | Decision                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | **Option B**: temporarily disable automatic deploys of `cs2-demo-parser` from `main` until the re-pin is complete                           |
| X2  | Keep `c0aa8a55` provisionally; its identity is **not** approved; no automatic rollback                                                      |
| X3  | Semantic revision describes the served worker tree; build revision equals the embedded commit; values confirmed after the runtime is stable |
| X4  | The operator publishes the application manually; no message is sent to Lovable from this repository                                         |
| X5  | R5.8.7/R5.8.8/R5.8.9 are prepared and validated on GitHub only; managed application needs specific authorization                            |
| X6  | A real attestation only after runtime, pins, configuration and migrations are reconciled                                                    |
| X7  | The read-only snapshot is code, tests and docs; applying it and any external access need authorization                                      |
| X8  | `canonical_uncontaminated` uses `STRICT_PROVENANCE` (#113); the existing row is not changed                                                 |

No step below has been executed. Each **external** step needs its own specific authorization. A value marked
_observed in En_ is unknowable before step En and must never be guessed or copied from history.

## 1. Observed state (read-only, 2026-10-13 05:15–06:20 UTC)

| Item                                            | Value                                                                                                                          | Source                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Serving deployment                              | `c0aa8a55-a2a8-43e4-924e-0966171cddcf`, SUCCESS, commit `c8c6d6ec…`, the only SUCCESS                                          | Railway `list-deployments`                                    |
| Merges #113–#116                                | `SKIPPED`, `snapshotId` null                                                                                                   | Railway                                                       |
| `/version`, both hosts                          | `build.commit c8c6d6ec…`, `build_revision git:10815fb4…`, `semantic_revision git:5703b1d8…`, `declared_revision_matches false` | worker hosts (via an intermediary fetch; CI is authoritative) |
| Worker tree of `c8c6d6ec` / `10815fb4` / `main` | `8120c12a` (identical); `5703b1d8` is `bf25eb86`                                                                               | git                                                           |
| Bridge (published fingerprint)                  | `expectedWorkerBuildCommit 10815fb4…`, `configured true`, `enforced false`                                                     | `GET /api/public/parser-attestation-runtime`                  |
| Bridge vs served                                | **mismatch** (`10815fb4` ≠ `c8c6d6ec`)                                                                                         | both                                                          |
| Recorder                                        | md5 `fe3250af…` (pins deployment `1b5778de`, worker blob `50a53b60`)                                                           | managed DB, read-only (earlier today)                         |

`enforced false` was computed before #115 from a differently written expression than the bridge's, so it does
not prove what the bridge decides. After a publication that includes #115 it reports the bridge's own
expression. If it is still `false`, the bridge's identity check is off in production. That calls for a
fail-closed code change in `src/lib/pipeline/h3e91ExecutionBridge.server.ts` (a Railway watch path, so only
after E1).

## 2. Sequence

| Step | Kind                      | Exact operation                                                                                                                                                                                                                                                                                                                                     | Validation (read-only)                                                                                                                                                                                                                 | Rollback                                                              |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| E1   | **external** (Railway)    | Project `aa2176ec…`, service `cs2-demo-parser` (`706fa246…`), environment `production` (`2385d707…`): Settings → Source → disconnect the `main` branch trigger (or disable automatic deployments). Change nothing else.                                                                                                                             | Service config shows no branch trigger. Merge one docs-only PR, then one workflow-only PR, one at a time: `list-deployments` shows **no new entry** (not even SKIPPED) and `/version` is unchanged.                                    | Reconnect `main`; `watchPatterns` are kept as they are.               |
| E2   | decision record           | Keep `c0aa8a55` (X2). Record its id, commit and `/version` at the time of E3.                                                                                                                                                                                                                                                                       | `list-deployments status=SUCCESS` returns exactly `c0aa8a55`; `/health` `{"status":"ok"}` on both hosts.                                                                                                                               | —                                                                     |
| E3   | **external** (Railway)    | On the same service and environment, set `PARSER_BUILD_REVISION = git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d` and `PARSER_REVISION = git:10815fb44e165963adfaf07f71c474ca628f4b7f` (the first `main` commit whose worker tree is `8120c12a`; `git:c8c6d6ec…` is equally valid). Deploy the staged change, which is a redeploy of the same commit. | New deployment D = _observed in E4_. `/version` on both hosts: `build.commit` = the embedded commit; `build_revision` = `git:` + that commit; `declared_revision_matches true`; semantic tree = build tree. Activation `runtime` PASS. | Railway rollback to `c0aa8a55`, or restore both variables.            |
| E4   | read-only                 | Read D (`list-deployments`), `/version` and `/health` of both hosts; confirm that `build.commit` is still `c8c6d6ec`.                                                                                                                                                                                                                               | If `build.commit` differs, return to E3 with the observed commit. Never continue with assumed values.                                                                                                                                  | —                                                                     |
| E5   | GitHub                    | Re-pin PR: spec JSON from E4 → `python scripts/repin/r5_8_9.py verify spec.json`, then `generate spec.json <migration> <rollback>`. Update the repository pins (`docs/H3E_REPIN_PLAN.md` §3), including the workflow and registry blobs.                                                                                                            | `verify` passes (it refuses a removed deployment id, a non-`main` branch, `build ≠ deployment_commit`, wrong blobs, host disagreement, a non-SUCCESS deployment). Quality Gates green.                                                 | Revert the PR (merge commit).                                         |
| E6   | GitHub / disposable       | Disposable validation of R5.8.7, R5.8.8 and R5.8.9 with D's real values (`scripts/repin/validate_r5_8_9_disposable.py <build> <semantic>` on PG16 and PG17; draft #110 runs it in CI).                                                                                                                                                              | 7/7 PASS, `values_source = candidates`, target md5 equal to the generator's.                                                                                                                                                           | —                                                                     |
| E7   | **external** (managed DB) | Apply R5.8.7, R5.8.8 and the generated R5.8.9, in order, after a read-only preflight (recorder md5 `fe3250af…`, R5.8.8 state present).                                                                                                                                                                                                              | Read-only: recorder md5 = target, comment names D, grants `service_role` only, `SECURITY DEFINER`, `search_path=''`.                                                                                                                   | R5.8.9's own rollback (managed-safe); R5.8.7/R5.8.8 are no-ops there. |
| E8   | **external** (prod write) | Fresh attestation through `parser-runtime-attestation.yml` (`workflow_dispatch` on `main`).                                                                                                                                                                                                                                                         | One new VERIFIED `parser_runtime_provenance` row bound to D, commit and revisions; `hmac_configured`, `oidc_operational` and `provenance_verified` evidence.                                                                           | None needed: append-only; a bad row blocks rather than authorizes.    |
| E9   | external (Lovable) + read | §3 below; then the snapshot path (#112 migration and a CI read path, both authorized separately) for the seven database gates.                                                                                                                                                                                                                      | Activation `bridge_identity` PASS (`enforced true`, expected = served); `predem_matrix` 28/28 VERIFIED in **one** activation run of the head of `main`.                                                                                | Restore the previous variable or republish the previous version.      |

Order constraints:

- E1 before any merge touching `/services/cs2-demo-parser/**`, `/src/lib/pipeline/**`, `/scripts/queue/**`,
  `/supabase/migrations/**` or `/.github/workflows/**`. That covers #110, #112 and E5's workflow change.
- E4 before E5, because D is unknowable earlier.
- E7 before E8, because the recorder refuses D until re-pinned.
- E9's bridge value must equal E4's `build.commit`.

## 3. Lovable — what the operator does (nothing is sent from here)

After E4 only:

1. Cloud → Secrets: set `H3E91_EXPECTED_WORKER_BUILD_COMMIT` to the `build.commit` observed in E4 (40 lowercase
   hex characters, no prefix, no spaces). On 2026-10-13 that would be `c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d`,
   but only E4 decides.
2. Publish the version synced from `main` at or after #115 (`e6510c5a`). No code change is needed.
3. Validate from outside: `GET https://gamepro.network/api/public/parser-attestation-runtime`. `bridge` must be
   `{"expectedWorkerBuildCommit":"<E4 build>","configured":true,"enforced":true}`. The Lovable editor's "updated"
   message is not evidence; this response, read by the activation gate, is.

If a prompt to the Lovable agent is unavoidable, use only this text:

> Do not change any code, file, migration or configuration. Do not create or edit secrets. Just confirm which
> GitHub commit the current version is synced to, and stop.

## 4. The 28 pre-DEM gates on `main` `339cc7ce`

Sources:

- H.3-E activation [38359189034](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38359189034): 13/28 VERIFIED, `predem_decision` BLOCKED.
- R5.8.3 [38356033321](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38356033321).
- F553 post-completion [38359168841](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38359168841): CLOSED, issues `[]`.
- Quality Gates [38356033244](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38356033244): success.

Validity: every row is invalidated by a new commit on `main`, a new deployment or a pin change. "Operator
observation" is a read-only query made outside CI: it can show that a gate fails, but it never makes one VERIFIED.

| #   | Gate                          | Collector         | Current evidence                                                                                                           | State      | Next action                             |
| --- | ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------- |
| 1   | inventory_105                 | R5.8.3            | 105 rows, digests equal to the pins                                                                                        | VERIFIED   | —                                       |
| 2   | zero_generic                  | R5.8.3            | 0 generic sources                                                                                                          | VERIFIED   | —                                       |
| 3   | db_git_digest_parity          | managed snapshot  | no CI path; operator observation 03:25Z: release digests equal                                                             | NOT_PROVEN | E9 (snapshot path)                      |
| 4   | mapping_release_valid         | R5.8.3            | release matches the artifact                                                                                               | VERIFIED   | —                                       |
| 5   | canonical_authorization_false | R5.8.3            | 0 authorized rows                                                                                                          | VERIFIED   | —                                       |
| 6   | railway_deployment_exact      | R5.8.3            | `RAILWAY_DEPLOYMENT_BINDING_MISMATCH` (pinned `1b5778de`, serving `c0aa8a55`)                                              | FAIL       | E1–E5                                   |
| 7   | railway_commit_exact          | R5.8.3            | same binding mismatch                                                                                                      | FAIL       | E1–E5                                   |
| 8   | railway_branch_exact          | R5.8.3            | same binding mismatch                                                                                                      | FAIL       | E1–E5                                   |
| 9   | live_version_exact            | R5.8.3            | both hosts: `RUNTIME_IDENTITY_MISMATCH`, `BUILD_REVISION_NOT_EMBEDDED_COMMIT`, `SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD` | FAIL       | E3–E5                                   |
| 10  | live_health_exact             | R5.8.3            | both hosts `{"status":"ok"}`                                                                                               | VERIFIED   | —                                       |
| 11  | critical_hashes_exact         | R5.8.3            | `CRITICAL_HASH_MISMATCH: worker.py` (pinned `50a53b60`, served `ecaac396`)                                                 | FAIL       | E5                                      |
| 12  | hmac_configured               | fresh attestation | none for the serving deployment                                                                                            | NOT_PROVEN | E8                                      |
| 13  | transport_secret_configured   | activation        | 401 without the secret, 400 with it                                                                                        | VERIFIED   | —                                       |
| 14  | railway_token_configured      | R5.8.3            | Railway read succeeded                                                                                                     | VERIFIED   | —                                       |
| 15  | endpoint_configured           | activation        | approved endpoint answers                                                                                                  | VERIFIED   | —                                       |
| 16  | oidc_operational              | fresh attestation | none                                                                                                                       | NOT_PROVEN | E8                                      |
| 17  | oidc_immutable_subject        | R5.8.3            | subject pinned                                                                                                             | VERIFIED   | —                                       |
| 18  | workflow_identity_valid       | R5.8.3            | workflow blob equals the registry                                                                                          | VERIFIED   | —                                       |
| 19  | provenance_verified           | fresh attestation | 3 historical VERIFIED rows, none for `c0aa8a55`                                                                            | NOT_PROVEN | E7, E8                                  |
| 20  | remote_ci                     | activation        | Quality Gates, Main required gates, F553 success at `339cc7ce`                                                             | VERIFIED   | —                                       |
| 21  | python_tests                  | R5.8.3            | focused tests passed                                                                                                       | VERIFIED   | —                                       |
| 22  | persistence_validation        | activation        | disposable probes pass (synthetic, rolled back)                                                                            | VERIFIED   | —                                       |
| 23  | identity_validation           | managed snapshot  | no CI path; operator observation: empty ledger, 0 conflicts                                                                | NOT_PROVEN | E9                                      |
| 24  | retention_guard               | managed snapshot  | operator observation 05:15Z: `deletion_metadata_mismatch = 1` (`docs/H3E_RETENTION_DIAGNOSIS.md`)                          | FAIL       | authorized reconciliation, then E9      |
| 25  | attempt_9_absent              | managed snapshot  | no CI path; operator observation: max attempt 8                                                                            | NOT_PROVEN | E9                                      |
| 26  | metrics_uncontaminated        | managed snapshot  | no CI path; operator observation: 0 rows                                                                                   | NOT_PROVEN | E9                                      |
| 27  | features_uncontaminated       | managed snapshot  | no CI path; operator observation: 0 rows                                                                                   | NOT_PROVEN | E9                                      |
| 28  | canonical_uncontaminated      | managed snapshot  | operator observation: 1 `partial` row before the first VERIFIED provenance → STRICT_PROVENANCE FAIL                        | FAIL       | authorized decision on the row, then E9 |

Totals: **13 VERIFIED, 7 FAIL, 8 NOT_PROVEN.**

Outside the 28 gates:

- `runtime`: FAIL `DECLARED_REVISION_MISMATCH`.
- `bridge_identity`: FAIL, with problems `BRIDGE_IDENTITY_NOT_ENFORCED` and `BRIDGE_EXPECTED_BUILD_MISMATCH`
  (expected `10815fb4`, served `c8c6d6ec`).
- The 4 post-DEM gates: NOT_EVALUATED, since there is no pre-DEM approval.

## 5. Execution log (2026-10-13, owner-authorized)

| Step  | What was done                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1    | Freeze. The autodeploy toggle could not be switched (the Railway agent never executed the write; read-back stayed `enabled:true`). Instead, `watchPatterns` was set to the sentinel `/services/cs2-demo-parser/.railway-deploy-freeze-2026-10-13`. | `describe-service` shows the sentinel. The merges of #118 and #112 (they touch `.github/workflows`, `supabase/migrations`, `src/lib/pipeline` and `scripts/queue`) were SKIPPED with `snapshotId` null. Restore: the five previous patterns (§1.1 of `docs/H3E_RELEASE_STATUS.md`). |
| E3    | `PARSER_BUILD_REVISION=git:c8c6d6ec…`, `PARSER_REVISION=git:10815fb4…` (set with `skipDeploys`), then a redeploy of `c0aa8a55`'s build                                                                                                             | New deployment `09b50029-2508-4267-bb1d-28c5e99b95db`, SUCCESS, commit `c8c6d6ec`. The build reused the image (no pip/build steps in the log).                                                                                                                                      |
| E4    | Read back                                                                                                                                                                                                                                          | Both hosts identical: `build.commit c8c6d6ec`, `build_revision git:c8c6d6ec`, `semantic_revision git:10815fb4`, `declared_revision_matches true`; `/health` ok.                                                                                                                     |
| E5–E6 | #118: repository re-pins, R5.8.9 recorder migration and R5.8.9b boundary migration, all generated from `docs/reference/r5_8_9/spec.json`                                                                                                           | PostgreSQL 17 disposable 7/7; recorder probe 21/21; all required gates green.                                                                                                                                                                                                       |
| E7    | Managed DB, one step at a time, each followed by a read-back: R5.8.7 (no-op), R5.8.8 (no-op), R5.8.9, R5.8.9b, snapshot `20261013120000`. History rows were recorded with `sha256:<file>` keys.                                                    | Recorder `d7c325ba`; `assert_verified_parser_provenance` `b1576ce0`; `enforce_approved_attestation_workflow` `b9412b87`; grants and owner unchanged; head `20261013130100`.                                                                                                         |

Still pinned to the old runtime (diagnostic functions, not among the 28 gates): `h3e91_live_database_evidence`
(1b5778de/3070d8ba) and `r5_real_dem_execution_gate` (`railway_revision` 5703b1d8). Their re-pin is a follow-up.

Pending outside the repository:

1. Lovable publication (the operator's prompt), which carries the app-side pins, the bridge expectation and the snapshot route.
2. Then the fresh attestation (E8).
3. Retention: physical deletion through the Storage API needs the operator. First confirm that `A91_DEMO_URL` does not point at the remaining object, which has the reference DEM's SHA-256.
4. Canonical: the owner decides what happens to the pre-provenance row.
