# H.3-E.2 — Edge Function Attestation Recorder Architecture

**Status:** PROPOSED / PRE-EXECUTION / FAIL-CLOSED  
**Date:** 2026-09-24

## Why this exists

Lovable Cloud Project Secrets are available to server-side Edge Functions, while persistent PostgreSQL custom GUCs such as `app.settings.parser_attestation_hmac_secret` are not exposed as a user self-service feature.

The project therefore evaluates an Edge Function recorder as the supported server-side trust boundary.

This document does not authorize a real DEM execution.

## Current blocker

The existing PostgreSQL function `public.record_parser_runtime_attestation` validates:

`app.settings.parser_attestation_hmac_secret`

and writes immutable provenance/nonces.

The database function is already protected so that only `service_role` can execute it. The client roles do not have EXECUTE privilege.

The proposed change is to preserve the existing database security model while removing the dependency on the unavailable persistent GUC.

## Proposed flow

GitHub Actions
→ existing `PARSER_ATTESTATION_HMAC_SECRET`
→ canonical payload + HMAC signature
→ Edge Function recorder
→ validate transport secret
→ validate GitHub OIDC token
→ validate HMAC using Edge Function secret
→ validate payload/digest/freshness/idempotency
→ call a protected service-role-only database RPC
→ write `parser_attestation_nonces`
→ write `parser_runtime_provenance`

The HMAC secret must never be returned to the client, written to source, written to public tables, logged, or embedded in frontend code.

## Edge Function requirements

Function name should be deterministic, e.g. `parser-runtime-attestation`.

Because GitHub Actions is an external signed webhook-like caller, the function may use `verify_jwt = false`, but it MUST perform its own authentication and authorization:

1. Require the existing transport secret.
2. Require and cryptographically verify the GitHub OIDC token.
3. Require issuer `https://token.actions.githubusercontent.com`.
4. Require audience `gamepro-parser-attestation`.
5. Require repository `GameProAcademy/cs2-pro-hub`.
6. Require ref `refs/heads/main`.
7. Require workflow ref/path corresponding to `.github/workflows/parser-runtime-attestation.yml`.
8. Require workflow event `workflow_dispatch`.
9. Bind OIDC claims to the attestation payload workflow identity.
10. Reject expired/not-yet-valid tokens.
11. Never trust decoded JWT claims without signature verification.

## HMAC requirements

The Edge Function must read:

`PARSER_ATTESTATION_HMAC_SECRET`

from the protected Edge Function/Project Secret environment.

It must never return or log this value.

Prefer having GitHub Actions send the exact canonical payload string used for signing, so the Edge Function verifies the exact bytes rather than attempting to reproduce jq canonicalization independently.

The Edge Function must verify:

- SHA-256 digest of canonical payload;
- HMAC-SHA256 signature;
- payload JSON equivalence;
- attestation digest;
- nonce;
- freshness;
- release-gate evidence;
- frozen runtime identity;
- workflow identity;
- critical source hashes.

## Database requirements

Do not weaken the existing immutable provenance/nonces model.

Do not make the HMAC secret public.

Do not create a public secret table.

Do not embed a secret in a migration.

Do not grant anon/authenticated execute privileges.

Preferred implementation:

- retain the existing hardened function for backward compatibility;
- add a new versioned service-role-only RPC that receives the already-verified HMAC secret from the Edge Function, or otherwise provides an equivalent protected verification path;
- preserve all existing binding checks and immutable triggers;
- keep `anon` and `authenticated` at zero privileges;
- retain RLS and immutable triggers;
- reject any non-approved workflow/runtime identity.

If the database RPC receives the HMAC secret, it must not persist or return it. The Edge Function remains the only application component that reads the Project Secret.

## Workflow requirements

Update `.github/workflows/parser-runtime-attestation.yml` only after the Edge Function implementation is ready.

The workflow should:

1. remain manually dispatched;
2. remain restricted to `main`;
3. continue using the existing Railway token;
4. continue generating the GitHub OIDC token;
5. compute the canonical payload exactly as before;
6. send the canonical payload string to the Edge Function;
7. continue sending the existing signature;
8. continue sending release-gate evidence;
9. fail closed on any non-2xx response;
10. not execute a DEM.

The existing four GitHub Actions secrets remain authoritative:

- `RAILWAY_API_TOKEN`
- `PARSER_ATTESTATION_ENDPOINT`
- `PARSER_ATTESTATION_TRANSPORT_SECRET`
- `PARSER_ATTESTATION_HMAC_SECRET`

No new secret should be created unless strictly required by the implementation.

## Endpoint migration

Do not immediately overwrite the existing `PARSER_ATTESTATION_ENDPOINT`.

First deploy and smoke-test the Edge Function in a non-executing manner.

Then record its exact production URL.

Only after the endpoint is independently verified should the operator replace the GitHub repository secret value with the Edge Function URL.

## Testing

Required tests must include:

- missing transport secret → 401/403;
- wrong transport secret → 401/403;
- missing OIDC token → blocked;
- invalid OIDC signature → blocked;
- wrong OIDC audience → blocked;
- wrong repository claim → blocked;
- wrong branch/ref → blocked;
- wrong workflow ref → blocked;
- expired OIDC token → blocked;
- HMAC mismatch → blocked;
- payload/digest mismatch → blocked;
- nonce replay → blocked/idempotency failure;
- stale attestation → blocked;
- frozen runtime mismatch → blocked;
- critical hash mismatch → blocked;
- successful valid synthetic attestation → accepted;
- database provenance row created exactly once;
- nonce row created exactly once;
- secret never appears in response/log payloads.

Tests must use synthetic/fake attestation fixtures. They must not execute the real Cache DEM.

## Hard locks

This architecture change must NOT:

- enable real DEM execution;
- create Attempt 9;
- create Attempt 10+;
- upload or parse the controlled Cache DEM;
- create final RAW evidence;
- change Canonical authorization;
- mutate Railway production;
- apply the staged Railway EnvironmentPatch;
- weaken RLS;
- grant public database access;
- expose any secret;
- rotate existing secrets;
- bypass the attestation gate.

## Acceptance criteria

H.3-E.2 Edge Function architecture is considered implemented only when:

1. the Edge Function exists and is deployed;
2. the function reads the existing protected HMAC secret server-side;
3. the function validates transport authentication;
4. the function validates GitHub OIDC cryptographically;
5. the function validates HMAC;
6. the database write remains service-role-only;
7. immutable provenance/nonces remain fail-closed;
8. all synthetic security tests pass;
9. the endpoint URL is recorded;
10. the GitHub workflow is updated to send the exact canonical payload;
11. CI passes;
12. no real DEM execution occurred.

After that, a separate operator preflight must verify the deployed endpoint and only then replace `PARSER_ATTESTATION_ENDPOINT`.

A fresh attestation remains a separate subsequent gate.
