# FASE 2.7.2G.5-R-F.2.7 — Exhaustive RAW forensic audit

## Decision

**`BLOCKED / INCOMPLETE` for a controlled Cache retry.**

The repository now contains the versioned forensic-v2 producer, independent physical artifact verifier, and fail-closed Canonical admission path. No real v2 artifact has been produced or independently reconciled, so this implementation phase does not prove the Cache demo and does not authorize Cache Run 1, Run 2, or attempt 9.

## Parser capability baseline

- Parser identity: `demoparser2==0.42.0`.
- Catalogue version: `1`.
- Provenance: package stubs, runtime `list_updated_fields`, runtime `list_game_events`, and reviewed GamePro mappings.
- Static capabilities: 268 across 17 categories.
- Static classifications: 6 `CANONICAL`, 4 `DERIVED`, and 258 `RAW_ONLY`.
- Static catalogue digest: `d72c179ba22b96f30554d828a15fd7e90d46ea7a87303f3502c1f5660a43696a`.
- Runtime-discovered fields and events are retained with explicit provenance. Missing, unavailable, and parse-failed capabilities remain distinct in concrete-demo evidence.
- Unknown or malformed classifications, missing Canonical mappings, missing derivation rules, missing RAW-only reasons, duplicate identifiers, parser drift, and digest drift fail closed.

## Full-tick audit

- Approval evidence uses `parse_ticks(..., ticks=None)` in deterministic property batches; the legacy 4,096-row sample remains diagnostic/HOT-only.
- The audit records rows, types, nullability, distinct values, player identities, tick ranges, failures, and deterministic summaries with bounded retained samples.
- Tick sets are compared across successful property batches. Missing ticks, unexpected ticks, failed batches, or incomplete coverage prevent `FULL_TICK_DOMAIN_AUDIT`.
- This mechanism is covered by fixtures, but no claim is made here about the real Cache demo's tick counts.

## Audit contract v2 and admission

The worker emits 22 named gates covering parser identity, catalogue integrity, event discovery and attempts, full tick coverage, batch integrity, gaps, overlaps, exhaustive classification, header, players, rounds, bombs, combat, grenades, teams/score, usercmd, weapons/inventory, aggregates, mappings, parse failures, and physical re-audit.

Gate 22 is deliberately `BLOCKED` in producer output. The APP may approve only after it:

1. verifies artifact ownership, identity, immutable metadata, section order, chunk indices, hash chain, and root digest;
2. verifies the manifest and forensic-v2 deterministic digest;
3. downloads every private gzip JSONL chunk;
4. hashes the physical compressed bytes and compares each stored SHA and byte count;
5. decompresses and parses every line independently;
6. reconstructs section row/byte/field totals and reconciles global totals.

Only successful completion of that independent operation satisfies the physical gate and returns an approved admission decision. Legacy evidence remains readable but cannot gain v2 approval retroactively.

## Validation evidence

- Focused APP forensic/admission tests: 16/16 PASS after final typing fixes.
- Complete APP suite: 934/934 PASS across 66 files.
- Focused parser forensic/RAW tests: 41 PASS, 7 skipped.
- Complete parser suite: 169 PASS, 10 skipped; the skips remain explicit and were not converted into PASS.
- TypeScript typecheck: PASS.
- ESLint: PASS with 0 errors and 9 pre-existing Fast Refresh warnings.
- Python compileall: PASS.
- Formatting and diff integrity: PASS.
- Automatic application build: PASS.

Fixtures cover catalogue identity/digest, classifications, full-domain invocation, failed batches, required gates, physical gzip JSONL reconstruction, and byte mutation. They prove code behavior, not the real Cache artifact.

## Remaining proof

Closure still requires a new parser-produced forensic-v2 artifact and APP-side physical re-audit against that same immutable artifact. Only that execution can establish concrete event/property inventories, real tick-domain totals, physical reconciliation, and all 22 gates for the Cache demo. Until then, the operational decision remains fail-closed.

## Preservation statement

No Cache run, retry, queue operation, attempt 9, Canonical production write, migration, production data mutation, Storage mutation, secret change, Railway deployment, or historical attempt/artifact mutation occurred. Attempts 7 and 8 and their RAW evidence remain preserved. Run 2 and Fase 2.8 remain prohibited.