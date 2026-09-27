# F.5.3-CLOSURE.4 — integrated evidence closure

## Goal
Produce the remaining disposable-database, race, failure, HOT/RAW, runtime, and final verification evidence without changing production execution authority.

## Implementation
- Build a real disposable PostgreSQL integration harness around the production queue, lifecycle writer/reader, RAW/HOT persistence, and reconciliation contracts.
- Cover FINISHED, lost completion acknowledgement, pre-commit completion failure, FAILED, ABORTED, false-positive reconciliation cases, and queue-finalizer idempotency with fresh-worker replay and parser invocation counts.
- Expand machine-readable lifecycle, independent-connection race, and failure-injection matrices to every required case and assert persisted invariants.
- Strengthen FINISHED reconciliation so required HOT and RAW evidence are identity-bound and complete before queue acknowledgement.
- Verify the current visible application path in a browser, add focused regression coverage for unsafe data-shape/function assumptions if present, and run production-output sealing.
- Preserve the corrected migration lineage and report bounded lineage separately from full-schema equivalence.

## Verification
- Run the disposable PostgreSQL integration suites and all required local web, parser, contract, type, lint, build, browser-sealing, and available image-isolation checks.
- Perform only read-only live database checks; keep its ledger untouched.
- Record exact evidence and classify every acceptance item PASS or blocked. Closure remains BLOCKED if any mandatory proof, final-commit CI, Docker check, full-schema equivalence, or deployed parity is unavailable.

## Safety boundaries
- No Railway or environment changes, secrets, attestation, production parser execution, real DEM, Cache run, Attempt 9+, Canonical mutation, production event insertion, or production migration-history mutation.
- Keep `realDemAuthorized=false` and `canonicalAuthorized=false`; do not advance to R4.2.
