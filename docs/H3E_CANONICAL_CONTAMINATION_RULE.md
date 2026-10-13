# `canonical_uncontaminated` and the managed-database snapshot — proposal (not approved)

## 1. What the repository defines

- `matches.canonical_status` ∈ {queued, processing, completed, partial, failed, cancelled, unknown}
  (`supabase/migrations/20260906024007_…sql:82-84`). `CanonicalStatus` is the _lifecycle of a canonical
  entity, independent of analytics completeness_ (`src/lib/canonical/canonical.types.ts:29-30`). `partial`
  is a lifecycle state, not a provenance state.
- The gate (`GATE_SPECS`): _no Canonical row derived from unverified parser output exists_. Neither the
  repository nor the schema links a `matches` row to a VERIFIED `parser_runtime_provenance` row:
  `match_sources.source_version` records `demoparser2@0.42.0` without a revision.
- Canonical **admission** (the mapping release) is a separate concept: `canonical_mapping_inventory_releases.authorized_count`.

## 2. Facts (managed database, read-only, 2026-10-13T03:25Z)

One `matches` row: platform `demo`, from an upload, `canonical_status = 'partial'`, `finished`/`terminal`,
created 2026-09-11, `match_sources.source_version = demoparser2@0.42.0`; first VERIFIED provenance row
2026-10-05. Mapping release: `authorized_count = 0`.

## 3. Candidate rules

| Rule              | Definition                                                                                                                                                                                          | Result today     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| STRICT_PROVENANCE | no `matches` row with a non-null `canonical_status` created before the first VERIFIED provenance of a runtime that could have produced it (until rows are linked to provenance, any such row fails) | **FAIL** (1 row) |
| ADMISSION_ONLY    | no inventory row is authorized for Canonical admission (`authorized_count = 0`)                                                                                                                     | PASS             |

ADMISSION_ONLY duplicates `canonical_authorization_false` and would make this gate meaningless; STRICT_PROVENANCE
matches the gate's wording. Neither is approved. **The gate stays NOT_PROVEN** (`CANONICAL_RULE = None` in
`scripts/predem/managed_snapshot.py`; a test keeps it so). No production row is changed to make it pass.
Deciding STRICT_PROVENANCE implies deciding what to do with the existing row (keep and fail, quarantine, or
re-derive after a verified run) — a production-data decision outside this repository.

## 4. Snapshot collector

- SQL: `scripts/predem/managed_snapshot.sql` — `public.h3e_predem_managed_snapshot()`, `STABLE`,
  `SECURITY DEFINER`, `search_path=''`, `EXECUTE` for `service_role` only; aggregates and digests only;
  returns its own `digest` (sha256 of the document, computed in the database), `snapshot_at`, database
  name, server version, migration head and recorder md5.
- Evaluator: `scripts/predem/managed_snapshot.py` — per-gate VERIFIED/FAIL/NOT_PROVEN with reasons; a
  snapshot older than 6 h, from the future, without digest, of an unknown schema, or whose recorder md5 is
  not the expected one proves nothing.
- Disposable validation: `scripts/predem/validate_managed_snapshot_disposable.py` (PostgreSQL 16, all
  repository migrations, transaction rolled back): function created, grants exact, volatility `s`, rules applied.
- Managed database, read-only (the function body run as a plain SELECT, 2026-10-13T03:25:01Z, digest
  `f8293b7c…`): db_git_digest_parity, attempt_9_absent, metrics/features_uncontaminated, identity_validation
  VERIFIED by rule; **retention_guard FAIL** (`deletion_metadata_mismatch = 1`; also 12 expired demos,
  5.43 GB, eligible for deletion with 0 deletion attempts); canonical_uncontaminated NOT_PROVEN. This is an
  operator observation, not CI evidence: the gates remain NOT_PROVEN in the activation gate until an
  authorized collector delivers the snapshot.

## 5. What is needed to make it CI evidence (each external, needs authorization)

1. Apply the migration that creates the function (same text as `managed_snapshot.sql`; draft PR).
2. A read path for CI: an application route authenticated with the existing CI transport secret, calling
   the function through the service role and returning the document unchanged; or a dedicated database
   role allowed to execute only this function. Either needs a Lovable publication or a database role/secret.
3. Decide the canonical rule; investigate the retention mismatch and the stalled cleanup.
