# FASE 2.7.2G.5-R-F.2.8–F.2.9 — Forensic closure

## Decision

**`PASS_FOR_CODE_HARDENING`; operational execution remains `BLOCKED`.**

No Cache run, retry, attempt 9, enqueue, claim, Canonical write, production or Storage mutation, migration, secret change, or Railway deployment was performed. No real forensic-v2 artifact was produced. Fixtures prove code behavior only.

## Runtime capability proof

The declared catalog, installed package surface and GamePro mapping surface are now separate inputs. Catalog v2 records package version, module path, public symbol, callable signature, source reference, runtime/demo presence, mapping status, deterministic identity and per-capability digest.

The inspected environment contained `demoparser2==0.42.0` at `/tmp/g5-forensic-venv/lib/python3.13/site-packages/demoparser2/__init__.py`. Its public parser surface exposed `list_game_events`, `list_updated_fields`, `parse_event`, `parse_events`, `parse_grenades`, `parse_header`, `parse_item_drops`, `parse_player_info`, `parse_skins`, `parse_ticks`, and `parse_voice`. The runtime-surface digest was `d032ee0eaa3525af04fb4b212e9b84f4debf9985494fd5faff77b740e07eb5ce`.

That API surface cannot independently enumerate every possible runtime field or prove the complete expected tick domain. Its honest status is therefore `UNAVAILABLE`, `complete=false`; catalog reconciliation remains `BLOCKED`, never inferred as PASS from the declared catalog.

## Taxonomy and semantic gates

Forensic v2 accepts exactly `CANONICAL`, `DERIVED`, `RAW_ONLY`, `NOT_PRESENT`, `UNAVAILABLE`, and `PARSE_FAILED`. Legacy `UNMAPPED_BUT_AVAILABLE` remains readable only in legacy evidence and cannot obtain v2 approval. Null-only is recorded independently from absence. Failures carry stage, safe exception type/message, availability and attempt state.

The producer now checks evidence relationships rather than key presence alone: player identity uniqueness, contiguous/non-overlapping round lifecycle and event containment, bomb plant-before-resolution, combat actor/victim references, grenade player identity, team/score provenance, explicit usercmd availability, economy availability and aggregate scope. A discovered event that was not attempted blocks Gate 4.

## Tick authority

Tick auditing remains bounded by property batch and explicit tick interval. An approval requires a separately authoritative source, expected/observed domain equality, no missing/unexpected/duplicate ticks, no overlaps, and successful intervals. `parse_ticks(ticks=None)`, equal observed batches, playback metadata and the 4,096-row diagnostic sample are not authority. Because no valid production authority is currently available, the full-tick gate remains blocked.

## Producer-to-artifact reconciliation

The producer projection and APP reconstruction include events/counts/fields, players, rounds, ticks, mappings, classifications, derivations, RAW-only reasons, parser identity, catalog and capability digests, tick authority/coverage, property inventory, semantic inventories and forensic contract digest. The APP downloads every private chunk, validates its confined path, compressed SHA and bytes, gzip/JSONL decoding and rows, then reconstructs physical evidence.

A named 36-dimension registry covers identity, parser/contract, catalog/capability, classifications/mappings, semantic inventories, chunks, section digests, root digest, forensic digest and reconciliation digest. Dimensions are derived from the checks that completed; they are not blindly marked PASS.

## Gate 22 and Canonical admission

Producer output must have Gates 1–21 PASS while Gate 22 is BLOCKED. APP finalization requires physical reconstruction, producer↔physical equality, a valid reconciliation digest, artifact root digest and all 36 dimensions PASS. It recalculates the unsigned contract digest and a final contract digest. Canonical demo persistence now requires artifact identity plus final-contract and reconciliation digests; the legacy report fallback cannot authorize persistence.

This is integrity against accidental/cross-path corruption under the existing server trust boundary. It is not an HMAC or protection against a privileged administrator rewriting both database and Storage.

## Validation

- Parser suite: 171 passed, 10 explicitly skipped.
- Focused APP forensic, durable RAW and Canonical admission tests: 54 passed.
- TypeScript typecheck: PASS.
- Python compileall: PASS.
- Runtime inspection: package/version/path/signatures recorded; completeness remains UNAVAILABLE.

The complete APP suite, lint and build are run as final quality gates separately. Operational readiness remains blocked regardless of local success because tick authority and a real v2 artifact are absent.

## Remaining blockers

1. Provide and validate a real authoritative total tick-domain source for the pinned parser/demo contract.
2. Produce a new real v2 artifact only under a separately authorized execution.
3. Reconstruct and reconcile that artifact physically, proving all semantic and 36 reconciliation dimensions.
4. Only then consider `READY_FOR_CONTROLLED_V2_ARTIFACT`; this report does not grant it.
