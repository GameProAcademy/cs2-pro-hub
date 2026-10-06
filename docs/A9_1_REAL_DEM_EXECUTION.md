# A9.1-R1 — isolated real DEM execution harness

**IMPLEMENTED / NOT_EXECUTED.** No real DEM was downloaded or parsed during implementation. NOT_RUN is the correct state until the four real executions are actually observed.

## Preconditions and future fixture

The reviewed workflow must be on `main`, and an operator must independently authorize and manually dispatch `.github/workflows/a91-real-dem-gate.yml`. It has no push or pull-request trigger and only `contents: read` permission. This implementation does not dispatch it, merge it or deploy anything.

- Filename: `furia-vs-gamerlegion-m1-cache.dem`
- Exact size: **473748061 bytes**
- SHA-256: `0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d`
- Authorization reference: `A9.1-M1-CACHE-REAL-DEM`
- Required non-secret manual inputs: `expected_sha256`, `expected_size_bytes`, `authorization_ref`, `filename`, each compared with the exact official pin.
- The private URL comes only from the future GitHub Actions secret `A91_DEMO_URL`. No URL input exists. Missing secret fails closed as `A91_DEMO_URL_MISSING`; its value is never printed, persisted, or passed in argv. This hardening does not create or change that secret.

These pins are laboratory inputs, not production execution authority. Curl reads its URL configuration from stdin; child environments omit the URL secret. Curl output is discarded, retries are bounded, redirects are HTTPS-only, and file size is capped. Size, SHA and the existing streaming `validate_demo_structure()` must pass before any parser call. Temporary files live exclusively in `RUNNER_TEMP`.

## Runtime sequence

The orchestrator calls the existing Python reference exactly twice, then the isolated WASM reference twice in separate processes. Each run hashes the complete file; no slicing, prefix-only parse, streaming substitution or production browser import is used. Python's existing maximum remains 1,500 MiB. The production browser/client POC remains 128 MiB.

**A9.1 real-Dem execution is an isolated validation harness and does not constitute production browser support.**

WASM loads the exact no-modules binding and binary pinned by the artifact manifest, validates both hashes and lengths, initializes wasm-bindgen and checks all declared exports. Stable artifact identity binds both hashes, source commit/tag and parser version. Catalog and contract digests are recomputed from the existing manifest. Export checks during unit tests initialize the pinned artifact but do not call parsing APIs.

Bounded samples retain original array order, duplicates, null, zero and false. Full API-result digests and counts accompany truncated evidence; the complete DEM is supplied to every actual parsing call. Evidence includes header, event inventory, per-event requested/returned/unavailable fields, parse failures, raw grenades, round events and non-authoritative tick probes. Output is capped at 2 MiB; overflow fails closed instead of silently deleting evidence.

## Parity is not determinism

Both existing scripts remain in use. Capability-aware parity preserves all 16 domains: header, map, tickrate, playback_ticks, players, player_identity, events, rounds, grenades, bomb, damage, deaths, weapons, economy, tick_properties and game_state. Comparable evidence must PASS semantic comparison. Explicit `NOT_AVAILABLE_ON_WASM` is `NOT_COMPARABLE`, with `equal=null`: neither equality, error nor PASS for that domain. A gate may PASS with documented capability exclusions only if every comparable domain passes and none is FAIL, NOT_RUN or BLOCKED. Missing Python evidence is not waived by WASM absence. `parsePlayerInfo` is never fabricated or inferred.

The parity digest binds domain, status, comparability, availability, both normalized values and mismatch reason. Cross-runtime domain lists retain exclusions and reasons; field count remains null with `FIELD_LEVEL_COMPARISON_NOT_IMPLEMENTED`, never fabricated. The producers expose different evidence shapes and field requests; unexplained mismatches remain `FAIL / SEMANTIC_MISMATCH`. No local tests establish real parity or guarantee a future real PASS.

The worker and reference use `parseTicks(bytes, properties, ticks, [], false)`; wanted players occupies argument four. The worker records `listUpdatedFields` independently. Singular `parseEvent` calls retain per-event field requests; plural `parseEvents` is exported but not invoked, and no call-success claim is made for it.

### Pinned artifact export audit

- declaredExports: listGameEvents, listUpdatedFields, parseEvent, parseEvents, parseGrenades, parseHeader, parseTicks.
- observedExports: the same seven functions, verified by initialization-only tests (no parsing).
- missingExports: parsePlayerInfo, parseChatMessages.
- upstreamExpectedExports: all nine APIs listed in the pinned upstream surface catalog, including parsePlayerInfo and parseChatMessages. Upstream support with absent runtime exports is `UPSTREAM_SUPPORTED_BUT_RUNTIME_EXPORT_MISSING`, not an implementation license.
- No artifact reconstruction, parser identity change or inferred player identity occurred. Declared/observed exports do not mean every function was exercised.

Determinism compares two runs **within each runtime** and requires stable nonempty result digests, four unique run IDs, exact counts, common DEM/parser/catalog/contract identity and stable WASM identity. Different runtime results may be individually deterministic while parity fails. The final decision validates identities, rehashes normalized result content, checks report digests, requires both independent gates and rejects `test_fixture_only`. No hash-only or fixture-only PASS is accepted.

Reports expose pythonDeterministic, wasmDeterministic, identityStable, artifactStable, catalogStable, contractStable, demoStable and determinismDecision. Python fingerprints include pythonVersion, platform, demoparser2Version and requirementsDigest; WASM fingerprints include nodeVersion, both artifact hashes and artifactIdentity. These complement pinned identities; they never replace them or include private paths. A9.2 remains LOCKED: A9.1 does not prove 473 MB browser support or change the 128 MiB ceiling.

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
