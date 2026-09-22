# G.6-R.4-C.10 — Final pre-Attempt-9 gate

## Current state

- IMPLEMENTED: release authority, attestation v3, OIDC/HMAC binding, freshness, anti-replay, offline parity/determinism harnesses, tick protocol, forensic digest envelope and safety contracts.
- VERIFIED: local static and fixture-only gate mechanics; immutable mapping release shape.
- NOT VERIFIED: real runtime provenance, real Python/WASM equivalence, real determinism, real tick authority, identity and persistence.
- BLOCKED: Canonical admission, cleanup execution and Attempt 9.
- NOT RUN: real DEM parsing, replay, Attempt 9, Attempt 10+, Railway mutation.
- EXTERNAL INPUT REQUIRED: authorized DEM and independently verifiable GitHub/Railway/runtime evidence.

## Gate ordering

Runtime provenance, release binding, RAW forensic integrity, identity, independent tick authority, same-DEM parity, determinism, persistence, retention and no-contamination checks must all pass before the database may return `READY_TO_EXECUTE_ATTEMPT_9`. Parser output never enters Canonical directly.

## Event capability matrix

The frozen upstream catalogue contains 38 explicit events. Each remains evidence-only until observed on the authorized DEM and reconciled; inferred round ends, team identity from `team_number`, nickname-only identity and invalid bomb transitions are prohibited.

## Decision

`IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`