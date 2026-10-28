# Canonical 105-field mapping gate — audit and contract proposal (2026-10-28)

Status: **PROPOSAL, NOT ADOPTED.** Canonical = **NOT PROVEN**. No gate rule, inventory, migration, deployment or
production row was changed by this investigation (§14).

Base: `main` at `912a8835`. Runtime: R5.8.19 (`git:47ed6454`, deployment `7179fcce`). Database migration head
`20261028090000`.

Labels: **[reproduced]** = re-executed or re-queried during this investigation; **[observed]** = read from a sealed
CI annotation; **[code]** = read from the source at `912a8835`; **[inferred]** = reasoning from code and data, not
executed.

## 1. Executive summary

1. **Correction.** The closure report (2026-10-28 section) says that the 105-field gate "governs the browser
   (client-parser) path, not the server pipeline". **That is wrong.** The 105 fields are the leaves emitted by
   `demoToCanonicalBundle` (`src/lib/canonical/adapters/demo.adapter.ts`), which the **server** pipeline calls
   (`src/lib/pipeline/jobs.server.ts:777`) on the output of the Railway parser. Every one of the 105 fields is
   persisted in production today by `persist_canonical_observation` [code][reproduced]. What decides whether a
   persisted row is eligible for users is a different mechanism (verified parser provenance, managed snapshot
   `STRICT_PROVENANCE`, quarantine). The mapping gate is consulted by no write path [reproduced: no function that
   writes Canonical rows references it]. The continuity prompt repeated the wrong framing ("campos produzidos pelo
   parser browser/WASM"); this document uses the corrected one.
2. **The gate cannot pass under its current definition, by construction.** PASS requires 105/105
   `canonicalAuthorization = true` with a `VERIFIED_*` mapping class. 37 fields are defined as constants, nulls or
   blocked classes in `FIELD_SPECS`. No evidence can move them; only a change of the definition can.
3. **The current governance is internally contradictory.** Five active controls require **zero** authorized
   fields: the release table CHECK, `r5_real_dem_access_gate` (`CANONICAL_BASELINE_CHANGED`), A9.1 pre-DEM gate 5,
   `parser_runtime_attestation.mapping_authority_matches_artifact` and `appDataContracts.ts`
   (`canonicalAuthorization: z.literal(false)`). Authorizing even one field breaks them. The gate's PASS state is
   therefore unreachable without a coordinated, owner-approved contract version.
4. **The parity evidence is real but does not measure the 105 fields.** A9.1 run `40622794332` proves that
   demoparser2 0.42.0 in Python and in WASM extract identical **raw tables** (40 tables, 414 raw columns, 14/14
   comparable domains) from **one** DEM (Cache `0caa7c97`), deterministically. It does not compare any Canonical
   field after the server adapters, and `players` / `player_identity` are NOT_COMPARABLE. Per-field parity and
   determinism of the 105 fields: **NOT PROVEN** for all 105.
5. **Two real defects found inside the current contract** (not gate issues):
   - **D33 — economy under-extraction.** `moneyStart` / `equipmentValue` / `moneyEnd` are persisted for 9 / 9 / 13
     of 630 player-rounds. The Dust2 DEM holds 10/10 balances at every round start tick [reproduced locally with
     demoparser2]. Cause: the values are read from the thinned general tick sample instead of a dedicated
     round-boundary read (the same class of defect D29 fixed for sides).
   - **D34 — `match_participants.identity_status` is stale after attachment.** The three attached targets have
     `internal_player_id` set and `identity_confidence = 1` but `identity_status = 'unlinked'`. The adapter emits
     `correlated`, but the `ON CONFLICT` branch of `persist_canonical_observation` does not update
     `identity_status`. The rows were created unattached and updated later [reproduced: `created_at` < `updated_at`
     for 3/3].
6. **Recommendation:** Alternative 2 (explicit availability states) as the contract, with Alternative 1 (per-field
   evidence) as the **only** way for a field to become available, versioned as `canonical-demo-v3` beside v2. The
   recommendation also separates per runtime path: the server path and the browser path. Alternative 3 (consumer
   capability profiles) is not recommended now. It would redefine what "Canonical" means, and that is a formal
   scope change. Owner decisions are listed in §11.

## 2. Gate implementation and verifiable references (Phase A)

| Component | Location | What it enforces |
| --- | --- | --- |
| Field definition | `scripts/canonical_mapping_gate.py` `FIELD_SPECS` (lines 69–185) | 105 leaves of `demoToCanonicalBundle`: 13 `CanonicalMatchSource`, 28 `CanonicalMatch`, 11 `CanonicalParticipant`, 16 `CanonicalRound`, 18 `CanonicalRoundPlayer`, 18 `CanonicalEvent`. Per field: capability, source field, kind, mapping class, type, persistence target/type, semantics, normalization (null) rule |
| Inventory build | `build_inventory` | every row: `parityStatus`/`determinismStatus` `NOT_RUN`, `semanticValidation` `NOT_RUN`, `persistenceValidation` `DECLARED_FROM_RPC_SQL`, `evidenceClass` `DECLARED_SOURCE_ONLY`, `canonicalAuthorization: false`; identity/tick dependency `BLOCKED` iff class is `IDENTITY_BLOCKED` / `TICK_DOMAIN_BLOCKED` |
| Gate rule (Python) | `assert_canonical_mapping_gate` | a row is *blocked* if its capability is unknown, its source is generic, its class is not one of `VERIFIED_DIRECT_SOURCE` / `VERIFIED_DERIVED_FROM_VERIFIED_SOURCE` / `VERIFIED_NORMALIZED_SOURCE`, a dependency is `BLOCKED`, or evidence refs are missing; *unverified* if semantic/persistence/parity/determinism are not `VERIFIED` or authorization is not true. **PASS iff authorized == 105** |
| Gate rule (database) | `public.assert_canonical_mapping_gate()` md5 `4c96158c` | same predicates over `canonical_mapping_inventory_release_rows` of the active release; raises `CANONICAL_MAPPING_GATE_BLOCKED` |
| Committed inventory | `docs/client-parser/canonical-mapping-inventory.json` | digest `cf0549c2…`, `canonical-demo-v2`, schema 2, matrix digest `a276b030…` |
| Capability matrix | `docs/client-parser/reconciled-field-matrix.json` | 375 capability rows; every `evidenceStatus` = `DECLARED_SOURCE_ONLY` |
| Production release | `canonical_mapping_inventory_releases` | release `cf0549c2-dfbd-c4df-25b4-2ce8204edf87`, status BLOCKED, 105 / 0 generic / 0 authorized / 0 verified, `classification: PRODUCTION_GOVERNANCE_NOT_EXECUTION_EVIDENCE` [reproduced]; table CHECK forces `authorized_count = 0 AND verified_count = 0` |
| Production inventory | `canonical_mapping_inventory` | 105 rows, all `PARITY_PENDING / NOT_RUN / NOT_RUN` [reproduced]; immutable (trigger) |
| CI | `.github/workflows/quality-gates.yml:92`, `cs2-parser-worker-ci.yml:40` | run the generator and gate; `scripts/tests/test_canonical_mapping_gate.py` |
| Zero-authorized baselines | `r5_real_dem_access_gate` (`CANONICAL_BASELINE_CHANGED` if authorized ≠ 0 or verified ≠ 0); `scripts/ci/a91_predem_postdem.py` gate 5; `scripts/parser_runtime_attestation.py:194–205` (`all(canonicalAuthorization is False)`, `authorized_count: 0`); `src/lib/appDataContracts.ts:115,133` (`z.literal(false)`); `scripts/r5_8_3_release_preflight.py:211` | each treats any authorization as a baseline change |
| Callers of the DB gate | `assert_cache_attempt_9_ready` (`PERFORM assert_canonical_mapping_gate()`), so that function always raises; `pre_real_demo_gate_status`, `h3e91_live_database_evidence`, `h3e_predem_managed_snapshot` report counts only | none of them is on the upload → parse → persist path [reproduced] |
| Canonical write path | `jobs.server.ts` → `demoToCanonicalBundle` → `validateCanonicalBundle` → RAW admission → `persist_canonical_observation` (md5 `a72ac136`) | writes all 105 leaves; never consults the mapping gate |

### 2.1 How each state is represented today (A.3)

| Requested state | Representation in the current contract | Distinguishable? |
| --- | --- | --- |
| present and verified | class `VERIFIED_*` + parity/determinism/semantic/persistence `VERIFIED` + authorization true | defined, **0 rows** |
| present, not verified | `DECLARED_BUT_NOT_VERIFIED` (68) | yes |
| legitimately empty in a given demo | **no field-level state.** The adapter persists `null`. The reason sometimes appears per observation as a parser warning (`tickrate_unavailable`, `bomb_defused_absent_from_event_inventory`) or a quality flag (`missing_economy`) | **no.** The gate cannot tell a legitimate null from an extraction failure |
| unsupported by the parser | `NOT_SUPPORTED` (5) and `SOURCE_UNAVAILABLE` (15), the latter mixing "absent from the DEM" with "not derived by this adapter" | partly. `SOURCE_UNAVAILABLE` covers both an absence in the DEM (`finishedAt`) and an absence of derivation (`kills`) |
| identity-blocked | `IDENTITY_BLOCKED` (10) | yes |
| insufficient tick data | `TICK_DOMAIN_BLOCKED` (4) | yes, but "complete tick domain" has no executable definition |
| explicitly not authorized | `CANONICAL_NOT_AUTHORIZED` (3), plus `canonicalAuthorization: false` on **all** 105 | conflated: every row is "not authorized" |
| Python vs WASM divergence | `parityStatus` `FAILED` exists in the DB CHECK; the gate never sets it per field | not populated |

**A.4 — does the gate confuse legitimate absence with missing authorization or an integrity failure? Yes.** The
blocking classes include fields whose correct value is always `null` (`externalMatchId`, `mapNumber`,
`finishedAt`). Those fields count as blocked exactly like a field with an extraction defect (D33). The gate has no
way to say that `null` is the verified correct value.

**A.5 — documented per field:** source, type, semantics and null rule: yes, for 105/105 (`FIELD_SPECS`). Unit:
implicit in the type or name (`…Seconds`, `…Tick`). Money has no currency unit; distance has no unit. Validation
criteria: none per field (`semanticValidation: NOT_RUN`). **Spec defect S1:** `playedAt` / `startedAt` declare the
capability `game_state.match_start_time`. That value is a game-clock number in seconds, not a wall-clock timestamp,
while the adapter reads `header.match_date`. The declared capability does not describe the real source.

### 2.2 Binding of the parity and determinism evidence (A.6, A.7)

[observed: sealed annotations of run `40622794332`, job `isolated-gate`]

| Binding | Value |
| --- | --- |
| Workflow / commit | `A9.1 Real DEM Python-WASM Parity & Determinism Gate`, `b464966a` on `main`, 2026-10-28T02:45Z |
| Pre-DEM approval | run `40618814712`, artifact `sha256:78e5a9d8…`, runtime pin `git:47ed6454` (R5.8.19) |
| DEM | `0caa7c97…` (m1-cache, 473 748 061 bytes), authorization `A9.1-M1-CACHE-REAL-DEM` |
| Parser | demoparser2 0.42.0, revision `d3767705`; WASM `e5c4e310…`, artifact identity `5ff31761…` |
| Parity | 14 PASS (header, map, tickrate, playback_ticks, events, rounds, grenades, bomb, damage, deaths, weapons, economy, tick_properties, game_state); `players`, `player_identity` NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM); 40/40 tables, 414/414 fields, 0 divergences, 18 tables empty in both |
| Determinism | 2 Python + 2 WASM runs, identical normalized digests per runtime (`dcebbebc…` / `ab5fb4f7…`) |
| Decision | `canonicalAuthorization: false`, `canonicalEligible: false`, `productionAuthorization: false` (by design) |

**What it measures:** equality of **values** (canonicalized under rules R1–R13: null ≠ 0, exact u64 decimal, exact
strings, RFC 8785 floats, row order) of the **raw demoparser2 tables** produced by two runtimes from the same DEM.

**What it does not measure:**

- the server `parser.py` contract (round reconstruction, D29 sides, D30 voiding, timing);
- `normalizer.ts` and `demo.adapter.ts`;
- any of the 105 Canonical fields;
- the semantics of a field;
- Dust2 or Mirage.

The "414 fields" are raw columns, not the 105 Canonical fields. Treating them as Canonical parity would extrapolate
beyond the evidence.

## 3. Matrix of the 105 fields (Phase B)

Machine-readable copy: `docs/client-parser/canonical-105-field-proposal-matrix.json`. It is generated read-only by
`scripts/canonical_field_gate_proposal_matrix.py` from `FIELD_SPECS` and the capability matrix.

Columns that are identical for every row, stated once so that they are not repeated:

- **determinism per field:** NOT PROVEN (A9.1 determinism is a digest over raw tables);
- **evidence class:** `DECLARED_SOURCE_ONLY`;
- **`canonicalAuthorization`:** false.

"Production 3 matches" is a read-only count over the validated matches Dust2 `747c7a6b`, Mirage `95186f3f` and
Cache `48e517e4` (3 matches, 30 participants, 63 rounds, 630 player-rounds, 12 006 events) [reproduced]. "Python" /
"WASM" is support of the source capability (`adapter` = computed by the server TypeScript adapter, no parser
capability). "Proposed" is a target classification under the recommended contract with the evidence it still
needs. **It is never a result.**

| # | Field | Persisted as | Source (capability → field) | Python | WASM | Type | Production 3 matches | Nullability rule | Identity / tick | Parity (A9.1) | Current | Proposed (v3, not adopted) | Risk | Rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `CanonicalMatchSource.source` | `match_sources.source` | `adapter.constant` → `literal:"demo"` | adapter | N/A | `DataSource` | 3/3 'demo' | Exact literal. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 2 | `CanonicalMatchSource.sourceContractVersion` | `match_sources.source_contract_version` | `adapter.constant` → `SOURCE_CONTRACT_VERSIONS.demo` | adapter | N/A | `SourceContractVersion` | 3/3 'demo-v1' | Exact configured contract token. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 3 | `CanonicalMatchSource.externalMatchId` | `match_sources.external_match_id` | `adapter.unsupported` → `null:no_demo_external_match_id` | adapter | N/A | `string\|null` | 0/3 (null) | Persist null; never substitute fingerprint. | — / — | N/A (adapter) | UNSUPPORTED (NOT_SUPPORTED) | UNSUPPORTED_BY_SOURCE | LOW | Always null; test that the adapter never fills it. |
| 4 | `CanonicalMatchSource.externalParentId` | `match_sources.external_parent_id` | `adapter.unsupported` → `null:no_demo_parent_id` | adapter | N/A | `string\|null` | 0/3 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (NOT_SUPPORTED) | UNSUPPORTED_BY_SOURCE | LOW | Always null; test. |
| 5 | `CanonicalMatchSource.sourceVersion` | `match_sources.source_version` | `adapter.input` → `parsed.parser.name+parsed.parser.version` | adapter | N/A | `string\|null` | 3/3 'demoparser2@0.42.0' | Join with @ only after parser identity validation. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 6 | `CanonicalMatchSource.fetchedAt` | `match_sources.fetched_at` | `adapter.input` → `input.fetchedAt` | adapter | N/A | `ISO-8601 string` | 3/3 | Validate ISO-8601; never use competitive date. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 7 | `CanonicalMatchSource.sourceUpdatedAt` | `match_sources.source_updated_at` | `adapter.unsupported` → `null:no_source_update_timestamp` | adapter | N/A | `string\|null` | 0/3 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | UNSUPPORTED_BY_SOURCE | LOW | DEM has no update timestamp; always null; test. |
| 8 | `CanonicalMatchSource.status` | `match_sources.status` | `adapter.lifecycle` → `parsed.quality.partialParse` | adapter | N/A | `ObservationStatus` | 3/3 'complete' | Boolean branch: incomplete or complete. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 9 | `CanonicalMatchSource.quality.status` | `match_sources.quality.status` | `adapter.quality` → `parsed.quality.partialParse+coverage` | adapter | N/A | `QualityStatus` | 3/3 'complete' | Use quality helpers; no optimistic default. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 10 | `CanonicalMatchSource.quality.reasons` | `match_sources.quality.reasons` | `adapter.quality` → `parsed.quality.flags+coverage` | adapter | N/A | `string[]` | NOT_OBSERVED | Preserve distinct reason slugs. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 11 | `CanonicalMatchSource.quality.confidence` | `match_sources.quality.confidence` | `adapter.quality` → `parsed.quality.extractionConfidence` | adapter | N/A | `number\|null` | NOT_OBSERVED | Preserve null and clamp only in quality helper. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 12 | `CanonicalMatchSource.fingerprint` | `match_sources.fingerprint` | `adapter.input` → `input.fingerprint` | adapter | N/A | `string\|null` | 3/3 | Lowercase validated SHA-256 or null. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 13 | `CanonicalMatchSource.metadata` | `match_sources.metadata` | `adapter.persistence` → `analysis/parser/tickrate/quality metadata` | adapter | N/A | `Record<string,unknown>` | 3/3 (8 named keys; tickrate null in 3/3) | Stable named keys; preserve null/absence. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 14 | `CanonicalMatch.game` | `matches.game` | `adapter.constant` → `literal:"cs2"` | adapter | N/A | `"cs2"` | 3/3 | Exact literal. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 15 | `CanonicalMatch.map` | `matches.map` | `header.map_name` → `parsed.map` | yes | yes | `string\|null` | 3/3 | Canonical CS2 map-code normalization. | — / — | 'header': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 16 | `CanonicalMatch.mapNumber` | `matches.map_number` | `adapter.unsupported` → `null:single_map_demo` | adapter | N/A | `number\|null` | 0/3 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (NOT_SUPPORTED) | UNSUPPORTED_BY_SOURCE | LOW | Standalone DEM has no series position; always null; test. |
| 17 | `CanonicalMatch.playedAt` | `matches.played_at` | `game_state.match_start_time` → `parsed.matchDate` | yes | yes | `string\|null` | 0/3 (null) | Validated timestamp or null; never fetchedAt. | — / — | 'game_state': PASS → field NOT PROVEN | NOT_VERIFIED | LEGITIMATELY_EMPTY_WHEN_ABSENT | LOW | header.match_date absent in 3/3; declared capability game_state.match_start_time is game-clock seconds, not a timestamp (spec correction). |
| 18 | `CanonicalMatch.startedAt` | `matches.started_at` | `game_state.match_start_time` → `parsed.matchDate` | yes | yes | `string\|null` | 0/3 (null) | Validated timestamp or null. | — / — | 'game_state': PASS → field NOT PROVEN | NOT_VERIFIED | LEGITIMATELY_EMPTY_WHEN_ABSENT | LOW | Same as playedAt. |
| 19 | `CanonicalMatch.finishedAt` | `matches.finished_at` | `adapter.unsupported` → `null:no_finish_timestamp` | adapter | N/A | `string\|null` | 0/3 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | UNSUPPORTED_BY_SOURCE | LOW | No wall clock in the DEM; always null; test. |
| 20 | `CanonicalMatch.durationSeconds` | `matches.duration_seconds` | `header.playback_time` → `parsed.durationSeconds` | yes | yes | `number\|null` | 0/3 (null) | Finite non-negative seconds or null. | — / — | 'header': PASS → field NOT PROVEN | NOT_VERIFIED | LEGITIMATELY_EMPTY_WHEN_ABSENT | LOW | Only from header tickrate; absent in 3/3 (warning tickrate_unavailable). |
| 21 | `CanonicalMatch.status` | `matches.canonical_status` | `adapter.lifecycle` → `partialParse+rounds[].endTick` | adapter | N/A | `CanonicalStatus` | 3/3 'completed' | Otherwise partial; never infer from date. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 22 | `CanonicalMatch.finished` | `matches.finished` | `adapter.lifecycle` → `partialParse+rounds[].endTick` | adapter | N/A | `boolean` | 3/3 true | Fail closed to false. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 23 | `CanonicalMatch.terminal` | `matches.terminal` | `adapter.lifecycle` → `partialParse+rounds[].endTick` | adapter | N/A | `boolean` | 3/3 true | Same strict predicate as finished. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 24 | `CanonicalMatch.teamA` | `matches.team_a` | `teams.team_name` → `parsed.teamA` | yes | yes | `string\|null` | 0/3 (null) | Non-empty string or null. | — / — | 'game_state': PASS → field NOT PROVEN | NOT_VERIFIED | NEEDS_PARSER_SUPPORT | MEDIUM | header.teams empty in 3/3; teams.team_name is a RECONCILED capability the parser does not emit. |
| 25 | `CanonicalMatch.teamB` | `matches.team_b` | `teams.team_name` → `parsed.teamB` | yes | yes | `string\|null` | 0/3 (null) | Non-empty string or null. | — / — | 'game_state': PASS → field NOT PROVEN | NOT_VERIFIED | NEEDS_PARSER_SUPPORT | MEDIUM | Same as teamA. |
| 26 | `CanonicalMatch.scoreTeamA` | `matches.score_team_a` | `score.score` → `parsed.scoreA` | yes | yes | `number\|null` | 0/3 (null) | Non-negative integer or null. | — / — | 'game_state': PASS → field NOT PROVEN | NOT_VERIFIED | NEEDS_PARSER_SUPPORT | MEDIUM | header.score empty in 3/3; team_rounds_total exists in game state. |
| 27 | `CanonicalMatch.scoreTeamB` | `matches.score_team_b` | `score.score` → `parsed.scoreB` | yes | yes | `number\|null` | 0/3 (null) | Non-negative integer or null. | — / — | 'game_state': PASS → field NOT PROVEN | NOT_VERIFIED | NEEDS_PARSER_SUPPORT | MEDIUM | Same as scoreTeamA. |
| 28 | `CanonicalMatch.winnerTeam` | `matches.winner_team` | `adapter.lifecycle` → `parsed.scoreA<>parsed.scoreB` | adapter | N/A | `CanonicalTeamSlot\|null` | 0/3 (null) | Tie or missing score remains null. | — / — | N/A (adapter) | NOT_VERIFIED | NEEDS_PARSER_SUPPORT | MEDIUM | Derived from scores; null while scores are null. |
| 29 | `CanonicalMatch.roundCount` | `matches.round_count` | `rounds.number` → `parsed.rounds.length` | yes | no (Python only) | `number\|null` | 3/3 | Positive observed length or null. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 30 | `CanonicalMatch.quality.status` | `matches.quality.status` | `adapter.quality` → `partialParse+coverage` | adapter | N/A | `QualityStatus` | 3/3 'complete' | Quality helper result. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 31 | `CanonicalMatch.quality.reasons` | `matches.quality.reasons` | `adapter.quality` → `quality flags+coverage` | adapter | N/A | `string[]` | 3/3 [] | Stable reason slugs. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 32 | `CanonicalMatch.quality.confidence` | `matches.quality.confidence` | `adapter.quality` → `extractionConfidence+coverage` | adapter | N/A | `number\|null` | 3/3 1 | Finite [0,1] or null. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 33 | `CanonicalMatch.coverage.roundsExpected` | `matches.coverage.roundsExpected` | `adapter.coverage` → `parsed.rounds.length` | adapter | N/A | `number\|null` | 3/3 | Positive count or null. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 34 | `CanonicalMatch.coverage.roundsObserved` | `matches.coverage.roundsObserved` | `adapter.coverage` → `rounds.length` | adapter | N/A | `number\|null` | NOT_OBSERVED | Observed length. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 35 | `CanonicalMatch.coverage.participantsExpected` | `matches.coverage.participantsExpected` | `adapter.unsupported` → `null:no_expected_roster` | adapter | N/A | `number\|null` | 0/3 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | UNSUPPORTED_BY_SOURCE | LOW | No roster contract; always null; test. |
| 36 | `CanonicalMatch.coverage.participantsObserved` | `matches.coverage.participantsObserved` | `adapter.coverage` → `participants.length` | adapter | N/A | `number\|null` | NOT_OBSERVED | Observed length. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 37 | `CanonicalMatch.coverage.participantsResolved` | `matches.coverage.participantsResolved` | `adapter.identity` → `participants.internalPlayerId` | adapter | N/A | `number\|null` | 3/3 = 1 | Count non-null internal IDs. | ID BLOCKED / — | N/A (adapter) | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | Count of attached participants; valid only with the EXACT Steam attachment rule; test. |
| 38 | `CanonicalMatch.coverage.eventsObserved` | `matches.coverage.eventsObserved` | `adapter.coverage` → `events.length` | adapter | N/A | `number\|null` | NOT_OBSERVED | Observed length. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 39 | `CanonicalMatch.coverage.hasRoundData` | `matches.coverage.hasRoundData` | `adapter.coverage` → `rounds.length>0` | adapter | N/A | `boolean` | NOT_OBSERVED | Exact count predicate. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 40 | `CanonicalMatch.coverage.hasEventData` | `matches.coverage.hasEventData` | `adapter.coverage` → `events.length>0` | adapter | N/A | `boolean` | NOT_OBSERVED | Exact count predicate. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 41 | `CanonicalMatch.coverage.hasPlayerRoundState` | `matches.coverage.hasPlayerRoundState` | `adapter.coverage` → `roundPlayers.length>0` | adapter | N/A | `boolean` | 3/3 true | Exact count predicate. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 42 | `CanonicalMatch.schemaVersion` | `matches.canonical_schema_version` | `adapter.constant` → `CANONICAL_SCHEMA_VERSION` | adapter | N/A | `number` | 3/3 = 2 | Exact configured integer. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 43 | `CanonicalParticipant.participantKey` | `match_participants.participant_key` | `player_info.steamid` → `player.participantKey??player.steamId` | yes | yes | `string` | 30/30 | Validated participant key; unresolved players omitted. | ID BLOCKED / — | 'players': NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM) → field NOT PROVEN | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | Source-local Steam key; never nickname. |
| 44 | `CanonicalParticipant.internalPlayerId` | `match_participants.internal_player_id` | `adapter.identity` → `input.internalPlayerId when target matches` | adapter | N/A | `string\|null` | 3/30 (targets) | UUID or null; never nickname-derived. | ID BLOCKED / — | N/A (adapter) | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | Only through EXACT Steam attachment. |
| 45 | `CanonicalParticipant.source` | `match_participants.source` | `adapter.constant` → `literal:"demo"` | adapter | N/A | `DataSource` | NOT_OBSERVED | Exact literal. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 46 | `CanonicalParticipant.externalPlayerId` | `match_participants.external_player_id` | `player_info.steamid` → `player.steamId` | yes | yes | `string\|null` | 30/30 | Decimal string or null. | — / — | 'players': NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM) → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 47 | `CanonicalParticipant.steamId64` | `match_participants.steam_id64` | `player_info.steamid` → `player.steamId` | yes | yes | `string\|null` | 30/30 | Decimal SteamID64 or null. | — / — | 'players': NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM) → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 48 | `CanonicalParticipant.nicknameSnapshot` | `match_participants.nickname_snapshot` | `player_info.name` → `player.name` | yes | yes | `string\|null` | 30/30 | Bounded UTF-8 or null. | — / — | 'players': NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM) → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 49 | `CanonicalParticipant.team` | `match_participants.team` | `player_info.team_number` → `player.team->slotFor(teamA,teamB)` | yes | no (Python only) | `CanonicalTeamSlot\|null` | 0/30 (null) | team_a/team_b or null; not CT/T. | — / — | 'players': NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM) → field NOT PROVEN | NOT_VERIFIED | NEEDS_PARSER_SUPPORT | MEDIUM | Depends on teamA/teamB; team_number is side evidence, correctly removed. |
| 50 | `CanonicalParticipant.isTargetPlayer` | `match_participants.is_target_player` | `adapter.identity` → `targetParticipantKey==participantKey` | adapter | N/A | `boolean` | 3/30 true (one per match) | Strict key equality; absent target is false. | ID BLOCKED / — | N/A (adapter) | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | Only through EXACT Steam attachment. |
| 51 | `CanonicalParticipant.identityStatus` | `match_participants.identity_status` | `adapter.identity` → `target key+internalPlayerId` | adapter | N/A | `IdentityStatus` | 30/30 'unlinked' (incl. 3 targets with internalPlayerId; D34) | correlated or unlinked; never verified by nickname. | ID BLOCKED / — | N/A (adapter) | IDENTITY_BLOCKED | BLOCKED_DEFECT | HIGH | D34 identity_status not updated on re-observation (ON CONFLICT omits it). |
| 52 | `CanonicalParticipant.identityConfidence` | `match_participants.identity_confidence` | `adapter.identity` → `correlated?1:null` | adapter | N/A | `number\|null` | 3/30 = 1 (targets) | 1 or null. | ID BLOCKED / — | N/A (adapter) | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | 1 only with EXACT attachment. |
| 53 | `CanonicalParticipant.metadata` | `match_participants.metadata` | `adapter.constant` → `empty object` | adapter | N/A | `Record<string,unknown>` | 30/30 {} | Persist empty object. | — / — | N/A (adapter) | NOT_AUTHORIZED | CONSTANT_EMPTY | LOW | Constant {}; test that it stays {}. |
| 54 | `CanonicalRound.roundNumber` | `match_rounds.round_number` | `rounds.number` → `round.roundNumber` | yes | no (Python only) | `number` | NOT_OBSERVED | Positive integer. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 55 | `CanonicalRound.startTick` | `match_rounds.start_tick` | `rounds.start_tick` → `round.startTick` | yes | no (Python only) | `number\|null` | 63/63 | Non-negative ordered tick or null. | — / TICK BLOCKED | 'rounds': PASS → field NOT PROVEN | TICK_BLOCKED | CANDIDATE_AVAILABLE | MEDIUM | Tick domain proven for round boundaries by D30 real-DEM tests; needs per-field parity on the server contract. |
| 56 | `CanonicalRound.endTick` | `match_rounds.end_tick` | `rounds.end_tick` → `round.endTick` | yes | no (Python only) | `number\|null` | 63/63 | Ordered tick or null. | — / TICK BLOCKED | 'rounds': PASS → field NOT PROVEN | TICK_BLOCKED | CANDIDATE_AVAILABLE | MEDIUM | Same as startTick. |
| 57 | `CanonicalRound.startTimeSeconds` | `match_rounds.start_time_seconds` | `adapter.unsupported` → `null:no_round_start_seconds` | adapter | N/A | `number\|null` | 0/63 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_PARSER_SUPPORT | MEDIUM | Derivable from the proven game clock (D22) once specified; until then always null. |
| 58 | `CanonicalRound.endTimeSeconds` | `match_rounds.end_time_seconds` | `adapter.unsupported` → `null:no_round_end_seconds` | adapter | N/A | `number\|null` | 0/63 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_PARSER_SUPPORT | MEDIUM | Same as startTimeSeconds. |
| 59 | `CanonicalRound.durationSeconds` | `match_rounds.duration_seconds` | `rounds.duration_seconds` → `round.durationSeconds` | yes | no (Python only) | `number\|null` | 0/63 (null; parser warning tickrate_unavailable) | Finite non-negative seconds or null. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | LEGITIMATELY_EMPTY_WHEN_ABSENT | LOW | Same root as Match.durationSeconds. |
| 60 | `CanonicalRound.winningTeam` | `match_rounds.winning_team` | `rounds.winner_team` → `round.winnerTeam->winnerSlot` | yes | yes | `CanonicalTeamSlot\|null` | 0/63 (null) | team_a/team_b or null. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | NEEDS_PARSER_SUPPORT | MEDIUM | Depends on team identity (teamA/teamB); CT/T tokens are sides, correctly removed. |
| 61 | `CanonicalRound.winningSide` | `match_rounds.winning_side` | `rounds.winner_side` → `round.winnerSide` | yes | no (Python only) | `CanonicalSide\|null` | 63/63 | CT/T or null; never derive from team slot. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 62 | `CanonicalRound.winReason` | `match_rounds.win_reason` | `adapter.unsupported` → `literal:"unknown"` | adapter | N/A | `RoundWinReason\|null` | 63/63 'unknown' | Exact unknown sentinel. | — / — | N/A (adapter) | UNSUPPORTED (NOT_SUPPORTED) | NEEDS_PARSER_SUPPORT | MEDIUM | round_win_reason exists in game state (D30 evidence); requires a reviewed enum mapping; sentinel 'unknown' until then. |
| 63 | `CanonicalRound.bombPlanted` | `match_rounds.bomb_planted` | `rounds.bomb_planted` → `round.bombPlanted` | yes | no (Python only) | `boolean\|null` | 45/63 true | Preserve null versus false. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 64 | `CanonicalRound.bombDefused` | `match_rounds.bomb_defused` | `rounds.bomb_defused` → `round.bombDefused` | yes | no (Python only) | `boolean\|null` | 9/63 true | Preserve null versus false. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 65 | `CanonicalRound.bombExploded` | `match_rounds.bomb_exploded` | `rounds.bomb_exploded` → `round.bombExploded` | yes | no (Python only) | `boolean\|null` | 22/63 true | Preserve null versus false. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 66 | `CanonicalRound.quality.status` | `match_rounds.quality.status` | `adapter.quality` → `sourceQuality.status` | adapter | N/A | `QualityStatus` | 63/63 'complete' | No per-round completeness inflation. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 67 | `CanonicalRound.quality.reasons` | `match_rounds.quality.reasons` | `adapter.quality` → `sourceQuality.reasons` | adapter | N/A | `string[]` | NOT_OBSERVED | Preserve reason slugs. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 68 | `CanonicalRound.quality.confidence` | `match_rounds.quality.confidence` | `adapter.quality` → `sourceQuality.confidence` | adapter | N/A | `number\|null` | NOT_OBSERVED | Finite [0,1] or null. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 69 | `CanonicalRound.metadata` | `match_rounds.metadata` | `adapter.constant` → `empty object` | adapter | N/A | `Record<string,unknown>` | 63/63 {} | Persist empty object. | — / — | N/A (adapter) | NOT_AUTHORIZED | CONSTANT_EMPTY | LOW | Constant {}; test. |
| 70 | `CanonicalRoundPlayer.roundNumber` | `round_players.round_number` | `rounds.number` → `round.roundNumber` | yes | no (Python only) | `number` | NOT_OBSERVED | Exact emitted round number. | — / — | 'rounds': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 71 | `CanonicalRoundPlayer.participantKey` | `round_players.participant_key` | `adapter.identity` → `participant.participantKey` | adapter | N/A | `string` | NOT_OBSERVED | Exact source-local key; never nickname. | ID BLOCKED / — | N/A (adapter) | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | Source-local Steam key; join key only, never ownership. |
| 72 | `CanonicalRoundPlayer.side` | `round_players.side` | `player_info.team_number` → `round.sides[participantKey]` | yes | no (Python only) | `CanonicalSide\|null` | 630/630 | CT/T or null. | — / — | 'players': NOT_COMPARABLE (NOT_AVAILABLE_ON_WASM) → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 73 | `CanonicalRoundPlayer.survived` | `round_players.survived` | `adapter.unsupported` → `null:no_positive_survival_evidence` | adapter | N/A | `boolean\|null` | 0/630 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from death events + round roster only if the roster is proven complete; product decision. |
| 74 | `CanonicalRoundPlayer.moneyStart` | `round_players.money_start` | `economy.start_balance` → `round.moneyStart[participantKey]` | yes | yes | `number\|null` | 9/630 (D33: demo has 10/10 per round start) | Integer or null; preserve zero. | — / — | 'economy': PASS → field NOT PROVEN | NOT_VERIFIED | BLOCKED_DEFECT | HIGH | D33 economy under-extraction; fix, release, then per-field parity/determinism. |
| 75 | `CanonicalRoundPlayer.moneyEnd` | `round_players.money_end` | `economy.balance` → `round.moneyEnd[participantKey]` | yes | yes | `number\|null` | 13/630 (D33) | Integer or null; preserve zero. | — / — | 'economy': PASS → field NOT PROVEN | NOT_VERIFIED | BLOCKED_DEFECT | HIGH | D33; same root cause (end-of-round read from the thinned sample). |
| 76 | `CanonicalRoundPlayer.equipmentValue` | `round_players.equipment_value` | `economy.current_equip_value` → `round.equipmentValue[participantKey]` | yes | yes | `number\|null` | 9/630 (D33: demo has 10/10 per round start) | Integer or null; preserve zero. | — / — | 'economy': PASS → field NOT PROVEN | NOT_VERIFIED | BLOCKED_DEFECT | HIGH | D33. |
| 77 | `CanonicalRoundPlayer.buyContext` | `round_players.buy_context` | `adapter.unsupported` → `null:no_buy_classifier` | adapter | N/A | `BuyContext\|null` | 0/630 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (NOT_SUPPORTED) | UNSUPPORTED_BY_CONTRACT | LOW | Needs a reviewed classifier; depends on D33 economy. |
| 78 | `CanonicalRoundPlayer.kills` | `round_players.kills` | `adapter.unsupported` → `null:no_round_player_aggregate` | adapter | N/A | `number\|null` | 0/630 (null) | Persist null; never zero. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 79 | `CanonicalRoundPlayer.deaths` | `round_players.deaths` | `adapter.unsupported` → `null:no_round_player_aggregate` | adapter | N/A | `number\|null` | 0/630 (null) | Persist null; never zero. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 80 | `CanonicalRoundPlayer.assists` | `round_players.assists` | `adapter.unsupported` → `null:no_round_player_aggregate` | adapter | N/A | `number\|null` | 0/630 (null) | Persist null; never zero. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 81 | `CanonicalRoundPlayer.damage` | `round_players.damage` | `adapter.unsupported` → `null:no_round_player_aggregate` | adapter | N/A | `number\|null` | 0/630 (null) | Persist null; never zero. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 82 | `CanonicalRoundPlayer.flashAssists` | `round_players.flash_assists` | `adapter.unsupported` → `null:no_round_player_aggregate` | adapter | N/A | `number\|null` | 0/630 (null) | Persist null; never zero. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 83 | `CanonicalRoundPlayer.openingKill` | `round_players.opening_kill` | `adapter.unsupported` → `null:no_opening_duel_derivation` | adapter | N/A | `boolean\|null` | 0/630 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 84 | `CanonicalRoundPlayer.openingDeath` | `round_players.opening_death` | `adapter.unsupported` → `null:no_opening_duel_derivation` | adapter | N/A | `boolean\|null` | 0/630 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 85 | `CanonicalRoundPlayer.traded` | `round_players.traded` | `adapter.unsupported` → `null:no_trade_derivation` | adapter | N/A | `boolean\|null` | 0/630 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 86 | `CanonicalRoundPlayer.tradeKill` | `round_players.trade_kill` | `adapter.unsupported` → `null:no_trade_derivation` | adapter | N/A | `boolean\|null` | 0/630 (null) | Persist null. | — / — | N/A (adapter) | UNSUPPORTED (SOURCE_UNAVAILABLE) | NEEDS_DERIVATION_DECISION | MEDIUM | Derivable from verified events + round boundaries (the metrics recount already does it); null until a reviewed derivation is specified; never zero. |
| 87 | `CanonicalRoundPlayer.metadata` | `round_players.metadata` | `adapter.constant` → `empty object` | adapter | N/A | `Record<string,unknown>` | 630/630 {} | Persist empty object. | — / — | N/A (adapter) | NOT_AUTHORIZED | CONSTANT_EMPTY | LOW | Constant {}; test. |
| 88 | `CanonicalEvent.roundNumber` | `round_events.round_number` | `event_fields.round` → `event.roundNumber` | yes | yes | `number` | NOT_OBSERVED | Positive integer within emitted rounds. | — / — | 'events': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 89 | `CanonicalEvent.type` | `round_events.event_type` | `events.player_death` → `event.type` | yes | no (Python only) | `CanonicalEventType` | 12006/12006 (11 types) | Allowlisted Canonical event type. | — / — | 'deaths': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 90 | `CanonicalEvent.tick` | `round_events.tick` | `event_fields.tick` → `event.tick` | yes | yes | `number\|null` | 12006/12006 | Non-negative integer or null. | — / TICK BLOCKED | 'events': PASS → field NOT PROVEN | TICK_BLOCKED | CANDIDATE_AVAILABLE | MEDIUM | Raw events domain PASS (A9.1); needs per-field parity on the server contract and an ordering test. |
| 91 | `CanonicalEvent.gameTimeSeconds` | `round_events.time_seconds` | `event_fields.game_time` → `event.timeSeconds` | yes | yes | `number\|null` | 12006/12006 (from game clock; header tickrate absent) | Finite seconds or null; no tick fallback without authority. | — / TICK BLOCKED | 'events': PASS → field NOT PROVEN | TICK_BLOCKED | CANDIDATE_AVAILABLE | MEDIUM | Values come from the game clock when header tickrate is absent; provenance must be recorded per observation. |
| 92 | `CanonicalEvent.actorParticipantKey` | `round_events.actor_steam_id` | `event_fields.attacker_steamid` → `event.actorSteamId` | yes | yes | `string\|null` | 2048/12006 | Null for unresolved actor; never nickname. | ID BLOCKED / — | 'events': PASS → field NOT PROVEN | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | Source-local Steam key. |
| 93 | `CanonicalEvent.victimParticipantKey` | `round_events.victim_steam_id` | `event_fields.victim_steamid` → `event.victimSteamId` | yes | no (Python only) | `string\|null` | 1979/12006 | Null for unresolved victim; never nickname. | ID BLOCKED / — | 'events': PASS → field NOT PROVEN | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | Source-local Steam key. |
| 94 | `CanonicalEvent.assisterParticipantKey` | `round_events.assister_steam_id` | `event_fields.assister_steamid` → `event.assisterSteamId` | yes | yes | `string\|null` | 117/12006 | Null for unresolved assister; never nickname. | ID BLOCKED / — | 'events': PASS → field NOT PROVEN | IDENTITY_BLOCKED | IDENTITY_SCOPED | HIGH | Source-local Steam key. |
| 95 | `CanonicalEvent.sourceActorExternalId` | `round_events.source_actor_external_id` | `event_fields.attacker_steamid` → `event.actorSteamId` | yes | yes | `string\|null` | 2048/12006 | Verbatim source identifier or null. | — / — | 'events': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 96 | `CanonicalEvent.sourceVictimExternalId` | `round_events.source_victim_external_id` | `event_fields.victim_steamid` → `event.victimSteamId` | yes | no (Python only) | `string\|null` | 1979/12006 | Verbatim source identifier or null. | — / — | 'events': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 97 | `CanonicalEvent.sourceAssisterExternalId` | `round_events.source_assister_external_id` | `event_fields.assister_steamid` → `event.assisterSteamId` | yes | yes | `string\|null` | 117/12006 | Verbatim source identifier or null. | — / — | 'events': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 98 | `CanonicalEvent.weapon` | `round_events.weapon` | `event_fields.weapon` → `event.weapon` | yes | yes | `string\|null` | 1972/12006 | Bounded normalized token or null. | — / — | 'events': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 99 | `CanonicalEvent.headshot` | `round_events.headshot` | `event_fields.headshot` → `event.headshot` | yes | yes | `boolean\|null` | 392/12006 | Preserve null versus false. | — / — | 'events': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 100 | `CanonicalEvent.distance` | `round_events.distance` | `event_fields.distance` → `event.distance` | yes | yes | `number\|null` | 392/12006 | Finite non-negative value or null. | — / — | 'events': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 101 | `CanonicalEvent.damage` | `round_events.damage` | `event_fields.dmg_health` → `event.damage` | yes | yes | `number\|null` | 1587/12006 | Finite non-negative value or null; preserve zero. | — / — | 'events': PASS → field NOT PROVEN | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 102 | `CanonicalEvent.quality.status` | `round_events.quality.status` | `adapter.quality` → `sourceQuality.status` | adapter | N/A | `QualityStatus` | 12006/12006 'complete' | No event completeness inflation. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 103 | `CanonicalEvent.quality.reasons` | `round_events.quality.reasons` | `adapter.quality` → `sourceQuality.reasons` | adapter | N/A | `string[]` | NOT_OBSERVED | Preserve reason slugs. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 104 | `CanonicalEvent.quality.confidence` | `round_events.quality.confidence` | `adapter.quality` → `sourceQuality.confidence` | adapter | N/A | `number\|null` | NOT_OBSERVED | Finite [0,1] or null. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |
| 105 | `CanonicalEvent.data` | `round_events.data` | `adapter.persistence` → `event.data` | adapter | N/A | `Record<string,unknown>` | 1979/12006 non-empty | Preserve JSON object without semantic promotion. | — / — | N/A (adapter) | NOT_VERIFIED | CANDIDATE_VERIFY | LOW-MEDIUM | Source present; needs per-field parity, determinism, semantic and persistence round-trip evidence. |

### 3.1 Summary of the matrix

| Current state (contract v2) | Count | Proposed state (v3, not adopted) | Count |
| --- | --- | --- | --- |
| NOT_VERIFIED (`DECLARED_BUT_NOT_VERIFIED`) | 68 | CANDIDATE_VERIFY (source present; needs per-field evidence) | 54 |
| UNSUPPORTED (`SOURCE_UNAVAILABLE`) | 15 | NEEDS_PARSER_SUPPORT | 10 |
| IDENTITY_BLOCKED | 10 | NEEDS_DERIVATION_DECISION | 10 |
| UNSUPPORTED (`NOT_SUPPORTED`) | 5 | IDENTITY_SCOPED | 9 |
| TICK_BLOCKED | 4 | UNSUPPORTED_BY_SOURCE | 6 |
| NOT_AUTHORIZED (`CANONICAL_NOT_AUTHORIZED`) | 3 | LEGITIMATELY_EMPTY_WHEN_ABSENT | 4 |
| | | BLOCKED_DEFECT (D33 ×3, D34 ×1) | 4 |
| | | CANDIDATE_AVAILABLE (tick fields) | 4 |
| | | CONSTANT_EMPTY | 3 |
| | | UNSUPPORTED_BY_CONTRACT | 1 |
| **VERIFIED** | **0** | **PARITY_FAILED** | **0 (no per-field comparison exists)** |

Nine of the 68 "declared" fields are `null` in 3/3 production matches. The cause is a source or parser gap, not a
gate decision:

- `playedAt`, `startedAt`, `durationSeconds`, `teamA`, `teamB`, `scoreTeamA`, `scoreTeamB`, `winnerTeam`;
- `Round.durationSeconds` and `Round.winningTeam`;
- `Participant.team`.

The parser contract output for Dust2 and Mirage has `header.teams = {}`, `header.score = {}`, `match_date = null`
and `tickrate = null`, with the warning `tickrate_unavailable` [reproduced from the cached R5.8.19 contract output].
They are correct nulls under the current null rule. They are not evidence that the fields work.

## 4. The 37 structural blockers (Phase C)

Q1 in the DEM? · Q2 reliably extractable? · Q3 derivable without inventing? · Q4 identity-dependent? · Q5 needs
verifiable ticks/timestamps? · Q6 legitimately absent in some demos? · Q7 correct behaviour when absent · Q8 test that
proves it · Q9 individually authorizable without breaking full-set consumers? · Q10 dependencies.

### 4.1 `SOURCE_UNAVAILABLE` (15)

| Field | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MatchSource.sourceUpdatedAt` | No (a DEM carries no source-update time; file mtime is not demo data) | N/A | No | No | No | Always | `null`, field-level UNSUPPORTED_BY_SOURCE | adapter unit test: every input → `null`; persistence round trip keeps `null` | Yes | None |
| `Match.finishedAt` | No wall clock (playback time is relative); `match_date` absent in 3/3 | N/A | No: needs an absolute start, and computing one would invent it | No | Yes (absolute time) | Always for these DEMs | `null` | adapter test `null`; test that it is never computed from `fetchedAt` | Yes | `playedAt`, `startedAt` |
| `Match.coverage.participantsExpected` | No roster contract | N/A | No (assuming 5v5 is an invention) | No | No | Always | `null` | adapter test `null` | Yes | None (independent of `participantsObserved`) |
| `Round.startTimeSeconds` | Indirectly: per-tick `game_time` and the game-state round start time | The game-clock relation is proven where used (D22); per field NOT PROVEN | Yes, from `startTick` and the proven clock, once specified | No | Yes | When no clock relation is provable | `null` plus quality reason `round_times_unavailable` | real DEM: `start ≤ first event time ≤ end`, monotonic per round; raw `tick_properties` parity PASS (A9.1) | Only together with `startTick` | `startTick`, `Event.gameTimeSeconds` |
| `Round.endTimeSeconds` | As above | As above | As above | No | Yes | As above | As above | As above, against `endTick` | With `endTick` | `endTick` |
| `RoundPlayer.survived` | Derivable: death events plus the per-round roster (sides 10/10, D29) | Deaths yes (kill recount PASS); roster completeness per round NOT PROVEN (disconnects) | Yes, only with a proven complete roster | Yes (participant join) | Yes (death tick inside round bounds) | When the roster is incomplete | `null`, never `true` by default ("absence of death is not survival") | per round: survivors = roster − deaths, compared with the stored events of the 3 matches (read only) | No, needs roster + bounds first | `participantKey`, `side`, round ticks, `Event.type` |
| `RoundPlayer.kills` | Yes, via `player_death` events | Yes: the stored-event recount equals the metrics for Cache | Yes (count of verified events) | Yes | Round assignment by tick | Never for a round with complete event coverage; unknown when coverage is partial | integer when the round's event coverage is proven complete (0 allowed), otherwise `null`; **never 0 by default** | Σ per round = match metric (recount) for the 3 matches; partial-coverage fixture → `null` | Yes, after event actor/round fields are verified | `Event.type/actor/tick/roundNumber` |
| `RoundPlayer.deaths` | Yes | Yes | Yes | Yes | Yes | As kills | As kills | As kills (victim) | As kills | `Event.victim…` |
| `RoundPlayer.assists` | Yes (assister) | assister present in 117 events; parity of `assister_steamid` on raw events PASS | Yes | Yes | Yes | As kills | As kills | As kills | As kills | `Event.assister…` |
| `RoundPlayer.damage` | Yes (`player_hurt.dmg_health`) | 1 587 damage events | Yes (sum) | Yes | Yes | As kills | As kills; numeric sum | Σ per round = ADR × rounds (recount) | As kills | `Event.damage`, actor |
| `RoundPlayer.flashAssists` | Possibly (flash events + assist flag) | **NOT PROVEN** (no reviewed source for the flash-assist flag) | Not yet | Yes | Yes | Unknown | `null` | requires a source review first | No | `Event` flash rows |
| `RoundPlayer.openingKill` | Derivable (first kill of the round) | Depends on kill ordering by tick | Yes, once "opening" is defined (first `player_death` in the round) | Yes | Yes (ordering) | No kill in the round → `false` for all, but only with complete coverage | `null` if coverage is partial | Σ = match FK metric (Cache FK 0 / FD 3 recount) | After kills + tick order | `kills`, `Event.tick` |
| `RoundPlayer.openingDeath` | As above | As above | As above | Yes | Yes | As above | As above | Σ = match FD metric | As above | As above |
| `RoundPlayer.traded` | Derivable | Needs the trade-window definition used by metrics | Yes, with the same window as metrics | Yes | Yes (time window) | As kills | `null` if coverage is partial | Σ = traded-deaths metric (Cache 2) | After kills + time | `Event.gameTimeSeconds`, `kills` |
| `RoundPlayer.tradeKill` | As above | As above | As above | Yes | Yes | As above | As above | Σ = trade-kill metric (Cache 2) | As above | As above |

### 4.2 `IDENTITY_BLOCKED` (10)

| Field | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Match.coverage.participantsResolved` | No (ownership is not in the DEM) | N/A | Count of participants with an internal id | Yes | No | No attachment → 0 or `null` (**decision O4**) | the decided value; never counts a nickname match | count = rows with `internal_player_id`; stranger cannot attach | Server path: yes, with the EXACT Steam rule; browser: no | `internalPlayerId` |
| `Participant.participantKey` | Yes (`player_info.steamid`) | Yes in Python; `players` domain NOT_COMPARABLE on WASM | Direct | It is the source-local key, **not** ownership | No | Bots / SteamID 0 → participant omitted | omit the participant (current) | key = exact u64 decimal of the Steam id (R2), never a nickname; SteamID 0 omitted | Yes, as a source-local key without an ownership claim | every `…ParticipantKey` |
| `Participant.internalPlayerId` | No | N/A | Only from the EXACT Steam attachment (server) | Yes | No | Unattached → `null` (legitimate) | `null` | attach only if profile Steam = participant Steam; Gamers Club refused; stranger isolation (proven 2026-10-28) | Server: yes; browser: no | `isTargetPlayer`, `identityStatus`, `identityConfidence` |
| `Participant.isTargetPlayer` | No | N/A | Equality with the selected key | Yes | No | No selection → `false` | `false` | exactly one target per attached match (3/3 today) | With `internalPlayerId` | `internalPlayerId` |
| `Participant.identityStatus` | No | **D34**: stale `unlinked` after attachment | Derived | Yes | No | Unattached → `unlinked` | `correlated` iff `internal_player_id` is set | DB invariant test including the attach-after-create path | **No, until D34 is fixed** | `internalPlayerId` |
| `Participant.identityConfidence` | No | Yes (1 on 3/3 targets) | `1` iff correlated | Yes | No | Unattached → `null` | `null` | invariant with `identityStatus` | After D34 | `identityStatus` |
| `RoundPlayer.participantKey` | Yes (from sides / economy keys) | Yes; orphan rows are refused by the RPC (FASE 2.6.9) | Direct | Source-local | No | No | row omitted | every key ∈ participants of the match (DB) | After `Participant.participantKey` | `Participant.participantKey` |
| `Event.actorParticipantKey` | Yes (`attacker_steamid`) | Raw events parity PASS | Direct | Source-local | No | World / bomb events → `null` | `null` | every non-null key ∈ participants or recorded unresolved; never a nickname | After `participantKey` | `sourceActorExternalId` |
| `Event.victimParticipantKey` | Yes (`victim_steamid`) | Python only (`victim_steamid` has no WASM counterpart) | Direct | Source-local | No | Non-player events → `null` | `null` | as actor | Server: yes; browser: no counterpart | `sourceVictimExternalId` |
| `Event.assisterParticipantKey` | Yes | Raw events parity PASS | Direct | Source-local | No | No assist → `null` | `null` | as actor | After `participantKey` | `sourceAssisterExternalId` |

### 4.3 `NOT_SUPPORTED` (5)

| Field | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MatchSource.externalMatchId` | No | N/A | No (never the fingerprint) | No | No | Always | `null` | adapter test; DB round trip | Yes | None |
| `MatchSource.externalParentId` | No | N/A | No | No | No | Always | `null` | adapter test | Yes | None |
| `Match.mapNumber` | No (a standalone DEM has no series position) | N/A | No | No | No | Always | `null` | adapter test | Yes | None |
| `Round.winReason` | Yes: game-state `round_win_reason` (codes observed in the D30 evidence) and `round_end.reason` when the event exists | Likely; per demo NOT PROVEN | Yes, through a reviewed code → enum table | No | No | When neither source is present | **decision O3**: keep the sentinel `unknown` or use `null` + reason | mapping table test; consistency (`bomb_exploded` ⇒ T win; `bomb_defused` ⇒ CT win) on the 63 stored rounds | Yes | `winningSide`, bomb flags |
| `RoundPlayer.buyContext` | Derivable from money and equipment | Depends on D33 | Only with a reviewed classifier (thresholds are a product definition, not a raw fact) | No | No | Missing economy → `null` | `null` | classifier fixtures + D33 coverage | After D33 + spec | `moneyStart`, `equipmentValue` |

### 4.4 `TICK_DOMAIN_BLOCKED` (4)

| Field | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Round.startTick` | Yes | Yes: D30 real-DEM tests pin Dust2 start 3498 and Mirage 1; raw `rounds` parity PASS on Cache | Direct, or game-state derived (`round_boundaries_observed_from_game_state`) | No | Yes | Unobservable start → `null` | `null` | ordering `start < end ≤ next start`; voided rounds excluded (D30); pinned real-DEM values | Yes, once "complete tick domain" is defined (**decision O5**) | `endTick`, D30 voiding |
| `Round.endTick` | Yes | Yes | As above | No | Yes | As above | `null` | As above | As above | `startTick` |
| `Event.tick` | Yes | Yes (raw events parity PASS) | Direct | No | Yes | No | `null` | every event tick ∈ [start, end] of its round; unassignable events counted (Dust2 147, Mirage 81) and documented, never re-assigned | Yes | `roundNumber`, round ticks |
| `Event.gameTimeSeconds` | Native `game_time` or derived | In the 3 matches it is derived from the game clock (header tickrate absent); provenance is **not recorded per event** | Derived (D22) | No | Yes | No clock → `null` | `null` | monotonic with tick; equals native `game_time` where present; provenance recorded | After recording time provenance (**decision O5**) | `tick` |

### 4.5 `CANONICAL_NOT_AUTHORIZED` (3)

`Participant.metadata`, `Round.metadata` and `RoundPlayer.metadata` behave the same way:

- **Q1–Q5:** N/A. They are constant `{}` (723/723 rows `{}` (30 + 63 + 630) in production).
- **Q6:** always.
- **Q7:** `{}`.
- **Q8:** a test that the adapter emits `{}`, plus a DB round trip. Note that the RPC merges with `||`.
- **Q9:** yes, as CONSTANT_EMPTY.
- **Q10:** none.

## 5. Defects and findings outside the gate definition

| Id | Finding | Evidence | Class | Fix (not applied here) |
| --- | --- | --- | --- | --- |
| **D33** | Economy under-extracted: `money_start` 9/630, `equipment_value` 9/630, `money_end` 13/630; Mirage carries `missing_economy` | [reproduced] Dust2 DEM, `parse_ticks` at the first 4 round start ticks: 10/10 players with `balance`, `start_balance`, `current_equip_value`; contract output has ≤ 1 per round. `enrich_rounds_from_tick_evidence` reads the thinned `tick_rows` sample at the exact boundary tick | technical defect, inside contract v2 | dedicated round-boundary economy read (as D29 for sides), real-DEM tests, release R5.8.20 by the standard procedure, then owner-authorized reprocessing |
| **D34** | `match_participants.identity_status` stays `unlinked` after attachment | [reproduced] 3/3 targets: internal id set, confidence 1, status `unlinked`; created first, updated later; the RPC's `ON CONFLICT … DO UPDATE` omits `identity_status`. No app reader of this column today (readers use `player_identities`) | technical defect (persistence), inside contract v2 | forward-only migration: on conflict, take `correlated` when the incoming row is correlated (never downgrade); probe scenario; one-off correction of the 3 rows only by a reviewed migration |
| S1 | `playedAt`/`startedAt` declare capability `game_state.match_start_time`, which is game-clock seconds; the adapter reads `header.match_date` | [code] | spec defect; changes the inventory digest (pinned) | correct it in v3, not in v2 |
| G1 | Gate PASS is unreachable by construction, and five controls require 0 authorized | §2 | contract contradiction | §8 |
| G2 | `assert_cache_attempt_9_ready` performs the DB gate, so it always raises | [reproduced] | historical function, not on the user path | document; retire in v3 |
| P1 | A9.1 covers one DEM and raw tables only | §2.2 | evidence gap | §9 |

D33 and D34 were **not** fixed in this investigation:

- **D33** needs a parser change. `parser.py` is a pinned critical file of the running R5.8.19 attestation. Merging
  it without a release would put `main` out of line with the runtime pin, and the release itself is a deployment,
  which this phase excludes.
- **D34** needs a production migration, which this phase also excludes.

Both fixes are inside the current contract and ready to start on the owner's go-ahead.

## 6. Alternatives (Phase D)

| Criterion | Alt 1 — per-field authorization | Alt 2 — explicit availability states | Alt 3 — capability-subset profiles |
| --- | --- | --- | --- |
| Backward compatibility | data unchanged; v2 consumers break (they require 0 authorized) | data unchanged (nulls stay nulls; reasons are additive); same consumer break | data unchanged; every consumer must declare a profile |
| Inconsistency risk | medium: an unauthorized field cannot say *why* (absent, unsupported or defective) | low: each field has exactly one state, and the state carries its reason | medium-high: the same field may be valid for one profile and not another |
| Wrong-identity risk | low if identity fields are left unauthorized | low: identity is an explicit state, separated by runtime path | medium: a profile may include identity fields without the EXACT rule |
| Invented-data risk | low, but pressure to "authorize" nulls to reach 105 | lowest: legitimate nulls are a terminal state, so nothing has to be filled | low |
| Database / migrations | new release rows; revise the release CHECK and `r5_real_dem_access_gate` | the same, plus `availability_state` in the inventory release rows; optional additive per-observation reasons in existing `quality.reasons` | a new profile table; per-consumer gates |
| Dashboard / APIs | none until fields are used | consumers read the state to show "not available" ≠ 0; aligned with the existing `AVAILABLE`/`NOT_AVAILABLE` evidence schema in `appDataContracts.ts` | each surface binds to a profile |
| Observability / audit | per-field evidence refs | per-field state + evidence + per-observation reason | per-profile reports |
| Tests | per-field parity/determinism/round trip | the same, plus "always-null" and "reason-emitted-when-null" tests | the same, per profile |
| Rollout / rollback | re-pin the active release | re-pin the active release (v2 stays intact) | per-profile switch |
| Effect on the current gate | still cannot pass (37 fields) unless absences are "authorized", which conflates them | PASS becomes reachable **and** meaningful: every field terminal, zero unverified | replaces the gate with N gates |
| Owner decision required | yes | yes (redefines PASS) | yes (formal scope change of "Canonical") |

## 7. Recommendation

**Adopt Alternative 2 as the contract, with Alternative 1 as its admission mechanism, as `canonical-demo-v3`, scoped
per runtime path. Do not adopt Alternative 3 now.**

- **Why Alternative 2.** The blocking problem is semantic: the contract has no way to say "`null` is the verified
  correct value". Alternative 1 alone keeps that conflation and leaves the gate unreachable. It can only reach 105 by
  authorizing absences, which is the masking this investigation must avoid.
- **Why Alternative 1 inside it.** A field becomes `AVAILABLE` only through its own evidence: same-DEM parity,
  determinism, semantic test and persistence round trip. No domain-level result is extrapolated to a field.
- **Why per runtime path.** On the server path, identity fields can be governed by the EXACT Steam attachment rule
  that is already proven in production. On the browser path, `players` / `player_identity` are NOT_COMPARABLE, so
  identity-dependent fields stay blocked there whatever the server state.
- **Why not Alternative 3.** Profiles answer "what may this consumer read". They do not answer "is this field
  correct". They also change the meaning of "Canonical" from one contract to many. If needed, they can later be
  derived as views over the v3 states.

### 7.1 Proposed v3 PASS definition (draft for decision)

For the selected runtime path, every field of the versioned set is in exactly one terminal state, and none is in a
non-terminal state.

Terminal states:

- **`AVAILABLE_VERIFIED`:** per-field parity, determinism, semantic and persistence evidence, each bound to commit,
  runtime, DEM sha and contract version.
- **`ABSENT_BY_SOURCE`:** always `null` or a fixed sentinel, justified by the source or the contract, with a test
  that the value is never substituted.
- **`CONSTANT`:** a tested literal.
- **`IDENTITY_SCOPED_VERIFIED`:** server path only, EXACT Steam rule tested, including isolation.

Non-terminal states: `NOT_VERIFIED`, `BLOCKED_DEFECT`, `NEEDS_PARSER_SUPPORT`, `NEEDS_DERIVATION_DECISION`,
`PARITY_FAILED`.

At the observation level, a `null` in an `AVAILABLE_VERIFIED` field is legitimate only together with a recorded
reason slug (for example `tickrate_unavailable`), and a test proves that the slug is emitted whenever the value is
`null`.

## 8. Implementation, rollout and rollback plan (after the owner decisions)

1. **Within v2, independent of v3:**
   - D33: parser fix, real-DEM tests, release R5.8.20 by the standard freeze → deploy → repin → attestation →
     activation procedure;
   - D34: forward-only migration, plus a Canonical persistence probe scenario for "create unattached, attach later".
   - Reprocessing of the three validated matches only after these releases, with the owner's authorization per
     attempt.
2. **Evidence harness (CI, disposable database, no production writes):**
   - run the server contract and the browser adapter on the same DEM and compare the 105 bundle fields one by one;
   - run each runtime twice (determinism);
   - persist through `persist_canonical_observation` in a disposable database and read back (round trip);
   - produce one sealed annotation per field;
   - DEMs: the three owner-provided demos, through the existing A9.1 storage and authorization path.
3. **v3 artifacts beside v2:**
   - generator `canonical_mapping_gate.py` v3 path (v2 output byte-identical);
   - new inventory JSON;
   - forward migration that inserts a **new** release. Inventory rows are immutable, so the migration adds rows; it
     does not update them.
4. **Coordinated consumer change, in one PR:**
   - release CHECK;
   - `r5_real_dem_access_gate` baseline (pin by release id instead of "authorized = 0");
   - A9.1 pre-DEM gate 5;
   - `parser_runtime_attestation` mapping pins;
   - `r5_8_3` / `r5_8_4` preflights;
   - `appDataContracts.ts` literals.
   Each lab and preflight gate keeps a strict pin, now to the approved release id.
5. **Activation:** a separate forward migration sets the active release to v3. Before it: the activation gate on the
   same SHA. After it: a read-back.
6. **Rollback:** a forward migration re-pins the active release to v2 `cf0549c2`. No data table is touched by v3
   (no backfill), so rollback has no data effect. `docs/reference/<v3>/rollback.sql` is committed with the
   migration.

## 9. Tests and evidence required (Phase E)

| Requirement | Test | Environment | Reusable existing evidence |
| --- | --- | --- | --- |
| Python vs browser parity per field | 105-field bundle comparison, server contract vs browser adapter, same DEM | CI + A9.1 DEM storage | A9.1 raw-domain PASS (Cache): input-level only |
| Determinism | 2 runs per runtime, per-field digests | CI | A9.1 digest-level PASS (Cache) |
| Legitimate absence | "always null" tests for ABSENT_BY_SOURCE fields; "reason emitted when null" for AVAILABLE fields | unit + real DEM | warnings `tickrate_unavailable`, `bomb_defused_absent_from_event_inventory` exist |
| Unsupported / missing data | adapter fixtures with each source absent → `null`, never `0`, `false` or `fetchedAt` | unit | null rules in `FIELD_SPECS` |
| Player identity | EXACT Steam attachment, Gamers Club refusal, stranger isolation, `identity_status` invariant (D34) | disposable DB probe + read-only prod check | isolation proven 2026-10-28 |
| Ticks and ordering | round boundaries ordered; event ∈ round bounds; voided rounds excluded | real DEM (D30 tests) | `test_match_reset_rounds.py` real-DEM tests |
| Events ↔ rounds ↔ metrics | per-round aggregates sum to the match metrics recount | read-only SQL over stored rows | Cache recount (kills 12, deaths 14, …) |
| Persistence and idempotency | write the same observation twice → identical rows; attach after create | disposable DB (`canonical_persistence_probe.py`) | probe 24/24 |
| Dust2 / Mirage / Cache regression | contract outputs compared with the cached R5.8.19 outputs; no production reprocessing | local / CI | cached contract outputs (2026-10-27) |
| User isolation | random `authenticated` sub reads 0 rows of each match | read-only prod check | 2026-10-28 |
| Server pipeline compatibility | existing Quality Gates + activation gate on the same SHA | CI | run 40629449316 PASS |
| Unauthorized fields never silently persisted | v3: the RPC refuses a non-null value in an ABSENT_BY_SOURCE or non-terminal field (or the adapter strips it, with a reason), tested in the probe | disposable DB | none |

## 10. Classification of pending items (Phase F)

| Item | Class |
| --- | --- |
| D33 economy under-extraction | technical defect, fixable without a contract change |
| D34 `identity_status` stale | technical defect, fixable without a contract change |
| Per-field parity/determinism/semantic/round-trip for the 54 CANDIDATE_VERIFY + 4 tick fields | missing test evidence |
| `teamA`/`teamB`/scores/`winnerTeam`/`winningTeam`/`Participant.team`, `winReason`, round times | needs additional parser support |
| `internalPlayerId`, `isTargetPlayer`, `identity*`, `participantsResolved`, `…ParticipantKey` | identity-dependent (server: EXACT rule; browser: unavailable) |
| `finishedAt`, `participantsExpected`, `sourceUpdatedAt`, `externalMatchId`, `externalParentId`, `mapNumber` | data unavailable in the source (terminal absence) |
| `null` vs sentinel (`winReason`), 0 vs `null` for aggregates, `participantsResolved` when unattached | product decision on absence semantics |
| Whether browser/WASM output may ever be persisted as Canonical | product decision on browser/WASM persistence |
| Redefining PASS, revising the zero-authorized baselines, S1 | formal contract change required |

## 11. Decisions required from the owner

- **O1 — Scope of the gate.**
  - **(a)** It governs the server Canonical bundle that production already writes, so today's persistence is
    governed by provenance and not by this gate: a governance gap to close.
  - **(b)** It governs only whether browser/WASM output may be persisted.
  - **(c)** Both, per runtime path (recommended).
- **O2 — Adopt `canonical-demo-v3`** (Alt 2 + Alt 1, §7.1). This replaces "105/105 authorized" and the
  zero-authorized baselines with release-id pins.
- **O3 — Absence semantics:** `winReason` sentinel `unknown` vs `null` + reason. Per-round aggregates: `null` until
  coverage is proven, or derived integers.
- **O4 — `participantsResolved`** when no attachment exists: `0` or `null`.
- **O5 — Definition of "complete tick domain"** and recording of the time provenance per event (native vs game
  clock).
- **O6 — Derivations:** whether the Canonical bundle should carry per-round aggregates (kills … tradeKill,
  `survived`, `buyContext`) or keep them in the metrics layer only.
- **O7 — D33 / D34:** go-ahead for the fix PRs, the R5.8.20 release, the D34 migration and the reprocessing of the
  three validated matches (each a new, authorized attempt).

## 12. Technical changes made in this investigation

- `docs/CANONICAL_105_FIELD_GATE_PROPOSAL.md`: this document.
- `docs/client-parser/canonical-105-field-proposal-matrix.json` and its read-only generator
  `scripts/canonical_field_gate_proposal_matrix.py`. The generator imports `FIELD_SPECS` and never writes the gate
  inventory.
- A correction note in `docs/CS2_PRO_RELEASE_CLOSURE_REPORT.md` for the wrong browser/server statement. The original
  row is kept.

Nothing else: no gate code, inventory, matrix digest, workflow, migration, production row, secret or deployment.

## 13. Risks and pending items

- **Production persists all 105 fields without per-field verification today.** User-facing correctness currently
  rests on provenance, recounts and the tests listed above, not on this gate. D33 shows a persisted field can be
  incomplete while every gate is green.
- **A9.1 parity is single-DEM and raw-level.** Generalizing it to Dust2/Mirage or to Canonical fields is NOT PROVEN.
- **v3 touches several pinned controls at once.** It must land as one reviewed PR with all required checks green on
  the same SHA, then a separate activation.

**Next step:** the owner decides O1, O2 and O7. Then come the D33 and D34 fix PRs, which are inside the current
contract, followed by the per-field evidence harness, before any v3 artifact.

## 14. Explicit confirmation

No rule of the 105-field gate was changed:

- `scripts/canonical_mapping_gate.py`, `docs/client-parser/canonical-mapping-inventory.json` (digest `cf0549c2…`)
  and `docs/client-parser/reconciled-field-matrix.json` (digest `a276b030…`) are byte-identical to `912a8835`;
- the database gate, its release row (`authorized_count = 0`) and its inventory are unchanged;
- no migration was applied, no deployment was made, and no demo was reprocessed.

**Canonical remains NOT PROVEN.**
