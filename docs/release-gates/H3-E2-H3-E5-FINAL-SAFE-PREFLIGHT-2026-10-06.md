# H.3-E.2 / H.3-E.5 — Final Safe Pre-Attestation Preflight

**Date:** 2026-10-06  
**Status:** PASS / PRE-EXECUTION / FAIL-CLOSED

## Evidence registrations

### 1. H.3-E.2 implementation

- `public.record_parser_runtime_attestation_with_secret(...)` remains `SECURITY DEFINER`, with an empty `search_path` and `EXECUTE` limited to `service_role`.
- The bridge validates the supplied HMAC secret, applies `pg_catalog.set_config('app.settings.parser_attestation_hmac_secret', _hmac_secret, true)`, and delegates to `public.record_parser_runtime_attestation(...)`.
- The transaction-local secret is not inserted, returned or logged. The authoritative recorder continues to enforce digest, HMAC, freshness, nonce, binding, critical hashes, release evidence and exact replay controls.

### 2. H.3-E.5 implementation

- The server adapter copies only `PARSER_ATTESTATION_ENDPOINT`, `PARSER_ATTESTATION_TRANSPORT_SECRET` and `PARSER_ATTESTATION_HMAC_SECRET` from server runtime bindings.
- It does not enumerate arbitrary runtime bindings, use `Object.assign`, expose values to browser code, return them or log them.
- Both required attestation secrets were observed as configured by name only; values and lengths were not read or disclosed.

### 3. H.3-E.5 runtime configuration

- An anonymous empty production request to `/api/public/parser-attestation` returned HTTP 401 with `UNAUTHORIZED`.
- This proves configuration reached the transport-authentication gate only. It is not an attestation and proves no downstream attestation result.
- Generated-output and rendered-page checks found no attestation secret names or values exposed to the browser.

### 4. Runtime correction verification

- No product runtime correction was required in this round.
- The supervised application build remained successful.
- Full local validation passed: 104 test files and 1,419 tests; TypeScript validation, lint and public-build checks passed. Existing non-failing deprecation and fast-refresh warnings remain outside this gate.

### 5. Safe pre-attestation preflight

- Database evidence remained unchanged: two VERIFIED historical provenance rows, two nonces, zero Attempt 9, zero Attempt 10+, and Canonical at 105 total / zero generic / zero authorized / zero verified.
- `UNIQUE(attestation_digest)`, digest-scoped conflict handling and exact-replay requirements remain in place. No deployment-identity uniqueness was added.
- The current critical worker hash remains `50a53b607d26f00b4de05c5e8998611959e27bd1` in the application registry. Historical migration text is retained unchanged and is not current authority.
- PR #57 is closed without merge because the same structure-aware bridge assertion correction is already present on current `main` commit `3f3b6ef...`. Quality Gates #655 remains a historical FAIL from the superseded PR branch; no external green rerun is claimed for that old run.

## Required status report

| ITEM | STATUS | EVIDENCE |
|---|---|---|
| Hero runtime | PASS | No current product runtime correction was required; application build is successful. |
| Index runtime | PASS | No current product runtime correction was required; application build is successful. |
| TypeScript | PASS | TypeScript validation completed successfully. |
| Lint | PASS | Lint completed without errors; existing warnings are non-failing and outside this gate. |
| Frontend tests | PASS | Full suite passed: 104 files, 1,419 tests. |
| Build | PASS | Public-build configuration and supervised build are successful. |
| Transport secret runtime | PASS | Server-side secret presence was verified by name only; anonymous request reached 401 transport auth. |
| HMAC secret runtime | PASS | Server-side secret presence was verified by name only; no value or length was disclosed. |
| HMAC bridge | PASS | Service-only transient bridge exists and delegates to the authoritative recorder. |
| Transaction-local `set_config` | PASS | Bridge uses `set_config(..., true)` for transaction-local scope. |
| Authoritative recorder | PASS | Digest, HMAC, evidence, freshness, mapping and critical-hash gates remain enforced. |
| Nonce controls | PASS | Nonce uniqueness and immutable history remain preserved; two historical nonces observed. |
| `attestation_digest` idempotency | PASS | Unique digest, digest-scoped conflict handling and exact replay remain preserved. |
| GitHub OIDC | PASS | Cryptographic verification and exact claim/source binding remain required. |
| Anonymous endpoint preflight | PASS | Empty anonymous production POST returned HTTP 401 `UNAUTHORIZED`. |
| Browser secret exposure | PASS | Generated-output and rendered-page checks found no attestation secret exposure. |
| GitHub PR #57 | CLOSED / REDUNDANT | Closed without merge after confirming its proposed test correction is already present on current `main` commit `3f3b6ef...`. |
| Quality Gates #655 | HISTORICAL FAIL | Superseded PR run failed on brittle multiline exact-string matching; current `main` contains the structure-aware correction and passed the independent 1,419-test local suite, but remote CI for `3f3...` is not claimed. |
| Railway | NOT RUN | No deployment, environment or service mutation occurred. |
| Attempt 9 | NOT RUN | Database count remains zero; no DEM was processed. |
| Canonical | BLOCKED | 105 total rows; zero generic, authorized or verified rows. |
| Runtime Attestation | NOT RUN | No workflow dispatch, valid payload, credentialed request, nonce or provenance write occurred. |

## Preserved locks

No Runtime Attestation, workflow dispatch, DEM execution, Attempt 9/10+, Cache Run, Canonical admission, Railway mutation, EnvironmentPatch, secret rotation, provenance/nonce deletion, database reset or historical-data modification was performed. The next controlled attestation phase was not started.

## Post-Lovable reconciliation addendum — 2026-10-06

The current `main` revision `3f3b6efaa627cae101bf5683da6322ecada33a53` contains the structure-aware HMAC bridge assertion that was missing from the superseded PR #57 branch. PR #57 was therefore closed without merge to avoid duplicating a correction already present on `main`.

Lovable's completed safe preflight reported 104 test files / 1,419 tests, TypeScript, lint and public-build PASS, plus an anonymous production attestation POST returning 401 `UNAUTHORIZED`. These are treated as implementation/preflight evidence only; they do not constitute a fresh Runtime Attestation or prove post-A9.1 provenance.

The production Railway deployment and staged EnvironmentPatch were not changed. Attempt 9/10+, Canonical admission, DEM execution and Runtime Attestation remain locked/not run.
