# Parser failure taxonomy

Status: the internal classification is implemented on `main` (not deployed).
The wire protocol, the APP classifier and the database are unchanged. Promoting
the classes to the wire is a proposal that needs the owner's decision.

## The five classes

| Class                | Meaning                                                                          | Is it an error? | Retry makes sense                    |
| -------------------- | -------------------------------------------------------------------------------- | --------------- | ------------------------------------ |
| `NO_DATA`            | the demo does not contain the stream                                             | no              | no                                   |
| `PARSER_FAILURE`     | the parser failed on this demo or capability (exception, panic, native crash)    | yes             | not until the parser version changes |
| `RESOURCE_EXHAUSTED` | memory or time ran out (`MemoryError`, timeout, child killed by SIGKILL/SIGXCPU) | yes             | only with more resources             |
| `CANCELLED`          | shutdown or cancellation interrupted the work (SIGTERM/SIGINT, task cancel)      | yes             | yes                                  |
| `INVALID_OUTPUT`     | output outside the declared contract                                             | yes             | no                                   |

## What exists today, and where it lands

| Situation                                                        | Before                                                                             | Now (this change)                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stream absent from the demo                                      | capability state `NOT_PRESENT_IN_DEMO` / `AVAILABLE_BUT_EMPTY` (`raw_evidence.py`) | unchanged; this is `NO_DATA` and never a wire error                                            |
| Exception or panic in one capability                             | capability state `PARSE_FAILED`, parse continues                                   | unchanged; `PARSER_FAILURE` at capability level                                                |
| `MemoryError` inside a capability                                | empty table, parse continues, job ends `blocked_raw_audit` (permanent)             | propagates; wire `PARSER_ERROR`, class `RESOURCE_EXHAUSTED`                                    |
| Parse timeout                                                    | wire `PARSE_TIMEOUT`                                                               | same code, class `RESOURCE_EXHAUSTED`                                                          |
| Cancellation during parse                                        | wire `PARSER_ERROR`                                                                | same code, class `CANCELLED`                                                                   |
| Any other exception                                              | wire `PARSER_ERROR`                                                                | same code, class `PARSER_FAILURE`                                                              |
| Child process killed by signal (isolation, deployed branch only) | wire `PARSER_ERROR`, signal only in logs (`parser_isolated.py@91aeee8:83-93`)      | `classify_child_exit` is implemented and tested here; it is NOT wired into the deployed branch |

The class is carried on the in-process `WorkerError.failure_class` and in the
log line `failure_class=...`. `WorkerError.envelope()` is byte-identical to
before; `WORKER_ERROR_CODES` is unchanged (asserted by
`tests/test_failure_taxonomy.py`).

## Why the class does not go on the wire yet

- The APP accepts a closed list (`WORKER_ERROR_CODES` in
  `src/lib/pipeline/parser/parserEndpoint.ts:89-108`) and `WorkerError` refuses
  any code outside the worker's own list. A new code is a coordinated change.
- The APP already declares `RESOURCE_LIMIT` as a pipeline error and treats it
  as permanent (`src/lib/pipeline/errors.ts:51,78`), and `retry_demo_job`
  already lists it. Nothing emits it.
- The deployed worker is built from another branch with unrelated history. A
  wire change has to land there too, and merging to that branch deploys.

## Proposed coordinated change (not implemented)

1. Worker: add wire codes `RESOURCE_EXHAUSTED` and `CANCELLED` to `errors.py`,
   emitted from the mapping in `FAILURE_CLASS_WIRE_CODE`.
2. APP: add both to `WORKER_ERROR_CODES` and to `classifyWorkerFailure`:
   `RESOURCE_EXHAUSTED` → `RESOURCE_LIMIT` (permanent), `CANCELLED` →
   `PARSER_UNAVAILABLE` (transient). Extend the Gate 1E.1 mirror test.
3. Deployed branch: use `classify_child_exit(returncode, timed_out=...)` in
   `parser_isolated.py` instead of the single `PARSER_ERROR`.
4. Database: no migration is needed for the codes themselves
   (`demo_jobs.error_code` is free text). The H3E91 outcome code accepts any
   `^[A-Z][A-Z0-9_]{0,63}$` value.
5. Order: APP first (accepts the new codes, old worker keeps working), then the
   worker. Reverse order would make the APP see unknown codes.

## Tests

`services/cs2-demo-parser/tests/test_failure_taxonomy.py` and
`tests/test_non_demo_failures.py`:

- real child processes killed by SIGKILL, SIGTERM and SIGSEGV, and a hung child
  cut off by a timeout, classified from their actual exit status;
- a real child hitting `RLIMIT_AS` raises `MemoryError` and never reports success;
- `MemoryError`, timeout and cancellation through the real parse wrapper:
  failure, correct class, unchanged envelope, never a payload;
- resource failure in the durable loop: one failed terminal in the ledger, one
  `fail` to the queue, never `complete`;
- RAW write failure: never `complete`; pins the current gap that no `fail` is
  sent (the job waits for lease expiry).

Covered by tests that already existed: lost acknowledgement after `FINISHED`
(`test_worker.py::test_finished_completion_ack_loss_reconciles_without_second_parse_or_terminal`),
re-delivery without a second parse
(`test_worker.py::test_durable_worker_replayed_intent_reads_authoritative_state_without_reparse`),
HTTP retries without re-execution
(`test_h3e91_failure_injection.py::test_v1_http_retry_reconstructs_identity_without_reexecuting_parser`).
