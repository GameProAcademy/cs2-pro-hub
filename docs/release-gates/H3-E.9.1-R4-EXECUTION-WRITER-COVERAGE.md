# H.3-E.9.1-R4 — execution writer coverage

**Result: H.3-E.9.1-R4 — BLOCKED / FAIL-CLOSED / DIAGNOSTIC-ONLY.**

The machine-readable inventory is `inspectH3E91ExecutionSurfaces()`, included in the preflight artifact and its digest. It is a diagnostic, not permission to execute. Current source revision at investigation: `a9750e3a35f26a85690122aadb2cd187efcf3cb3`; changes to this report and registry are not yet a reviewed or deployed Railway revision.

| Surface | Current status | Actual path and reason |
| --- | --- | --- |
| `APP_REMOTE_PARSER` | `NOT_COVERED` | `jobs.server.ts` calls `adapter.parseDemo()`; `remoteParser.server.ts` sends `POST /v1/parse` without a ledger INTENT. |
| `RAILWAY_DURABLE_WORKER` | `NOT_COVERED` | `worker.py` claims via the APP bridge and calls `_parse_durable_request`; `app.py` calls `asyncio.to_thread(parse, path)` without an authoritative STARTED write. |
| `RAILWAY_V1_PARSE` | `NOT_COVERED` | `app.py` exposes an independent authenticated `POST /v1/parse` that calls `_parse_request`, bypassing any ledger writer. It has **not** been silently disabled. |
| `BROWSER_WASM_POC` | `NOT_COVERED` | `FEATURES.realDemoParser=false`, but a separately gated POC and directly callable `ClientParserService.parse()`/worker exist. A build flag and UI gate alone do not prove this surface `SEALED_OFF`. |

Other entrypoints considered: `pipeline-worker.$action.ts` routes claims/completions into the durable path; `python_reference.py` and local parity/determinism scripts can call the parser outside the service and must be scoped in any future exhaustive review. The deployed Railway source is not proven identical to the checked-out source. Neither an empty ledger nor zero mutable job rows proves zero execution.

**Authority:** `ledgerAuthority=UNINSTRUMENTED`, `writerCoverageVerified=false`. The existing R3 table is append-only-prepared and service-read-only; no event writer was created or activated. The read-only inspector remains the authority for current ledger metadata. Current exact blockers include `H3E91_EXECUTION_LEDGER_UNKNOWN`, `H3E91_EXECUTION_LEDGER_MUTABLE_ONLY` (when the prepared ledger is observed), and `H3E91_EXECUTION_SURFACE_NOT_COVERED`; unexpected/missing surfaces additionally raise `H3E91_EXECUTION_SURFACE_UNKNOWN`. The evaluator remains pure; coverage is applied only in the collector.

**Validation and changes:** Registry and collector diagnostic, artifact type, blocker code, synthetic coverage tests, roadmap, architecture rule and this report; **no migrations**. Two focused web test files passed (79 synthetic tests); `git diff --check` passed and the latest preview build signal was OK. Python, database privilege, lifecycle, idempotency, concurrency and ledger-write-failure tests were not run or cannot claim PASS without a reviewed writer. No real DEM or Cache bytes were opened, read, hashed, or parsed by this work; no workflow, valid attestation, job, deployment, Railway setting, secret or Canonical authorization was changed. R5.8 remains blocked; first valid attestation and Attempt 9 not executed; Canonical locked; retention and operator authorization not granted.

**Next review:** independently verify every execution path and deployed source, then design and review a narrowly scoped authenticated bridge, database lifecycle writer, idempotency/concurrency rules, and a pre-parser write-failure test. Only after all paths are covered or provably sealed can a future migration change ledger authority. This report does not authorize that transition.