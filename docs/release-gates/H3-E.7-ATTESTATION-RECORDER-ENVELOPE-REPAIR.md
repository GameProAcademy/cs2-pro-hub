# H.3-E.7 — Attestation recorder envelope repair

## Status

`IMPLEMENTED / PRE-PUBLISH / FAIL-CLOSED`

## Root cause

The attestor artifact stores release evidence at `payload.release_gate_evidence`, but the delivery workflow read `.release_gate_evidence`. `jq` therefore emitted `null` into the HTTP field `releaseGateEvidence`.

The recorder correctly rejected that value at the body schema with this non-sensitive diagnostic:

- code: `invalid_type`
- path: `releaseGateEvidence`
- message: `Expected object, received null`

## Repair

- The workflow now reads `.payload.release_gate_evidence` and asserts that the value is an object before delivery.
- The route and tests use one shared envelope schema. The schema still requires plain JSON objects and rejects null, arrays, strings, missing fields, malformed digests/signatures, non-VERIFIED results, blockers, and short OIDC tokens.
- The expected deployment ID changed from `6330c8c4-a410-45db-a364-4eb47702c2fc` to the independently verified existing deployment `7a540da0-3a69-44c0-9c42-40209f903fa7`.
- Railway, secrets, database schema, RLS, privileges, the protected recorder, and the attestor payload generator were not changed.

## Remaining protected persistence reconciliation

The reviewed workflow source digest and deployment identity changed at the application boundary. The existing database recorder still contains its prior immutable allowlist values. Because this phase explicitly prohibits migrations, persistence remains fail-closed until a separately authorized additive migration reconciles those two pins. No valid delivery was attempted to bypass or probe that protected boundary.

## Safety state

- Valid attestation delivery NOT RUN after this repair.
- Real DEM and Cache DEM remain LOCKED.
- Canonical remains LOCKED.
- Railway was not changed.
- No migration was created or executed.
- No secret was changed, rotated, logged, returned, or persisted.
