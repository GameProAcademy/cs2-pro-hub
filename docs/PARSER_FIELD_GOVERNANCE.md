# Parser field governance

How CS2 PRO classifies every raw field and event the demo parser returns, how a new CS2 field is
detected and reviewed, and how a reviewed classification reaches production. It was introduced on
2026-11-04 and is released with R5.8.23.

## Why

CS2 updates add fields to existing events and add new events. An unreviewed field blocks the whole
demo at the RAW audit (`RAW-EVIDENCE-01`, `RAW→CANONICAL`), even when no metric uses it. The real
case was `player_disconnect.ever_fully_connected` (job `e4088318`, attempt 1, 2026-11-03). Blocking
is correct and stays. What this document adds is a predictable, auditable path from "blocked" to
"reviewed and released", with no emergency improvisation.

## Architecture

| Piece | Location | Role |
| --- | --- | --- |
| Classification (**single source of truth**) | `services/cs2-demo-parser/raw_evidence.py`: `MAPPED_RAW_FIELDS`, `REVIEWED_RAW_ONLY_EVENT_FIELDS`, `REVIEWED_IGNORED_EVENT_FIELDS`, the family rules (`PLAYER_PROPERTIES`, `REVIEWED_EVENT_FIELDS`, `REVIEWED_HEADER_FIELDS`, `REVIEWED_GRENADE_FIELDS`) | Code that runs in the attested worker. Its git blob is pinned by the runtime attestation (`scripts/parser_runtime_attestation.py`). It cannot change at runtime, and demo content cannot influence it: field names are looked up in fixed tables. |
| Review records | `docs/reference/parser_field_reviews.json` | Why each class was chosen: reason, review date, release that introduced it, tests, consumers. |
| Versioned catalog | `docs/reference/parser_field_catalog.json` | Generated from the two files above. It holds class, runtime status, targets and the review, plus the `source_blob` of `raw_evidence.py`. |
| Audit tool | `scripts/parser_field_catalog.py` (`generate`, `check`, `diagnose`) | CI audit and support diagnostics. It never classifies anything by itself. |
| Behavioural proof | `services/cs2-demo-parser/tests/test_field_governance.py` | Perturbs every input of the real consumers to prove what is and is not consumed. |
| CI | `scripts/tests/test_parser_field_catalog.py` (runs in "Main required gates" with all of `scripts/tests`) and the worker tests (`CS2 parser tests`) | Fails on drift, missing review, double class, missing governance test or a consumed RAW_ONLY field. |

The capability catalog (`capability_catalog.py`) is a coarser, category-level description of the
parser's capabilities (RAW-V2 gates). It is unchanged and is not the per-field admission authority.

## Classes

| Class | Runtime status in `field_mappings` | Meaning | Proven by |
| --- | --- | --- | --- |
| **CANONICAL** | `MAPPED` / `DERIVED` (v2: `CANONICAL` / `DERIVED`) | Reviewed semantics; feeds Canonical data. Must name `app_field` and `canonical_field`. | `test_every_field_the_adapter_reads_is_canonical`, `test_semantic_tick_fields_equal_what_the_hot_payload_reads` |
| **RAW_ONLY** | `RAW_ONLY_INTENTIONAL` + reason | Reviewed and preserved as RAW evidence. It **never** feeds metrics, Player DNA, AI Coach, identity, aggregates or Canonical data. | `test_no_raw_only_or_ignored_field_changes_the_adapter_output`, `test_raw_only_game_state_never_reaches_the_hot_payload` |
| **IGNORED_APPROVED** | `RAW_ONLY_INTENTIONAL` + `IGNORED_APPROVED_REASON` | Reviewed, no analytic value, intentionally unused, never blocks. It is still preserved, because the evidence contract keeps every returned field. Examples: HLTV camera, server cvars and messages, chat, pings. | `test_ignored_approved_is_explicit_non_blocking_and_distinguishable` |
| **UNMAPPED** | `UNMAPPED_BUT_AVAILABLE` | Not reviewed. **Blocks** `RAW-EVIDENCE-01` and `RAW→CANONICAL`, and the job becomes `blocked_raw_audit`. | `test_unknown_fields_and_unknown_events_still_block` |

Precedence: an explicit CANONICAL entry wins over any RAW_ONLY family rule. A field may appear in
only one explicit table; `test_each_field_has_exactly_one_class` enforces this.

### What the 2026-11-04 audit found

Proven from the production manifest of job `e4088318` and from the code:

- Some fields were consumed by the adapter while labelled `RAW_ONLY_INTENTIONAL`:
  - `player_death.assistedflash` feeds D35 flash assists in `src/lib/pipeline/metrics.ts`;
  - `bomb_planted/defused/exploded.user_steamid`;
  - `hegrenade/flashbang/smokegrenade/molotov/decoy_detonate.user_steamid` (D35 thrower);
  - `player_blind.attacker_steamid` and `player_blind.user_steamid`;
  - the tick and round of every adapter-emitted event.

  They are now CANONICAL.
- The tick-sample properties copied by `hot_payload._semantic_tick_rows` into
  `match_sources.metadata.semantic_player_data` were labelled RAW_ONLY. They are now CANONICAL,
  with the same target as the existing `game_state.tick/steamid/name`.
- Duplicate listings were removed: `player_death.attackerblind` and `player_team.tick` were both
  MAPPED/DERIVED and RAW_ONLY.
- No metric changed. Only the labels changed, so the inventory now says what the code does.
- `inferno_startburn` appears in `adapter._GRENADE_EVENTS` but not in `SUPPORTED_EVENTS`, so the
  adapter never emits it and it stays RAW_ONLY. This is recorded as an adapter observation and was
  not changed.

## Compatibility cases (not equivalent)

| Situation | What happens |
| --- | --- |
| New field in a known event | UNMAPPED, so blocked, preserved and diagnosed. |
| New event | `<event>.__event__` is UNMAPPED, so blocked and diagnosed (`kind: new_event`). |
| Reviewed field absent from a demo | Not an error. The field is absent from the inventory, and metrics stay `NULL`, never `0`. |
| Field the adapter needs is absent or invalid | Adapter coercion (`_num/_int/_bool/_steam_id`) yields `None`. Metrics stay unknown, never zero. |
| Same field with several native types in one demo | Reported by `diagnose` as `type_conflicts`; the adapter coerces incompatible values to `None`. |
| Parser/version change | Parser identity gates (`RAW-V2-01`, revision lock `PARSER_IDENTITY_MISMATCH`). |

## Runbook — a demo was blocked by an unknown field {#runbook}

1. **Identify the field.** The job shows "Análise retida para revisão". The support email of a
   "Reportar problema" for that job includes the RAW artifact path (`Artefato RAW`). Otherwise,
   look it up as `raw_evidence_artifacts.manifest_storage_path` for the job id and attempt. Download
   the manifest (read-only) and run:

   ```bash
   python3 scripts/parser_field_catalog.py diagnose manifest.json
   ```

   The report gives field, event, `new_field`/`new_event`, observed types, rows, first/last tick,
   parser revision and blocking gates. It never prints event values.
2. **Investigate the semantics.** Use the demoparser2 0.42.0 docs, the CS2 game-event definitions
   and the observed values in the RAW artifact. Never approve a field because its name looks
   harmless.
3. **Check the impact.** Does `adapter.py` (`_event_fields`, `normalize_*`) or `hot_payload.py`
   read it? Could it affect rounds, ticks, combat, identity or economy?
4. **Classify it in `raw_evidence.py`.**
   - CANONICAL: add it to `MAPPED_RAW_FIELDS` with `app_field` and `canonical_field`, plus the
     consumer change and its tests.
   - RAW_ONLY: add it to `REVIEWED_RAW_ONLY_EVENT_FIELDS` with a comment giving source, job and date.
   - IGNORED_APPROVED: add it to `REVIEWED_IGNORED_EVENT_FIELDS`.
5. **Record the review** in `docs/reference/parser_field_reviews.json` (reason, reviewed,
   introduced_in, tests, consumers). Then run `python3 scripts/parser_field_catalog.py generate`
   and commit the catalog.
6. **Tests.** Add a regression test for the field, like the one for `ever_fully_connected`, and run:
   - `cd services/cs2-demo-parser && pytest -q`;
   - `python -m pytest -q scripts/tests`;
   - `bun run test`.
7. **PR, CI and merge.** Merge only when every required check is green on the same head SHA, using
   a merge commit.
8. **Release the worker** with the controlled procedure, because `raw_evidence.py` is an attested
   blob:
   1. Write the repin migration (`scripts/repin/r5_8_11.py`) and update the pins in
      `scripts/parser_runtime_attestation.py`, `scripts/h3e91_live_preflight.py`,
      `src/lib/parserAttestation.ts` and `src/lib/pipeline/parser/adapter.ts`.
   2. Freeze the watch patterns, set `PARSER_REVISION` / `PARSER_BUILD_REVISION` with
      skipDeploys, and deploy exactly once.
   3. Apply the migration and record it.
   4. Update the app secrets: `DEMO_PARSER_EXPECTED_REVISION` and
      `DEMO_PARSER_EXPECTED_BUILD_REVISION` take the `git:` prefix; `H3E91_EXPECTED_WORKER_BUILD_COMMIT`
      is the bare commit.
   5. Publish the app.
   6. Dispatch the attestation workflow and confirm the activation gate passes.

   See `docs/H3E_RELEASE_IDENTITY_TRACEABILITY.md`.
9. **Verify production.** `/health` and `/version` must report `build_revision` = the approved
   commit with `declared_revision_matches` true, attestation VERIFIED, and the activation gate PASS.
10. **Affected demos.** A blocked attempt is never rewritten. When authorized, the player
    reprocesses ("Reprocessar com o parser atual") or uploads again, which creates a new attempt
    with its own RAW evidence. The blocked attempt and its evidence stay in history.

## Player experience

A blocked audit is classified `raw_audit_review` (amber, never red). The player is told the data was
preserved, a technical review is needed, and the same demo should not be sent again. The player can
use "Reportar problema", which gives a `GP-XXXXXX` protocol. The support email carries the job,
attempt, code `RAW_AUDIT_BLOCKED` and the RAW artifact path, but no table names or infrastructure
details reach the player.
