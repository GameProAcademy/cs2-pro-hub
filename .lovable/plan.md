# H.3-E.5 — Server runtime configuration repair

## Goal
Make the existing protected attestation secrets available to the published TanStack server route without changing their values or weakening any gate.

## Implementation
- Bridge only the two existing attestation secret bindings from the server runtime `env` argument into server-only `process.env` before TanStack handles each request.
- Keep the recorder's existing 503, bearer, canonical payload, digest, HMAC, evidence, freshness, OIDC, mapping, and protected RPC checks unchanged.
- Add focused tests proving missing/short configuration remains fail-closed and diagnostics never expose secret material.
- Preserve H.3-E.3 as reachability-only; document the distinct unconfigured state rather than calling it ready.

## Verification and records
- Run focused tests, the full test suite, type checks, lint, and inspect the managed build result.
- Republish only the application, verify an unauthenticated production POST advances from 503 to 401, and do not run attestation or DEM execution.
- Record H.3-E.3 #9 success and H.3-E.4 #9 delivery failure without inventing database counts.
