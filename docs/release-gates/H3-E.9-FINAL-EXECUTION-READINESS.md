# H.3-E.9 — Final Execution Readiness Gate

Status: **READY / NOT EXECUTED / FAIL-CLOSED**

This document defines the next pre-execution milestone after H.3-E.8.1. It does not authorize a valid attestation, DEM execution, Cache DEM execution, Attempt 9+, Canonical admission, cleanup, Railway mutation, EnvironmentPatch application, or secret rotation.

## Objective

Establish an independently auditable, machine-readable readiness state for the first valid parser runtime attestation while keeping real DEM execution locked.

## Required preconditions

### A. Identity parity

The following must remain identical:

- Application deployment identity: 7a540da0-3a69-44c0-9c42-40209f903fa7
- Railway project: aa2176ec-0e35-45f0-8cfa-9f8c0707dca4
- Railway service: 706fa246-a263-484f-a986-c74516be862b
- Railway environment: 2385d707-795d-4e32-a00b-0afaba0a9b7e
- Runtime branch: infra/cs2-parser-worker-v8
- Runtime parser commit: 5703b1d88f21ee57fdd1d83722edf30e0f0c6f76
- Approved workflow path: .github/workflows/parser-runtime-attestation.yml
- Approved workflow blob SHA: fae651ed5174aa609e4b07d575105d80a00d0055

Any mismatch is a hard blocker.

### B. Attestation storage state

Before the first valid attestation:

- parser_runtime_provenance count must be 0.
- parser_attestation_nonces count must be 0.
- RLS must remain enabled.
- anon and authenticated must have no data privileges.
- The recorder, assertion and HMAC bridge must remain service-role-only.
- Authoritative functions must remain SECURITY DEFINER with search_path="".

### C. External transport

The production endpoint must be configured exactly as:

https://gamepro.network/api/public/parser-attestation

Transport authentication must remain enabled.

An unauthenticated empty POST may be used only as a negative boundary test and must return 401 UNAUTHORIZED. It must not create provenance or nonce rows.

### D. Secret readiness

The following protected values must be present where required, without exposing values:

- RAILWAY_API_TOKEN
- PARSER_ATTESTATION_ENDPOINT
- PARSER_ATTESTATION_TRANSPORT_SECRET
- PARSER_ATTESTATION_HMAC_SECRET

The database HMAC secret must continue to be supplied through the protected transaction-local bridge. No secret may be persisted in public application tables, logs, artifacts, source files, or roadmap documentation.

### E. Freshness and evidence readiness

The attestation workflow must be able to produce, without executing a DEM:

- exact runtime identity evidence;
- Railway API deployment evidence;
- live /version evidence on both domains;
- critical source hash evidence;
- approved workflow identity evidence;
- GitHub OIDC identity;
- canonical payload;
- SHA-256 digest;
- HMAC-SHA256 signature;
- release gate evidence;
- fresh nonce.

### F. Retention authorization

Retention authorization must be explicit and independently represented as a readiness input. It must not be inferred from CI success, database readiness, Railway health, synthetic memory tests, or the existence of a staged DEM.

The readiness state must remain blocked if retention authorization is absent, stale, ambiguous, or unverifiable.

### G. Operator authorization

A separate explicit operator authorization is required for the first valid attestation. Readiness must not automatically authorize execution.

The system must distinguish:

1. technically ready;
2. attestation authorized;
3. attestation executed;
4. provenance verified.

These are separate states.

## Hard locks

H.3-E.9 must never:

- execute the real DEM;
- execute the Cache DEM;
- create Attempt 9 or later;
- create final RAW evidence;
- promote Canonical mappings;
- apply the staged Railway EnvironmentPatch;
- mutate Railway production;
- rotate or expose secrets;
- treat synthetic browser memory evidence as real parser memory evidence;
- treat a successful CI run as a valid attestation;
- automatically dispatch the valid attestation merely because readiness becomes green.

## Required readiness result

The implementation should produce a deterministic machine-readable result containing at least:

- status: READY or BLOCKED;
- blockers: array of stable blocker codes;
- exact pinned identities;
- storage counts;
- security invariant result;
- external endpoint boundary result;
- secret-presence result without values;
- retention authorization result;
- operator authorization result;
- workflow approval result;
- Railway runtime preflight result;
- validAttestationExecuted: always false until an explicit later execution;
- demExecuted: always false at this milestone;
- canonicalAdmission: LOCKED.

No readiness result may imply that a DEM was parsed.

## Transition rule

H.3-E.9 may become READY only when every required precondition is independently green. READY means ready for an explicitly authorized next action, not permission to execute automatically.

The next milestone after a green H.3-E.9 is a separately authorized fresh attestation execution and post-attestation audit. Real DEM execution remains a later, separately gated milestone.