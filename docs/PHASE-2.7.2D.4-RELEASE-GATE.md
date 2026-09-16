# FASE 2.7.2D.4 — Release gate

Status: **APP HARDENING VALIDATED / RELEASE BLOCKED / REAL E2E NOT AUTHORIZED**

This checklist is the only promotion gate for the HOT + RAW Artifact path. A
code-level PASS is not evidence of Railway synchronization or production E2E.
Do not process the Cache demo, re-enqueue a job, change Railway secrets, deploy,
or mutate production data from this document.

| # | Promotion gate | Current evidence | Status |
|---|---|---|---|
| 1 | Parser contract remains version 1 | APP and Python constants/tests | PASS |
| 2 | Semantic revision remains fail-closed | APP expected contract and worker startup validation | PASS |
| 3 | Exact build revision is separate and optional during rollout | `/version`, parse identity and APP checks | PASS |
| 4 | `/version` and parse identities cannot diverge | APP consistency assertion and contract test | PASS |
| 5 | Durable `/complete` accepts only strict HOT + READY RAW reference | strict route schema and validators | PASS |
| 6 | `/complete` body hard-fails above 8 MiB while streaming | route boundary test | PASS |
| 7 | HOT arrays are bounded with explicit overflow metadata | producer and consumer tests | PASS |
| 8 | HOT partial state derives from overflow, unclassified rows or not-implemented sections | producer and consumer tests | PASS |
| 9 | Full RAW never crosses `/complete` | forbidden-field validation and route contract | PASS |
| 10 | RAW chunks target 4 MiB and hard-fail above 8 MiB | Python writer and APP metadata checks | PASS |
| 11 | Chunk identity, ordering, hash chain and root digest fail closed | APP integrity functions and tests | PASS |
| 12 | FAILED artifact recovery is same-identity and idempotent | lifecycle recovery and chunk reuse/conflict checks | PASS |
| 13 | READY artifact and manifest are immutable through the application path | finalize re-entry compares root and full manifest | PASS |
| 14 | APP derives audit approval from deterministic evidence | evidence digest and APP-owned derivation/revalidation | PASS |
| 15 | Canonical admission requires READY plus APP-approved RAW | durable completion gate | PASS |
| 16 | Railway surgical sync, external audit and authorized smoke are complete | not executed in this phase | BLOCKED |

## Validation record

- TypeScript typecheck: PASS.
- TypeScript tests: 861/861 PASS.
- Python tests: 138/138 PASS after installing both declared requirements files.
- Build/diff validation: required before handoff.
- Production database immutability triggers for the already-existing RAW tables:
  not changed in this phase; review remains part of external release approval.

## Promotion rule

Promotion requires all 16 gates to be PASS. Gate 16 is BLOCKED, therefore this
state is not `READY FOR REAL E2E`, does not authorize Railway deployment, and
does not authorize any real demo processing.