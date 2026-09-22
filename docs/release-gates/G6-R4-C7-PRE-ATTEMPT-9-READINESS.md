# G.6-R.4-C.7 — Pre-Attempt-9 readiness

## Decision

`IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`

## Implemented

- Immutable `canonical-demo-v2` authority remains fixed at 105 unique fields, zero generic sources, zero authorized and zero verified.
- Attestation v3 binds immutable GitHub identity, frozen Git objects, Railway API evidence, live runtime identity, release digests, timestamp and nonce.
- The nonce registry is append-only and rejects repeated digest/nonce evidence.
- The database diagnostic returns only `BLOCKED` or `READY_TO_EXECUTE_ATTEMPT_9`; it performs no mutation.
- Attempt 9 reservation remains behind the authoritative gate; Attempt 10+ remains forbidden.

## State

`PRE_ATTEMPT_9_READY_INFRASTRUCTURE` is implemented. No provenance was fabricated and no operational release was authorized.

## External input required

Authorized real DEM, GitHub OIDC run, Railway API proof, transport/HMAC secrets, remote CI, same-DEM parity, determinism, identity, persistence and independent tick-domain evidence.