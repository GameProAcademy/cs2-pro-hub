# H.3-E.7 / H.3-E.8 — Attestation envelope repair

## Goal
Repair the rejected GitHub Actions attestation envelope, reconcile the recorder's pinned deployment identity with the existing independently verified Railway evidence, and preserve every fail-closed security gate.

## Changes
- Extract the route's Zod envelope schema into a shared server-safe module so production and tests use the exact same validator.
- Reproduce the GitHub Actions envelope with synthetic data, capture the exact structural validation failure, and apply only the proven Zod-compatible object-record correction.
- Add positive and negative envelope tests covering every critical field and type boundary.
- Update only the expected deployment ID to `7a540da0-3a69-44c0-9c42-40209f903fa7`; keep project, service, environment, branch, parser version, parser commit, Railway, and the attestor script unchanged.
- Add semantic tests proving the current deployment evidence passes and a mismatched deployment remains rejected.
- Preserve runtime secret binding, transport auth, canonical equality, digest, HMAC, freshness, OIDC, release evidence, mapping authority, and protected recorder behavior.
- Record the exact non-sensitive Zod issue and repair status in the release-gate documentation and roadmap.

## Verification
- Run focused attestation/schema/crypto/runtime-binding tests, the full suite, TypeScript, lint, diff checks, and inspect the managed build result.
- Publish only the Lovable application.
- Send only an unauthenticated empty production POST and require `401 UNAUTHORIZED`; do not run valid attestation, DEM, ingestion, Canonical admission, Railway mutation, migration, or secret changes.
- Confirm provenance and nonce counts remain unchanged using read-only queries only.
