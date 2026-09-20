# FASE 2.7.2G.5-R-F.2.7 — Exhaustive RAW forensic audit

## Decision

**`PASS_FOR_CODE_HARDENING`; operational Cache execution remains `BLOCKED`.**

The repository now contains the versioned forensic-v2 producer, independent physical artifact verifier, and fail-closed Canonical admission path. The installed `demoparser2==0.42.0` surface exposes no independent, documented API for enumerating the complete expected tick domain. The producer therefore reports that source as `UNAVAILABLE`/non-authoritative and blocks the full-domain gate instead of inferring completeness from `parse_ticks`, `playback_ticks`, equal batches, or the 4,096-row diagnostic sample. No real v2 artifact was produced or reconciled, so this phase does not prove the Cache demo and does not authorize Cache Run 1, Run 2, or attempt 9.

## Parser capability baseline

- Parser identity: `demoparser2==0.42.0`.
- Catalogue version: `1`.
- Provenance: installed runtime signatures/docstrings, public parser APIs, runtime `list_updated_fields`, runtime `list_game_events`, and reviewed GamePro mappings.
- Public APIs inventoried: `parse_header`, `list_updated_fields`, `list_game_events`, `parse_event`, `parse_events`, `parse_grenades`, `parse_item_drops`, `parse_player_info`, `parse_skins`, `parse_ticks`, and `parse_voice`.
- Static capabilities: 357 across the required 24 categories.
- Static classifications: 7 `CANONICAL`, 4 `DERIVED`, and 346 `RAW_ONLY`.
- Static catalogue digest: `664e1aec2ac0d02532aef1fe3f935e7d657331b3a5989f8e67084b6b94f5537a`.
- Runtime-discovered fields and events are retained with explicit provenance. Missing, unavailable, and parse-failed capabilities remain distinct in concrete-demo evidence.
- Unknown or malformed classifications, missing Canonical mappings, missing derivation rules, missing RAW-only reasons, duplicate identifiers, parser drift, and digest drift fail closed.

## Full-tick audit

- Approval evidence is designed as bounded `PROPERTY_BATCH × TICK_INTERVAL` calls with explicit tick lists; it never uses `ticks=None` as proof. The legacy 4,096-row sample remains diagnostic/HOT-only.
- Intervals are generated only from an independently authoritative expected domain. Without one, no unbounded parse is attempted and the result is explicitly `UNAVAILABLE`/`BLOCKED`.
- The audit records expected and observed domains, rows, types, nullability, player identities, tick ranges, interval digests, missing/unexpected ticks, failures, gaps, and overlaps without retaining parsed DataFrames.
- Fixtures inject an explicit authoritative domain to prove batching, complete coverage, missing/unexpected tick detection, and fail-closed behavior. They make no claim about the real Cache demo.

## Audit contract v2 and admission

The worker emits 22 named gates covering parser identity, catalogue integrity, event discovery and attempts, full tick coverage, batch integrity, gaps, overlaps, exhaustive classification, header, players, rounds, bombs, combat, grenades, teams/score, usercmd, weapons/inventory, aggregates, mappings, parse failures, and physical re-audit.

Gate 22 is deliberately `BLOCKED` in producer output. The APP may approve only after it:

1. verifies artifact ownership, identity, immutable metadata, section order, chunk indices, hash chain, and root digest;
2. verifies the manifest and forensic-v2 deterministic digest;
3. downloads every private gzip JSONL chunk;
4. hashes the physical compressed bytes and compares each stored SHA and byte count;
5. decompresses and parses every line independently;
6. reconstructs compressed/decompressed bytes, section rows, fields, chunk indices/SHA sets, events, players, rounds, ticks, and mappings;
7. compares the producer projection and physical projection by set and deterministic digest;
8. resolves Gate 22 to `PASS` only after reconciliation, then validates the final contract before issuing `RawAdmissionApproval`.

Only successful completion of that independent operation satisfies the physical gate and returns an approved admission decision. Legacy evidence remains readable but cannot gain v2 approval retroactively.

## Validation evidence

- Focused APP forensic/admission tests: 9/9 PASS.
- Complete APP suite: 937/937 PASS across 66 files.
- Focused parser forensic/RAW tests: 20/20 PASS.
- Complete parser suite: 171 PASS, 10 skipped; the skips remain explicit and were not converted into PASS.
- TypeScript typecheck: PASS.
- ESLint: PASS with 0 errors and 9 pre-existing Fast Refresh warnings.
- Python compileall: PASS.
- Formatting and diff integrity: PASS.
- Automatic application build: PASS.

Fixtures cover catalogue identity/digest, classifications, full-domain invocation, failed batches, required gates, physical gzip JSONL reconstruction, and byte mutation. They prove code behavior, not the real Cache artifact.

## Remaining proof

Operational closure first requires a genuinely authoritative complete expected tick-domain source compatible with `demoparser2==0.42.0`; the currently inspected public API does not provide one. Only after that prerequisite exists may a new parser-produced forensic-v2 artifact and APP-side physical re-audit establish concrete inventories, physical reconciliation, and all 22 gates for the Cache demo. Until then, `READY_FOR_CONTROLLED_V2_ARTIFACT` is not asserted and the operational decision remains fail-closed.

## Preservation statement

No Cache run, retry, queue operation, attempt 9, Canonical production write, migration, production data mutation, Storage mutation, secret change, Railway deployment, or historical attempt/artifact mutation occurred. Attempts 7 and 8 and their RAW evidence remain preserved. Run 2 and Fase 2.8 remain prohibited.