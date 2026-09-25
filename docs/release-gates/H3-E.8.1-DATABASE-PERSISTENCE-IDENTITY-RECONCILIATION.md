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

Status: `PASS`.

- Application, reviewed workflow bytes, and database now agree on deployment `7a540da0-3a69-44c0-9c42-40209f903fa7` and workflow blob `fae651ed5174aa609e4b07d575105d80a00d0055`.
- Post-migration read-only checks confirmed both old pins absent, both new pins present, all three authoritative functions remain `SECURITY DEFINER` with empty `search_path`, and the approved-workflow trigger remains installed.
- Provenance count: `0`; nonce count: `0`.
- Both attestation tables retain RLS and immutable user triggers; client roles retain zero data privileges.
- The authoritative recorder, assertion, and HMAC bridge remain unavailable to `anon` and `authenticated`, and executable by `service_role` only.
- The HMAC bridge still uses transaction-local `set_config(..., true)`.
- Focused tests: `63 passed`.
- Full web tests: `90 files passed`.
- Python tests: `216 passed, 10 skipped`.
- Typecheck: `PASS`; lint: `PASS` with nine pre-existing warnings and zero errors; managed build: `PASS`; diff check: `PASS`.
- Public unauthenticated empty POST: `401 UNAUTHORIZED`.

- Valid attestation: `NOT EXECUTED`.
- DEM and Cache DEM: `NOT EXECUTED`.
- Canonical admission: `LOCKED`.
- Railway: `UNCHANGED`.
- Secrets: `UNCHANGED`.
- H.3-E.9: `READY / NOT EXECUTED`.