# A9.1-R1 — isolated real DEM execution harness

**IMPLEMENTED / NOT_EXECUTED.** No real DEM was downloaded or parsed during implementation. NOT_RUN is the correct state until the four real executions are actually observed.

## Preconditions and future fixture

The reviewed workflow must be on `main`, and an operator must independently authorize and manually dispatch `.github/workflows/a91-real-dem-gate.yml`. It has no push or pull-request trigger and only `contents: read` permission. This implementation does not dispatch it, merge it or deploy anything.

- Filename: `furia-vs-gamerlegion-m1-cache.dem`
- Exact size: **473748061 bytes**
- SHA-256: `0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d`
- Authorization reference: `A9.1-M1-CACHE-REAL-DEM`
- Required manual inputs: `demo_url`, `expected_sha256`, `expected_size_bytes`, `authorization_ref`, `filename`. The URL has no default and must be HTTPS without embedded credentials.

These pins are laboratory inputs, not production execution authority. The URL is passed through environment variables, never interpolated into a logged shell command. Curl output is discarded, retries are bounded, redirects are HTTPS-only, and file size is capped. Size, SHA and the existing streaming `validate_demo_structure()` must pass before any parser call. Temporary files live exclusively in `RUNNER_TEMP`.

## Runtime sequence

The orchestrator calls the existing Python reference exactly twice, then the isolated WASM reference twice in separate processes. Each run hashes the complete file; no slicing, prefix-only parse, streaming substitution or production browser import is used. Python's existing maximum remains 1,500 MiB. The production browser/client POC remains 128 MiB.

**A9.1 real-Dem execution is an isolated validation harness and does not constitute production browser support.**

WASM loads the exact no-modules binding and binary pinned by the artifact manifest, validates both hashes and lengths, initializes wasm-bindgen and checks all declared exports. Stable artifact identity binds both hashes, source commit/tag and parser version. Catalog and contract digests are recomputed from the existing manifest. Export checks during unit tests initialize the pinned artifact but do not call parsing APIs.

Bounded samples retain original array order, duplicates, null, zero and false. Full API-result digests and counts accompany truncated evidence; the complete DEM is supplied to every actual parsing call. Evidence includes header, event inventory, per-event requested/returned/unavailable fields, parse failures, raw grenades, round events and non-authoritative tick probes. Output is capped at 2 MiB; overflow fails closed instead of silently deleting evidence.

## Parity is not determinism

Both existing scripts remain in use. Parity compares all 16 existing A9.1 domains conservatively. Missing domains and `NOT_AVAILABLE_ON_WASM` are not equality. `parsePlayerInfo` is absent; player identity is never inferred, so this pinned artifact cannot currently obtain an all-domain parity PASS. The Python and WASM producers also expose different evidence shapes; unexplained mismatches remain FAIL, not normalized away.

Determinism compares two runs **within each runtime** and requires stable nonempty result digests, four unique run IDs, exact counts, common DEM/parser/catalog/contract identity and stable WASM identity. Different runtime results may be individually deterministic while parity fails. The final decision validates identities, rehashes normalized result content, checks report digests, requires both independent gates and rejects `test_fixture_only`. No hash-only or fixture-only PASS is accepted.

## Artifacts, cleanup and locks

Only seven exact JSON filenames are uploadable: `a91_real_dem_report.json`, `parity_report.json`, `determinism_report.json`, two `python_run_*.json` and two `wasm_run_*.json`. All are inspected for URLs, credential markers, non-finite numbers, unknown files and size overflow. Authorization and DEM are never uploaded. Artifact retention is three days. An upload marker is generated only after cleanup and sanitization; any cleanup or sanitization failure blocks upload. An `always()` cleanup step additionally removes private temporary directories after failure or cancellation where the runner remains available. Abrupt runner destruction is subject to GitHub's ephemeral-runner disposal, not a fabricated successful cleanup claim.

Memory exhaustion, timeouts and resource failure remain explicit failures. Unit fixtures test only the harness mechanism and never establish A9.1 real PASS.

**Canonical authorization=false; Attempt 9 authorization=false; production authorization=false.** Railway, production database, secrets, worker and browser parsing limits are untouched. A9.1-R2/R3/R4/R5 remain locked pending separately authorized real runs and independent review.

## Local validation closeout

| ITEM | STATUS | EVIDENCE |
| --- | --- | --- |
| A9.1-R1 implementation | IMPLEMENTED | Isolated scripts, manual workflow, safety tests and this document |
| Full Vitest suite | PASS | 106 files, 1,423 tests; includes Node safety checks and Python harness checks |
| Python harness mechanics | PASS | 6 synthetic tests; no parser or network calls |
| ESLint | PASS | Zero errors; nine existing warnings in the full repository |
| Public build configuration | PASS | `PUBLIC_BUILD_CONFIG_OK` |
| Automatic compilation | PASS | Observability recorded `build OK` after code edits |
| Sealed browser-output inspection | NOT PROVEN | Checker cannot find generated browser output: `H3E91_BROWSER_BUILD_OUTPUT_MISSING`; no manual build was run |
| Real DEM execution | NOT RUN | No download, real parsing or workflow dispatch performed |
| Real Python/WASM parity and determinism | NOT PROVEN | Local synthetic tests are not real execution evidence |
| Attempt 9 and Canonical | BLOCKED | All authorization flags remain false |
| Production changes | NOT RUN | No deployment, Railway, live database or secret mutation performed |

The local Python test intentionally emits `A9.1 FAIL` for missing DEM URL and verifies cleanup and no parser invocation; this is expected negative-test evidence, not a real execution failure. No `.dem` file is tracked. No PR, merge or new release commit was created by this task; repository synchronization is managed by Lovable.
