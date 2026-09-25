# H.3-E.8.1 — Database Persistence Identity Reconciliation

## Scope

This gate reconciles only the protected PostgreSQL attestation identity with the approved application, workflow source, and independently verified Railway deployment evidence.

## Identity change

| Binding | Previous database pin | Reconciled pin |
| --- | --- | --- |
| Railway deployment | `6330c8c4-a410-45db-a364-4eb47702c2fc` | `7a540da0-3a69-44c0-9c42-40209f903fa7` |
| Approved workflow Git blob | `de6732f465cae08c96aece304558273242b7016d` | `fae651ed5174aa609e4b07d575105d80a00d0055` |

Applied migration: `20260925011902_051ef9cf-6adf-4689-9fe2-c2fc86dedc40.sql`.

## Fail-closed controls

- The migration aborts before replacement unless provenance and nonce tables are both empty.
- It requires the exact previous pins and rejects partially reconciled or unexpected definitions.
- It preserves `SECURITY DEFINER` and an empty `search_path` on every modified function.
- It changes no HMAC, OIDC, freshness, schema-v3, release evidence, mapping authority, critical hash, RLS, trigger, or privilege rule.
- The service-only HMAC bridge remains transaction-local and was not executed by this gate.

## Result

Status: `PENDING FINAL VERIFICATION`.

- Valid attestation: `NOT EXECUTED`.
- DEM and Cache DEM: `NOT EXECUTED`.
- Canonical admission: `LOCKED`.
- Railway: `UNCHANGED`.
- Secrets: `UNCHANGED`.
- H.3-E.9: `NOT EXECUTED`.