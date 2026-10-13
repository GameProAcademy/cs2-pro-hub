# `canonical_uncontaminated` and the managed-database snapshot — approved rule, production data remains blocked

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
matches the gate's wording. **Decision: adopt `STRICT_PROVENANCE`.** `ADMISSION_ONLY` is rejected because it duplicates
`canonical_authorization_false` and makes this gate meaningless.

Evaluation (`_canonical` in `scripts/predem/managed_snapshot.py`):

| Snapshot evidence                                                                                         | Result                                              |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| count missing, negative, boolean, non-integer; breakdown missing or malformed                             | NOT_PROVEN `CANONICAL_PROVENANCE_EVIDENCE_MISSING`  |
| violations > rows; breakdown total ≠ rows; no VERIFIED provenance yet violations ≠ rows                   | NOT_PROVEN `CANONICAL_EVIDENCE_CONTRADICTORY`       |
| ≥ 1 canonical row created before the first VERIFIED provenance                                            | FAIL `UNVERIFIED_CANONICAL_ROWS_PRECEDE_PROVENANCE` |
| ≥ 1 canonical row after it (no `matches` row links to a provenance row; the active runtime may have none) | FAIL `CANONICAL_ROWS_WITHOUT_PROVENANCE_LINK`       |
| zero canonical rows                                                                                       | VERIFIED `NO_CANONICAL_ROWS`                        |

A row created after the first VERIFIED provenance is not evidence of verified output: that provenance may belong to
another runtime (on 2026-10-13 the serving deployment had none). Until rows are linked to the provenance that
produced them, only the absence of canonical rows proves the gate.

This decision defines the evidence rule only; it does not authorize changing production data. The existing row
keeps this gate at FAIL until an independently authorized remediation and a fresh snapshot establish otherwise.
No production row is changed.

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
  5.43 GB, eligible for deletion with 0 deletion attempts); canonical_uncontaminated FAIL under STRICT_PROVENANCE. This is an
  operator observation, not CI evidence: the gates remain NOT_PROVEN in the activation gate until an
  authorized collector delivers the snapshot.

## 5. What is needed to make it CI evidence (each external, needs authorization)

1. Apply the migration that creates the function (same text as `managed_snapshot.sql`; draft PR).
2. A read path for CI: an application route authenticated with the existing CI transport secret, calling
   the function through the service role and returning the document unchanged; or a dedicated database
   role allowed to execute only this function. Either needs a Lovable publication or a database role/secret.
3. Canonical rule decided (STRICT_PROVENANCE); remediation of the existing row needs separate authorization.
4. Investigate the retention mismatch and the stalled cleanup (read-only; no deletion).
