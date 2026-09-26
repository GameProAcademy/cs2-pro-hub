# H.3-E.9.1 — Live Evidence Collector & Machine-Readable Preflight

## Status

`IMPLEMENTED / DIAGNOSTIC-ONLY / FAIL-CLOSED`

The collector is separate from the pure H.3-E.9 evaluator. A manual GitHub workflow gathers external evidence, authenticates to the server endpoint with a short-lived GitHub OIDC identity, and receives a machine-readable artifact. It never dispatches attestation or execution workflows.

## Trust boundaries and sources

- **GitHub checkout:** computes the actual Git blob SHA from the approved attestation workflow bytes and compares it with the reviewed registry SHA.
- **GitHub workflow:** checks OIDC structure and the presence-only state of endpoint, transport, HMAC, and Railway secrets. Values, lengths, hashes, and fragments are never emitted.
- **Railway control plane:** performs one read-only deployment GraphQL query and compares project, service, environment, deployment, branch, status, and source commit.
- **Runtime:** only `GET /health` and `GET /version` are allowed on the custom and Railway domains.
- **Recorder boundary:** sends exactly one anonymous `POST {}` and requires `401`; it sends no valid credentials or attestation.
- **Server database collector:** uses only read queries for provenance, nonce, Attempt 9+, Canonical, and the existing diagnostic gate. Database catalog facts unavailable through the existing read surface remain `UNKNOWN`, which blocks readiness. No migration was added to weaken that boundary.

## OIDC endpoint authentication

`POST /api/internal/h3e9/preflight` accepts only an RS256 token verified against GitHub's discovery document and JWKS. Claims are bound to the expected issuer, dedicated audience, repository, `refs/heads/main`, branch ref type, `workflow_dispatch`, exact H.3-E.9.1 workflow name/ref/SHA, and short validity window. Anonymous and ordinary application-user requests return `401`.

The body is strict-schema external evidence only. Database/security state cannot be supplied by the caller. The response uses `Cache-Control: no-store` and contains no credential material.

## Artifact and integrity

`h3-e9-live-preflight.json` includes schema and collector versions, observation time, workflow/source identity, safe database/security/runtime/Railway/transport evidence, secret-presence booleans, authorization state, execution locks, the unchanged H.3-E.9 result, and `evidenceDigest`.

The digest is SHA-256 over recursively key-sorted canonical JSON excluding `evidenceDigest`. Tests independently reproduce it.

## Authorization separation

Retention remains `NOT_AUTHORIZED` without explicit current evidence scoped to `H3E9_ATTESTATION_RETENTION`. Operator execution remains `NOT_AUTHORIZED` without explicit current evidence scoped to `H3E9_FIRST_VALID_ATTESTATION`. The collector does not accept or infer either authorization.

## Failure semantics

Missing, malformed, unknown, unavailable, expired, contradictory, mismatched, timeout, HTTP, database, Railway, OIDC, migration, security, runtime, secret, provenance, nonce, Attempt 9, or Canonical-lock evidence fails closed to `BLOCKED`. The collector never repairs state automatically.

## No-side-effect guarantee

The implementation has no attestation dispatch, parser call, DEM access, Cache DEM access, database insert/update/delete, provenance/nonce creation, Attempt 9 creation, Canonical mutation, cleanup, Railway mutation, EnvironmentPatch acceptance, or secret mutation. The workflow is manual-only and uploads only the safe JSON artifact.

**FIRST VALID ATTESTATION = NOT EXECUTED. REAL DEM = NOT EXECUTED. CACHE DEM = NOT EXECUTED. ATTEMPT 9 = LOCKED. CANONICAL = LOCKED.**
