# H.3-E activation gate

Replaces `.github/workflows/h3-e5-transport-deployment-proof.yml` and
`.github/workflows/h3-e6-activation-one-shot.yml` with
`.github/workflows/h3-e-activation-gate.yml` and
`scripts/ci/h3e_activation_gate.py`.

A green gate is evidence, not authorization. A PASS authorizes no attestation,
no real demo, no Attempt 9 and no Canonical write. Those stay manual and gated
elsewhere.

## Why the old workflows had to go

Both ran on every push to `main`, but their only job was conditioned on one
fixed previous head:

| Workflow                           | Condition                                                      | Runs     | Result        |
| ---------------------------------- | -------------------------------------------------------------- | -------- | ------------- |
| H.3-E.5 Transport Deployment Proof | `github.event.before == 'ae328df8…'` (merge of PR #34, 24 Sep) | last 100 | 100 `skipped` |
| H.3-E.6 One-Shot Activation        | `github.event.before == '56faeb6a…'` (24 Sep)                  | last 100 | 100 `skipped` |

They were armed for one push each on 24 Sep and could never run again.
Neither one appears as a non-skipped run in the last 100 runs of either
workflow. A skipped job shows as a skipped check, and nothing consumed its
result, so these workflows produced no evidence on any later commit. H.3-E.6
existed only to dispatch H.3-E.3 once; H.3-E.5 probed transport and then also
dispatched H.3-E.3. Both needed `actions: write`.

## Dependency map

| Workflow                             | Trigger                                                | What it does                                                | Side effects       |
| ------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------- | ------------------ |
| Quality Gates                        | push, PR                                               | tests, lint, build, R11.2; `Main required gates` aggregates | none               |
| F553 R11.2 post-completion           | `workflow_run` of Quality Gates                        | attests the finished Quality Gates run                      | none               |
| R5.8.3 Read-Only Release Preflight   | push to main                                           | release bindings; writes `decision` into an artifact        | none               |
| R5.8.4 Read-Only Gate Reconciliation | `workflow_run` of R5.8.3 success                       | reconciles 32 gates from the R5.8.3 artifact                | none               |
| H.3-E.3 Final External Preflight     | manual                                                 | secret presence, unauthenticated probe, endpoints           | none               |
| **H.3-E activation gate (new)**      | `workflow_run` of F553 post-completion success; manual | everything below                                            | none               |
| Parser Runtime Attestation           | manual                                                 | **submits** a signed attestation                            | writes attestation |

## What the gate checks, for the current head of main

| Stage                                                       | PASS only if                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                                                    | the commit is a full SHA and is the current head of `main`                                                                                                                                                                                                                                                             |
| `quality_gates`, `f553_post_completion`, `r5_8_3`, `r5_8_4` | the latest run (reruns included) for that commit, branch `main`, this repository, expected event, is `completed` / `success`                                                                                                                                                                                           |
| `main_required_gates`                                       | the job `Main required gates` in that Quality Gates run succeeded                                                                                                                                                                                                                                                      |
| `r5_8_3_artifact`, `r5_8_4_artifact`                        | exactly one artifact with the expected name, produced by that run, SHA-256 equal to the API digest, one JSON file                                                                                                                                                                                                      |
| `r5_8_3_decision`                                           | evidence for this commit, `side_effects: false`, `decision: GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT`, no failures                                                                                                                                                                                                        |
| `r5_8_4_decision`                                           | bound to that R5.8.3 run and commit, `decision: READY_FOR_OPERATOR_REVIEW`, no blockers, no authorization claimed                                                                                                                                                                                                      |
| `transport`                                                 | all four secrets present; endpoint exactly the approved one; `POST {}` **without** the transport secret → `401 UNAUTHORIZED`; with it → `400 ATTESTATION_PAYLOAD_INVALID`. Nothing else is ever sent                                                                                                                   |
| `runtime`                                                   | `/health` = `ok` and `/version` on both hosts; one embedded build commit, `source` railway or build-arg, `declared_revision_matches: true`; Railway's active successful deployment has that commit; that commit is an ancestor of the target; `services/cs2-demo-parser` tree of the build commit = tree of the target |

The runtime stage is what makes a push without worker changes keep its gate:
the image built from `10815fb4` is accepted for `7e6eb463` because both have
worker tree `8120c12a…`, not because of its label. When the worker tree changes
and the image is not rebuilt, the stage fails with `WORKER_TREE_DIFFERS`.

Statuses: `PASS`, `FAIL`, `BLOCKED`, `SKIPPED`. Decision `PASS` only when every
stage is `PASS`; any `FAIL` gives `FAIL`; otherwise `BLOCKED`. `SKIPPED` is
never evidence. The job succeeds only on `PASS`, and the evidence artifact
`h3e-activation-gate-<sha>-<run_id>-<attempt>` is uploaded in every case.

Manual runs (`workflow_dispatch` on `main`) evaluate the same commit rules, so
they cannot skip a prerequisite or certify an older commit. Reruns are
idempotent: no state is written anywhere, and each attempt gets its own
artifact name.

## Tests

`scripts/ci/test_h3e_activation_gate.py`, 28 cases, offline (all network and
git calls go through a fake). It runs inside `Main required gates` on every PR
and push, and as the first step of the gate itself.

| Required case                               | Test                                                                                                                                                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 normal push passes                        | `test_complete_green_state_passes_and_records_evidence`                                                                                                                                                                                                     |
| 2 push without worker change keeps the gate | `test_push_without_worker_change_passes_on_tree_identity_not_on_build_label`, `test_worker_tree_changed_but_image_not_rebuilt_fails`                                                                                                                        |
| 3 missing secret                            | `test_missing_secret_fails_closed_without_exposing_values`, `test_unapproved_endpoint_fails`                                                                                                                                                                |
| 4 transport rejected                        | `test_transport_rejected_blocks_activation`, `test_endpoint_accepting_requests_without_secret_fails`, `test_server_not_configured_fails`                                                                                                                    |
| 5 endpoint unavailable                      | `test_unreachable_endpoints_block`, `test_railway_unverified_blocks`, `test_runtime_identity_problems_fail`                                                                                                                                                 |
| 6 wrong or old artifact                     | `test_artifact_for_another_commit_is_rejected`, `test_tampered_artifact_is_rejected`, `test_artifact_produced_by_another_run_is_rejected`, `test_missing_artifact_blocks`, `test_run_for_another_commit_or_repository_is_not_evidence`                      |
| 7 dependency failed or skipped              | `test_dependent_gate_failed_skipped_or_running_blocks_activation`, `test_skipped_aggregate_job_inside_green_workflow_fails`, `test_green_check_with_blocked_decision_fails`, `test_r584_blocked_or_bound_to_another_run_fails`, `test_latest_rerun_decides` |
| 8 rerun                                     | `test_rerun_is_idempotent_and_read_only`                                                                                                                                                                                                                    |
| 9 manual run                                | `test_manual_dispatch_cannot_skip_prerequisites_or_target_an_old_commit`                                                                                                                                                                                    |
| 10 success recorded                         | `test_complete_green_state_passes_and_records_evidence`                                                                                                                                                                                                     |

## Expected first result: not PASS

R5.8.3 is green on `7e6eb463`, but its decision is almost certainly `BLOCKED` (inference: the artifact cannot be downloaded from where this was written, but the inputs are public). Its pins in
`scripts/parser_runtime_attestation.py` still name the retired deployment
`1b5778de` (Railway status now `REMOVED`) and require `build_revision`
`git:5703b1d…`, while the worker reports `git:10815fb4…`. The verification
step pipes into `tee` under the default `bash -e` shell (no `pipefail`), so
the job stays green when the script exits 1. This
gate reads the decision and will report `r5_8_3_decision: FAIL`. That is the
correct outcome until the attestation pins are moved to the homologated image,
which is a release-identity change (app, database pins, attestation workflow
registry) outside this change.
