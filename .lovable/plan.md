# C.10-R1.1 trust-chain closure

## Goal
Close the attestation infrastructure gaps while keeping the release blocked and making no real-demo, Attempt 9, Canonical, cleanup, secret, or Railway changes.

## Changes
- Investigate and formally classify `sandbox_exec`; harden and permanently test effective table and function privileges for all client/internal roles.
- Add a database migration for live/migration parity checks and a read-only `pre_real_demo_gate_status` that remains blocked without genuine external evidence.
- Pin every action in the attestation workflow to an official immutable commit and bind accepted attestations to an approved workflow commit without circular self-reference.
- Expand OIDC, HMAC, freshness, nonce replay, workflow identity, and no-side-effect tests.
- Correct migration references, add the machine-readable gate report and full C.10-R1.1 audit report, and update the roadmap.

## Verification
- Validate the applied migration, ACLs, RLS, triggers, policies, function security, counts, and gate status against the live database.
- Run focused TypeScript, Python, event-matrix, parity/determinism no-input, and SQL security checks.
- Reconfirm Attempt 9/10+, Canonical authorization, provenance, nonce, cleanup, and Railway remain unchanged.

## Technical constraints
- Do not process or copy the real DEM.
- Do not configure secrets, create verified provenance, authorize mappings, deploy, or mutate Railway.
- Keep the final operational gate fail-closed: code readiness is not production evidence.
