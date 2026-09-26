# H.3-E.9.1 — Live Evidence Collector & Machine-Readable Preflight

## Status

`IMPLEMENTED / DIAGNOSTIC-ONLY / FAIL-CLOSED`

The collector is separate from the pure H.3-E.9 evaluator. A manual GitHub workflow gathers external evidence, authenticates to the server endpoint with a short-lived GitHub OIDC identity, and receives a machine-readable artifact. It never dispatches attestation or execution workflows.

## Trust boundaries and sources

- **GitHub checkout:** computes the actual Git blob SHA from the approved attestation workflow bytes and compares it with the reviewed registry SHA.
- **GitHub workflow:** checks OIDC structure and the presence-only state of endpoint, transport, HMAC, and Railway secrets. Values, lengths, hashes, and fragments are never emitted.
- **Railway control plane:** performs one read-only deployment GraphQL query and compares project, service, environment, deployment, branch, status, and source commit.
- **Runtime:** only `GET /health` and `GET /version` are allowed on the custom and Railway domains.
- **Recorder boundary:** the server snapshots provenance/nonce counts before and after exactly one anonymous `POST {}` to the pinned endpoint. It requires `401` and identical known counts. The runner does not claim this proof.
- **Server database collector:** calls the service-role-only read-only `public.h3e91_live_database_evidence()` RPC for aggregate counts, migration history and catalog security booleans. The sole additive migration is `20260926004515_2e070743-aa6d-496e-92b7-d1683758dad4.sql`; H.3-E.8.1, recorder and pins are unchanged. No complete real DEM or Cache DEM execution ledger is available: those states stay `UNKNOWN` and block readiness.

## OIDC endpoint authentication

`POST /api/internal/h3e9/preflight` accepts only an RS256 token verified against GitHub's discovery document and JWKS. Claims include the expected issuer, audience, repository and numeric IDs, subject, main branch, `workflow_dispatch`, exact workflow name/ref, reviewed `github.workflow_sha` (`7bafc26ac61ae3d3d7767a57d5749cbd3d31d2fc`), trigger SHA and short validity window. A changed workflow source needs a reviewed registry update. Anonymous and ordinary application-user requests return `401`.

The body is strict-schema external evidence only. Database/security state cannot be supplied by the caller. The response uses `Cache-Control: no-store` and contains no credential material.

## Artifact and integrity

`h3-e9-live-preflight.json` separates collector workflow SHA, collector trigger commit, approved attestation workflow blob SHA (`fae651ed5174aa609e4b07d575105d80a00d0055`) and Railway deployment commit (`ff0cc222f514c01eda6e26d7bb95271a8b0c9b04`). It includes safe database/security/runtime/Railway/transport evidence, secret-presence booleans, authorization state, execution locks, the H.3-E.9 result, and `evidenceDigest`.

The digest is SHA-256 over recursively key-sorted canonical JSON excluding `evidenceDigest`. Tests independently reproduce it.

## Authorization separation

Retention remains `NOT_AUTHORIZED` without explicit current evidence scoped to `H3E9_ATTESTATION_RETENTION`. Operator execution remains `NOT_AUTHORIZED` without explicit current evidence scoped to `H3E9_FIRST_VALID_ATTESTATION`. The collector does not accept or infer either authorization.

## Failure semantics

Missing, malformed, unknown, unavailable, expired, contradictory, mismatched, timeout, HTTP, database, Railway, OIDC, migration, security, runtime, secret, provenance, nonce, Attempt 9, or Canonical-lock evidence fails closed to `BLOCKED`. Runner observations are untrusted external claims; database and negative POST evidence are server-collected. `verifiedProvenanceCount > 0` means an attestation executed, while any unexpected provenance row blocks. The collector never repairs state automatically.

## No-side-effect guarantee

The implementation has no attestation dispatch, parser call, DEM access, Cache DEM access, database insert/update/delete, provenance/nonce creation, Attempt 9 creation, Canonical mutation, cleanup, Railway mutation, EnvironmentPatch acceptance, or secret mutation. The workflow is manual-only and uploads only the safe JSON artifact.

**FIRST VALID ATTESTATION = NOT EXECUTED. REAL DEM = NOT EXECUTED. CACHE DEM = NOT EXECUTED. ATTEMPT 9 = LOCKED. CANONICAL = LOCKED.**
