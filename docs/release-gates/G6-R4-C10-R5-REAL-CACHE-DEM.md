# G.6-R.4-C.10-R5 — Real Cache DEM forensic execution

**Decision:** `IMPLEMENTATION COMPLETE / EXECUTION PARTIAL / VERIFICATION PARTIAL / RELEASE BLOCKED / ATTEMPT_9 LOCKED`.

## Observed production state

- The database contains the authorized Attempt 8 identity (`d89b697f-c40d-42f4-ae51-040e4e8cabba`) for `0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d`, 473,748,061 bytes.
- The exact private `demos` object is absent. Only Attempt 8 RAW evidence remains: 1 artifact and 25 chunks. Therefore the DEM bytes were not readable or processed in R5.
- Security invariants returned `PASS`: client roles have zero access; `service_role` and approved internal `sandbox_exec` retain SELECT/INSERT only; RLS and immutability are required.
- The approved workflow Git blob is `5039bff74550f02291fd066c7f10d781f6b86ebe`. Live GitHub OIDC/attestation was not run.
- Railway and HMAC credentials were unavailable. Railway was not queried through its authenticated API and was not mutated.
- Provenance and nonce counts remain zero. Canonical remains 105 mappings, 0 authorized, 0 verified, 0 generic.

## Execution results

| Area                 | Result                                           |
| -------------------- | ------------------------------------------------ |
| Python real run      | NOT_RUN — DEM bytes unavailable                  |
| WASM real run        | NOT_RUN — DEM bytes unavailable                  |
| Python/WASM parity   | NOT_RUN                                          |
| Four-run determinism | NOT_RUN                                          |
| Tick authority       | NOT_VERIFIED / UNAVAILABLE                       |
| Player identity      | NOT_VERIFIED                                     |
| Persistence          | NOT_VERIFIED for a new R5 run                    |
| Forensic integrity   | NOT_VERIFIED; partial evidence envelope recorded |
| Contamination        | PASS — no R5 mutation observed                   |
| Cleanup              | NOT_EXECUTED                                     |

## Official gate results

- `pre_real_demo_gate_status()` → `BLOCKED_BEFORE_REAL_DEMO`.
- `pre_attempt_9_gate_status(NULL)` → `BLOCKED`.
- All three assertion gates rejected the missing provenance with `CACHE_ATTEMPT_9_PROVENANCE_RELEASE_MISMATCH`.
- Attempt 9 count: 0. Attempt 10+ count: 0.

## Validation

- Python compileall: PASS.
- Focused Vitest: 10 passed.
- Full Vitest: 1,079 passed and 6 failed in two pre-existing parser contract suites (`hotPayload.contract` and `quality271`); these failures were not counted as R5 PASS.
- Workflow blob identity: PASS.
- Pytest/event matrix: NOT_RUN because pytest is not installed in this environment; no dependency was installed to manufacture a pass.
- Event matrix functions invoked directly: 2 passed, confirming the documented catalogue exactly matches all 40 `EVENT_TYPES`.
- Parity and determinism harnesses: correctly returned NOT_RUN.
- Lint: FAIL due to four pre-existing formatting errors, with nine warnings; `git diff --check` passed.
- Database linter: unchanged baseline of 15 findings across three categories.

## Final disposition

The run stopped before parsing, persistence, Attempt 9, Canonical, cleanup, or any external mutation. The next valid milestone is to restore access to the authorized private DEM bytes through the official lifecycle and provide real Railway/HMAC/GitHub evidence, then rerun R5. Documentation or existing RAW chunks must not substitute for the original DEM.
