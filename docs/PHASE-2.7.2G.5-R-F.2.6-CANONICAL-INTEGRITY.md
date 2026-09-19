# FASE 2.7.2G.5-R-F.2.6 — Canonical integrity remediation

## Purpose

Close the concrete blockers discovered after Cache Run 1. This phase is a remediation gate, not a new analytical phase.

## Findings addressed

1. finish_demo_job_processed wrote text[] into demo_jobs.quality_flags jsonb.
2. Canonical persistence and terminal job finalization are separate transactions; a post-Canonical failure must converge by retry rather than create a new failed attempt.
3. Approved durable RAW artifacts were not sufficient for processed idempotency when the legacy RAW report row was absent.
4. Round reconstruction paired a lifecycle round_end at tick 1 with the first real round start, shifting every boundary.
5. Event resolution assigned known inter-round gaps to the next round.
6. Canonical validation did not enforce round interval or event containment invariants.
7. Legacy demo Canonical matches without approved RAW evidence could be selected as convergence candidates.
8. Future database rows had no direct guard against end_tick < start_tick.

## Implementation

- services/cs2-demo-parser/adapter.py: start-first round pairing; orphan pre-start ends ignored; inter-round gaps unresolved; explicit round numbers must agree with the observed interval.
- src/lib/pipeline/validator.ts: bundle-level semantic gate; contiguous round numbering; round-count equality; start/end ordering; non-overlap; event-to-round containment.
- src/lib/pipeline/jobs.server.ts: records that Canonical committed; durable post-Canonical finalization remains retryable instead of terminal failure.
- src/lib/faceit/faceit.canonical.server.ts: legacy demo candidates without approved RAW evidence are excluded from identity convergence.
- supabase/migrations/20260919110000_g5_rf2_canonical_integrity.sql: corrected terminalization RPC; approved durable RAW idempotency; future-row round interval CHECK.

## Safety

No historical attempt, RAW artifact, Canonical row, secret or Railway production deployment is mutated by this phase itself.

Run 2 remains prohibited until the migration is applied, Railway is synced, focused tests pass, and a fresh controlled Run 1 reaches terminal processed with structurally valid Canonical data.

## Production application and pre-run verification

- The existing migration `20260919110000_g5_rf2_canonical_integrity.sql` was applied once to the production database.
- Live definitions confirm JSONB `quality_flags`, Canonical postconditions, advisory locking, SHA validation, service-role-only execution and the future-row round interval constraint as `NOT VALID`.
- Attempts 7 and 8 and both RAW artifacts remain unchanged; no attempt 9 exists and no Cache run was executed.
- Railway health/version probes remain read-only and report parser `demoparser2 0.42.0`, contract 1 and the pinned semantic revision.
- The first local gate exposed type-contract and stale-regression-test drift. The validator now accepts the shared structural round/event contract without weakening any invariant, and mock convergence fixtures now include explicit approved RAW evidence.
- Focused APP regressions: 197/197 PASS. Complete APP regressions: 931/931 PASS across 65 files.
- Complete parser regressions: 165 PASS/10 skipped. The round-boundary test now verifies the boundary fields without discarding valid bomb-state fields, and unknown end boundaries have a direct regression assertion.
- Typecheck, Python compileall, formatting, diff check and the automatic build all PASS.
- Final pre-run decision: `READY_FOR_CONTROLLED_RUN_1_RETRY`.
- No Cache run, upload, enqueue, retry, attempt 9, historical mutation, Railway deployment or secret change occurred in this phase. Run 2 remains prohibited.

## Exit criteria

- migration applied in production;
- Railway parser revision contains the round reconstruction fix;
- parser + APP focused tests pass;
- Cache Run 1 retry uses the real demo and exact SHA;
- attempt 7 remains immutable;
- no attempt 9 exists;
- RAW artifact is approved;
- every Canonical round has valid ordering;
- every Canonical event is inside its proven round interval;
- match.round_count equals match_rounds row count;
- terminal job finalization succeeds;
- subsequent identical reservation is idempotent;
- no metrics/features are released unless their required player-round evidence is present.

## Controlled Run 1 retry — preflight result

**Decision:** `BLOCKED_BEFORE_RETRY`. The authorized retry was not invoked because the mandatory repository lint gate failed. Under the fail-closed execution rule, no production mutation was permitted after that result.

### Verified before the stop

- Protected master-admin preflight: PASS. Railway `/health` and `/version` returned HTTP 200; parser `demoparser2 0.42.0`, contract `1`, semantic revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`, build revision `git:684da207d6a35d14d5663b011966561b09d55703`.
- Expected Railway deployment: `4a5dcf59-f816-420c-bbaf-3b7a7165bac7`; the read-only runtime probes did not expose a deployment identifier, so this identifier was not independently re-derived in this run.
- Official retry path: `retry_demo_job(..., true, 'admin_e2e')` updates the existing job/upload in place, preserves `attempt_number=8`, and would increment only the technical retry/dispatch counter. It was not called.
- Attempt 8 object exists in private Storage at the recorded path with 473,748,061 bytes. Its database SHA remains `0caa7c9744deec106095895d2dacd19cbfdae689f99e29e29b0dd4d446b4ec8ae3d`.
- Artifact 8 remains `ready/ready/approved`, 25/25 physical chunks verified, 373,778 rows, 2,799,506 bytes, root digest `341eb88e1c5b1c4f6af8fd74e7a7af39333ff0c4a2108a8d9e05a5e9a8297b1c`.
- Attempt 7 remains `blocked_raw_audit`; artifact 7 remains `ready/ready/blocked`, 24/24 physical chunks verified, 373,754 rows, 2,799,488 bytes, root digest `ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2`.
- No attempt 9 exists. No upload, enqueue, retry, queue claim, parser execution, RAW rewrite, Canonical rewrite, metric, feature, deployment or secret mutation occurred.
- APP tests: 931 passed, 0 failed, 0 skipped across 65 files.
- Parser tests: 165 passed, 0 failed, 10 skipped, with one warning. Python compileall passed.
- Build passed, including the latest automatic build signal.
- Lint failed on existing Prettier formatting violations across pipeline and supporting files. The failures were not converted to skips and no broad formatting rewrite was performed inside this production-run phase.

### Required 27-item run record

1. Parser commit: `git:684da207d6a35d14d5663b011966561b09d55703` build; semantic revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`.
2. Railway deployment: expected `4a5dcf59-f816-420c-bbaf-3b7a7165bac7`; health/version PASS, deployment ID not exposed by probes.
3. Upload ID: `d89b697f-c40d-42f4-ae51-040e4e8cabba`.
4. Job ID: `d1851c49-820a-426b-86c6-0ea4623b4f41`.
5. Attempt number: `8`, unchanged.
6. Artifact ID: `62637627-3cfa-4e67-8734-75d5cc90966d`.
7. SHA: `0caa7c9744deec106095895d2dacd19cbfdae689f99e29e29b0dd4d446b4ec8ae3d`.
8. Root digest: `341eb88e1c5b1c4f6af8fd74e7a7af39333ff0c4a2108a8d9e05a5e9a8297b1c`.
9. RAW audit: `approved` from the preserved artifact; not re-run.
10. Parser result: not run; preflight only.
11. Rounds found: historical partial Canonical has 25; no new result.
12. Invalid rounds: historical partial Canonical has 24 with `end_tick < start_tick`; no new result.
13. Events found: historical partial Canonical has 4,397; no new result.
14. Events discarded: not measured because retry did not run.
15. Events outside interval: historical partial Canonical has 4,397; no new result.
16. Participants: historical partial Canonical has 10; no new result.
17. Round players: historical partial Canonical has 0; no new result.
18. Canonical match ID: historical `a7b27f16-4c85-428b-a855-0f683bda48a2`.
19. Match source ID: historical `b63082cb-4220-4d0d-9b45-d6db6c119256`.
20. Canonical status: historical source `incomplete`; no new persistence occurred.
21. Job final status: unchanged `failed`.
22. Retry count: unchanged `3`.
23. Dispatch attempt: unchanged `2`.
24. Error: unchanged historical `PERSISTENCE_ERROR`; current execution blocker is mandatory lint failure before retry.
25. F2.4: `BLOCKED/NOT RUN`.
26. F2.5: `BLOCKED/NOT RUN`.
27. F2.6: remediation remains verified, but phase closure is `BLOCKED` pending a clean mandatory preflight and controlled retry.

**attempt 9 NÃO foi criado.**

### Next authorized gate

Resolve the repository lint gate without weakening tests or changing production data, rerun the full preflight, and only then request the single controlled retry of attempt 8. Run 2, Metrics/Features release and AI Coach remain blocked.
