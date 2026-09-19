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