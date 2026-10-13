# H.3-E — quarantine of the pre-provenance Canonical row (preserve, do not promote, isolate)

Status: **prepared, not applied**. Nothing in this change writes to the managed database. Each
production step below needs its own explicit authorization.

## 1. Facts (managed database, read-only, 2026-10-13 ~19:20Z)

| Fact                                        | Value                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public.matches` rows                       | 1: `a7b27f16-4c85-428b-a855-0f683bda48a2`, `canonical_status='partial'`, source `demo`, schema 2, created `2026-09-11 10:40:06.477964+00`, fingerprint `0caa7c97…ae3d`, upload `9b375fd1…` |
| Children                                    | `match_sources` 1, `match_participants` 10, `match_rounds` 25, `round_events` 4397, `round_players` 0                                                                                      |
| Derived rows                                | `match_metrics` 0, `match_features` 0                                                                                                                                                      |
| Linked job                                  | `demo_jobs b94c46fd…` (status `processed`, 2026-09-11)                                                                                                                                     |
| Constraint `matches_canonical_status_check` | queued, processing, completed, partial, failed, cancelled, unknown (no `quarantined`)                                                                                                      |
| Existing quarantine/eligibility table       | none                                                                                                                                                                                       |
| First VERIFIED provenance                   | 2026-10-05                                                                                                                                                                                 |

## 2. Root cause of `canonical_uncontaminated = FAIL`

`_canonical` (`scripts/predem/managed_snapshot.py`, STRICT_PROVENANCE) counts every `matches` row with a
non-null `canonical_status`. Status is irrelevant (`partial` counts like `completed`); no row links to a VERIFIED
provenance, so the only way to VERIFIED was zero rows. The row is not contaminating because of its status but
because it **exists and is eligible**: nothing stops it from being promoted (`partial → completed`) or from
feeding metrics → features → analysis → Player DNA → Pro Score → training plan → AI Coach
(`src/lib/sources/sources.ts`).

## 3. Mechanism (`supabase/migrations/20261014120000_h3e_canonical_match_quarantine.sql`)

- `public.canonical_match_quarantine`: append-only registry (`match_id` PK → `matches` ON DELETE RESTRICT,
  `reason`, `decision_ref`, `quarantined_by`, `evidence` jsonb, `quarantined_at`). RLS enabled and forced, no
  policy, no client grant; `service_role` SELECT/INSERT only. UPDATE/DELETE/TRUNCATE refused
  (`CANONICAL_QUARANTINE_IMMUTABLE`). No release path exists.
- `guard_canonical_match_quarantine()` BEFORE triggers on `matches` (UPDATE/DELETE) and on `match_sources`,
  `match_participants`, `match_rounds`, `round_players`, `round_events`, `match_metrics`, `match_features`
  (INSERT/UPDATE/DELETE), plus TRUNCATE statement guards: any write touching a quarantined match fails with
  `CANONICAL_MATCH_QUARANTINED` (55000) — for every writer, including the SECURITY DEFINER persistence routines
  and the service role. The row is preserved exactly as ingested; it cannot be promoted, edited, deleted or
  derived from.
- Consequence by design: a cascading/SET NULL FK action touching the quarantined match (deleting its player
  profile, upload or series) is refused too.
- No status is invented, no column is added to `matches`, the constraint is unchanged.

## 4. Gate rule (snapshot schema v3, `20261014120100_h3e_predem_managed_snapshot_v3.sql`)

The snapshot adds `canonical.quarantine`: registry size, quarantined/eligible rows, eligible rows before the
first VERIFIED provenance, quarantined rows promoted to `completed`, metric/feature rows derived from
quarantined matches, and the presence/enabled state of the 18 guard triggers. `_canonical` now reads:

| Evidence                                          | Result                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| quarantine section missing/malformed              | NOT_PROVEN `CANONICAL_QUARANTINE_EVIDENCE_MISSING`     |
| counts inconsistent                               | NOT_PROVEN `CANONICAL_EVIDENCE_CONTRADICTORY`          |
| eligible row before the first VERIFIED provenance | FAIL `UNVERIFIED_CANONICAL_ROWS_PRECEDE_PROVENANCE`    |
| eligible row after it                             | FAIL `CANONICAL_ROWS_WITHOUT_PROVENANCE_LINK`          |
| any guard missing, disabled or unknown            | FAIL `CANONICAL_QUARANTINE_NOT_ENFORCED`               |
| quarantined row promoted / with derived rows      | FAIL `QUARANTINED_ROW_PROMOTED` / `…_HAS_DERIVED_ROWS` |
| only quarantined rows, all guards enforced        | VERIFIED `ONLY_QUARANTINED_CANONICAL_ROWS`             |
| no canonical row, all guards enforced             | VERIFIED `NO_CANONICAL_ROWS`                           |

**Semantic change to approve:** "uncontaminated" becomes "no _eligible_ Canonical row from unverified output".
A preserved row counts as ineligible only with database-enforced guards proven by the same snapshot.

## 5. Evidence produced by this change (repository only)

- `scripts/tests/test_managed_snapshot.py`, `scripts/tests/test_canonical_quarantine.py`,
  `scripts/ci/test_h3e_activation_gate.py`: rules, contradictions, static contract.
- `scripts/queue/canonical_persistence_probe.py` (CI "Queue semantics", disposable PostgreSQL 17 built by
  `supabase db reset`): a quarantined synthetic match survives re-persistence, promotion, mutation, deletion,
  child writes, metric/feature inserts and TRUNCATE byte-identical; the registry refuses UPDATE/DELETE/TRUNCATE;
  client roles can neither read nor write it; non-quarantined matches are unaffected.

None of this is evidence about the managed database.

## 6. Production order (each step separately authorized; stop on any failure)

1. Apply `20261014120000` (managed DB), read back: table, 4 functions (definer, `search_path=''`, grants), 18 triggers enabled.
2. Apply `20261014120100`, read back the function md5 and grants; run the snapshot read-only: `quarantine.guards` all true, registry 0.
3. Run `docs/ops/h3e_quarantine_partial_match_2026-09-11.sql` once (asserts the identity above; one INSERT into the registry; the match is not written).
4. Snapshot read-only: `quarantined_with_status=1`, `unquarantined_with_status=0`, derived 0, promoted 0.
5. Merge this PR (the activation gate pins snapshot schema v3; merging before steps 1–2 makes `managed_snapshot` NOT_PROVEN, fail-closed).
6. Re-run the Activation Gate; `canonical_uncontaminated` VERIFIED only from that run.

Rollback: `docs/reference/h3e_quarantine/rollback_20261014120100.sql` (restores v2), then
`rollback_20261014120000.sql` (refuses while any match is quarantined).

## 7. Audit of privileged paths and the existing row (managed database, 2026-10-13 ~22:40Z)

Measured with session-local probes that roll back (`RAISE` at the end of a `DO` block; nothing persisted):

| Role                                                                             | `session_replication_role = replica`            | `ALTER TABLE … DISABLE TRIGGER` | Effect on the guards                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `service_role` (app server, worker, RPCs)                                        | DENIED                                          | DENIED (not owner)              | bound by every guard                                                   |
| `postgres` (table owner, migration/admin role)                                   | ALLOWED                                         | ALLOWED (owner)                 | can bypass: break-glass, not an app path                               |
| `sandbox_exec` (LOGIN, BYPASSRLS, INSERT on 56 tables, not owner, not superuser) | not testable (`SET ROLE` refused to `postgres`) | not owner                       | BYPASSRLS does not skip triggers; bound unless it can set replica mode |

- Row triggers fire for every role, BYPASSRLS included; only `session_replication_role = replica` or a disabled
  trigger skips them. The snapshot detects a **persistently** disabled guard (`tgenabled`), and the disposable probe
  proves it. It cannot detect a transient `replica` session or a disable-and-re-enable inside one transaction by
  the owner. That residual risk is the database owner's break-glass capability, outside every application path.
- TRUNCATE: statement-level guards on the 8 tables and on the registry refuse it while any match is quarantined
  (proven on PostgreSQL 17, including `TRUNCATE matches CASCADE`).

### `round_count = 24` vs 25 `match_rounds` rows (not changed)

Round 25 has 0 events and `start_tick 246747 < end_tick 253251`, while rounds 1–24 carry `end_tick` values lower
than their own `start_tick` (round 1: start 1688, end 1). The legacy (pre-provenance) mapping paired each round's
start with the previous round's end, which leaves a trailing synthetic round. This is an integrity defect of that
ingestion, consistent with `canonical_status = 'partial'`, and a further reason the row must stay ineligible. The
quarantine preserves it as evidence; nothing is realigned or deleted.
