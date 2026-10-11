# Demo-parse queue: recovery protocol

Status: merged to `main`. Whether the migration is applied to the managed
database, and what runs in production, is recorded in
`QUEUE_RECOVERY_ROLLOUT.md`; the deployed worker (`91aeee8`) does not contain
this code. Nothing here authorizes Canonical, Attempt 9 or a deploy.

Delivery is **at-least-once**. A parser may run more than once for a job. What
the protocol guarantees is at most one committed result per job and a bounded,
recorded end for every dispatch. Exactly-once execution is not claimed.

## Four things that used to be conflated

| Term      | What it is                                   | Identity                            | Counter                  |
| --------- | -------------------------------------------- | ----------------------------------- | ------------------------ |
| job       | one `demo_jobs` row                          | `id`, `upload_id`, `attempt_number` | —                        |
| dispatch  | one queue message for the job                | `dispatch_attempt`, message id      | `retry_count`            |
| delivery  | one lease granted on a dispatch              | —                                   | `delivery_count` (new)   |
| execution | one parser run, recorded in the H3E91 ledger | execution id (one per dispatch)     | `EXECUTION_STARTED` rows |

`pgmq.read_ct` counts reads, including reads answered `busy`. It is none of
the above and is not used.

## The defects this replaces (reproduced, see "Evidence")

1. **A retry never re-ran the parser.** The execution id was derived from the
   job and its logical attempt only, so the dispatch created by a counted
   retry (or by `retry_demo_job`) replayed the same identity. The worker saw
   `IDEMPOTENT_REPLAY`, asked for reconciliation, found the earlier `FAILED`
   terminal and failed the job permanently. One parser execution, job failed,
   `retry_count` consumed.
2. **A worker that died mid-parse left the job `processing` forever.**
   Reconciliation answered `reconciliation_required` for `STARTED` and
   `INTENT_ONLY` and nothing closed the dispatch; it was re-leased on every
   lease expiry.
3. **A completion that never reached the bridge was stuck the same way**
   (`FINISHED` in the ledger, job still `processing`).
4. **A lost `fail` turned a retryable failure into a permanent one**
   (`_permanent` was `lifecycle === "FAILED"`, regardless of the outcome).

## Rules

1. **One execution identity per dispatch.** Dispatch 0 keeps the previous
   name, so identities already in the ledger remain valid; dispatch _n_ ≥ 1
   appends `:dispatch:n`. Worker (`durable_execution_id`) and bridge
   (`durableExecutionId`) share test vectors.
2. **An identity is executed at most once.** A redelivery of the same dispatch
   maps to the same identity. If the ledger already has an intent for it, the
   worker only reconciles; it never parses.
3. **A redelivered dispatch whose execution left no usable result is closed,
   not replayed.** Reconciliation calls `abandon_demo_parse_dispatch` when the
   ledger shows `INTENT_ONLY`, `STARTED`, or `FINISHED` with the job still
   `processing`. The job gets a new dispatch (new identity, parser really
   runs) while `retry_count < max_retries`; otherwise it ends `failed` /
   `JOB_STALE` with the stage in `error_message`.
4. **Only a later holder may abandon.** The database refuses the call from the
   first holder of a dispatch (`delivery_count < 2`), from an expired lease
   and from a superseded claim. The first holder owns the execution: it must
   record a terminal and report `fail` or `complete`.
5. **A dispatch is leased at most 3 times.** If reconciliation could not
   decide twice (`NONE`, `INVALID`, bridge unreachable), the fourth delivery is
   refused and the job ends `failed` / `JOB_STALE` (`delivery_limit`). The
   ledger state is unknown at that point, so nothing is retried automatically.
6. **A heartbeat means worker progress.** A redelivery renews the lease but
   does not touch `heartbeat_at`, so the stale sweep can still see the job.
7. **A lost `fail` is classified like a delivered one**, with the same
   retryable/permanent matrix.
8. **Every closure is recorded** in `demo_job_dispatch_closures` (service
   role only): dispatch, message, deliveries, reason, ledger lifecycle,
   whether it was retried.

Recovering a terminal `JOB_STALE` is the existing explicit path,
`retry_demo_job`, which opens a new dispatch and therefore a new execution.

## Failure matrix

| Where it breaks                                   | Ledger for the dispatch | What happens next                                                                   | Parser runs again? |
| ------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- | ------------------ |
| Crash after claim, before any ledger event        | nothing                 | redelivery records the intent and executes; no retry spent                          | first run          |
| Crash after intent, before start                  | `INTENT_ONLY`           | redelivery → abandon → new dispatch                                                 | first run          |
| Crash during parse                                | `STARTED`               | redelivery → abandon → new dispatch                                                 | yes, new identity  |
| Parser failure, `fail` delivered                  | `FAILED`                | counted retry if retryable, else terminal                                           | yes if retryable   |
| RAW write failure                                 | `FAILED`                | `fail` sent, never `complete`; counted retry                                        | yes; RAW reused    |
| `fail` lost                                       | `FAILED` / `ABORTED`    | redelivery → reconcile → same decision as a delivered `fail`                        | yes if retryable   |
| `complete` lost before commit                     | `FINISHED`              | redelivery → abandon (`FINISHED`, job `processing`) → new dispatch                  | yes; RAW reused    |
| Crash between result commit and queue acknowledge | `FINISHED`              | redelivery is rejected (`processed`) and archived                                   | no                 |
| `complete` acknowledgement lost after commit      | `FINISHED`              | nothing left to do                                                                  | no                 |
| Holder lost its lease but is still running        | `STARTED`               | new holder abandons; the old holder's later calls are refused (`claim_not_current`) | yes, new identity  |
| No worker alive                                   | any                     | stale sweep closes the dispatch (`stale_sweep`), counted retry                      | yes, new identity  |
| Reconciliation cannot decide                      | `NONE` / `INVALID`      | up to 3 leases, then terminal `JOB_STALE` (`delivery_limit`)                        | no                 |

## Evidence

Two probes, both on a disposable database. Crashes are real `SIGKILL`s; lost
requests and acknowledgements are connections dropped at an exact protocol
point; time is an expired lease.

### End to end (`scripts/queue/recovery_integration_probe.py`)

Production code on the whole path, on the Supabase local stack (PostgreSQL
17.6, pgmq 1.5.1 — the versions the managed database reports):

- worker: `uvicorn app:app`, the image's own command, `ENVIRONMENT=production`:
  https download, isolated parser child, demoparser2, RAW artifact writer;
- bridge: the application's TypeScript route handlers with supabase-js
  (`scripts/queue/integration/bridge_host.ts` hosts them unchanged);
- storage: the stack's Storage API; demo: the pinned public fixture (60.6 MB).

14 of 14 scenarios pass in CI:

| Scenario                                               | Executions | Result                                                    |
| ------------------------------------------------------ | ---------- | --------------------------------------------------------- |
| download → parse → 29 RAW chunks → complete → ACK      | 1          | terminal, 30 objects (29 chunks + manifest)               |
| parse timeout (parser killed), retry by another worker | 2          | new identity, terminal                                    |
| parse always times out                                 | 3          | `failed` / `PARSER_TIMEOUT` at the retry limit            |
| worker `SIGKILL`ed during parse                        | 2          | abandoned at `STARTED`, new identity, terminal            |
| `complete` lost before commit                          | 2          | abandoned at `FINISHED`, RAW artifact reused              |
| acknowledgement lost after commit                      | 1          | nothing changes                                           |
| `fail` lost                                            | 2          | reconciled as retryable, retry parses                     |
| RAW chunk upload lost before storage commit            | 2          | dispatch fails, retry completes                           |
| RAW chunk stored, answer lost                          | 2          | dispatch fails, retry rewrites, no duplicate object       |
| stale worker that lost its lease                       | 2          | cannot write RAW or complete                              |
| three workers, one job                                 | 1          | one lease                                                 |
| heartbeats during a real parse                         | 1          | lease renewed                                             |
| reconciliation cannot decide                           | 1 (+1)     | `JOB_STALE` / `delivery_limit`; `retry_demo_job` recovers |
| worker `SIGKILL`ed during download                     | 1          | abandoned at `INTENT_ONLY`, terminal                      |

Checked in every scenario: at most one RAW artifact per job; every chunk
verified; storage objects = chunks + manifest; one terminal per execution
identity; no queue message left for a terminal job; no parser process and no
temporary file left by a worker that was allowed to stop.

Defects this probe found in code already on `main`, each fixed and tested:

- the isolated parser child refused `NaN` and failed every real demo (#84);
- the bridge and the worker computed different digests for the same RAW
  evidence (`localeCompare` key order; `0.0` against `0`), so
  `raw-artifact-finalize` failed for every real demo (this change);
- the parser child outlived a `SIGKILL`ed worker (#86);
- a worker killed during download leaves the partial demo (#85).

What it does not reach: every successful job ends `blocked_raw_audit`, because
the application's RAW admission blocks the public fixture
(`raw_artifact_audit:blocked`). That gate was not touched, so the Canonical
write is **not** exercised end to end; its idempotency is measured separately
(`canonical_persistence_probe.py`). The bridge runs with `NODE_ENV=test`: in
production its event bridge refuses durable execution events.

### Protocol (`scripts/queue/recovery_protocol_probe.py`)

The production `durable_consumer_loop` with a scripted parse step and a
loopback bridge over the real queue functions and ledger. Fast, 22 scenarios,
including ones the end-to-end probe does not have (crash on every dispatch,
crash between result commit and acknowledgement, permanent failures, abandon
guards and grants).

- New protocol: 22 of 22.
- Previous protocol (`--protocol legacy`, the schema and worker tree before
  this change): 4 of 5 fail — the four defects above.

`h3e91DurableReconciliation.test.ts` (52 tests) covers the bridge decisions;
`tests/test_execution_identity.py` the worker.

### Still not exercised

- A holder whose `complete` is still running in the bridge when its lease
  expires (it needs more than one visibility window).
- A graceful shutdown in the middle of a job: the worker stops without
  recording a terminal, and the dispatch waits for its lease to expire before
  it is reconciled. Correct, but slow; not changed here.

## Applying it

See `QUEUE_RECOVERY_ROLLOUT.md` for the order, the compatibility matrix and
the rollback.
