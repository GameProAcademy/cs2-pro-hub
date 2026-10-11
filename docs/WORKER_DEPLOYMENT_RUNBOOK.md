# Worker deployment runbook

State on 2026-10-11, 20:50 UTC. The production worker was **not** replaced.
This file says why, what was verified, and the exact sequence that replaces it.

## What is running

| Item              | Value (Railway, read-only)                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| Service           | `cs2-demo-parser`, environment `production`                                |
| Branch            | `infra/cs2-parser-worker-v8` (head `b957557`)                              |
| Active deployment | `1b5778de-3eaf-46f1-9ea5-cba381d95313`, commit `91aeee8`, `SUCCESS`, 5 Oct |
| Start command     | `python worker_main.py`; health check `/health`, 30 s                      |
| Limits            | 4 vCPU, 4,000,000,000 bytes, 1 replica, restart `ALWAYS`                   |
| Wait for CI       | off (`checkSuites: false`)                                                 |
| Staged patch      | `d66b5a12-a69e-4b9a-87b6-314f75c471cc`, `STAGED` since 16 Sep              |

Unchanged by this work: same values before and after.

## Why a worker from `main` cannot go to production today

Two gates in the application, both reachable only by publishing the app:

1. `src/lib/pipeline/parser/adapter.ts:55-56` accepts one worker revision,
   `git:5703b1d…`, unless `DEMO_PARSER_EXPECTED_REVISION` is set on the app.
   Any other worker is answered `PARSER_IDENTITY_MISMATCH`.
2. `src/lib/pipeline/h3e91ExecutionBridge.server.ts:109-110` answers
   `503 H3E91_DEPLOYED_SOURCE_PARITY_UNVERIFIED` to every durable execution
   event when `NODE_ENV=production`. The worker on `main` records an intent
   before it parses and stops when that fails (fail-closed), so it would parse
   nothing.

A worker from `main` deployed now would be healthy and would fail every job.
The deployed worker (`91aeee8`) is outside the ledger and keeps working with
the published app. Replacing it is therefore a regression until the app side
is promoted, and the app is published through Lovable, which this work may not
instruct.

Which revision of the app is published is not readable from here. Lovable
reports the project at `258b6145` (it follows `main`) and "published"; it does
not report the published commit.

## Deploy branch: decision

`main`, root `services/cs2-demo-parser`, Dockerfile `CMD`
(`uvicorn app:app`), no start-command override. It is the only tree that
Quality Gates, R11.2 and the end-to-end queue probe exercise, and it carries
the isolation, build identity and temp-file fixes. `infra/cs2-parser-worker-v8`
stays as the rollback source until the first `main` deployment is proven, then
it is retired. Not switched yet: see the sequence.

`main` already has a `push` workflow that covers the worker (`Quality Gates`:
`Contract-sensitive parser tests`, `F553 R11.2 EXECUTION`, which builds the
image and checks its file allowlist and build identity). It is not filtered by
path, so Wait for CI does not depend on a path-filtered workflow.

## Wait for CI

Railway (docs, read 2026-10-11): with Wait for CI on, a deployment waits for
every GitHub Actions check suite of the commit; a failed workflow skips the
deployment; a skipped workflow never blocks; a cancelled one blocks only if no
other workflow succeeded.

Verified here:

- The connected branch has three `push` workflows (`CS2 Parser CI`,
  `CS2 Parser Worker CI`, `Quality Gates`), so the toggle is available.
- A deliberately broken change on the throwaway branch
  `infra/cs2-parser-worker-v8-ci-probe` (`cedec0f`, one failing test) made
  `Parser worker tests` fail (run `38170785743`). That branch is not
  connected to Railway; no deployment was created.
- The commit that is in production, `91aeee8`, has `CS2 parser tests` and
  `Web tests / lint / build` failed. With Wait for CI on it would not have
  been deployed.

Not done: the toggle itself. It exists only in the Railway dashboard (service
→ Settings → Source → Wait for CI); the API used here does not expose it.
Turning it on is safe at any time: it can only skip deployments.

## Staged patch `d66b5a12`

One change: the key `deploy` set to `{}` in the environment patch. The live
configuration already has a populated `deploy` block; an empty object merged
onto it changes no field. It is a leftover of an edit that was reverted in the
dashboard without discarding the draft. Decision: **discard**. Applying it
("Deploy" on the staged-changes banner) would change nothing in the
configuration but would start a new production deployment of the branch head.
Discarding is a dashboard action (the banner's "Discard"); the API used here
can only apply a patch, so it was left untouched rather than applied.

## Sequence that replaces the worker

Each step is reversible until the next one starts.

| #   | Step                                                                                                                                             | Who / where               | Check before going on                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Schema                                                                                                                                           | done, managed database    | hashes in `QUEUE_RECOVERY_ROLLOUT.md`                                               |
| 2   | Turn on Wait for CI; discard the staged patch                                                                                                    | owner, Railway dashboard  | `checkSuites: true`; no staged patch                                                |
| 3   | Create a second Railway service from `main` (same variables, no public job traffic), deploy it                                                   | owner or automation       | `/version`: `build.commit` = the `main` SHA, `build.embedded` = true; `/health` 200 |
| 4   | Smoke test that service through `/v1/runtime/preflight` and the public fixture, against the bridge of a non-production app build                 | automation                | same 14 scenarios as CI; no row in the production database                          |
| 5   | Decide the two app gates in a pull request: replace the constant 503 by a check of the worker's reported build commit; set the expected revision | reviewed change on `main` | unit tests; end-to-end probe with `NODE_ENV=production` on the bridge host          |
| 6   | Publish the app                                                                                                                                  | owner, Lovable            | published app answers the new worker's events                                       |
| 7   | Point `cs2-demo-parser` at `main`, remove the start-command override, deploy                                                                     | owner or automation       | new deployment `SUCCESS`; `/version` commit; `/health`; preflight                   |
| 8   | One disposable job end to end in production, then clean it up                                                                                    | automation                | job terminal, one RAW artifact, no Canonical row                                    |

Rollback at step 7 or 8: redeploy `1b5778de` (Railway keeps it, `canRollback`
is true), set the branch back, restore the start command. The schema does not
need to be rolled back for the old worker: old worker and old bridge on the
new schema is a supported combination.

Steps 3 and 4 were not executed. A second service needs the bridge secret and
parser token; copying them means reading secret values, which this work does
not do, and a new service is a billable resource the owner did not ask for.

## Limits and resources

No change proposed. Evidence: the real 473,748,061-byte demo peaked at
1,480,458,240 bytes in the WASM runtime (A9.1 run `38112341484`); the 60 MB
fixture parses in CI on a 2-core runner inside the default timeouts. Neither
measurement is of the Python worker under the 4 GB limit with the largest
demo, so there is no basis to raise or lower the limit.
