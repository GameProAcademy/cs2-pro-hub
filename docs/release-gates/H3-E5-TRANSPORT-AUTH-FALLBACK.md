# H.3-E.5 — Transport Authentication Fallback

Status: **IMPLEMENTED ON BRANCH / NOT YET MERGED**

## Trigger

H.3-E.3 Final External Preflight #10 succeeded and automatically triggered Parser Runtime Attestation #10.

Runtime evidence generation returned VERIFIED and GitHub OIDC minting succeeded. The delivery request reached the production attestation endpoint but received HTTP 401 UNAUTHORIZED.

The user independently confirmed that the transport secret configured in GitHub Actions and the corresponding Lovable runtime secret are intended to be identical. No secret value is recorded in this document.

## Change

The attestation transport gate now supports two exact, constant-time authentication paths:

1. Authorization: Bearer <transport-secret> — existing path.
2. X-Parser-Attestation-Transport: <transport-secret> — dedicated fallback for deployment/proxy surfaces that do not preserve Authorization reliably.

Both paths compare exactly against the same server-side transport secret. No prefix, suffix, normalization, presence-only check, or partial match is accepted.

The GitHub attestor sends both headers over HTTPS. The existing Authorization header remains in place.

## Security properties

- No secret values are stored in source, tests, documentation, logs, or responses.
- No secret is hashed or exposed for diagnostics.
- A request is still rejected with HTTP 401 unless one exact transport credential authenticates.
- HMAC, OIDC, payload, mapping, freshness, database recorder, and provenance gates are unchanged.
- This change does not authorize DEM execution.

## Required validation after merge

1. Quality Gates must pass.
2. H.3-E.3 Final External Preflight must pass.
3. A fresh Parser Runtime Attestation must reach the next validation layer.
4. If transport succeeds, inspect the exact next response before making any further change.
5. Do not execute a DEM as part of this diagnostic.
6. Do not mutate Railway or the database outside the existing attestation recorder path.

## Current lock

Even if the attestation becomes VERIFIED, controlled Cache execution remains blocked until the separate retention authorization and explicit operator authorization gates are independently satisfied.
