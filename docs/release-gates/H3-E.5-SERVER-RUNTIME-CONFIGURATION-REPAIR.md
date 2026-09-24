# H.3-E.5 — Server Runtime Configuration Repair

**Date:** 2026-09-24  
**Status:** IMPLEMENTED / VALIDATION PENDING / FAIL-CLOSED

## Observed failure

H.3-E.3 Final External Preflight run #9 completed successfully on `main` commit `72639dff38d87c5415e211fa5ca7aa524e0f07f0`. Its endpoint check is intentionally reachability-only and accepts a fail-closed response; it does not establish recorder readiness.

Parser Runtime Attestation run #9 reached verified evidence generation and GitHub OIDC minting. Its production delivery then received `503 ATTESTATION_SERVER_NOT_CONFIGURED`. The request did not reach the protected database recorder and wrote no parser provenance.

## Root cause and repair

The two existing project secret objects were present under the correct names. The published Worker supplied custom secrets as server runtime bindings, while the TanStack route read them from `process.env`. The custom server adapter forwarded the runtime object to TanStack without bridging those two named bindings.

The adapter now copies only `PARSER_ATTESTATION_TRANSPORT_SECRET` and `PARSER_ATTESTATION_HMAC_SECRET` from the server runtime binding object into the server-only environment before request dispatch. It does not enumerate, serialize, log, return, persist, rotate, or alter either value.

The recorder remains unchanged and fail-closed. Missing or short values still return `503`; configured requests must still pass bearer authentication, exact canonical payload checks, digest, HMAC, evidence, freshness, GitHub OIDC signature and claim binding, mapping authority, and the service-only transactional database recorder.

## Locks

This is a server configuration gate, not execution authorization. No attestation was run from Lovable, no DEM was executed, no Railway state was mutated, no Canonical data was admitted, and no database migration was added. GitHub Actions remains the attestor.
