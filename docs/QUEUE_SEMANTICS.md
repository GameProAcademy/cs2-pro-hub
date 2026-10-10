# Durable demo-parse queue: effective semantics

Evidence, not intent: every line below is what
`scripts/queue/queue_semantics_probe.py` observed on a disposable database
built from `supabase/migrations` (152 migrations). The probe refuses any
non-local host. Nothing here was run against the managed database.

Local run used PostgreSQL 16.15 with pgmq 1.13.1 and stubbed platform roles
and schemas (`auth`, `storage`). The CI workflow uses the Supabase local stack
instead. The managed database's pgmq version is not known.

## What is guaranteed

| Property                                | Observed                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate enqueue                       | 8 concurrent `enqueue_demo_job` calls for one upload → 1 job, 1 message                                                                             |
| Single active lease                     | 8 concurrent claims → exactly 1 `claimed`, the rest `busy`                                                                                          |
| Fencing of a stale worker               | after a re-claim, the old worker's `heartbeat`, `fail` and `finalize` are refused (`claim_not_current`)                                             |
| Acknowledgement needs a terminal status | `finalize` while `processing` → `job_not_terminal`, message stays queued                                                                            |
| Reported transient failures are bounded | 3 deliveries (`max_retries` = 2), then `failed`                                                                                                     |
| Permanent failure                       | stops at once, queue empty                                                                                                                          |
| Superseded messages                     | the message of an earlier dispatch is archived (`stale_or_invalid_message`), never executed                                                         |
| Execution ledger                        | one intent, one start, one terminal per execution; 8 concurrent terminals → 1 inserted; a replayed intent is `IDEMPOTENT_REPLAY`                    |
| Client roles                            | `anon` and `authenticated` cannot execute queue or persistence functions (10 of 10 calls denied)                                                    |
| Row-level security                      | 52 of 52 public tables have RLS; a user sees their own job and upload, not another user's; `anon` sees none; an owner cannot update or delete a job |

## What is NOT guaranteed

**Delivery is at-least-once. Exactly-once is not claimed anywhere and is not
provided.** Deduplication of effects rests on the fencing above, on the
execution ledger, and on unique keys in the canonical tables
(`matches_content_fingerprint_uniq`, `match_sources_source_fingerprint_uniq`,
`match_participants_match_key_uniq`, `match_rounds_match_round_key`,
`match_metrics_match_id_player_id_key`). `round_events` has no unique key; it
relies on delete-then-insert under a lock. `persist_canonical_observation`
itself was not executed by the probe.

### Known defect: a crashed worker is redelivered without bound

`claim_demo_parse_message` (`20260916103513…sql:64-73`) re-claims a
`processing` job whose lease expired, with the same message and the same
`retry_count`. `retry_count` only moves in `fail_demo_parse_message` and in
the stale sweep. The probe delivered one message 12 times
(`pgmq read_ct` = 12) with `retry_count` still 0 and `max_retries` = 2.

The stale sweep does not help: `recover_stale_demo_jobs` needs a heartbeat
older than its threshold, and every re-claim writes a fresh heartbeat. With a
fresh heartbeat it recovered 0 jobs; with a heartbeat forced 31 minutes old it
recovered 1. When the sweep does run it is bounded (pending, pending, failed
`JOB_STALE`). Whether the sweep's cron is scheduled in production is not
determinable from the repository.

Consequences, by where the code runs:

- **Deployed worker (`91aeee8`, `python worker_main.py`):** if only the parser
  child is killed, the parent reports `PARSER_ERROR` and the job is bounded by
  `max_retries`. If the parent dies, or a post-parse `RuntimeError` is raised
  (no `fail` is sent, `worker.py:137-138`), the job is re-parsed on every
  lease expiry.
- **`main`:** the re-delivered intent is a replay; `reconcile` answers
  `reconciliation_required` for a `STARTED` or `INTENT_ONLY` lifecycle
  (`durableBridge.server.ts:245-247`) and the worker moves on. The job stays
  `processing`, is never parsed again and never failed.

### By design on `main`: an automatic retry does not parse again

`attempt_number` is immutable across retries and the execution id is derived
from job, attempt number and upload (`worker.py:76`). A re-dispatched job
replays the intent; if the ledger says `FAILED`, `reconcile` fails the job
permanently without running the parser
(`durableBridge.server.ts:339-347`). This matches the documented rule that a
durable replay must reconcile without rerunning the parser. Its effect is
at-most-once parsing per upload attempt: a transient failure is final unless
a new attempt is created.
