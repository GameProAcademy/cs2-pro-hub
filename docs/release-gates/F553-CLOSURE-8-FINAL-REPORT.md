# F.5.3-CLOSURE.8-R2 — BLOCKED

**Decision:** BLOCKED. No complete disposable stack installation or integrated lifecycle was demonstrated. No production, Railway, DEM, Attempt 9 or Canonical mutation was performed; `realDemAuthorized=false` and `canonicalAuthorized=false`.

## Corrected classification

The previous PostgreSQL 17.9-only probe failed because `auth` was absent in a plain database. This is **plain_postgres_probe=FAIL**, not evidence that the full stack or the first migration fails. **full_supabase_install=NOT_PROVEN**. The RAW textual-reference preflight is now **NOT_PROVEN**, not proof of a SQL dependency error: a reference inside a stored function body need not resolve at function creation time. RAW equivalence remains limited to two catalog tables and disposable historical privileges, not the desired source security policy or full schema.

## Executed in this revision

- Local synthetic parser suite: **239 passed, 10 skipped**. Targeted H3E91 parser regressions: **52 passed**. No real DEM.
- Isolated writer concurrency: **30 lifecycle cases plus 50 stress executions passed**. These are not integrated races or failures.
- Local full-stack verifier: `python3 scripts/run-f553-closure-8.py` returned `NOT_PROVEN`, 145 migrations expected, 0 integrated races and 0 integrated failures; local full-stack CLI was not present. The executor now requires loopback endpoints, performs a clean local reset, and cannot return success until every mandatory gate has executed proof. The CI workflow uses the pinned official CLI setup and starts/stops a disposable stack; its result has **not** been observed.

## R2 executed attempt and precise blockers

CLI 2.118.0 was downloaded into `/tmp` and executed. `/tmp/f553-r2/supabase start` exited 1: `failed to inspect container health: docker: command not found (podman also not found)`. The verifier was rerun with the installed CLI, exited 1 and recorded `Local disposable stack not running; full-stack reset was not executed`; source migration count 145, applied count 0. This is a **failed stack-start attempt**, not a failed migration. The runner now compares ordered applied/source versions exactly and contains a real temporary pgmq visibility/ACK probe, but that probe could not run. CI uploads actual disposable evidence when its workflow runs; no run ID/conclusion is observed. R2 parser, Docker, production-output browser, and integrated matrices were not executed; prior R1 results do not count as R2 proof. `f553-closure-8-final.json` contains the exact blocker fields. Attempted source revision: `b7991b875fd6c1fce969c207416b76641d22a9cd`; **FINAL_COMMIT and FINAL_CI_RUN remain unverified**. Production and Railway remained untouched.

## Mandatory proof state

Full schema, pgmq, PostgREST, Storage, FINISHED, ACK loss, fresh worker, FAILED, ABORTED, queue idempotency, HOT/RAW identity, RAW integrity, parser exactly once, 50 integrated races, 50 integrated failures, Docker runtime and production-output browser: **NOT_PROVEN**. The runner's service-presence checks do not count as integrated execution. **FINAL_COMMIT / FINAL_CI_RUN / FINAL_CI_CONCLUSION: NOT_PROVEN**. Existing historical read-only counts (ledger 0, RAW artifacts 2, RAW chunks 49) were not promoted to closure evidence and the full production audit was not repeated.

Exact commands, outputs, file locations and next actions for the unresolved gates are recorded in `f553-closure-8-final.json`. No synthetic case was marked executed and no missing proof was called PASS.
