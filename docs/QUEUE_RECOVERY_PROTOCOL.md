# Demo-parse queue: recovery protocol

Status: **proposed, not applied anywhere real.** The migration
`20261011120000_demo_parse_recovery_protocol.sql` has only been run on a
disposable database. The deployed worker (`91aeee8`) does not contain this
code. Nothing here authorizes Canonical, Attempt 9 or a deploy.

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

`scripts/queue/recovery_protocol_probe.py` runs the production
`durable_consumer_loop` as real processes against a loopback bridge backed by
the real queue functions, pgmq and the real execution ledger in a disposable
database. Crashes are real `SIGKILL`s; lost requests and acknowledgements are
connections dropped at an exact protocol point; time is an expired lease.

- New protocol: 22 of 22 scenarios pass. Every scenario also checks: at most
  one committed RAW effect and one committed observation effect per job; each
  parser execution has a `STARTED` row; one terminal per identity; a terminal
  job has no queue message left.
- Previous protocol (`--protocol legacy`, main's schema and worker tree): 4 of
  5 fail — the four defects above.

`h3e91DurableReconciliation.test.ts` (52 tests) covers the TypeScript bridge
decisions; `tests/test_execution_identity.py` covers the worker.

### What the probe does not cover

- The TypeScript bridge as a running process. The loopback bridge mirrors its
  `reconcile`, `fail` and `complete` decisions; the TypeScript itself is unit
  tested with a mocked database.
- RAW chunk storage and the Canonical/HOT persistence. They are replaced by
  two idempotent effect rows per job. `initializeRawArtifact`,
  `decideRawChunkRecovery` and `finalizeRawArtifact` are written to be
  re-entrant per job, but that was not executed here.
- Download, demoparser2 and RAW chunking in the worker: the parse step is
  scripted.
- A holder whose `complete` is still running in the bridge when its lease
  expires (it would need more than one visibility window). Not exercised.

## Before this can be applied

1. Decide to apply the migration to the managed database (not done here).
2. Deploy bridge and worker together: an old worker with the new bridge, or
   the reverse, disagree on the identity of dispatches ≥ 1 and reconciliation
   answers `reconciliation_required` (fail-closed, bounded by rule 5).
3. In production the event bridge still answers
   `H3E91_DEPLOYED_SOURCE_PARITY_UNVERIFIED`, so this worker path does not
   execute there until deployed-source parity is proven.
