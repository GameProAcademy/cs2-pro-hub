# `retention_guard` — diagnosis of the managed-database retention state (read-only)

Status: **diagnosis only.** Nothing was deleted, claimed, replayed or rewritten. The gate stays FAIL.

## 1. Evidence

`scripts/predem/retention_diagnosis.sql` was run once as a single `SELECT` on the managed database, at
2026-10-13T05:15:37Z. It reads aggregates only and calls only STABLE functions. This is an operator observation,
not CI evidence.

| Group               | Jobs | `storage_deleted_at` | verified | object in bucket | `cleanup_error`              | attempts | deletion gate              | declared bytes |
| ------------------- | ---: | -------------------- | -------- | ---------------- | ---------------------------- | -------: | -------------------------- | -------------: |
| `processed`         |    1 | set 2026-09-13       | no       | **absent**       | null                         |        0 | `RAW_ADMISSION_INCOMPLETE` |    473 748 061 |
| `failed`            |    9 | set 2026-09-16…09-22 | no       | **absent**       | null                         |        0 | `ELIGIBLE`                 |  4 009 268 035 |
| `blocked_raw_audit` |    1 | set 2026-09-21       | no       | **absent**       | null                         |        0 | `ELIGIBLE`                 |    473 748 061 |
| `cancelled`         |    1 | set 2026-09-13       | no       | **present**      | `DELETION_METADATA_MISMATCH` |        0 | `ELIGIBLE`                 |    473 748 061 |

Other values from the same run:

- **Bucket `demos`:** 2 objects, 473 749 085 bytes. That is the cancelled job's object plus one orphan of 1 024 bytes.
- **`get_demo_cleanup_authority()`:** `execution_enabled = false`, `legacy_cleanup_disabled = true`.
- **`cron.job`:** a single job, `cs2-demo-pipeline` (every minute). Its command mentions neither cleanup nor delete.
- **`get_demo_retention_metrics()`:**
  - `expired_demos = 12`, `deletion_eligible = 12`, `deletion_attempts = 0`;
  - `deletion_metadata_mismatch = 1`, `deletion_failed = 0`;
  - `total_bytes_eligible = 5 430 512 218`.

## 2. Facts from the repository

- **Retention contract (`demo-retention-v1`):** set by `guard_demo_retention_lifecycle`
  (`supabase/migrations/20260921055331_…sql`, replaced by `20260921065045_…sql`). Retention is 24 h for
  `processed`, 72 h for `failed` and `blocked_raw_audit`, and immediate for `cancelled`.
- **The only writer of `cleanup_error = 'DELETION_METADATA_MISMATCH'` without an attempt** is the G.6 emergency
  quarantine `20260921055737_d98f6d41-…sql:2-17`. It marks a row with `storage_deleted_at` set whose object
  still exists, and does not touch `cleanup_attempt_count`. The other two writers do increment it:
  `claim_demo_cleanup_jobs` (`…055331…sql:174-182`, `…055555…sql:76-78`) and `fail_demo_cleanup`
  (`…065045…sql:82-86`, which runs after a claim).
- **Physical cleanup is switched off on purpose (G.6-R):**
  - `DEMO_CLEANUP_EXECUTION_ENABLED = false` (`src/config/pipeline.ts:78`);
  - `cleanupExpiredDemos` returns early (`src/lib/pipeline/jobs.server.ts:395-406`);
  - no cron, admin or function path calls it (`src/lib/pipeline/__tests__/retentionLifecycle.test.ts:125-132`);
  - the database authority reports `execution_enabled false`.
- **`get_demo_retention_metrics()` does not check the bucket.** `expired_demos`, `deletion_eligible` and the
  byte totals filter on `storage_delete_verified_at IS NULL` and sum the declared `file_size`.
- **Pre-G.6 audit:** `.lovable/plan/fase-2-7-2g-6-…-2026-09-21.md:6` records the legacy cleanup marking jobs deleted
  without confirming physical absence. At the time, 4 jobs were marked deleted and 3 still had their object.

## 3. Diagnosis

### `deletion_metadata_mismatch = 1`

The cancelled job's DEM is still in the bucket, but its row says `storage_deleted_at = 2026-09-13`. The
pre-G.6 cleanup set that flag without deleting or verifying. The G.6 quarantine migration then labelled the row
`DELETION_METADATA_MISMATCH`. That is why `attempts = 0` and `deletion_reason` is null.

This is the inconsistency the gate exists to catch, and it is real: about 474 MB of DEM data that the metadata
calls deleted.

### `deletion_attempts = 0` for the 12 expired demos

Expected, not a stalled worker. Physical cleanup has been disabled since G.6-R (2026-09-21), pending a separately
approved operational gate. Nothing claims, so nothing is counted.

### 5.43 GB

This is a metric artifact, not data at rest. 11 of the 12 objects are already physically absent: the legacy
cleanup removed them, but none was verified, so `storage_delete_verified_at` is null and their declared sizes
are still summed. The bucket holds 0.47 GB.

### Other observations

- **The 1 024-byte orphan** belongs to no job and no upload.
- **The `processed` job** (created 2026-09-11) is not eligible: `RAW_ADMISSION_INCOMPLETE`, meaning no approved
  RAW evidence. It is the upload behind the `partial` canonical row that keeps `canonical_uncontaminated` at FAIL.

### Not proven

- **Who set `storage_deleted_at` on 2026-09-22,** after the G.6-R migration (2026-09-21): the repository history
  starts at 2026-10-08, so the legacy writer can't be traced. Possibilities: the published app still ran the
  legacy cleanup until republished, or another path. **Hypothesis only.**
- **Whether the 11 absent objects were removed by the legacy cleanup or by something else.**

## 4. Expected transitions (G.6 contract) and what would reconcile the state

Every step below writes to production and needs **specific authorization**. None was done.

| Rows                                                             | Transition (existing service-role functions)                                                                                                                                      | Pre-check (read-only)                                                                                                        | Risk                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 11 rows, object absent, `ELIGIBLE` or `RAW_ADMISSION_INCOMPLETE` | `claim_demo_cleanup_jobs` → verify absence through the Storage API → `finish_demo_cleanup_verified(…, 'ALREADY_ABSENT')`. Needs the cleanup gate enabled (code flag + authority). | Re-run the diagnosis: `object_present = false` for each row; no active worker, lease or claim.                               | Enabling cleanup also covers rows created later. Do it with a limit and an operator present. |
| `processed` row, `RAW_ADMISSION_INCOMPLETE`                      | No transition: the gate refuses it by design. Requires a decision on the legacy row (keep, quarantine, or authorized exception).                                                  | —                                                                                                                            | Bypassing the gate defeats RAW admission.                                                    |
| cancelled row, object present, `DELETION_METADATA_MISMATCH`      | Claim → Storage delete → verify absence → `finish_demo_cleanup_verified(…, 'DELETE_VERIFIED')`.                                                                                   | `object_present = true`; no other row or upload references the path; the file is not the controlled-DEM artifact being kept. | **Irreversible deletion of a DEM.**                                                          |
| orphan object (1 024 bytes)                                      | `get_demo_orphan_report` then a reviewed delete.                                                                                                                                  | Confirm the orphan.                                                                                                          | Low; irreversible.                                                                           |
| metrics                                                          | Optional migration: report physically present bytes next to declared bytes, so the gauge shows 0.47 GB, not 5.43 GB.                                                              | Disposable validation.                                                                                                       | Metric semantics change.                                                                     |

**Success criterion:** a fresh snapshot shows `deletion_metadata_mismatch = 0` and `deletion_failed = 0`. Only then
can `retention_guard` be VERIFIED.

**Rollback:** none for a physical deletion. A metadata-only step can be reverted from the before/after diagnosis.
