# H.3-E release identity: traceability and a blocking divergence

Observed 2026-10-12, `main` = `fb044b37`. Nothing in Railway, the managed
database, Lovable or any secret was changed. Database reads were `SELECT`
statements on catalog and history tables.

**Status: re-pin STOPPED.** The managed database's attestation recorder is not
the function the repository migrations build. The release-identity migration
would have to be written against one of the two, and choosing between them is
an owner decision, not something to improvise. Evidence in section 3.

Source tags: **[api]** Railway / GitHub API or logs, **[db]** read-only query
on the managed database, **[repo]** repository inspection, **[disposable]**
PostgreSQL built from repository migrations, **[inferred]**, **[unverified]**.

## 1. Five identities that the old pins conflate

| Identity                 | What it is                                                                      | Value today                                       | Source of truth                                                                     | Evidence                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Build commit             | commit the running image was compiled from                                      | `10815fb44e165963adfaf07f71c474ca628f4b7f`        | `BUILD_INFO.json` inside the image (written from `RAILWAY_GIT_COMMIT_SHA` at build) | build log of deployment `3ad4b1fe`; `/version` `build.commit`, `embedded: true`; H.3-E gate run 38306322120 `runtime: PASS` **[api]** |
| Semantic revision        | revision label the worker declares for its parser semantics (`PARSER_REVISION`) | `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`    | Railway variable `PARSER_REVISION` (set by hand)                                    | `/version` `revision` and `semantic_revision` **[api]**                                                                               |
| Active deployment        | Railway deployment serving traffic                                              | `3ad4b1fe-9b9e-4fec-b79a-4215d27aab29`, `SUCCESS` | Railway                                                                             | deployments list; gate run 38306322120 **[api]**                                                                                      |
| Deployment source branch | branch Railway builds                                                           | `main`                                            | Railway service source                                                              | service config **[api]**                                                                                                              |
| Critical file hashes     | Git blob SHA-1 of five worker files                                             | see section 2                                     | the build commit's tree                                                             | `git rev-parse 10815fb4:<path>` **[repo]**                                                                                            |

**The semantic label does not describe the running code.** `5703b1d` and
`10815fb4` differ in 17 worker files, including `parser.py`
(`9d21670e…` against `981f6261…`) **[repo]**. `parser.py` is identical between
`2c5cded` (A9.1 real-demo parity, run 38112341484) and `10815fb4` **[repo]**,
so the parser semantics validated by A9.1 are those of the image, not those of
`5703b1d`. Moving the semantic pin to `git:10815fb4…` is the truthful value,
and it needs the Railway variable `PARSER_REVISION` changed by hand; keeping
`5703b1d` would encode a known-false claim. **Owner decision D2.**

## 2. Traceability matrix

Old pins: deployment `1b5778de-3eaf-46f1-9ea5-cba381d95313` (Railway status
now `REMOVED` **[api]**), source commit `91aeee853200d0f461d0d36af1781d7fdfa40941`,
branch `infra/cs2-parser-worker-v8`, semantic and build revision
`git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`.

Proposed values are those the evidence in section 1 supports. They are not
applied anywhere.

### 2.1 Repository

| Location                                                                                     | Pin                                                                                                       | Current                                          | Proposed                                                                                                                                        | Tests that would cover the change                                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `scripts/parser_runtime_attestation.py:19-22`                                                | branch / commit / deployment / source commit                                                              | `infra/…v8` / `5703b1d` / `1b5778de` / `91aeee8` | `main` / build `10815fb4` + semantic per D2 / `3ad4b1fe` / `10815fb4`                                                                           | `scripts/tests/test_parser_runtime_attestation.py` (binding, removed deployment, wrong branch) |
| `scripts/parser_runtime_attestation.py:26-32`                                                | critical hashes                                                                                           | blobs of `91aeee8` (`worker.py` `50a53b60…`)     | blobs of `10815fb4`: `parser.py 981f6261…`, `adapter.py 34ce0f19…`, `worker.py ecaac396…`, `raw_evidence.py 46df350b…`, `settings.py dc76db86…` | hash-mismatch negative tests                                                                   |
| `scripts/r5_8_3_release_preflight.py:38-42`                                                  | `EXPECTED_IDENTITY` uses one commit for revision, semantic and build                                      | `git:5703b1d` ×3                                 | build and semantic as separate fields                                                                                                           | R5.8.3 tests: divergent identity, unavailable runtime                                          |
| `scripts/r5_8_4_gate_reconciliation.py:109-113`                                              | deployment / source / branch                                                                              | old pins                                         | new pins                                                                                                                                        | `scripts/tests/test_r5_8_4_gate_reconciliation.py`                                             |
| `scripts/h3e91_live_preflight.py:27-30`                                                      | deployment / branch / source / revision                                                                   | old pins                                         | new pins                                                                                                                                        | `scripts/tests/test_h3e91_live_preflight.py:58-59` (currently asserts the old values)          |
| `.github/workflows/parser-runtime-attestation.yml:32-34`                                     | fetches `infra/…v8`, ancestry of `5703b1d`                                                                | old                                              | ancestry of the build commit on `main`                                                                                                          | changes the workflow blob → every registry below                                               |
| `.github/workflows/r5-8-3-read-only-preflight.yml:24`                                        | fetches `infra/…v8`                                                                                       | old                                              | not needed                                                                                                                                      | workflow lint                                                                                  |
| `scripts/approved_attestation_workflow.json`, `src/lib/parserAttestationWorkflowRegistry.ts` | workflow blob                                                                                             | `3070d8ba…`                                      | new blob of the edited workflow                                                                                                                 | registry tests                                                                                 |
| `src/lib/parserAttestation.ts:9-12, 44-48, 177-217`                                          | expected binding, critical hashes, `semantic_revision` and `build_revision` both compared to one `commit` | old                                              | separate build and semantic fields; new hashes                                                                                                  | `src/lib/__tests__/parserAttestation.test.ts`, OIDC tests                                      |
| `src/routes/api/public/parser-attestation-runtime.ts:10`                                     | `workerCriticalHash`                                                                                      | `50a53b60…`                                      | `ecaac396…`                                                                                                                                     | route registration test                                                                        |
| `src/lib/pipeline/parser/adapter.ts:55-56`                                                   | production fallback for expected revision and build revision                                              | `git:5703b1d` ×2                                 | build `git:10815fb4`; revision per D2                                                                                                           | `gate1e1.test.ts`, `quality271.test.ts`, `hotPayload.contract.test.ts`                         |
| `src/lib/client-parser/realDemExecutionReadiness.ts:145`                                     | `parserBuildIdentity`                                                                                     | `demoparser2:0.42.0:git:5703b1d`                 | per D2                                                                                                                                          | `realDemExecutionReadiness.test.ts`                                                            |

### 2.2 Managed database (functions; all `SECURITY DEFINER`, `search_path=""`) [db]

| Function                                                                         | Pins inside                                                                            | `md5(prosrc)` Live                 | `md5(prosrc)` from repository migrations [disposable]                                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)` | branch, commit, deployment, semantic, build, source commit, workflow blob, five hashes | `fe3250af2b461f03f459adf36b43ec21` | **`5ea1ffff4fc874ca50f0081b9c9a5e71`** (all files) / `aa4440ef5a3aac350ed292d8ca1d19ee` (only versions recorded in Live) |
| `assert_verified_parser_provenance(uuid)`                                        | branch, semantic, deployment, workflow blob                                            | `e00209501284eed35cb6fb710bca4390` | same                                                                                                                     |
| `h3e91_live_database_evidence()`                                                 | deployment, workflow blob                                                              | `c25adbc38cadd28cbe7958033d938be0` | same                                                                                                                     |
| `enforce_approved_attestation_workflow()`                                        | workflow blob                                                                          | `8a10c243e91f8f0a6db41279cf643830` | same                                                                                                                     |
| `r5_real_dem_execution_gate(uuid)`                                               | semantic revision                                                                      | `fce981a936d9bb7a8a860558a4d3a616` | same                                                                                                                     |

### 2.3 Configuration outside the repository

| Where                     | Variable                                                                                                     | Value                                                         | Note                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------ |
| Railway `cs2-demo-parser` | `PARSER_REVISION`                                                                                            | `git:5703b1d…` (as reported by `/version`) **[api]**          | changes only by hand; D2 |
| Railway `cs2-demo-parser` | `PARSER_BUILD_REVISION`                                                                                      | `git:10815fb4…` (`declared_revision_matches: true`) **[api]** | consistent               |
| Lovable app (server)      | `H3E91_EXPECTED_WORKER_BUILD_COMMIT`, `DEMO_PARSER_EXPECTED_REVISION`, `DEMO_PARSER_EXPECTED_BUILD_REVISION` | **[unverified]**                                              | not readable from here   |

## 3. The divergence that stops the migration

`record_parser_runtime_attestation` differs between the managed database and
any database built from the repository's migrations.

- Located by comparing `md5` of 250-character chunks: only chunks 25–26 differ
  **[db]** **[disposable]**.
- The difference is one value, the expected blob of `services/cs2-demo-parser/worker.py`:
  - Live: `50a53b607d26f00b4de05c5e8998611959e27bd1` (the blob at `91aeee8`) **[db]**;
  - repository migrations: `dfc2e67fcb3644be91108079f9096947c16119b3` (the blob at `5703b1d`), last set by `20260923093242_b5dfb9fd-….sql` **[repo]**.
- No migration file in the repository contains `50a53b60…` **[repo]**, and no
  statement recorded in `supabase_migrations.schema_migrations` contains it
  **[db]**. The Live function was changed outside the migration history.
- The application side moved to `50a53b60…` in commit `a9a2e9ea`
  (2026-10-05 21:42 -03, "reconcile deployed worker critical hash",
  `src/lib/parserAttestation.ts` only) **[repo]**. The database change most
  likely happened at the same time **[inferred]**.
- The rest of the function agrees with the repository once the unrecorded
  `20261006120000` (`ON CONFLICT (attestation_digest)`) is included, which the
  Live function already contains **[db]** — the known pattern of migrations
  applied without a history row.

Consequence: a re-pin migration written against the repository's definition
would fail its own pre-condition on Live (or, without one, silently overwrite
an out-of-band change); one written against Live would encode a definition
the repository cannot reproduce. Either is a production decision.

## 4. Decisions needed before the PR can be written

- **D1. Which recorder is authoritative.** Recommended: Live (`50a53b60…`),
  because the application has required that value since `a9a2e9ea`. Then the
  first migration is a repository-only reconciliation that reproduces the Live
  body exactly, guarded on Live by `md5(prosrc) = fe3250af…` so it is a no-op
  there and fails closed on any other definition.
- **D2. Semantic revision.** Recommended: `git:10815fb44e165963adfaf07f71c474ca628f4b7f`
  for both semantic and build, which requires setting Railway `PARSER_REVISION`
  to that value by hand. The alternative keeps `git:5703b1d…`, which section 1
  shows does not describe the running parser.

## 5. What the PR will contain once D1 and D2 are decided

1. Repository-only reconciliation migration for the recorder (D1), guarded by the Live hash.
2. Re-pin migration: the same guarded `pg_get_functiondef` + `replace` +
   post-condition pattern as `20261005231726`, over the five functions above;
   separate semantic and build values in the recorder; new hashes; new workflow
   blob. No table data touched; `EXECUTE` grants unchanged; the 17- and
   18-argument ledger writers untouched (`md5` `7032fe9f…` / `fa0c32b7…`
   asserted before and after).
3. Coordinated code changes from section 2.1, with build and semantic revision
   as separate fields.
4. Negative tests: divergent identity, removed deployment (`1b5778de` status
   `REMOVED`), wrong critical hash, runtime source unavailable, workflow blob
   mismatch.
5. Disposable PostgreSQL runs: the migration on a database built from
   repository migrations plus D1, re-run refusal, rollback restoring the prior
   `md5` values.
6. Rollout, in order: Railway `PARSER_REVISION` (manual, D2); Lovable server
   variables (manual); migrations through the authorized single-request
   procedure; app publication (manual, Lovable); then the H.3-E gate must report
   PASS before any attestation is dispatched.
