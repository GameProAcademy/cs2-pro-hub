# H.3-E.2 — Protected attestation recorder

## Goal
Replace the persistent database HMAC dependency with a protected server-side recorder that injects the existing secret only for the database transaction, while preserving every current fail-closed attestation check.

## Implementation
- Keep the external recorder under the existing protected public API path required by this TanStack project, rather than adding a separate Edge Function runtime.
- Refactor the recorder into testable server-only validation logic: transport authentication, exact supplied canonical bytes, SHA-256, HMAC-SHA256, GitHub OIDC signature/JWKS verification, claim binding, freshness, frozen runtime identity, release-gate binding, and safe response codes.
- Add `canonicalPayload` to the GitHub Actions request without changing its manual-only trigger or existing signature calculation.
- Add an additive database migration with `record_parser_runtime_attestation_with_secret(...)`; it will use transaction-local `set_config(..., true)`, call the existing recorder unchanged, and grant execution only to `service_role`.
- Update the API recorder to call the protected wrapper through the privileged server client after all server-side checks pass.

## Security verification
- Add synthetic tests for missing/wrong transport authentication, malformed/invalid OIDC, issuer/audience/repository/ref/workflow/run bindings, expiry, missing/mismatched HMAC and digest, canonical and release evidence mismatch, frozen identity mismatches, replay handling, successful recording, and secret non-disclosure.
- Add migration contract tests for local-only secret injection, restricted privileges, preserved RLS/immutability, and unchanged authoritative recorder.
- Apply the migration, verify the live security invariant and privilege state, deploy through the supported app endpoint, and run only synthetic smoke checks if the required existing secrets are available by name.

## Documentation and status
- Document the server-side trust boundary, transient HMAC bridge, OIDC/HMAC checks, endpoint, tests, and remaining locks.
- Update the authoritative roadmap to `IMPLEMENTED / PRE-EXECUTION / FAIL-CLOSED` only if implementation, deployment, and checks pass.
- Do not execute any DEM, create Attempt 9+, change Canonical authorization, mutate Railway, apply its staged patch, rotate secrets, or dispatch the attestation workflow.
