# H.3-E release identity: traceability and a blocking divergence

Observed 2026-10-12, `main` = `fb044b37`. Nothing in Railway, the managed
database, Lovable or any secret was changed. Database reads were `SELECT`
statements on catalog and history tables.

**Status (2026-10-12, 19:10 -03).** Nothing below was applied to the managed
database, Railway or Lovable.

- D1 (managed recorder is authoritative): `20261012200000_r5_8_7_…` versions
  it (section 10).
- D3, option (a) since 18:37 -03 (it replaced option (b) of 18:05): remove
  deployment-scoped provenance uniqueness from repository builds, finishing
  R5.8.6. `20261012210000_r5_8_8_…` drops
  `parser_runtime_provenance_deployment_identity_idx` only when it has its
  original definition, is a no-op when it is absent (the managed database),
  and fails closed otherwise (section 11).
- D2: prepared only (section 8).
- Tests: probe 16/16 on a disposable database built from all 158 repository
  migrations; see section 11 and the PR for CI.

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

## 4. Decisions (D1 and D2 taken 2026-10-12 17:59 -03)

- **D1. Which recorder is authoritative.** Decided: Live. Recommended: Live (`50a53b60…`),
  because the application has required that value since `a9a2e9ea`. Then the
  first migration is a repository-only reconciliation that reproduces the Live
  body exactly, guarded on Live by `md5(prosrc) = fe3250af…` so it is a no-op
  there and fails closed on any other definition.
- **D2. Semantic revision.** Decided: prepare, do not change Railway yet (section 8). Recommended: `git:10815fb44e165963adfaf07f71c474ca628f4b7f`
  for both semantic and build, which requires setting Railway `PARSER_REVISION`
  to that value by hand. The alternative keeps `git:5703b1d…`, which section 1
  shows does not describe the running parser.

## 5. Original plan (superseded by sections 9 and 10)

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

## 6. Second divergence: a unique index the managed database does not have

Found while comparing every dependency of `record_parser_runtime_attestation`
between the managed database **[db]** and a database built from all repository
migrations **[disposable]**.

| Object                              | Managed database                                               | Repository build                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `parser_runtime_provenance` indexes | `…_attestation_digest_key (attestation_digest)`, `…_pkey (id)` | the same two **plus** `parser_runtime_provenance_deployment_identity_idx` UNIQUE `(railway_project_id, railway_service_id, railway_environment_id, deployment_id, deployment_commit, semantic_revision, build_revision)` |

Evidence:

- `20260921080334_7925a88b-….sql:52` creates that index with `CREATE UNIQUE INDEX` **[repo]**. The managed database recorded that version **[db]**.
- `20261006120000_r5_8_6_attestation_idempotency_scope.sql` intends to remove the deployment-scoped uniqueness ("different attestations may prove the same frozen deployment"), but it only drops a **constraint** with those columns. The uniqueness is an **index**, so on a repository build nothing is dropped **[repo]** **[disposable]**.
- That version is not recorded in the managed database, yet its effects are there (`…_attestation_digest_key`, `ON CONFLICT (attestation_digest)` in the recorder) and the index is gone **[db]**. No recorded statement drops the index **[db]**. It was removed outside the migration history **[inferred]**.

Effect: on a repository build, a second attestation for the same deployment
identity fails in the recorder's `INSERT` with a unique violation that
`ON CONFLICT (attestation_digest)` does not catch. On the managed database it
is accepted, which is what R5.8.6 says it wants. The two databases behave
differently for the very function D1 reconciles.

Everything else compared equal: the five other pin-bearing functions; for the
recorder the signature, result type, language, owner `postgres`,
`SECURITY DEFINER`, `search_path=""`, volatility, strictness, parallel safety,
`EXECUTE` for `postgres` and `service_role` only, and the comment;
`parser_attestation_nonces` and `parser_runtime_provenance` columns, constraints,
triggers and trigger functions (`md5` `622bbb2b…`, `8a10c243…`, `21baae34…`);
table ACLs apart from `MAINTAIN` (`m`), which exists only on PostgreSQL 17.

Needed from the owner (D3): whether the D1 reconciliation should also bring
repository builds in line with the managed database by dropping
`parser_runtime_provenance_deployment_identity_idx` when present (a no-op on
the managed database, a real change on every fresh build), or whether the index
should stay and the managed database is the one to be reviewed.

## 7. Reference definition of the Live recorder

`docs/reference/record_parser_runtime_attestation.live-2026-10-12.sql`.

- It is the repository build's `pg_get_functiondef` with exactly one
  substitution: the `worker.py` blob `dfc2e67f…` → `50a53b60…` (one occurrence).
- `md5` of that definition (file content without its final newline) =
  `c69a1a801e8377b2121c6d07c2b91a39`, equal to `md5(pg_get_functiondef(…))`
  read on the managed database **[db]** **[disposable]**.
- `md5` of the body = `fe3250af2b461f03f459adf36b43ec21`, equal to
  `md5(prosrc)` on the managed database.
- It reads the HMAC secret with `current_setting('app.settings.parser_attestation_hmac_secret', true)`;
  no secret value is in the file.

The D1 migration, once D3 is decided, would: accept only `md5(prosrc)` =
`fe3250af…` (no-op, managed database) or `5ea1ffff…` (repository build, apply
the one substitution and assert `fe3250af…` afterwards); fail closed on any
other value; assert owner, `SECURITY DEFINER`, `search_path`, `EXECUTE` grants
and the comment before and after; carry no `BEGIN`/`COMMIT` of its own.

## 8. D2: semantic revision `git:10815fb44e165963adfaf07f71c474ca628f4b7f` (prepared, not applied)

Candidate: set Railway `PARSER_REVISION` to the build commit, so semantic and
build revision name the same code.

Validation that it should represent this build:

- The worker documents `PARSER_REVISION` as the identifier of "the deployed
  build" (`services/cs2-demo-parser/settings.py:6`) **[repo]**.
- The declared value `git:5703b1d…` names a tree that differs from the image
  in 17 worker files, `parser.py` included **[repo]**.
- `parser.py` of the image equals that of `2c5cded`, the commit whose parser
  was validated on the real demo by A9.1 (run 38112341484) **[repo]**.
- Not yet validated: whether anything outside this repository (stored
  provenance rows, reports, Canonical rows) keys data on `git:5703b1d…`.
  `r5_real_dem_execution_gate` contains it **[db]**; a read-only scan of the
  tables that store `semantic_revision` is still to be done **[unverified]**.

Consequences of the change, once made:

| Component                                                                               | Effect                                                                                        | Required counterpart                                                                                                                                  |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker `/version`                                                                       | `revision` and `semantic_revision` become `git:10815fb4…`                                     | none                                                                                                                                                  |
| App revision lock (`adapter.ts:55`, env `DEMO_PARSER_EXPECTED_REVISION`)                | rejects the worker (`PARSER_IDENTITY_MISMATCH`) until the expected revision is the same value | code change + Lovable publication, or the Lovable variable                                                                                            |
| Attestation recorder, `assert_verified_parser_provenance`, `r5_real_dem_execution_gate` | still expect `git:5703b1d…`                                                                   | re-pin migration                                                                                                                                      |
| R5.8.3, attestation script, `parserAttestation.ts`                                      | still expect `git:5703b1d…` for both fields                                                   | re-pin PR                                                                                                                                             |
| A Railway variable change                                                               | Railway starts a new deployment                                                               | confirm afterwards that `build.commit` is still `10815fb4…`; if Railway built a newer commit, `PARSER_BUILD_REVISION` and every build pin must follow |

Tests that must exist before the change (part of the re-pin PR):

- worker: `/version` reports the two fields from `PARSER_REVISION` / `PARSER_BUILD_REVISION`, and `declared_revision_matches` compares the build revision with `BUILD_INFO.json`;
- app: a worker whose semantic revision differs from the expected one is rejected; a worker whose build revision differs is rejected; both pins come from separate fields;
- database (disposable): the re-pinned recorder accepts the new identity and rejects `git:5703b1d…`, a removed deployment (`1b5778de`), a wrong critical hash, and a payload whose `custom_domain_version` disagrees with `railway_domain_version`;
- gate: H.3-E stage `runtime` stays PASS and R5.8.3 decision becomes green only when all of the above agree.

Manual procedure, later, in this order:

1. Merge the re-pin PR (app and scripts) without publishing.
2. Apply the reconciliation and re-pin migrations through the authorized single-request procedure; verify with read-only queries.
3. Railway → `cs2-demo-parser` → Variables: `PARSER_REVISION=git:10815fb44e165963adfaf07f71c474ca628f4b7f`. Leave `PARSER_BUILD_REVISION` unchanged. Deploy the staged change.
4. Wait for `SUCCESS`; read `/version`: `revision`, `semantic_revision` and `build_revision` = `git:10815fb4…`, `build.commit` = `10815fb4…`, `declared_revision_matches: true`.
5. Lovable: publish the app (and set `H3E91_EXPECTED_WORKER_BUILD_COMMIT` if not set).
6. Run the H.3-E activation gate; it must report PASS before any attestation.

Rollback of step 3: set `PARSER_REVISION=git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76` again, or redeploy `3ad4b1fe` from the Railway history.

## 9. D3: what `parser_runtime_provenance_deployment_identity_idx` was for, and why it is gone from the managed database

Decision D3: option (b) at 18:05 -03 (keep the index, investigate), replaced
at 18:37 -03 by option (a) on the evidence below (remove it from repository
builds). The investigation is kept as the record of why.

### 9.1 Origin

`20260921080334_7925a88b-….sql:52` creates it as `CREATE UNIQUE INDEX` over
`(railway_project_id, railway_service_id, railway_environment_id,
deployment_id, deployment_commit, semantic_revision, build_revision)`, and the
recorder of that time used exactly that tuple as its `ON CONFLICT` target
**[repo]**. The managed database recorded that version **[db]**.

### 9.2 R5.8.6's intent is explicit: remove deployment-scoped uniqueness

- Migration header (`20261006120000_…sql:3-15`): the deployment identity "makes
  a second legitimate attestation for the same deployment impossible";
  "different attestations may prove the same frozen deployment" **[repo]**.
- PR #56 (merged 2026-10-06 05:11 UTC, `5385b7d1`), "Root cause confirmed":
  Runtime Attestations #32 and #33 were rejected with
  `PARSER_ATTESTATION_IDEMPOTENCY_CONFLICT` because "the first successful
  attestation consumes the entire frozen deployment identity"; correction:
  "remove the deployment-wide uniqueness constraint", "make
  `attestation_digest` the idempotency key", "preserve nonce uniqueness as the
  replay barrier" **[api]**.
- Test `parserAttestationIdempotencyScope.test.ts`: "moves provenance
  uniqueness from deployment identity to attestation digest" **[repo]**.
- `roadmap.md:83`: Runtime Attestation #36 was recorded as "a distinct
  digest-scoped record under R5.8.6" for the same deployment **[repo]**.

No document, test or migration found states that one provenance row per
deployment is a security requirement. The replay protections the recorder
relies on are the nonce primary key, the `attestation_digest` uniqueness, the
5-minute freshness window, the HMAC signature and the OIDC workflow binding.

### 9.3 Why the repository still has the index

The first R5.8.6 draft raised `R5_8_6_OLD_PROVENANCE_IDEMPOTENCY_CONSTRAINT_NOT_FOUND`
when no **constraint** over those columns existed. Commit `d6944799`
(2026-10-06 01:44 -03, "fix(db): tolerate absent legacy attestation
constraint") turned that into "drop it if present". The object was an
**index**, never a constraint, so on every repository build the lookup finds
nothing and the index stays **[repo]** **[disposable]**. The test kept passing
because it only checks the migration text.

### 9.4 State of the managed database [db]

| Item                                   | Value                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Indexes on `parser_runtime_provenance` | `parser_runtime_provenance_pkey (id)`, `parser_runtime_provenance_attestation_digest_key (attestation_digest)` |
| Unique / primary constraints           | the same two                                                                                                   |
| Provenance rows                        | 3, all `VERIFIED`                                                                                              |
| Rows per deployment identity           | `1b5778de…` / `5703b1d…`: **2**; `207d0b66…` / `5703b1d…`: 1                                                   |
| Nonces                                 | 3                                                                                                              |
| Recorded statement dropping the index  | none                                                                                                           |

The two rows for `1b5778de` exist only because the index is absent. The index
was dropped outside the migration history **[inferred]**, before Runtime
Attestation #36 (run 37443082666, 2026-10-06 09:27 UTC) **[inferred from the
row count]**.

### 9.5 Consequences of keeping the index (D3) — measured on a disposable database

| Case                                                                                   | Repository build (index present)                                                                                                                                                                                                        | Managed-like (index absent)                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| First attestation of a deployment                                                      | accepted                                                                                                                                                                                                                                | accepted                                           |
| Exact replay                                                                           | rejected, `23505` on `parser_attestation_nonces_pkey`                                                                                                                                                                                   | the same                                           |
| Second, distinct attestation of the same deployment                                    | **rejected**, raw `23505` on `parser_runtime_provenance_deployment_identity_idx`, not caught by `ON CONFLICT (attestation_digest)` (the endpoint would see an unexpected database error, not `PARSER_ATTESTATION_IDEMPOTENCY_CONFLICT`) | accepted; 2 rows                                   |
| `CREATE UNIQUE INDEX …deployment_identity_idx` over two attestations of one deployment | —                                                                                                                                                                                                                                       | **fails**, `23505` "could not create unique index" |

Security reading: the index adds no replay protection beyond the nonce and
digest uniqueness; it limits each deployment to one provenance row for ever.
Restoring it on the managed database would require deleting a VERIFIED
provenance row, which this project forbids. Keeping it in the repository keeps
fresh builds behaving unlike production for every re-attestation.

The owner replaced option (b) with option (a) after this evidence; the
migration is in section 11.

## 10. D1 migration and tests

`supabase/migrations/20261012200000_r5_8_7_reconcile_attestation_recorder_live_definition.sql`

- Starting states accepted: `md5(prosrc)` `fe3250af…` (managed; no-op) or
  `5ea1ffff…` (repository build; exactly one occurrence of `dfc2e67f…` replaced
  by `50a53b60…`, then `fe3250af…` asserted). Anything else:
  `R5_8_7_RECORDER_UNEXPECTED_DEFINITION`, SQLSTATE `55000`, nothing changed.
- Checked before and after: identity arguments, result `uuid`, `plpgsql`,
  function kind, `SECURITY DEFINER`, volatile, not strict,
  `search_path=""`, owner `postgres`, `EXECUTE` for `service_role` and not for
  `anon`, `authenticated`, `sandbox_exec` or `PUBLIC`, and the comment.
- A single `DO` block: no explicit `BEGIN`/`COMMIT`, no data, no grant, no index.
- Rollback for repository builds only:
  `docs/rollback/20261012200000_r5_8_7_recorder_rollback_repository_builds_only.sql`
  (section 11). On the managed database the migration changes nothing, so
  there is nothing to roll back there, and the rollback refuses to run there.

The tests of this migration are in section 11 together with R5.8.8's (the
eight-scenario table that was here described an earlier revision of the probe
and has been replaced).

## 11. R5.8.8: finish R5.8.6 (D3 option a)

`supabase/migrations/20261012210000_r5_8_8_drop_deployment_identity_uniqueness.sql`.
A new corrective migration; no historical migration is edited.

| State found                                                                                                                    | Action                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| index present, `pg_get_indexdef` exactly the original definition, unique, no predicate or expression, not backing a constraint | `DROP INDEX public.parser_runtime_provenance_deployment_identity_idx` |
| index absent and no other unique index over the seven deployment columns                                                       | no-op (notice `R5_8_8_DEPLOYMENT_INDEX_ALREADY_ABSENT`)               |
| index with another definition                                                                                                  | `55000` `R5_8_8_UNEXPECTED_INDEX_DEFINITION`                          |
| another unique index over the deployment columns                                                                               | `55000` `R5_8_8_UNEXPECTED_DEPLOYMENT_UNIQUENESS`                     |
| `UNIQUE (attestation_digest)` on provenance or on nonces, or `PRIMARY KEY (nonce)`, missing                                    | `55000` `R5_8_8_REPLAY_CONTROLS_MISSING`                              |
| recorder not `fe3250af…` (R5.8.7 not applied)                                                                                  | `55000` `R5_8_8_RECORDER_NOT_RECONCILED`                              |

All checks run before and after. No data, grant, or other object is changed;
no explicit `BEGIN`/`COMMIT`.

Rollbacks, both for repository builds only, never for the managed database.
Each begins with an enforced guard, not only a comment: when
`supabase_migrations.schema_migrations.created_by` exists and holds a row
written by the platform (`created_by = 'apikey@lovable.dev'`, which is how the
managed history marks Lovable-applied migrations; 144 of its 150 rows were observed
read-only on 2026-10-12), the rollback raises
`R5_8_7_ROLLBACK_REFUSED_ON_MANAGED_DATABASE` /
`R5_8_8_ROLLBACK_REFUSED_ON_MANAGED_DATABASE` (`55000`) before reading or
changing anything. Builds made by `supabase db reset` or by the tests have no
such row.

- R5.8.8: `docs/rollback/20261012210000_r5_8_8_…` re-creates the index, and
  refuses (`R5_8_8_ROLLBACK_WOULD_REQUIRE_DELETING_ATTESTATIONS`) when two
  rows share a deployment identity. It contains no `DELETE`, `UPDATE` or
  `TRUNCATE`, so it can never remove or rewrite a VERIFIED attestation; it
  also refuses when the index is already present.
- R5.8.7: `docs/rollback/20261012200000_r5_8_7_…` replaces only the function
  body (from `fe3250af…` to `5ea1ffff…`, failing closed from any other state)
  and reads or writes no row. After it, R5.8.8 fails closed
  (`R5_8_8_RECORDER_NOT_RECONCILED`) until R5.8.7 is applied again.

### Test results

Probe `scripts/queue/attestation_recorder_reconciliation_probe.py`; every
scenario in a transaction that is rolled back, synthetic attestations signed
with a throwaway key (`repeat('s', 48)`, set with `set_config(…, true)`), and
the probe refuses any non-local host. Each scenario asserts the specific
SQLSTATE and message, or the catalog/row fingerprints, that it expects; the
CI annotation carries the per-scenario result, so the evidence is the probe's
own decision, not the job's colour. Results in section 12.

| Scenario                                                                  | Expected evidence                                                                                                                                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `d1_reset_build_has_managed_recorder_and_properties`                      | `fe3250af…`, owner `postgres`, `SECURITY DEFINER`, `search_path=""`, `service_role` only                                                                                                                                       |
| `d1_rerun_is_a_no_op`                                                     | function `xmin` unchanged                                                                                                                                                                                                      |
| `d1_unexpected_definition_fails_closed_and_changes_nothing`               | `R5_8_7_RECORDER_UNEXPECTED_DEFINITION`, function unchanged                                                                                                                                                                    |
| `d1_changed_grant_fails_closed`                                           | `R5_8_7_RECORDER_GRANTS_INVALID (before)` for `anon`                                                                                                                                                                           |
| `d1_property_drift_fails_closed`                                          | comment → `…_COMMENT_INVALID`; owner, `search_path`, `SECURITY INVOKER` → `…_PROPERTIES_INVALID`; `EXECUTE` to `PUBLIC`, `service_role` revoked → `…_GRANTS_INVALID`; recorder unchanged                                       |
| `d1_rollback_restores_repository_definition_and_migration_reapplies`      | `5ea1ffff…` then `fe3250af…`; on the old definition the managed blob is rejected and the old one accepted; R5.8.8 refuses while rolled back                                                                                    |
| `rollbacks_refuse_on_a_managed_database`                                  | both rollbacks `…_REFUSED_ON_MANAGED_DATABASE` with a platform history row; catalog and rows identical before and after; recorder `fe3250af…`                                                                                  |
| `r588_reset_build_has_no_deployment_uniqueness_and_keeps_replay_controls` | index absent; digest key on provenance, nonce primary key, digest key on nonces present                                                                                                                                        |
| `r588_absent_index_rerun_changes_no_data_or_object`                       | with two attestations stored (managed-like): fingerprints of relations (oid, name, kind, `xmin`), constraints, functions, and full row digests identical                                                                       |
| `r588_drops_index_with_expected_definition_only`                          | dropped; other objects, constraints, functions and data unchanged                                                                                                                                                              |
| `r588_unexpected_index_definition_fails_closed`                           | `R5_8_8_UNEXPECTED_INDEX_DEFINITION`, index kept                                                                                                                                                                               |
| `r588_other_deployment_uniqueness_fails_closed`                           | `R5_8_8_UNEXPECTED_DEPLOYMENT_UNIQUENESS`                                                                                                                                                                                      |
| `r588_missing_digest_key_fails_closed`                                    | `R5_8_8_REPLAY_CONTROLS_MISSING (before)`                                                                                                                                                                                      |
| `r588_missing_nonce_controls_fail_closed`                                 | nonce primary key or nonce digest key dropped → `R5_8_8_REPLAY_CONTROLS_MISSING (before)`                                                                                                                                      |
| `r588_constraint_backed_index_fails_closed`                               | the index backing a `UNIQUE` constraint → `R5_8_8_UNEXPECTED_INDEX_DEFINITION`                                                                                                                                                 |
| `two_distinct_attestations_of_one_deployment_coexist`                     | both accepted, 2 VERIFIED rows                                                                                                                                                                                                 |
| `replay_reused_nonce_and_duplicate_digest_rejected`                       | `23505` on `parser_attestation_nonces_pkey` (replay and reused nonce), `parser_attestation_nonces_attestation_digest_key`, `parser_runtime_provenance_attestation_digest_key`                                                  |
| `invalid_attestations_rejected_by_their_controls`                         | `PARSER_ATTESTATION_SIGNATURE_INVALID` (`42501`), `…_DIGEST_MISMATCH`, `…_FRESHNESS_INVALID`, `…_BINDING_INVALID` (deployment `3ad4b1fe`), `…_CRITICAL_HASH_MISMATCH` (`dfc2e67f…`), `…_SECRET_NOT_CONFIGURED`; 0 rows written |
| `r588_rollback_never_deletes_attestations`                                | over two attestations: `R5_8_8_ROLLBACK_WOULD_REQUIRE_DELETING_ATTESTATIONS`; data and objects unchanged                                                                                                                       |
| `r588_rollback_and_reapply_on_a_single_attestation`                       | index restored, second attestation rejected `23505` on the index; migration drops it again, second attestation accepted                                                                                                        |

Contract tests `parserAttestationRecorderReconciliation.contract.test.ts`
(9 tests: text-level guarantees — accepted hashes, only the worker blob
substituted, no `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`GRANT`/`REVOKE`, a
single `DROP`, rollbacks guarded and free of `DELETE`/`TRUNCATE`/`UPDATE`).

### Future operational sequence (each step separately authorized)

1. Review and merge this PR. Merging changes no database.
2. Managed database, through the authorized single-request procedure, read-only
   preflight first (recorder `fe3250af…`, index absent, digest keys and nonce
   primary key present, history without `20261012200000`/`20261012210000`):
   apply `20261012200000`, then `20261012210000`. On the managed database both
   are no-ops that only add their history rows; verify with the same queries.
3. Re-pin PR for the release identity (sections 2 and 8), with its own
   migration and tests.
4. Railway `PARSER_REVISION` (D2), Lovable variables and publication, as in
   section 8.
5. H.3-E activation gate PASS before any attestation is requested.

## 12. Final independent review (2026-10-12, requested 19:07 -03)

Scope: the final diff of both migrations, both rollbacks, the probe, the
contract tests and the workflow step. Nothing was applied to the managed
database; Railway, secrets and Lovable were not touched; no attestation was
requested; no DEM, Attempt 9 or Canonical write. `H3E91_DEPLOYED_SOURCE_PARITY_UNVERIFIED`
is preserved. D2 remains pending.

### Problems found by the review, and fixed

1. **Rollbacks restricted to repository builds only by comments.** Both now
   refuse with an enforced guard on the managed history marker (section 11);
   covered by `rollbacks_refuse_on_a_managed_database`. Commit `b7b15e71`.
2. **Documented fail-closed states without a test** (owner, `search_path`,
   `SECURITY INVOKER`, comment, `PUBLIC`/`service_role` grants; nonce controls;
   constraint-backed index). Four scenarios added, the probe went from 16 to 20.
   Commit `b7b15e71`.
3. **The new owner-drift case failed on PostgreSQL 17 in CI**
   ([run 38315025867](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38315025867),
   annotation `d1_property_drift_fails_closed` FAIL, 19/20) while passing on
   PostgreSQL 16 locally. Cause: on the Supabase stack `postgres` is not a
   superuser and cannot make `service_role` the recorder owner, so the drift
   setup itself failed (`pg_temp.drift … line 7 at EXECUTE`) before the
   migration ran — a probe defect, not a migration defect, but exactly what a
   green-only reading would have missed. Fix: the owner drift uses a
   transaction-scoped `NOLOGIN` role, and any drift that cannot be set up now
   raises `PROBE_DRIFT_SETUP_FAILED` with its cause. Commit `6c88eed1`.
4. Count in this document corrected: 144 of the 150 managed history rows carry
   `created_by = 'apikey@lovable.dev'` (read-only query, 2026-10-12).

### Evidence

| Criterion                                                                                      | Evidence                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R5.8.7 changes no data, permission, or the managed definition                                  | Migration contains no `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`GRANT`/`REVOKE`/index DDL (contract test); on `fe3250af…` it only emits a notice (`d1_rerun_is_a_no_op`: function `xmin` unchanged); properties, grants and comment asserted before and after                                |
| R5.8.8 deletes or modifies no attestation                                                      | Only statement with effect is one `DROP INDEX` of the exact original definition; `r588_absent_index_rerun_changes_no_data_or_object` proves identical row digests with two attestations stored                                                                                            |
| Fail closed on any unexpected state                                                            | 9 distinct `55000` errors exercised by scenarios (sections 11 table)                                                                                                                                                                                                                      |
| PostgreSQL 16                                                                                  | Local disposable cluster, database built from all 158 repository migrations: probe 20/20 PASS on `6c88eed1`; temporary role not left behind (0 rows in `pg_roles`)                                                                                                                        |
| PostgreSQL 17                                                                                  | Supabase local stack after `supabase db reset`, [run 38316203964, job 115033692550](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/38316203964/job/115033692550): annotation `ATTESTATION_RECORDER_RECONCILIATION` 20/20 PASS, other probes 13/13, 22/22, 12/12               |
| Re-run and rollback                                                                            | `d1_rerun_is_a_no_op`, `r588_absent_index_rerun_changes_no_data_or_object`, `d1_rollback_…_reapplies`, `r588_rollback_and_reapply_on_a_single_attestation` on both versions                                                                                                               |
| Rollbacks never need deleting VERIFIED attestations                                            | R5.8.8 rollback contains no `DELETE`/`UPDATE`/`TRUNCATE` and refuses over two rows (`r588_rollback_never_deletes_attestations`); R5.8.7 rollback touches no row                                                                                                                           |
| Workflow exposes no secrets, sends no real attestation, writes nothing to the managed database | Step env is only `QUEUE_PROBE_PGHOST=127.0.0.1`, port `54322`, the local stack's default password; no `secrets.*`; workflow `permissions: contents: read`; probe calls `refuse_non_local()`, reports `LOCAL_DISPOSABLE_ONLY`, signs with a throwaway key and rolls back every transaction |
| Managed database still in the expected starting state                                          | Read-only query (2026-10-12): PostgreSQL 17.6, recorder `fe3250af…`, deployment index absent, 3/3 replay controls, 3 provenance rows, 3 nonces, 150 history rows, neither `20261012200000` nor `20261012210000` recorded                                                                  |

Files: [R5.8.7](../supabase/migrations/20261012200000_r5_8_7_reconcile_attestation_recorder_live_definition.sql),
[R5.8.8](../supabase/migrations/20261012210000_r5_8_8_drop_deployment_identity_uniqueness.sql),
[R5.8.7 rollback](rollback/20261012200000_r5_8_7_recorder_rollback_repository_builds_only.sql),
[R5.8.8 rollback](rollback/20261012210000_r5_8_8_deployment_uniqueness_rollback_repository_builds_only.sql),
[probe](../scripts/queue/attestation_recorder_reconciliation_probe.py),
[contract tests](../src/lib/pipeline/__tests__/parserAttestationRecorderReconciliation.contract.test.ts),
[workflow](../.github/workflows/queue-semantics-probe.yml),
[Live reference](reference/record_parser_runtime_attestation.live-2026-10-12.sql).

Limits that remain (not blockers for merging; blockers for later steps): the
H.3-E activation gate still fails its R5.8.3/R5.8.4 decisions on stale pins
(run 38306322120) until the re-pin PR; D2 (`PARSER_REVISION`) is not applied;
applying these migrations to the managed database is a separate, separately
authorized operation.

## 13. D2 resolved by evidence, and why R5.8.3 / R5.8.4 looked green (2026-10-12, after #97)

### 13.1 What runs, measured independently

| Source (read-only, 2026-10-12 ~23:10 UTC)                | Observation                                                                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway `list-deployments` (SUCCESS)                     | active deployment `3ad4b1fe-9b9e-4fec-b79a-4215d27aab29`, commit `10815fb44e165963adfaf07f71c474ca628f4b7f`, branch `main`; every later push `SKIPPED` (#94–#97)                       |
| Railway service config                                   | source `GameProAcademy/cs2-pro-hub@main`, root `services/cs2-demo-parser`                                                                                                              |
| `/version` (Railway domain)                              | `parser.semantic_revision = git:5703b1d8…`, `parser.build_revision = git:10815fb4…`, `build.commit = 10815fb4…`, `build.embedded = true`, `declared_revision_matches = true`           |
| `/health`                                                | `{"status":"ok"}`                                                                                                                                                                      |
| git, worker tree `services/cs2-demo-parser`              | `10815fb4` = `main` = `8120c12a`; `5703b1d8` = `bf25eb86`                                                                                                                              |
| git, critical blobs at `5703b1d8` / `10815fb4`           | `parser.py` `9d21670e`/`981f6261`; `adapter.py` `34ce0f19`/`34ce0f19`; `worker.py` `dfc2e67f`/`ecaac396`; `raw_evidence.py` `750195c1`/`46df350b`; `settings.py` `35eecfb0`/`dc76db86` |
| `git diff 5703b1d8 10815fb4 -- services/cs2-demo-parser` | 39 files; `parser.py` changes failure semantics (`NON_DEMO_FAILURES`: cancellation and resource exhaustion now end the parse instead of being recorded as missing demo data)           |

**Proven:** `git:5703b1d8…` does not describe the deployed code: 4 of the 5
critical files and the parser's failure behaviour differ. The only revision
the evidence supports for the running image is its own build commit,
`git:10815fb44e165963adfaf07f71c474ca628f4b7f` (the first commit of `main`
with worker tree `8120c12a`; its parent `a5dcdfdb` has `0bea75c3`).

**Why `declared_revision_matches: true` did not show it:**
`services/cs2-demo-parser/app.py:412-417` compares
`PARSER_BUILD_REVISION or PARSER_REVISION` with the embedded commit. With
`PARSER_BUILD_REVISION` set, `PARSER_REVISION` (the semantic revision) is never
compared with anything. The H.3-E activation gate inherited the same blind
spot (`evaluate_runtime` checked only that flag).

**Every pin still names the removed runtime.** `scripts/parser_runtime_attestation.py:19-31`
(branch `infra/cs2-parser-worker-v8`, commit `5703b1d8`, deployment `1b5778de`,
source `91aeee85`, worker blob `50a53b60`), `src/lib/parserAttestation.ts`, the
managed recorder (section 7), `.github/workflows/parser-runtime-attestation.yml:33-34`
and `.github/workflows/cs2-parser-worker-ci.yml:44-46`. The worker blob
`50a53b60` exists only at `91aeee85`/`f88b6453`; the deployed one is `ecaac396`.
Consequently any real attestation of the current runtime would be rejected by
the managed recorder (binding and critical-hash checks), and the existing
VERIFIED rows record `deployment_commit = 5703b1d8` for deployment `1b5778de`,
whose Railway source was `91aeee85`.

### 13.2 Why R5.8.3 and R5.8.4 were `success` while blocked

1. `r5-8-3-read-only-preflight.yml`: `python … | tee r5-8-3-preflight.json`
   without `shell: bash`; the default `bash -e {0}` has no `pipefail`, so the
   pipeline's status was `tee`'s (0) and a BLOCKED preflight (exit 1) passed.
   It was the only `| tee` in the repository without `pipefail`.
2. `r5-8-4-gate-reconciliation.yml`: the reconcile step printed `decision` and
   always exited 0; `test_suite_passed=True` was hard-coded and ran _before_
   the tests; it checked out `main` instead of the source run's commit.
3. The governance tests in `scripts/tests/` ran only after a merge to main,
   never on a pull request.

No workflow still depends on `github.event.before` (that cause was removed by #94).

### 13.3 Fix (this PR)

- R5.8.3 writes its evidence itself (`R583_EVIDENCE_OUT`, no pipe), runs under
  `set -euo pipefail`, exits 1 unless GREEN, uploads the evidence anyway and
  publishes `::error title=R5.8.3 decision::{decision, failures}`. Tests run first.
  It now also checks, against git and independently of every pin, that the
  semantic revision names a commit whose worker tree is the build's
  (`SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD`), and that `build_revision`
  is the embedded commit.
- R5.8.4 runs for R5.8.3 runs that succeeded _or failed_, checks out their
  commit, derives `remote_ci`/`python_tests` from the R5.8.3 run's own
  focused-test step, runs its tests first, publishes its decision and exits 1
  unless the 32-gate matrix is complete.
- The activation gate reads the evidence of failed R5.8.3/R5.8.4 runs (so it
  reports the real reason instead of SKIPPED, while the run itself still counts
  as FAIL), and checks the semantic revision as above.
- The governance tests run on every pull request (a step of `Main required gates`, so the three-gate contract is unchanged).

### 13.4 What remains blocked, and why it cannot be fixed in the repository alone

R5.8.4's matrix includes `python_wasm_parity`, `determinism`,
`persistence_validation`, `provenance_verified`, `hmac_configured`,
`transport_secret_configured`, `railway_token_configured`, `endpoint_configured`,
`oidc_operational`, `live_health_exact`, `tick_authority`, `retention_guard`,
`attempt_9_absent`, `metrics_uncontaminated`, `features_uncontaminated`,
`canonical_uncontaminated`, `runtime_frozen` and `db_git_digest_parity`, none of
which R5.8.3 evidence can prove. Several are _outputs_ of the real-DEM run. By
construction R5.8.4 is BLOCKED before that run; this PR makes that visible, it
does not and must not turn it into PASS.

The identity chain needs, in order, operations outside the repository:

1. Railway `PARSER_REVISION = git:10815fb44e165963adfaf07f71c474ca628f4b7f`
   (changing a variable creates a new deployment id);
2. a re-pin PR naming that deployment id, branch `main`, build/semantic
   `10815fb4`, and the current critical blobs, with a new recorder migration;
3. applying that migration to the managed database;
4. a fresh attestation through the approved workflow.
   Each needs its own authorization.


## Update 2026-10-17 — semantic/build identity and approved workflow pin

This dated addendum records the current investigation without rewriting earlier release history.

### Current identity contract

- Semantic parser revision: `git:c2e045b0f71a7699c935b65ffe514fe526889de3`.
- Build/source commit embedded in the reference worker image: `git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1`.
- Verified `services/cs2-demo-parser/worker.py` Git blob at that build: `23a5f8624955181ad9033221cfae00138c7228dc`.
- Semantic identity and build identity are separate contract fields and must not be collapsed.

### Fresh main-branch evidence observed

- R5.8.3 run [39041686075](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39041686075), main SHA `7b88f68c1797f8a81cacb9b00c140a49a52df978`, concluded `failure`. Its read-only evidence reported both public `/version` endpoints serving semantic revision `git:c2e045...` and build revision `git:c2e045...`, while the embedded build/source commit was `eaaa2c8...`. The resulting blockers were `RUNTIME_IDENTITY_MISMATCH` and `BUILD_REVISION_NOT_EMBEDDED_COMMIT`.
- H.3-E activation gate [39043542007](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/39043542007), same main SHA, concluded `failure`. It reported `DECLARED_REVISION_MISMATCH`, `PARSER_LOCK_NOT_REQUIRED`, `PARSER_LOCK_REVISION_MISMATCH`, `PARSER_LOCK_BUILD_MISMATCH`, and `SNAPSHOT_UNUSABLE`. The app-side expected revision and build revision both came from environment and were both pinned to the historical `60099ed3...` value.
- These are external configuration/runtime blockers. A green code workflow alone cannot clear them. The main-branch R5.8.3/R5.8.4/H.3-E results remain failures until fresh evidence proves otherwise.

### Repository-side corrections under PR #151

- The attestation workflow's old hard-coded `60099ed3...` ancestry check was replaced with checks that load `COMMIT` and `BUILD_COMMIT` from `scripts/parser_runtime_attestation.py` and verify both are present on `main`.
- The reviewed workflow blob is now `f5e8ffb19d03dca410591f8d2fd38dc47a3ca485`, matched by both `scripts/approved_attestation_workflow.json` and the TypeScript registry.
- The additive migration `20261017180000_r5_8_12_repin_workflow_source_sha.sql` preserves R5.8.11/R5.8.11b migration files and updates the three current attestation/provenance function definitions from the previous workflow blob to the new blob. It is source code only and has **not** been applied to production. The disposable-database CI must prove it before it can be considered ready.
- Regression tests were added/updated to prevent reintroducing the old workflow ancestry pin and to preserve the historical migration pins while checking the new forward migration.

### Production remediation still requires authorized configuration changes

The latest gate evidence indicates these values are required for a future approved repair:

- Railway worker: `PARSER_REVISION=git:c2e045b0f71a7699c935b65ffe514fe526889de3`; `PARSER_BUILD_REVISION=git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1`, after confirming the deployed image's embedded `build.commit` remains the latter.
- App runtime: `DEMO_PARSER_EXPECTED_REVISION=git:c2e045b0f71a7699c935b65ffe514fe526889de3`; `DEMO_PARSER_EXPECTED_BUILD_REVISION=git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1`; `DEMO_PARSER_REVISION_REQUIRED=true`; `DEMO_PARSER_BUILD_REVISION_REQUIRED=true`.

These are a repair target derived from the gate's observed payload, not a claim that variables have been changed. The connected Railway tool withheld variable values, and no Lovable action or production change was performed. Before modifying production, preserve the current configuration, confirm authorization and rollback, then re-run the official read-only preflight and reconciler. Do not run a real DEM, attestation delivery, provenance write, Attempt 9 or Canonical while the relevant gates remain blocked.

### Current decision

R5.8.3: `BLOCKED`; R5.8.4: `NOT_PROVEN`; H.3-E: `BLOCKED`. PR #151 remains open and unmerged. Only CI results bound to its final HEAD may be treated as approval evidence. No production deployment, variable change, database migration, ledger/provenance write or Lovable publication is authorized by this addendum.


## Update 2026-10-17 — R5.8.12 current workflow pin and disposable probe correction

The R5.8.11 candidate spec and migrations remain immutable records of their original reviewed workflow blob `523cee5b0fecc21c7ce2b5f538b42670eec3fed1`. They are not the active source of the current workflow pin after the workflow content changed.

Added `docs/reference/r5_8_12/spec.json` as the current candidate pin set. It carries forward the same independently observed deployment/runtime fields and critical-file hashes from R5.8.11, while advancing `workflow_source_sha` to the reviewed current blob `f5e8ffb19d03dca410591f8d2fd38dc47a3ca485` and regenerating the two boundary-function MD5 targets for the updated database function bodies. It preserves the independently observed deployment/runtime fields and critical-file hashes; R5.8.11 remains unchanged.

The Queue Semantics failure was caused by a stale fixture binding: the shared disposable attestation fixture rendered the historical R5.8.11 workflow blob even after the schema prelude applied R5.8.12, so the current recorder correctly rejected all six otherwise legitimate lineage fixtures with `PARSER_ATTESTATION_BINDING_INVALID` (SQLSTATE `55000`). The fixture now derives its workflow binding from the R5.8.12 spec. A separate negative case deliberately tampers with both workflow identity fields and requires the recorder to reject the payload, preserving fail-closed behavior.

The release-governance failures also exposed a brittle test expecting the literal shell string `git cat-file -e`, although the workflow invokes the same Git operation using a subprocess argument tuple. The test now checks the actual command arguments. The R5.8.10 historical-artifact test no longer treats its old workflow blob as the current pin; the verifier reports that mismatch and continues evaluating independent identity failures instead of returning early. This does not rewrite R5.8.10/R5.8.11 migrations or their historical specs.

Validation remains pending until focused tests, full Queue Semantics Probe (including RLS and reconciliation), Quality Gates and all release gates finish on the new exact HEAD. No managed database, Railway, Lovable, provenance, ledger, or production state was changed.


## Follow-up 2026-10-17 — disposable legacy-probe baseline

Quality Gates, contract-sensitive parser tests, parser tests, web lint/build, the queue-semantics-v2 probe (8/8), and the two-user RLS probe passed on `af28940a6e8774b46bca82d0ad72b164356cc80f`. The complete Queue Semantics job still failed in the historical R5.8.7/R5.8.8 recorder-reconciliation probe: its baseline builder recognized only R5.8.11 and earlier recorder fingerprints, while the newly applied R5.8.12 recorder had MD5 `321d649a3defcf3daf61de8b5f6d6ad2`. It consequently skipped the required rewind and produced downstream baseline failures.

Added a fail-closed R5.8.12 rollback script for disposable/history-replay use. It requires exactly two current-pin occurrences per target function, reverses only those occurrences, restores the exact R5.8.11/R5.8.11b comments, checks the prior recorder/boundary function MD5s and security properties, and rejects mixed or unknown states. The legacy probe now rewinds R5.8.12 before older migrations inside its own transaction; the current gate-semantics probe continues to retain R5.8.12 and separately tests idempotent reapplication plus unknown/mixed-state rejection and transaction rollback. The migration itself now requires exactly two expected occurrences for each of the three functions rather than accepting any positive count.

This fix has not been validated until a fresh CI run completes. The previous run's R5.8.7/R5.8.8 results are failures and are not counted as passing. No managed database changes were made.

The R5.8.12 migration also snapshots and compares each target function's owner, ACL/grants, SECURITY DEFINER flag, volatility, strictness, search-path config, language, return/argument signature, variadic/parallel/leakproof settings, cost/rows and support function before and after the replacement. Any property drift raises `R5_8_12_FUNCTION_PROPERTIES_CHANGED` and rolls the entire migration back.

The latest disposable run produced PASS reports for queue semantics (12/12), queue recovery (22/22), and canonical persistence (17/17). The only failure in the recorder-reconciliation report was an obsolete assertion that the repository reset head should still be the R5.8.11 recorder MD5; the observed current head is the expected R5.8.12 recorder MD5 `321d649a3defcf3daf61de8b5f6d6ad2`. The R5.8.12 rollback ran and the historical scenarios otherwise passed. Updated that baseline assertion to identify R5.8.12 as the reset head; historical R5.8.11 target checks remain in the rollback transition and committed artifact tests.

The Quality Gates run on SHA `6916364e5744f590be2046396f4511bfecb05f7c` failed its R5.8.12 source-level test because the test assumed the migration's first non-whitespace bytes were `BEGIN;`; the migration correctly starts with explanatory SQL comments. The assertion now checks the first and last non-comment SQL statements. The same test now compares the R5.8.12 candidate's boundary-function MD5 metadata against the generator's computed target values; the candidate currently carries the prior R5.8.11 values, so the next focused run will reveal the exact regenerated hashes for correction. The F553 R11.2 engine step in that run was cancelled when a newer commit superseded it; the subsequent missing-evidence errors are a fail-closed consequence of cancellation, not a completed R11.2 execution result. A fresh uninterrupted F553 run is still required.

The first metadata comparison used `r5_8_11.targets(spec)`, but that helper deliberately returns the spec's recorded boundary MD5 values because those hashes must be observed from PostgreSQL, not inferred from Python-generated SQL. Replaced that tautological check with a direct read of `pg_proc.prosrc` MD5s from the reconstructed disposable database. The direct check correctly failed closed: live PostgreSQL reported boundary-function MD5s `e62a11f966063440eaacb636c608c33a` for `assert_verified_parser_provenance` and `f74d8af991b7ec6f33d9aabbef00c4fc` for `enforce_approved_attestation_workflow`, while the candidate spec still carried the historical R5.8.11 values `f5e27fc3961d7d4bee50d440862f39cc` and `f95e6a50fd78a5aef78feb4d0dd7fdd1`. Updated the current R5.8.12 spec with the observed disposable-PostgreSQL values and preserved the historical pair under `r5_8_11_database_target_md5`. The recorder's new target remains `321d649a3defcf3daf61de8b5f6d6ad2`.
