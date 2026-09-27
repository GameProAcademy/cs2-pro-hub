# F.5.3-CLOSURE.8-R4 — BLOCKED

## R4 execution and CI blocker

EXECUTED: `python3 -m py_compile scripts/run-f553-closure-8.py` succeeded; `python3 scripts/run-f553-closure-8.py` exited 1, reporting `[Errno 2] No such file or directory: 'supabase'`, 145 source migrations and zero integrated races/failures. The run produced fresh blocked full-schema and decision records with one shared run ID, timestamps and explicit non-authorizing locks. The workflow now checks Docker, Supabase CLI version and disposable inputs before startup and shares one run identity. The verifier rejects stale matrix entries that differ in commit or workflow run. These source changes were validated locally, not executed in GitHub Actions.

FAIL: No clean disposable Supabase installation or integrated scenario executed in this R4 run. `supabase`, Docker and authenticated GitHub Actions execution are unavailable in this environment; the repository remote is a private project mirror and there is no accessible GitHub connector. This does not establish a SQL migration failure. The existing CI job has no integrated lifecycle harness; its limited queue probe is not FINISHED/ACK-loss proof, and the verifier intentionally exits nonzero rather than marking unexecuted gates PASS. The workflow cannot attest its own final conclusion from inside its running job. R4 cannot be declared CLOSED or CI-ready solely on workflow configuration. The missing external access alone is not the only blocker: the real integrated harness, 50+50 distinct executed cases, Docker/browser proof and final-CI sealing must still be implemented and executed.

NOT_PROVEN: full 145-migration install, PGMQ/PostgREST/Storage integrations, FINISHED, ACK loss, fresh worker, FAILED, ABORTED, idempotency, HOT/RAW identity, RAW integrity, exactly-once, race 0/50, failure 0/50, Docker, browser and exact-revision CI run/conclusion. Previous R3 parser and writer-only tests are historical, not R4 integrated or final CI proof. Production and Railway unchanged; real DEM, Attempt 9 and Canonical remain locked. **Decision: BLOCKED.**

## R3 executed evidence and remaining blockers

Current source revision at the start of this attempt: `2350933a5e462c2579cc34f292286e6a8612b58a`. The complete synthetic parser suite was rerun in a newly created disposable virtual environment: `239 passed, 10 skipped, 161 warnings in 3.42s`; no real DEM was used. The matrix verifier now requires a fresh run ID and time, distinct case identities, before/after digests and actual evidence. Its fresh-matrix rejection check passed. `python3 scripts/run-f553-closure-8.py` exited 1 with `No such file or directory: 'supabase'`, 145 source migrations, zero integrated race and failure cases. The earlier R2 CLI stack-start failure is historical, not current proof of a migration failure.

This checkout's Git remote is a private project mirror rather than an authenticated GitHub Actions remote; no GitHub token or CLI is present. A public query to `GameProAcademy/cs2-pro-hub` returned HTTP 404, so no final-revision workflow run or conclusion could be retrieved. The configured F553 job executes a reset and a limited queue probe, but no real integrated lifecycle/matrix harness exists to make its mandatory gates pass. Production and Railway were not changed. Full-stack schema equivalence, FINISHED, ACK-loss fresh-worker recovery, FAILED/ABORTED, Docker runtime and production-output browser remain **NOT_PROVEN**; the parser test result is local R3 proof only, not final-CI proof. `FINAL_COMMIT`, `FINAL_CI_RUN` and `FINAL_CI_CONCLUSION` remain unverified. Exact blockers are in the machine-readable decision.

**Decision:** BLOCKED. No complete disposable stack installation or integrated lifecycle was demonstrated. No production, Railway, DEM, Attempt 9 or Canonical mutation was performed; `realDemAuthorized=false` and `canonicalAuthorized=false`.

## Corrected classification

The previous PostgreSQL 17.9-only probe failed because `auth` was absent in a plain database. This is **plain_postgres_probe=FAIL**, not evidence that the full stack or the first migration fails. **full_supabase_install=NOT_PROVEN**. The RAW textual-reference preflight is now **NOT_PROVEN**, not proof of a SQL dependency error: a reference inside a stored function body need not resolve at function creation time. RAW equivalence remains limited to two catalog tables and disposable historical privileges, not the desired source security policy or full schema.

## Previous R1 results (not R2 proof)

- Local synthetic parser suite: **239 passed, 10 skipped**. Targeted H3E91 parser regressions: **52 passed**. No real DEM.
- Isolated writer concurrency: **30 lifecycle cases plus 50 stress executions passed**. These are not integrated races or failures.
- The R1 verifier returned `NOT_PROVEN`, 145 migrations expected, 0 integrated races and 0 integrated failures. Its service-presence checks are not integrated proof.

## R2 executed attempt and precise blockers

CLI 2.118.0 was downloaded into `/tmp` and executed. `/tmp/f553-r2/supabase start` exited 1: `failed to inspect container health: docker: command not found (podman also not found)`. The verifier was rerun with the installed CLI, exited 1 and recorded `Local disposable stack not running; full-stack reset was not executed`; source migration count 145, applied count 0. This is a **failed stack-start attempt**, not a failed migration. The runner now compares ordered applied/source versions exactly and contains a real temporary pgmq visibility/ACK probe, but that probe could not run. CI uploads actual disposable evidence when its workflow runs; no run ID/conclusion is observed. R2 parser, Docker, production-output browser, and integrated matrices were not executed; prior R1 results do not count as R2 proof. `f553-closure-8-final.json` contains the exact blocker fields. Attempted source revision: `b7991b875fd6c1fce969c207416b76641d22a9cd`; **FINAL_COMMIT and FINAL_CI_RUN remain unverified**. Production and Railway remained untouched.

## Mandatory proof state

Full schema, pgmq, PostgREST, Storage, FINISHED, ACK loss, fresh worker, FAILED, ABORTED, queue idempotency, HOT/RAW identity, RAW integrity, parser exactly once, 50 integrated races, 50 integrated failures, Docker runtime and production-output browser: **NOT_PROVEN**. The runner's service-presence checks do not count as integrated execution. **FINAL_COMMIT / FINAL_CI_RUN / FINAL_CI_CONCLUSION: NOT_PROVEN**. Existing historical read-only counts (ledger 0, RAW artifacts 2, RAW chunks 49) were not promoted to closure evidence and the full production audit was not repeated.

Exact commands, outputs, file locations and next actions for the unresolved gates are recorded in `f553-closure-8-final.json`. No synthetic case was marked executed and no missing proof was called PASS.
