# H.3-E.2 — Protected Operator Configuration & Attestation Readiness

Status: `BLOCKED / PRE-EXECUTION / FAIL-CLOSED`

## Purpose

Close the external operator configuration required before the first fresh parser runtime attestation. This document does not authorize a real DEM execution, Attempt 9, RAW finalization, Canonical admission, cleanup, Railway mutation, or EnvironmentPatch acceptance.

## Frozen runtime and controlled target

- Repository: `GameProAcademy/cs2-pro-hub`
- Attestor source: `main`
- Railway runtime branch: `infra/cs2-parser-worker-v8`
- Frozen parser commit: `5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`
- Railway project: `aa2176ec-0e35-45f0-8cfa-9f8c0707dca4`
- Railway service: `706fa246-a263-484f-a986-c74516be862b`
- Railway production environment: `2385d707-795d-4e32-a00b-0afaba0a9b7e`
- Parser: demoparser2 0.42.0
- Contract: 1
- Controlled DEM: `furia-vs-gamerlegion-m1-cache.dem`
- Controlled DEM size: 473,748,061 bytes
- Controlled DEM SHA-256: `0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d`

## Required GitHub Actions secrets

Repository: `GameProAcademy/cs2-pro-hub`

Navigate to:

`Settings → Secrets and variables → Actions → Secrets → New repository secret`

Configure these exact repository secrets:

1. `RAILWAY_API_TOKEN`
2. `PARSER_ATTESTATION_ENDPOINT`
3. `PARSER_ATTESTATION_TRANSPORT_SECRET`
4. `PARSER_ATTESTATION_HMAC_SECRET`

Do not create `GITHUB_OIDC_TOKEN` as a secret. The workflow mints it at runtime with `id-token: write`.

The current attestation workflow consumes the four named secrets exactly as above. Do not rename them without changing and re-auditing the workflow.

### Railway token requirement

The current attestation script calls Railway GraphQL using:

`Authorization: Bearer <RAILWAY_API_TOKEN>`

Therefore the token must be an account- or workspace-scoped Railway API token accepted through the Bearer header. A Railway project token is intentionally not substituted here because Railway project tokens use the `Project-Access-Token` header.

Prefer a workspace-scoped token for the `GamePro CS2` workspace over a broad account token when the workspace contains the required project.

Do not put `RAILWAY_API_TOKEN` into the Railway parser service variables merely to satisfy the attestor. The attestor is a GitHub Actions job and needs the GitHub repository secret.

## Protected database HMAC configuration

The application requires the same HMAC secret on the GitHub side and as the protected PostgreSQL runtime setting:

`app.settings.parser_attestation_hmac_secret`

The value must NOT be stored in a public table, frontend code, migration, source file, log, issue, PR, or browser-visible project secret.

Generate the HMAC secret locally with a cryptographically secure generator, for example:

`python -c "import secrets; print(secrets.token_urlsafe(48))"`

Do not paste the generated secret into ChatGPT, GitHub issues, PRs, source files, or screenshots.

The protected PostgreSQL operation is conceptually:

`ALTER DATABASE postgres SET app.settings.parser_attestation_hmac_secret = '<OPERATOR_SECRET>'; `

Run it only through an authorized database-admin path. The database must be treated as production.

Afterward, verify only the boolean presence, never the value:

```sql
SELECT
  current_setting('app.settings.parser_attestation_hmac_secret', true) IS NOT NULL
  AND length(current_setting('app.settings.parser_attestation_hmac_secret', true)) > 0
  AS hmac_setting_present;
```

The verification must return `true`. Do not output the secret or its value.

## Secret equality requirement

The HMAC secret configured in:

`PARSER_ATTESTATION_HMAC_SECRET`

must be byte-for-byte identical to the protected PostgreSQL setting:

`app.settings.parser_attestation_hmac_secret`

Do not use two different secrets.

## Endpoint requirement

`PARSER_ATTESTATION_ENDPOINT` must point to the approved production server-side recorder for parser attestation.

An endpoint merely existing is not enough. The endpoint must be the approved production recorder and accept the current V3 payload, HMAC signature, transport secret, and GitHub OIDC token.

Do not replace the endpoint with a test, preview, localhost, generic API, or arbitrary URL.

## Retention authorization

Retention authorization is a separate release gate from HMAC and attestation.

The exact controlled Cache DEM is permitted to exist only under the previously defined short-retention policy. Retention authorization must be independently recorded/evidenced before the first real run.

Do not infer retention authorization from:
- DEM existence;
- CI success;
- PR merge;
- Railway health;
- synthetic memory tests;
- parser identity;
- a READY staging object by itself.

The retention gate must explicitly define the temporary input → processing → validation/extraction → short retention → deletion lifecycle and the authorized retention window.

## Readiness checklist

H.3-E.2 is closed only when all are independently verified:

- [ ] GitHub `RAILWAY_API_TOKEN` configured and usable by the attestor.
- [ ] GitHub `PARSER_ATTESTATION_ENDPOINT` configured with the approved production recorder.
- [ ] GitHub `PARSER_ATTESTATION_TRANSPORT_SECRET` configured.
- [ ] GitHub `PARSER_ATTESTATION_HMAC_SECRET` configured.
- [ ] PostgreSQL protected HMAC setting configured with the exact same secret.
- [ ] Database verification confirms the HMAC setting is present without revealing its value.
- [ ] Approved production endpoint is verified.
- [ ] Retention authorization is independently evidenced.
- [ ] The exact frozen Cache envelope remains unchanged.
- [ ] No Attempt 9 exists.
- [ ] No Attempt 10+ exists.
- [ ] Canonical authorization/verification remains zero.
- [ ] No Railway staged patch is accepted.
- [ ] No real DEM execution has occurred.

## After H.3-E.2

Only after every checklist item is GREEN:

1. Run the attestation workflow manually from `main`.
2. Require the attestation to finish `VERIFIED`.
3. Independently inspect provenance, nonce, workflow identity, Railway deployment identity, runtime identity, critical hashes and freshness.
4. Stop again if any attestation/provenance condition is not independently proven.
5. Only then evaluate H.3-E.3/H.3-E.4 for one single controlled Cache execution.

A successful attestation does not itself authorize Attempt 9. Execution remains a separate explicit operator authorization step.

## Current hard locks

Until H.3-E.2 and the subsequent gates are independently closed:

- no real DEM execution;
- no Attempt 9/10+;
- no Python/WASM execution against the real DEM;
- no final RAW evidence;
- no Canonical promotion;
- no cleanup;
- no Railway production mutation;
- no EnvironmentPatch acceptance;
- no secret exposure or rotation;
- no bypass of attestation.

## 2026-09-24 read-only reconciliation

- GitHub main HEAD: `7e530633cb4c2533a12900bfe9a86f2338e4df6c`
- Quality Gates for the preceding H.3-E closure: PASS.
- Railway latest successful deployment remains on `infra/cs2-parser-worker-v8`.
- Railway staged EnvironmentPatch `d66b5a12-a69e-4b9a-87b6-314f75c471cc` remains untouched.
- Railway service currently has no `RAILWAY_API_TOKEN` variable; this is correct because the attestor requires a GitHub Actions secret.
- Project database is enabled and the protected HMAC setting is currently absent.
- The project database role observed by the protected inspection is the database owner `postgres`; PostgreSQL documents that database owners may change per-database session defaults with `ALTER DATABASE ... SET`.
- Parser runtime provenance rows: 0; VERIFIED rows: 0.
- Attestation nonce rows: 0.
- These observations do not authorize execution.

