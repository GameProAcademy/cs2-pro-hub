# H.3-E — gate semantics v2 (`attempt_9_absent`, `*_uncontaminated`)

Status: **prepared in the repository, not applied**. The managed database still runs snapshot schema 3.
Each production step below needs its own authorization.

## 1. Why v1 can no longer decide

| Gate | v1 question (schema 3) | Managed fact (read-only, 2026-10-14) | v1 verdict | Why that verdict is not informative |
| --- | --- | --- | --- | --- |
| `attempt_9_absent` | Has no job reached attempt ≥ 9? | `e3f93688` (attempt 9, `failed`) and `4b5e3530` (attempt 10, `blocked_raw_audit`), reference DEM `0caa7c97…` | FAIL, permanently | It cannot tell an authorized execution from an unauthorized one. |
| `metrics_uncontaminated` / `features_uncontaminated` | Are there zero rows? | 0 / 0 | VERIFIED | The first legitimate ingestion makes it FAIL forever, whatever its provenance. |
| `canonical_uncontaminated` | Is no row eligible (STRICT_PROVENANCE + quarantine)? | 1 row, quarantined | VERIFIED | Any eligible row is FAIL `CANONICAL_ROWS_WITHOUT_PROVENANCE_LINK`, verified or not. No column links a match to a provenance row. |

## 2. v2 (snapshot schema 4, `scripts/predem/managed_snapshot.py` `GATE_SEMANTICS`)

| Gate | Semantics id | VERIFIED only when | FAIL | NOT_PROVEN |
| --- | --- | --- | --- | --- |
| `attempt_9_absent` | `AUTHORIZED_ATTEMPTS_V2` | every job at attempt ≥ 9 has a row in `public.h3e_attempt_authorizations` that still matches its job, upload, attempt and DEM sha256 | `UNAUTHORIZED_JOBS_AT_ATTEMPT_9_OR_MORE`, `AUTHORIZATION_NO_LONGER_MATCHES_ITS_JOB` | missing or contradictory counts |
| `metrics_uncontaminated`, `features_uncontaminated` | `VERIFIED_LINEAGE_V2` | every row belongs to a match with verified lineage | `ROWS_WITHOUT_VERIFIED_LINEAGE` | missing counts, lineage > rows |
| `canonical_uncontaminated` | `STRICT_PROVENANCE_VERIFIED_LINEAGE_V2` | every eligible (unquarantined) row has verified lineage, and the quarantine guards are enforced | as in v1, plus `CANONICAL_ROWS_WITHOUT_VERIFIED_LINEAGE` | as in v1, plus lineage evidence missing or contradictory |

**Verified lineage** of a match `m` (SQL in `scripts/predem/managed_snapshot.sql`, CTE `lineage`) means one chain exists with every link below:

1. `m` is not in `canonical_match_quarantine`.
2. A job `j` exists where:
   - `j.upload_id = m.upload_id` (the match's own upload) **or**, since D26 (2026-10-23, migration `20261023100000`), `j.match_id = m.id` (a later attempt of the same content that persisted into this match);
   - `j` is the **most recent** processed job of the match by `finished_at` (an older verified job never vouches for rows a newer, unverified observation produced);
   - `j.status = 'processed'`;
   - `j.demo_sha256 = m.content_fingerprint`.
3. A RAW artifact for `j` has `status = 'ready'`, `audit_status = 'approved'` and the same sha256.
4. An H3E91 ledger event for `j` is `EXECUTION_FINISHED` with outcome `PARSE_SUCCEEDED` and the same sha256.
5. A `parser_runtime_provenance` row is `VERIFIED`, with:
   - `build_revision = 'git:' || worker_build_commit` and `semantic_revision = parser_revision` of that event;
   - a creation time no later than the event.

What is not weakened:

- Every v1 measure is still emitted by the snapshot.
- The v1 verdict is reported in each gate's `evidence.v1`.
- Pre-provenance eligible rows are still FAIL.
- Broken quarantine guards are still FAIL.
- Missing evidence is never VERIFIED.
- An authorization row counts only while it matches its job. Edit the job and the gate FAILs.

## 3. Registry `public.h3e_attempt_authorizations` (`20261014220000`)

- The primary key is `job_id`, which references `demo_jobs` with `ON DELETE RESTRICT`.
- Columns:
  - `upload_id`;
  - `attempt_number`, which must be ≥ 9;
  - `demo_sha256`;
  - `decision_ref`;
  - `authorized_by`;
  - `evidence`;
  - `recorded_at`.
- An INSERT trigger refuses any row that does not match its job: `H3E_ATTEMPT_AUTHORIZATION_IDENTITY_MISMATCH`.
- UPDATE, DELETE and TRUNCATE are refused: `H3E_ATTEMPT_AUTHORIZATION_IMMUTABLE`.
- RLS is enabled and forced, with no policy. `service_role` has SELECT and INSERT only. Clients have nothing.
- There is no revocation path.
- The migration records no authorization.

## 4. Evidence in the repository

- `scripts/tests/test_managed_snapshot.py` and `scripts/tests/test_gate_semantics_v2.py`: the rules, contradictions and static contract.
- `scripts/queue/gate_semantics_v2_probe.py` runs in CI "Queue semantics" on a disposable PostgreSQL 17 built from the migrations. Everything is rolled back, and the provenance is recorded by the real R5.8.10 recorder. It checks:
  - the registry is identity-bound, append-only and invisible to clients;
  - the gate follows the registry and FAILs on drift;
  - lineage counts a full chain;
  - each broken link removes the match from lineage: RAW not approved, job not processed, another build, failed execution, quarantine.

None of this is evidence about the managed database.

## 5. Production order (each step separately authorized; stop on any failure)

1. Apply `20261014220000`. Read back the table, the 3 triggers, the 2 functions (definer, `search_path=''`, grants) and RLS.
2. Apply `20261014220100` (snapshot v4). Read back the function md5 and grants, then run the snapshot read-only. Expected: `attempt_9_absent` FAIL `UNAUTHORIZED_JOBS_AT_ATTEMPT_9_OR_MORE`, unauthorized = 2.
3. **Owner decision.** Were executions `e3f93688` (attempt 9) and `4b5e3530` (attempt 10) authorized?
   - If yes, put the confirmation reference into `docs/ops/h3e_attempt_authorizations_2026-10-14.sql` and run it once. It asserts every observed identity and writes only registry rows.
   - If no, record nothing. The gate stays FAIL, which is the truthful verdict.
4. Re-run the Activation Gate. The v2 verdicts count only from that run.

Rollback:

- `docs/reference/h3e_gate_semantics_v2/rollback_20261014220100.sql` restores snapshot v3 byte for byte.
- `rollback_20261014220000.sql` refuses while any authorization is recorded.

## D26 amendment (2026-10-23) — lineage through a later attempt

Production evidence: the only Canonical match `95186f3f` lost its lineage when its original job `921b55cf` turned from `processed` to `failed` (D24 incident: an in-place re-run after a parser release). `persist_canonical_observation` keeps `matches.upload_id` at the first upload, so a successful new attempt of the same content (D24's parser-upgrade attempt) could never restore it.

The amended rule:
- accepts the processed job of a later attempt that persisted into the match (`j.match_id = m.id`, same sha256);
- counts only the match's most recent processed job.

Every other link is unchanged: approved RAW, `PARSE_SUCCEEDED` ledger event, VERIFIED provenance attested before the event, and quarantine exclusion.

Probe scenarios on the disposable database:
- `lineage_lineage_via_a_later_attempt_of_the_same_content` (counted);
- `lineage_newer_unverified_processed_job_removes_lineage` (not counted).

Rollback: `docs/reference/d26/rollback_restore_v4.sql` (the exact v4 text).
