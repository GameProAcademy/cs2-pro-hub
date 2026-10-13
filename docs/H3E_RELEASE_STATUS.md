# H.3-E release status — runtime, gates, managed database (2026-10-13)

Read-only observations at the times given; nothing here was changed outside GitHub.
Gate contract: `docs/H3E_PREDEM_POSTDEM_GATES.md` (generated from `GATE_SPECS`).

## 1. Deploy containment for `cs2-demo-parser` (proposal — not executed)

### 1.1 Facts (Railway API, read-only)

- Service config: source `GameProAcademy/cs2-pro-hub@main`, `rootDirectory: services/cs2-demo-parser`,
  `checkSuites: false`, Dockerfile builder, `watchPatterns`:
  `/services/cs2-demo-parser/**`, `/src/lib/pipeline/**`, `/scripts/queue/**`, `/supabase/migrations/**`, `/.github/workflows/**`.
- The image depends only on the build context `services/cs2-demo-parser` and the `BUILD_COMMIT_SHA` build
  argument (`services/cs2-demo-parser/Dockerfile`); the other four patterns describe files that are not in the image.
- History of the 50 latest deployments (2026-09-16 → 2026-10-13):

| Push                                      | Watched path in the pushed commits                                                                  | Railway outcome                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| #92, #95, #96, #102                       | none                                                                                                | `SKIPPED`, no snapshot (immediate)        |
| #93, #94, #97, #98, #99, #100, #101, #103 | yes (`.github/workflows/**`, `supabase/migrations/**`, or via a merge-of-main commit in the branch) | snapshot, build scheduled, then `SKIPPED` |
| #104 (`c8c6d6ec`, 01:35:16)               | yes (`.github/workflows/h3-e-activation-gate.yml`)                                                  | **deployed → `c0aa8a55` SUCCESS**         |
| #90 (`10815fb4`)                          | yes (`services/cs2-demo-parser/**`)                                                                 | deployed (expected)                       |

### 1.2 Cause

- **Proven:** a push whose commits touch no watched path is skipped before any build; a push touching a
  watched path is scheduled for a build.
- **Hypothesis H1 (supported, not proven):** a scheduled build is normally skipped as a duplicate of the
  serving image; #104 is the only scheduled push that deployed and the only one that arrived 3 s after
  another push still being evaluated (#103, `11a1144f`, 01:35:13 → SKIPPED 01:35:19). Railway does not
  publish the skip reason (build logs show only `scheduling build`).
- Either way, `/.github/workflows/**`, `/src/lib/pipeline/**`, `/scripts/queue/**` and
  `/supabase/migrations/**` can trigger a rebuild of an image that does not contain them.

### 1.3 Proposal (each option needs specific authorization)

|            | Option A — narrow watch patterns                                                                                        | Option B — disable automatic deploys from `main`                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Change     | `watchPatterns = ["/services/cs2-demo-parser/**"]`                                                                      | disconnect the branch trigger (deploy only by explicit action)                                                                                 |
| Effect     | only worker changes schedule builds                                                                                     | no merge ever deploys; every deploy is deliberate                                                                                              |
| Risk       | a worker change still auto-deploys (intended); H1 race still possible for worker changes                                | worker fixes need a manual deploy; forgotten deploys leave `main` ahead of production (the activation gate's `WORKER_TREE_DIFFERS` reports it) |
| Downtime   | none (config only)                                                                                                      | none (config only)                                                                                                                             |
| Validation | merge a docs-only PR and a workflow-only PR one at a time → both `SKIPPED` with no snapshot; `/version` build unchanged | merge any PR → no new deployment; `list-deployments` unchanged                                                                                 |
| Rollback   | restore the five patterns                                                                                               | reconnect the trigger                                                                                                                          |

Recommended: **B until the re-pin is complete**, then A. Until then, the rule applied in this repository:
merge only PRs whose every commit touches no watched path, one at a time, and confirm the Railway outcome
(`SKIPPED`, no snapshot) before the next merge.

## 2. Runtime identity (read-only, 2026-10-13 01:46–02:06 UTC)

| Item                                                    | Observed                                                                                            | Source                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Serving deployment                                      | `c0aa8a55-a2a8-43e4-924e-0966171cddcf`, SUCCESS, branch `main`, commit `c8c6d6ec…`                  | Railway                                                   |
| Previous deployment                                     | `3ad4b1fe…` (commit `10815fb4…`), now REMOVED, `canRollback: true`                                  | Railway                                                   |
| Image build commit                                      | `c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d`                                                          | `/version` `build.commit`                                 |
| Declared build revision (`PARSER_BUILD_REVISION`)       | `git:10815fb4…`                                                                                     | `/version`                                                |
| Declared semantic revision (`PARSER_REVISION`)          | `git:5703b1d8…`                                                                                     | `/version`                                                |
| `declared_revision_matches`                             | **false**                                                                                           | `/version`                                                |
| Worker tree of `c8c6d6ec` / `10815fb4` / `5703b1d8`     | `8120c12a` / `8120c12a` / `bf25eb86`                                                                | git                                                       |
| `/health`                                               | `{"status":"ok"}`                                                                                   | worker                                                    |
| Critical blobs pinned vs deployed                       | pinned `worker.py 50a53b60` (from `91aeee85`); deployed `ecaac396`                                  | git                                                       |
| Bridge expectation `H3E91_EXPECTED_WORKER_BUILD_COMMIT` | **not observable from GitHub/CI** (Lovable variable)                                                | `src/lib/pipeline/h3e91ExecutionBridge.server.ts:115-124` |
| Bridge compatibility                                    | served events carry `workerBuildCommit = c8c6d6ec`; accepted only if the Lovable variable equals it | same                                                      |
| Production executions since the deploy                  | none (`demo_jobs` last update 2026-09-22; H3E91 ledger empty)                                       | managed DB, read-only                                     |

Verdict: **ambiguous / not proven.** Code served is the reviewed tree `8120c12a`, but the declared semantic
revision does not describe it, the declared build revision is not the image's, and bridge compatibility
cannot be established from GitHub.

## 3. The 32 gates on `main` `c8c6d6ec` (before #106/#107)

Sources: R5.8.3 [38332835508](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38332835508),
R5.8.4 [38332859759](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38332859759),
activation [38334054129](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38334054129),
F553 post-completion [38334037472](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38334037472).
Every pre-DEM item is invalidated by a new commit on `main`, a new deployment or a pin change; post-DEM items by
a parser, contract or DEM change.

| #   | Gate                          | Phase | State       | Objective reason                                                                                                                               | Next action           |
| --- | ----------------------------- | ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | inventory_105                 | pre   | VERIFIED    | computed 105 rows, digests match                                                                                                               | —                     |
| 2   | zero_generic                  | pre   | VERIFIED    | computed 0 generic rows                                                                                                                        | —                     |
| 3   | db_git_digest_parity          | pre   | NOT_PROVEN  | no CI collector (operator observation 02:06 UTC: managed release `cf0549c2…` digests = git pins)                                               | §4 collector          |
| 4   | mapping_release_valid         | pre   | VERIFIED    | artifact matches pins                                                                                                                          | —                     |
| 5   | canonical_authorization_false | pre   | VERIFIED    | computed 0 authorized                                                                                                                          | —                     |
| 6   | railway_deployment_exact      | pre   | NOT_PROVEN  | pinned `1b5778de` is REMOVED; serving `c0aa8a55`                                                                                               | re-pin (§5)           |
| 7   | railway_commit_exact          | pre   | NOT_PROVEN  | requires the pinned deployment to be serving                                                                                                   | re-pin                |
| 8   | railway_branch_exact          | pre   | NOT_PROVEN  | same                                                                                                                                           | re-pin                |
| 9   | live_version_exact            | pre   | NOT_PROVEN  | semantic `5703b1d8` ≠ tree; build `c8c6d6ec` ≠ declared                                                                                        | E1 + re-pin           |
| 10  | live_health_exact             | pre   | VERIFIED    | both hosts `{"status":"ok"}`                                                                                                                   | —                     |
| 11  | critical_hashes_exact         | pre   | NOT_PROVEN  | pins are the `5703b1d8`/`91aeee85` blobs                                                                                                       | re-pin                |
| 12  | hmac_configured               | pre   | NOT_PROVEN  | needs a fresh attestation of the serving runtime                                                                                               | E3                    |
| 13  | transport_secret_configured   | pre   | VERIFIED    | activation transport stage PASS                                                                                                                | —                     |
| 14  | railway_token_configured      | pre   | VERIFIED    | read-only Railway query succeeded                                                                                                              | —                     |
| 15  | endpoint_configured           | pre   | VERIFIED    | activation transport stage PASS                                                                                                                | —                     |
| 16  | oidc_operational              | pre   | NOT_PROVEN  | needs a fresh attestation                                                                                                                      | E3                    |
| 17  | oidc_immutable_subject        | pre   | VERIFIED    | subject pinned in `src/lib/parserAttestation.ts`                                                                                               | —                     |
| 18  | workflow_identity_valid       | pre   | VERIFIED    | workflow blob = registry                                                                                                                       | —                     |
| 19  | provenance_verified           | pre   | NOT_PROVEN  | 0 VERIFIED rows for the serving deployment (3 historical rows, other deployments)                                                              | E2 + E3               |
| 20  | remote_ci                     | pre   | NOT_PROVEN  | F553 post-completion BLOCKED: `R11_FAILURE_MATRIX_REPEATED_FIXTURES:1_fixtures_shared_by_20_cases`                                             | #106                  |
| 21  | python_tests                  | pre   | VERIFIED    | R5.8.3 focused-test step success                                                                                                               | —                     |
| 22  | python_wasm_parity            | post  | NOT_STARTED | output of the laboratory run                                                                                                                   | A9.1 after pre-DEM    |
| 23  | determinism                   | post  | NOT_STARTED | same                                                                                                                                           | same                  |
| 24  | persistence_validation        | pre   | VERIFIED    | queue probes PASS on `c8c6d6ec` (disposable database)                                                                                          | —                     |
| 25  | identity_validation           | pre   | NOT_PROVEN  | no CI collector (observation: H3E91 ledger empty)                                                                                              | §4                    |
| 26  | tick_authority                | post  | NOT_STARTED | output of the laboratory run                                                                                                                   | A9.1                  |
| 27  | retention_guard               | pre   | NOT_PROVEN  | no CI collector                                                                                                                                | §4                    |
| 28  | attempt_9_absent              | pre   | NOT_PROVEN  | no CI collector (observation: max attempt 8, none ≥ 9)                                                                                         | §4                    |
| 29  | metrics_uncontaminated        | pre   | NOT_PROVEN  | no CI collector (observation: `match_metrics` empty)                                                                                           | §4                    |
| 30  | features_uncontaminated       | pre   | NOT_PROVEN  | no CI collector (observation: `match_features` empty)                                                                                          | §4                    |
| 31  | canonical_uncontaminated      | pre   | NOT_PROVEN  | no CI collector; observation: **1 match `canonical_status = 'partial'`**; criterion for "contaminated" not defined precisely in the repository | define criterion + §4 |
| 32  | runtime_frozen                | post  | NOT_STARTED | output of the laboratory run                                                                                                                   | A9.1                  |

Pre-DEM: **12 of 28 VERIFIED, 16 NOT_PROVEN.** Post-DEM: 4 NOT_STARTED. Operator observations are not CI
evidence and never turn a gate VERIFIED.

## 4. Read-only collector for the managed-database gates (proposal — needs authorization)

Minimal scope: one `STABLE SECURITY DEFINER` function, `search_path = ''`, `EXECUTE` for `service_role` only,
returning aggregates and digests, never rows:

| Gate                                             | Aggregate                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| db_git_digest_parity                             | `inventory_digest`, `matrix_digest`, `row_count`, `generic_count`, `authorized_count` of the authoritative release |
| attempt_9_absent                                 | `max(attempt_number)`, count of `demo_jobs` with `attempt_number >= 9`, count of Attempt-9 reservations            |
| metrics_uncontaminated / features_uncontaminated | row counts of `match_metrics` / `match_features` without a VERIFIED provenance of the serving runtime              |
| canonical_uncontaminated                         | count of `matches` by `canonical_status` and provenance (criterion to be defined first)                            |
| identity_validation                              | count of conflicting execution identities in `h3e91_execution_evidence_ledger`                                     |
| retention_guard                                  | output of the existing `get_demo_retention_metrics` aggregate                                                      |

Access: reached by the activation gate through an authenticated application endpoint (like the attestation
endpoint) with a dedicated CI secret, or a dedicated database role allowed to execute only that function.
Requires: a migration (managed database), a secret (GitHub + Lovable), an endpoint (application). Each is an
external change; none was made. The personal Supabase is never a substitute.

## 5. R5.8.7 / R5.8.8 / R5.8.9

|                                  | R5.8.7 (`20261012200000`)                         | R5.8.8 (`20261012210000`)                                                     | R5.8.9 (not written)                                                            |
| -------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Expected in code                 | recorder md5 `fe3250af…`                          | no deployment-identity unique index; digest key + nonce PK kept               | recorder pinned to the serving runtime                                          |
| Managed DB (read-only 01:35 UTC) | recorder `fe3250af…`; version not recorded        | index absent; replay controls present; version not recorded                   | —                                                                               |
| Divergence                       | none in definition; history row missing           | none in state; history row missing                                            | recorder pins removed `1b5778de`/`91aeee85`/`5703b1d8`/`50a53b60`               |
| Prerequisite                     | md5 `fe3250af` or `5ea1ffff`                      | R5.8.7 applied                                                                | R5.8.7 + R5.8.8; a deliberate, frozen deployment (§1)                           |
| Effect                           | none on managed DB (no-op + history row)          | none on managed DB (no-op + history row)                                      | function body only; no row, grant or index                                      |
| Verification                     | md5, properties, grants, comment                  | index absent, controls present, md5                                           | md5 target, fresh attestation of the new runtime accepted, removed one rejected |
| Rollback                         | repository builds only; refuses on the managed DB | repository builds only; refuses on the managed DB; never deletes attestations | to `fe3250af`, allowed on managed DB                                            |
| Evidence so far                  | disposable PG16/PG17 only (20/20)                 | same                                                                          | none                                                                            |

A no-op on the managed database proves nothing by itself; the read-only preflight does.
R5.8.9 cannot be written before the deployment it pins exists deliberately (§1, E1).

## 6. Real-DEM paths

`a91-real-dem-gate.yml` and `a91-wasm-large-demo-remediation.yml` are the only workflows that can process the
real DEM (`A91_DEMO_URL`, `rebuild_wasm_large_demo.py`, `execute.py`). Both start with `predem-approval`
(required run id, no default; newest completed activation run; current head of main; PASS +
`READY_FOR_PREDEM_REVIEW`; ≤ 6 h; intact artifact; laboratory dispatch only); with #107, also the approved
runtime must still be serving. `scripts/tests/test_a91_predem_postdem.py` fails if any such workflow lacks it.
Size and SHA-256 of the DEM are validated before processing (`scripts/a91/execute.py:90-102`). The file's
availability can only be checked by the run itself (signed URL in a secret); last verified 2026-10-11
(run 38112341484), not now.

## 7. External operations pending

| #   | Operation                                                                                                                                                                  | Why                                                        | Authorization                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| X1  | Deploy freeze (§1, option B or A)                                                                                                                                          | merges can rebuild the worker                              | Railway config                           |
| X2  | Decide the serving runtime: keep `c0aa8a55` or roll back to `3ad4b1fe`                                                                                                     | identity changed by #104                                   | Railway rollback, or none                |
| X3  | Set `PARSER_BUILD_REVISION = git:<serving image commit>` and `PARSER_REVISION = git:10815fb44e165963adfaf07f71c474ca628f4b7f` (or any commit of main with tree `8120c12a`) | `declared_revision_matches=false`; semantic revision false | Railway variables (creates a deployment) |
| X4  | Set Lovable `H3E91_EXPECTED_WORKER_BUILD_COMMIT` to the serving image commit                                                                                               | bridge rejects other builds with 503                       | Lovable variable                         |
| X5  | Re-pin PR + R5.8.9, then apply R5.8.7, R5.8.8, R5.8.9 to the managed DB                                                                                                    | recorder pins the removed runtime                          | managed DB migrations                    |
| X6  | Fresh attestation through the approved workflow                                                                                                                            | gates 12, 16, 19                                           | production write (one VERIFIED row)      |
| X7  | Read-only managed-DB collector (§4), and a precise criterion for `canonical_uncontaminated`                                                                                | gates 3, 25, 27–31                                         | migration + secret + endpoint            |
