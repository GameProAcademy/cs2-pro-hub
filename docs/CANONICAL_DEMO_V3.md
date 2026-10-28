# canonical-demo-v3 — versioned, evidence-based contract for the 105 Canonical demo fields

Status: **IMPLEMENTED; gate result is in §8**, recomputed by `python3 -m scripts.canonical_v3.gate`.
Owner decisions O1 (scope: server and browser, evaluated independently), O2 (adopt v3) and O7 (D33/D34)
were approved on 2026-10-28. Decisions O3–O6 are technical, reversible and recorded in §4.

Sources of truth (generated, never hand-edited):

| Artifact | Path |
| --- | --- |
| Contract (states, decisions, per-field per-path classification) | `scripts/canonical_v3/contract.py` → `docs/client-parser/canonical-demo-v3/contract.json` |
| Server-path policy in the app (fixed fields, contract tag) | `src/lib/canonical/canonicalContractV3.ts` (pinned to the contract by `scripts/tests/test_canonical_v3_contract.py`) |
| Harness (server code path → bundle) | `src/lib/canonical/__tests__/canonicalV3Harness.test.ts` |
| Field evidence (counts, digests, checks, determinism, persistence round trip) | `scripts/canonical_v3/harness.py` → `docs/client-parser/canonical-demo-v3/evidence/server-*.json` |
| Gate | `scripts/canonical_v3/gate.py` |

## 1. Relation to v2

- v2 (`scripts/canonical_mapping_gate.py`, inventory `cf0549c2…`, production release `cf0549c2-dfbd-c4df-25b4-2ce8204edf87`)
  is **unchanged**. It stays the immutable historical baseline: 0/105 authorized, gate BLOCKED forever.
- v3 covers the **same 105 field ids** (`FIELD_SPECS`); it does not rename or drop any field.
- Bundles written under v3 are tagged on their observation: `match_sources.metadata.canonical_contract = "canonical-demo-v3"`
  and `canonical_contract_digest`. An observation without the key is a v2 observation; no historical row is
  re-interpreted or rewritten.
- Coexistence: v2 controls keep checking the v2 baseline; v3 is evaluated by its own gate. Deprecation of v2
  (removal of its CI step) requires a new contract version and is not part of this change.

## 2. States

| State | Meaning | Persist | Metrics | Display | Terminal | Evidence required |
| --- | --- | --- | --- | --- | --- | --- |
| `available` | produced from a verified source by this path, with field-level evidence | yes | yes | yes | yes | non-null in a real demo; every semantic check passes in every demo; deterministic across two runs in ≥ 2 demos; persistence round trip EQUAL (and never DIFFERENT) |
| `legitimately_empty` | the information does not exist in this source | its representation only | no | as "not provided by this source" | yes | the representation holds in every observation |
| `unsupported` | the information exists or is derivable, but this path has no reviewed extraction | representation only | no | as "not supported yet" | yes | representation holds; an exit criterion is recorded |
| `identity_blocked` | depends on player identity this path cannot establish | no | no | no | yes | representation holds |
| `tick_blocked` | depends on a tick/time domain this path has not proven | no | no | no | yes | representation holds |
| `not_authorized` | policy forbids this path to persist or promote it | no | no | no | yes | policy reference; representation holds when produced |
| `not_verified` | produced, but its evidence is missing or a check failed | as in v2 | as in v2 | as in v2 | **no** | — |
| `parity_failed` | two implementations disagree on the same DEM | no | no | no | **no** | divergence record |

`null`, `0`, `[]`, `{}`, the string `"unknown"` and an absent key are distinct representations. A field's
state evolves only through evidence: an extraction for an `unsupported` field moves it to `not_verified`
until its own evidence exists; a failing check moves an `available` field back to `not_verified`; conflicting
evidence (a DIFFERENT round trip, a non-deterministic digest) blocks the field and the path.

**Gate PASS means every field is classified and every classification is proven — not that every field has
a value.**

## 3. Paths

- **Server path** (`services/cs2-demo-parser/parser.py` → `normalizer.ts` → `demo.adapter.ts` →
  `applyServerPolicyV3` → `persist_canonical_observation`): 71 `available`, 11 `legitimately_empty`,
  13 `unsupported`, 10 `not_authorized`. The 34 non-available fields are enforced in the app before
  persistence: a value other than the declared representation is **withheld** (replaced by the
  representation) and recorded in `canonical_v3_withheld` on the observation — never silently persisted.
- **Browser path**: there is no browser Canonical writer. The client parser is disabled in production
  (`clientParser.service.ts`), never persists, and never grants admission (`appDataContracts.ts`
  `canonicalAuthorization: false`). All 105 fields are `not_authorized` on this path; the gate checks those
  policy markers in the code. A9.1 raw parity (run `40622794332`) is recorded per field as context only — it
  compares raw demoparser2 tables, never Canonical fields, and `players`/`player_identity` are
  NOT_COMPARABLE on WASM. A server result never approves the browser path.

## 4. Decisions O3–O6

| Item | Alternatives | Decision (implemented) | Why | Impact |
| --- | --- | --- | --- | --- |
| O3 `winReason` | (a) keep `"unknown"` as a value; (b) `null` + reason; (c) typed `{value, status}` | The stored `"unknown"` is a **sentinel meaning "unsupported on this path"**; the field state is `unsupported` and consumers must read the state, never the string. A typed reason waits for a reviewed `round_win_reason` code table (exit criterion). | Keeps v2 rows and the DB column unchanged (no rewrite), removes the ambiguity at the contract level, and no consumer reads the string today. | DB: none. API/UI: none (no reader). Rollback: none needed. |
| O4 per-round aggregates | (a) derive in the bundle; (b) keep only in the metrics layer | **(b)**: `kills … tradeKill`, `survived` stay `null` in the bundle (`not_authorized`); the metrics layer (`metrics.ts`) derives them once from verified events. A `0` is produced only by the metrics layer, which owns coverage. | One source of truth; deriving twice risks divergent semantics (trade window, survival evidence). | DB: unchanged (columns stay null). Metrics: unchanged. |
| O5 `participantsResolved` | (a) `0` when none; (b) `null`; (c) explicit status | Integer count after the EXACT Steam attachment step; `0` = "none resolved". The demo path always runs that step, so "could not determine" does not occur; an observation without the step would carry `null`, never `0`. | Matches the adapter and production (1 per attached match). | None. |
| O6 tick domain | (a) block all tick fields; (b) define completeness and prove it per demo | (b). Complete when: rounds have non-null ticks with `start < end ≤ next start`; every persisted event tick lies in its round; event times never decrease with tick inside a round; the time provenance (native, header tickrate or game clock) is recorded in the RAW manifest warnings. Checked per field by `tick_domain_rounds`, `tick_domain_events`, `time_monotonic_in_round`. Derived aggregates stay in the metrics layer (O4). | Converts "tick domain" from a label into executable checks. | None. |

## 5. The five contradictions (v2 required 0 authorized fields; PASS required 105)

The contradiction existed only because PASS was defined as "authorize every field inside v2". v3 evaluates in
its own versioned contract, so every v2 control keeps its meaning — protecting the immutable v2 baseline —
and none had to be loosened.

| Control | v2 role (unchanged) | v3 relation |
| --- | --- | --- |
| `canonical_mapping_inventory_releases` CHECK (`authorized_count = 0 AND verified_count = 0`) | the v2 release row can never claim authorization | v3 has no row in that table; v3 is pinned by its contract digest in code and evidence |
| `r5_real_dem_access_gate` (`CANONICAL_BASELINE_CHANGED`) | detects any change to the v2 baseline before real-DEM access | still true; v3 never edits v2 rows |
| A9.1 pre-DEM gate 5 (`canonicalAuthorization` false) | the lab never grants Canonical authority | consistent: browser path `not_authorized`; raw parity is context only |
| `parser_runtime_attestation.mapping_authority_matches_artifact` | the runtime attests the exact v2 artifact | unchanged; the v3 contract digest is pinned separately (`CANONICAL_CONTRACT_V3_DIGEST`) and tagged on every v3 observation |
| `appDataContracts.ts` `canonicalAuthorization: z.literal(false)` | browser/app readiness never authorizes | consistent with the browser path; the server path's authority comes from v3 evidence, not from that literal |

## 6. Rollout and rollback

1. Merge (CI: Quality Gates, persistence probe, v3 tests). No migration is needed: v3 adds no column; the
   contract tag and withheld record live in existing `match_sources.metadata` (merged by the RPC).
2. Publish the app: from then on every new demo observation carries `canonical_contract = canonical-demo-v3`.
3. Evidence: harness runs on the owner-provided DEMs (local, never committed), production read-back digests
   after the authorized reprocessing, gate recomputed and committed.
4. Rollback (code only): revert the `applyServerPolicyV3` call in `jobs.server.ts` and republish. Rows written
   under v3 keep their tag (truthful history); no data migration in either direction.

## 7. Per-field classification (105)

Determinism, persistence round trip and checks per field and per demo are in the evidence files (§8).

| # | Field | Type | Server state | Server reason / derivation | Checks or representation | Exit criterion | Browser state |
|---|---|---|---|---|---|---|---|
| 1 | `CanonicalMatchSource.source` | `DataSource` | available | adapter literal 'demo' | `equals:demo` | — | not_authorized |
| 2 | `CanonicalMatchSource.sourceContractVersion` | `SourceContractVersion` | available | configured source contract token | `equals:demo-v1` | — | not_authorized |
| 3 | `CanonicalMatchSource.externalMatchId` | `string\|null` | legitimately_empty | a CS2 DEM does not carry this information (no provider match id); never the fingerprint | always `null` | — | not_authorized |
| 4 | `CanonicalMatchSource.externalParentId` | `string\|null` | legitimately_empty | a CS2 DEM does not carry this information (no series parent) | always `null` | — | not_authorized |
| 5 | `CanonicalMatchSource.sourceVersion` | `string\|null` | available | validated parser name@version | `equals:demoparser2@0.42.0` | — | not_authorized |
| 6 | `CanonicalMatchSource.fetchedAt` | `ISO-8601 string` | available | server collection timestamp (input) | `iso8601` | — | not_authorized |
| 7 | `CanonicalMatchSource.sourceUpdatedAt` | `string\|null` | legitimately_empty | a CS2 DEM does not carry this information (no source update time) | always `null` | — | not_authorized |
| 8 | `CanonicalMatchSource.status` | `ObservationStatus` | available | complete iff the parser reports no partial parse | `in:complete,incomplete` | — | not_authorized |
| 9 | `CanonicalMatchSource.quality.status` | `QualityStatus` | available | quality helper over parser flags | `in:complete,partial,unknown` | — | not_authorized |
| 10 | `CanonicalMatchSource.quality.reasons` | `string[]` | available | stable reason slugs | `array` | — | not_authorized |
| 11 | `CanonicalMatchSource.quality.confidence` | `number\|null` | available | measured extraction confidence | `unit_interval_or_null` | — | not_authorized |
| 12 | `CanonicalMatchSource.fingerprint` | `string\|null` | available | SHA-256 of the DEM file | `sha256` | — | not_authorized |
| 13 | `CanonicalMatchSource.metadata` | `Record<string,unknown>` | available | bounded lineage metadata | `object` | — | not_authorized |
| 14 | `CanonicalMatch.game` | `"cs2"` | available | adapter literal 'cs2' | `equals:cs2` | — | not_authorized |
| 15 | `CanonicalMatch.map` | `string\|null` | available | header map code | `map_code` | — | not_authorized |
| 16 | `CanonicalMatch.mapNumber` | `number\|null` | legitimately_empty | a CS2 DEM does not carry this information (a standalone DEM has no series position) | always `null` | — | not_authorized |
| 17 | `CanonicalMatch.playedAt` | `string\|null` | legitimately_empty | a CS2 DEM does not carry this information (no wall-clock date in the header); the parser contract emits it as null/empty by construction (services/cs2-demo-parser/adapter.py) | always `null` | — | not_authorized |
| 18 | `CanonicalMatch.startedAt` | `string\|null` | legitimately_empty | a CS2 DEM does not carry this information (no wall-clock date in the header); the parser contract emits it as null/empty by construction (services/cs2-demo-parser/adapter.py) | always `null` | — | not_authorized |
| 19 | `CanonicalMatch.finishedAt` | `string\|null` | legitimately_empty | a CS2 DEM does not carry this information (no wall-clock time) | always `null` | — | not_authorized |
| 20 | `CanonicalMatch.durationSeconds` | `number\|null` | unsupported | derived only from header playback_ticks_per_second, absent from every real CS2 demo observed (warning tickrate_unavailable); a game-clock derivation is not specified | always `null` | specify duration from the proven game clock (D22) and add real-DEM evidence | not_authorized |
| 21 | `CanonicalMatch.status` | `CanonicalStatus` | available | completed only for a non-partial parse with all end ticks | `in:completed,partial` | — | not_authorized |
| 22 | `CanonicalMatch.finished` | `boolean` | available | terminal round evidence | `boolean` | — | not_authorized |
| 23 | `CanonicalMatch.terminal` | `boolean` | available | same strict predicate as finished | `boolean` | — | not_authorized |
| 24 | `CanonicalMatch.teamA` | `string\|null` | unsupported | team names exist in the game state (teams.team_name) but the parser contract emits it as null/empty by construction (services/cs2-demo-parser/adapter.py) | always `null` | emit team clan names from the game state with real-DEM evidence | not_authorized |
| 25 | `CanonicalMatch.teamB` | `string\|null` | unsupported | as teamA | always `null` | as teamA | not_authorized |
| 26 | `CanonicalMatch.scoreTeamA` | `number\|null` | unsupported | team_rounds_total exists in the game state but the parser contract emits it as null/empty by construction (services/cs2-demo-parser/adapter.py) | always `null` | emit final scores bound to team identity, with real-DEM evidence | not_authorized |
| 27 | `CanonicalMatch.scoreTeamB` | `number\|null` | unsupported | as scoreTeamA | always `null` | as scoreTeamA | not_authorized |
| 28 | `CanonicalMatch.winnerTeam` | `CanonicalTeamSlot\|null` | unsupported | derived from the two scores, which are unsupported | always `null` | after scores | not_authorized |
| 29 | `CanonicalMatch.roundCount` | `number\|null` | available | count of reconstructed rounds | `equals_rounds_length` | — | not_authorized |
| 30 | `CanonicalMatch.quality.status` | `QualityStatus` | available | quality helper | `in:complete,partial,unknown` | — | not_authorized |
| 31 | `CanonicalMatch.quality.reasons` | `string[]` | available | stable reason slugs | `array` | — | not_authorized |
| 32 | `CanonicalMatch.quality.confidence` | `number\|null` | available | measured or coverage-derived confidence | `unit_interval_or_null` | — | not_authorized |
| 33 | `CanonicalMatch.coverage.roundsExpected` | `number\|null` | available | observed reconstructed rounds | `equals_rounds_length` | — | not_authorized |
| 34 | `CanonicalMatch.coverage.roundsObserved` | `number\|null` | available | emitted rounds | `equals_rounds_length` | — | not_authorized |
| 35 | `CanonicalMatch.coverage.participantsExpected` | `number\|null` | legitimately_empty | no expected-roster contract; assuming 5v5 would invent it | always `null` | — | not_authorized |
| 36 | `CanonicalMatch.coverage.participantsObserved` | `number\|null` | available | emitted participants | `equals_participants_length` | — | not_authorized |
| 37 | `CanonicalMatch.coverage.participantsResolved` | `number\|null` | available | O5: count after EXACT Steam attachment | `equals_resolved_count` | — | not_authorized |
| 38 | `CanonicalMatch.coverage.eventsObserved` | `number\|null` | available | emitted events | `equals_events_length` | — | not_authorized |
| 39 | `CanonicalMatch.coverage.hasRoundData` | `boolean` | available | rounds.length > 0 | `boolean` | — | not_authorized |
| 40 | `CanonicalMatch.coverage.hasEventData` | `boolean` | available | events.length > 0 | `boolean` | — | not_authorized |
| 41 | `CanonicalMatch.coverage.hasPlayerRoundState` | `boolean` | available | roundPlayers.length > 0 | `boolean` | — | not_authorized |
| 42 | `CanonicalMatch.schemaVersion` | `number` | available | Canonical model schema | `equals:2` | — | not_authorized |
| 43 | `CanonicalParticipant.participantKey` | `string` | available | source-local Steam key; never a nickname; no ownership claim | `steam_id64` | — | not_authorized |
| 44 | `CanonicalParticipant.internalPlayerId` | `string\|null` | available | only through the EXACT Steam attachment (server path) | `uuid_only_on_target` | — | not_authorized |
| 45 | `CanonicalParticipant.source` | `DataSource` | available | adapter literal 'demo' | `equals:demo` | — | not_authorized |
| 46 | `CanonicalParticipant.externalPlayerId` | `string\|null` | available | player_info steamid | `steam_id64` | — | not_authorized |
| 47 | `CanonicalParticipant.steamId64` | `string\|null` | available | player_info steamid (exact u64 decimal) | `steam_id64` | — | not_authorized |
| 48 | `CanonicalParticipant.nicknameSnapshot` | `string\|null` | available | display snapshot only | `string` | — | not_authorized |
| 49 | `CanonicalParticipant.team` | `CanonicalTeamSlot\|null` | unsupported | neutral team slot needs teamA/teamB (unsupported); team_number is side evidence and is correctly removed | always `null` | after teamA/teamB | not_authorized |
| 50 | `CanonicalParticipant.isTargetPlayer` | `boolean` | available | EXACT selected participant only | `one_target_when_attached` | — | not_authorized |
| 51 | `CanonicalParticipant.identityStatus` | `IdentityStatus` | available | correlated iff target with internal id (D34 keeps it on re-observation) | `identity_status_coherent` | — | not_authorized |
| 52 | `CanonicalParticipant.identityConfidence` | `number\|null` | available | 1 iff correlated | `identity_confidence_coherent` | — | not_authorized |
| 53 | `CanonicalParticipant.metadata` | `Record<string,unknown>` | legitimately_empty | no participant metadata is promoted | always `{}` | — | not_authorized |
| 54 | `CanonicalRound.roundNumber` | `number` | available | 1..n after D30 voiding | `round_numbers_contiguous` | — | not_authorized |
| 55 | `CanonicalRound.startTick` | `number\|null` | available | O6 tick domain (a) | `tick_domain_rounds` | — | not_authorized |
| 56 | `CanonicalRound.endTick` | `number\|null` | available | O6 tick domain (a) | `tick_domain_rounds` | — | not_authorized |
| 57 | `CanonicalRound.startTimeSeconds` | `number\|null` | unsupported | no normalized round time in the contract | always `null` | derive from startTick and the proven game clock | not_authorized |
| 58 | `CanonicalRound.endTimeSeconds` | `number\|null` | unsupported | as startTimeSeconds | always `null` | as startTimeSeconds | not_authorized |
| 59 | `CanonicalRound.durationSeconds` | `number\|null` | unsupported | needs header tickrate (absent; warning tickrate_unavailable) | always `null` | as Match.durationSeconds | not_authorized |
| 60 | `CanonicalRound.winningTeam` | `CanonicalTeamSlot\|null` | unsupported | needs team identity (teamA/teamB unsupported) | always `null` | after teamA/teamB | not_authorized |
| 61 | `CanonicalRound.winningSide` | `CanonicalSide\|null` | available | round_win_status side | `in:CT,T` | — | not_authorized |
| 62 | `CanonicalRound.winReason` | `RoundWinReason\|null` | unsupported | O3: sentinel 'unknown'; no reviewed reason table | always `"unknown"` | reviewed round_win_reason code table + consistency with bomb flags | not_authorized |
| 63 | `CanonicalRound.bombPlanted` | `boolean\|null` | available | bomb_planted events (D25: absent stream = zero occurrences) | `boolean` | — | not_authorized |
| 64 | `CanonicalRound.bombDefused` | `boolean\|null` | available | bomb_defused events | `boolean`, `defuse_implies_plant` | — | not_authorized |
| 65 | `CanonicalRound.bombExploded` | `boolean\|null` | available | bomb_exploded events | `boolean`, `explode_implies_plant` | — | not_authorized |
| 66 | `CanonicalRound.quality.status` | `QualityStatus` | available | inherits source quality | `in:complete,partial,unknown` | — | not_authorized |
| 67 | `CanonicalRound.quality.reasons` | `string[]` | available | inherits source reasons | `array` | — | not_authorized |
| 68 | `CanonicalRound.quality.confidence` | `number\|null` | available | inherits source confidence | `unit_interval_or_null` | — | not_authorized |
| 69 | `CanonicalRound.metadata` | `Record<string,unknown>` | legitimately_empty | no round metadata is promoted | always `{}` | — | not_authorized |
| 70 | `CanonicalRoundPlayer.roundNumber` | `number` | available | foreign key to an emitted round | `round_fk` | — | not_authorized |
| 71 | `CanonicalRoundPlayer.participantKey` | `string` | available | source-local Steam key, FK to participants | `participant_fk` | — | not_authorized |
| 72 | `CanonicalRoundPlayer.side` | `CanonicalSide\|null` | available | D29 round-start entity read | `in:CT,T`, `ten_per_round` | — | not_authorized |
| 73 | `CanonicalRoundPlayer.survived` | `boolean\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 74 | `CanonicalRoundPlayer.moneyStart` | `number\|null` | available | D33 round-start account (start_balance) | `non_negative_int`, `ten_per_round`, `pistol_800` | — | not_authorized |
| 75 | `CanonicalRoundPlayer.moneyEnd` | `number\|null` | available | D33 balance at the round end tick (before post-round credits) | `non_negative_int`, `ten_per_round` | — | not_authorized |
| 76 | `CanonicalRoundPlayer.equipmentValue` | `number\|null` | available | D33 equipment held at round start (round_start_equip_value) | `non_negative_int`, `ten_per_round` | — | not_authorized |
| 77 | `CanonicalRoundPlayer.buyContext` | `BuyContext\|null` | unsupported | the adapter runs no reviewed classifier | always `null` | promote classifyBuyContext (normalizer.ts) with real-DEM evidence | not_authorized |
| 78 | `CanonicalRoundPlayer.kills` | `number\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 79 | `CanonicalRoundPlayer.deaths` | `number\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 80 | `CanonicalRoundPlayer.assists` | `number\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 81 | `CanonicalRoundPlayer.damage` | `number\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 82 | `CanonicalRoundPlayer.flashAssists` | `number\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 83 | `CanonicalRoundPlayer.openingKill` | `boolean\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 84 | `CanonicalRoundPlayer.openingDeath` | `boolean\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 85 | `CanonicalRoundPlayer.traded` | `boolean\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 86 | `CanonicalRoundPlayer.tradeKill` | `boolean\|null` | not_authorized | derived once in the metrics layer from verified events (O4: single source of truth) | always `null` | — | not_authorized |
| 87 | `CanonicalRoundPlayer.metadata` | `Record<string,unknown>` | legitimately_empty | no player-round metadata is promoted | always `{}` | — | not_authorized |
| 88 | `CanonicalEvent.roundNumber` | `number` | available | event round after reconstruction | `round_fk` | — | not_authorized |
| 89 | `CanonicalEvent.type` | `CanonicalEventType` | available | allowlisted event types | `event_type_allowlist` | — | not_authorized |
| 90 | `CanonicalEvent.tick` | `number\|null` | available | O6 tick domain (b) | `tick_domain_events` | — | not_authorized |
| 91 | `CanonicalEvent.gameTimeSeconds` | `number\|null` | available | O6 (c)(d): native or derived time, provenance in RAW warnings | `time_monotonic_in_round` | — | not_authorized |
| 92 | `CanonicalEvent.actorParticipantKey` | `string\|null` | available | source-local key; FK to participants | `participant_fk_or_null` | — | not_authorized |
| 93 | `CanonicalEvent.victimParticipantKey` | `string\|null` | available | source-local key; FK to participants | `participant_fk_or_null` | — | not_authorized |
| 94 | `CanonicalEvent.assisterParticipantKey` | `string\|null` | available | source-local key; FK to participants | `participant_fk_or_null` | — | not_authorized |
| 95 | `CanonicalEvent.sourceActorExternalId` | `string\|null` | available | verbatim source id | `steam_id64_or_null` | — | not_authorized |
| 96 | `CanonicalEvent.sourceVictimExternalId` | `string\|null` | available | verbatim source id | `steam_id64_or_null` | — | not_authorized |
| 97 | `CanonicalEvent.sourceAssisterExternalId` | `string\|null` | available | verbatim source id | `steam_id64_or_null` | — | not_authorized |
| 98 | `CanonicalEvent.weapon` | `string\|null` | available | event weapon token | `string_or_null` | — | not_authorized |
| 99 | `CanonicalEvent.headshot` | `boolean\|null` | available | explicit flag; null versus false preserved | `boolean_or_null` | — | not_authorized |
| 100 | `CanonicalEvent.distance` | `number\|null` | available | explicit event distance | `non_negative_or_null` | — | not_authorized |
| 101 | `CanonicalEvent.damage` | `number\|null` | available | health damage (preserve zero) | `non_negative_or_null` | — | not_authorized |
| 102 | `CanonicalEvent.quality.status` | `QualityStatus` | available | inherits source quality | `in:complete,partial,unknown` | — | not_authorized |
| 103 | `CanonicalEvent.quality.reasons` | `string[]` | available | inherits source reasons | `array` | — | not_authorized |
| 104 | `CanonicalEvent.quality.confidence` | `number\|null` | available | inherits source confidence | `unit_interval_or_null` | — | not_authorized |
| 105 | `CanonicalEvent.data` | `Record<string,unknown>` | available | bounded residual evidence, never promoted | `object` | — | not_authorized |

## 8. Evidence and gate result

Evidence demos (owner-provided DEMs, parsed locally with the released parser `c38f209d`, never committed):

| Demo | sha256 | Runs | Determinism | Semantic checks | Representation | Persistence round trip |
| --- | --- | --- | --- | --- | --- | --- |
| Dust2 | `1c271096…` | 2 | 105/105 fields equal | all pass | 34/34 hold | pending the authorized reprocessing under R5.8.20 |
| Mirage | `1d98f8b6…` | 2 | 105/105 fields equal | all pass | 34/34 hold | pending the authorized reprocessing under R5.8.20 |
| Cache | `0caa7c97…` | — | NOT PROVEN (the 474 MB DEM exceeds the 400 MB transfer limit to this workspace) | — | — | production read-back only |

Round-trip machinery validated on 2026-10-28 against the R5.8.19 production rows of Dust2 (`747c7a6b`):
99/100 compared fields EQUAL, 5 excluded by design, 1 DIFFERENT — `CanonicalParticipant.identityStatus`,
which is exactly defect D34 (stored `unlinked`, bundle `correlated`). The harness therefore detects a real
persistence defect independently of the investigation that found it.

Gate (`python3 -m scripts.canonical_v3.gate`, this commit):

- **browser path: PASS** — 105/105 `not_authorized`, policy markers present.
- **server path: BLOCKED** — 71 `available` fields lack the persistence round trip on R5.8.20 data; every other
  requirement holds. This is updated, never hand-edited, after the reprocessing.
- **overall: BLOCKED** → Canonical = NOT PROVEN until the server path passes.
