# Attestation v3 forensic hardening and preflight

## Scope
- Preserve the current GitHub `main`, approved workflow blob, frozen Railway runtime, staged DEM, and all fail-closed locks.
- Do not run the first attestation, dispatch its workflow, process the DEM, create Attempt 9+, promote Canonical data, alter Railway, or change secrets.

## Implementation
1. Audit the applied v3 recorder, provenance assertion, persistence trigger, attestor script, and regression contracts.
2. Add one additive migration only if needed to make the recorder persist an explicitly v3 verification method and enforce the three distinct SHA identities.
3. Extend validation and regression tests for `trigger_commit_sha`, `workflow_file_commit_sha`, approved workflow blob SHA, main attestor branch, frozen runtime branch, signed evidence binding, and v2 rejection.
4. Apply any required additive migration to Lovable Cloud, then verify schema, migration registry, staging, attempts, provenance, nonces, Canonical inventory, HMAC state, and the read-only gate.
5. Run TypeScript, focused and full web tests, changed-file lint, and build checks. Record Python and external CI honestly when unavailable.
6. Update the release report and roadmap with exact results and remaining operator blockers.

## Technical constraints
- Existing applied migrations are immutable; the removed redundant migration stays absent.
- HMAC SHA-256, OIDC RS256, freshness, nonce, canonical payload, digest, and signature policies remain unchanged.
- The final status is `CLOSED` only if every listed invariant passes; otherwise it is `BLOCKED` with the exact blocker.
