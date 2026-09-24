# H.3-E.2 — Protected Attestation Recorder

**Date:** 2026-09-24  
**Status:** IMPLEMENTED / PRE-EXECUTION / FAIL-CLOSED

## Trust boundary

The externally callable recorder is the project server route at:

`https://gamepro.network/api/public/parser-attestation`

It is not a user endpoint. GitHub Actions must pass the existing transport secret, a cryptographically verified GitHub OIDC token, the exact canonical payload bytes signed by the workflow, and the HMAC-SHA256 signature.

The recorder validates the GitHub issuer, audience, repository, owner, main ref, workflow, event, run identity, workflow-file commit, token lifetime, frozen Railway/parser identity, critical hashes, release evidence, digest, and HMAC. Responses and logs exclude credentials, OIDC tokens, canonical payloads, and full evidence.

The reviewed workflow source is pinned by Git blob identity `de6732f465cae08c96aece304558273242b7016d` in the application registry and database persistence boundary.

## Transient database HMAC bridge

`public.record_parser_runtime_attestation_with_secret(...)` is executable only by `service_role`. It checks the server-side HMAC secret, sets `app.settings.parser_attestation_hmac_secret` locally for the current transaction, and delegates to the unchanged `public.record_parser_runtime_attestation(...)` function.

The setting disappears at transaction end. The secret is not persisted, inserted, returned, or logged. The existing database recorder remains the authoritative second verification layer for digest, HMAC, freshness, nonce, source/runtime bindings, critical hashes, mapping release, provenance, and replay prevention.

## Preserved controls

- Provenance and nonce tables remain private, RLS protected, and immutable.
- Public and signed-in roles cannot execute either recording path.
- The workflow remains manual-only and still performs all existing pre-attestation checks.
- The release-gate evidence remains BLOCKED and cannot authorize execution.

This implementation does not authorize real DEM execution.

Attempt 9+, final RAW evidence, Canonical admission, retention authorization, Railway mutation, and the staged Railway EnvironmentPatch remain outside this milestone and locked.
