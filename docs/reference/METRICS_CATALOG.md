# Metrics, events and diagnosis contract (Fase 2)

Continuity deliverable of Fase 2 (dados e Raio-X). Fase 3 consumes what is listed here and
must not recompute or invent values.

- Code source of truth: `src/lib/metrics/canonicalMetrics.ts` (metrics),
  `src/lib/diagnostics/xray.ts` (diagnosis contract `xray-v1`).
- Guarded by: `src/lib/__tests__/phase2DataXray.test.tsx`.

## 1. Data chain

```
.dem → Railway worker (cs2-demo-parser, demoparser2) → RAW evidence (raw_evidence_*)
     → admission contract v3 (src/lib/pipeline/admissionV3.ts: PASS / LIMITED / BLOCKED)
     → canonical match (matches, match_participants, match_rounds, round_players, round_events)
     → per-player projection (persistence.server.ts → RPC persist_demo_projection:
       match_metrics, match_features, matches.score_* / result)
     → app reads with the player's own session (RLS) → playerOverview / playerDna / xray
```

- **RLS (verified in production, 2026-11-04):**
  - `match_metrics`, `match_features`, `player_dna_snapshots`: `owns_player(player_id)` or staff.
  - `matches`, `match_rounds`, `round_events`: `owns_canonical_match` or staff.
  - `match_participants`, `round_players`: `owns_canonical_match`.
  - The app also narrows every read to the caller's own `player_profiles` (`ownPlayerIds`).
- **Nulls:** every column a limitation of the admission decision forbids is persisted as
  `null` (`excluded_metrics`), never as a value.

## 2. Canonical metrics

All per-match values come from `src/lib/pipeline/metrics.ts`; aggregates from
`playerOverview.ts` / `xray.ts`.

| id                           | Source                            | Per-match formula                                   | Aggregate                              | Null when                           |
| ---------------------------- | --------------------------------- | --------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| kills / deaths               | `match_metrics.kills` / `.deaths` | kill events by / on the player                      | Σ                                      | kill events unavailable             |
| kd                           | `kills`, `deaths`                 | kills ÷ deaths                                      | Σ kills ÷ Σ deaths (matches with both) | Σ deaths = 0                        |
| adr                          | `adr`                             | damage ÷ rounds played                              | mean of matches                        | no damage events                    |
| kast                         | `kast`                            | K/A/S/T rounds ÷ rounds × 100                       | mean of matches                        | survival or trade not provable      |
| hsPercent                    | `hs_percent`                      | headshot kills ÷ kills × 100                        | mean of matches                        | 0 kills                             |
| rating                       | `rating`                          | 0.45·KPR/0.70 + 0.25·(1−DPR/0.75) + 0.30·ADR/80     | mean of matches                        | rating evidence missing             |
| ctRating / tRating           | `ct_rating` / `t_rating`          | same formula on CT / T rounds                       | mean of matches                        | no round on that side               |
| openingKills / openingDeaths | `first_kills` / `first_deaths`    | first kill / death of a round                       | Σ                                      | kill order not determinable         |
| tradeKills                   | `trade_kills`                     | kill of a teammate's killer within the trade window | Σ                                      | timing not trustworthy              |
| flashAssists                 | `flash_assists`                   | game flag, else own flash within the window         | Σ                                      | neither flag nor timed blind events |
| utilityDamage                | `utility_damage`                  | damage dealt with any grenade                       | Σ                                      | no damage events                    |
| clutchWins                   | `clutch_wins`                     | last alive vs ≥ 1, survived and side won the round  | Σ                                      | kill/state evidence missing         |
| roundsPlayed                 | `rounds_played`                   | rounds the player was present                       | Σ                                      | round boundaries missing            |
| winRate                      | `matches.result`                  | wins ÷ (wins + losses)                              | same                                   | no resolved result (e.g. L04)       |

The data classes of each metric are the admission v3 maps (`METRIC_DATA_DEPENDENCIES_V3`,
`PROJECTION_DATA_DEPENDENCIES_V3`), referenced by the catalog rather than copied. Minimum
sample: 1 match for a per-player value; Player DNA dimensions need `DNA_MIN_MATCHES = 3`.

**Aggregation note.** A "mean of matches" weighs every match equally. Example from
production: HS% 27.8 % (5 / 18) and 0 % (0 / 2) average to 13.9 %, while pooling all kills
would give 25 % (5 / 20). The catalog makes this explicit. It is not a defect, but Fase 3
must use the same aggregation when it cites these numbers.

### Precision and rounding (Fase 2.1)

One rule, `roundHalfUp` (`src/lib/metrics/rounding.ts`): read the value at 15 significant
digits (drops binary noise such as 0.6549999999999999), shift the decimal point textually
and round half away from zero (0.655 → 0.66, −0.655 → −0.66, 1.005 → 1.01).

- **Internal precision:** per-match values as persisted by the engine (`round1` / `round3`);
  aggregates are computed in full precision. Nothing is rounded in between.
- **Contract precision:** `xray-v1` observations round the final aggregate once, to
  `digits.contract`.
- **Display precision:** `formatNumber` rounds again to `digits.display`, with the same
  rule, then applies the locale (`Intl`).

| Metric                                                                   | Contract | Display |
| ------------------------------------------------------------------------ | -------- | ------- |
| kd                                                                       | 3        | 2       |
| rating, ctRating, tRating                                                | 3        | 2       |
| adr, kast, hsPercent                                                     | 1        | 1       |
| winRate                                                                  | 1        | 0       |
| utilityDamage                                                            | 1        | 0       |
| counts (kills, deaths, opening, trades, flash assists, clutches, rounds) | 0        | 0       |

Example from production: rating 1.13 and 0.18 → mean 0.655 (contract) → "0,66" (display);
before Fase 2.1 the binary 0.6549999999999999 was shown as "0,65".

## 3. Event catalog (persisted `round_events.event_type`)

- **Observed in production (2026-11-04):** `kill`, `damage`, `flash`, `he`, `smoke`,
  `weapon_fire`, `bomb_plant`, `bomb_defuse`, `bomb_explode`, `round_start`, `round_end`.
- **Parser canonical inputs:** `CANONICAL_EVENT_TYPES` in
  `services/cs2-demo-parser/raw_evidence.py`, governed by `docs/PARSER_FIELD_GOVERNANCE.md`.

| Event                                     | Used by                                           | Reliability evidence                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kill`                                    | kills, deaths, HS%, opening, trades, clutch, KAST | Production cross-check: kill and headshot counts from events equal `match_metrics` for both real matches                                                                                                                                                                                                                                                                            |
| `damage`                                  | ADR, utility damage, rating                       | Admission gate RAW-V2-14-combat                                                                                                                                                                                                                                                                                                                                                     |
| `flash`                                   | flash assist fallback (needs a victim)            | In the 2 audited matches every persisted `flash` event has an actor and no victim (0 `player_blind` with victim). The parser supports `player_blind`; why it is absent here (demo, parser or canonical) is not verified. Enemies flashed is therefore unsupported for these matches. The game's `assistedflash` flag is read by the parser but not persisted in `round_events.data` |
| `round_start` / `round_end`               | rounds, sides, round winner side                  | Every round of the real matches has `winner_side`                                                                                                                                                                                                                                                                                                                                   |
| bomb events, `weapon_fire`, `he`, `smoke` | features (utility, grenades)                      | Parser field governance                                                                                                                                                                                                                                                                                                                                                             |

## 4. Diagnosis contract `xray-v1`

`buildXRay({ overview, dna, sides }) → XRayDiagnosis` (pure; served by `getXRay`).

- **`sample`:** matches, rounds, decided, resultUnresolved, processedDateOnly, dnaMatches,
  dnaMinimumMatches.
- **`dimensions[]`:** six dimensions:
  - `aim_duels`, `survival_positioning`, `utility`, `impact`, `consistency`, `decision`;
  - each holds `observations[]` (`metric`, `status`, `value`, `matches`, `numerator`,
    `denominator`) plus DNA readings.
- **`status`:**
  - `MEASURED`;
  - `NOT_MEASURED` (no match carries it);
  - `EXCLUDED_BY_ADMISSION` (every match's limitations exclude the column).
  - A measured 0 is `MEASURED 0`.
- **`sides`:** CT/T rounds from `round_players.side` of the player's own participant (only
  matches where every round has a side), plus `ct_rating` / `t_rating`.
- **`dimensions[].dna[]`:** `{ dimension, index, indexStatus, matches }`.
  - `indexStatus`: `READY` (index published), `IN_FORMATION` (observed, but the DNA has
    fewer than `DNA_MIN_MATCHES = 3` matches) or `NOT_OBSERVED`.
  - `index` is a number **only** when `indexStatus = READY`; otherwise `null`. A provisional
    index never appears in the payload (tested on the serialized JSON), and is never 0.
  - The state and the sample (`state`, `sample.dnaMatches`) prevail over any dimension.
- **`inferences[]`:**
  - only when Player DNA is `READY`;
  - rule `weakest_observed_dna_dimension` = training plan `needsFromPlayer`, with
    `PLAN_CEILING = 60` and at most 3 dimensions;
  - the X-ray therefore always agrees with the training plan priorities (tested).
  - `inferenceBlockedBy` says why there are none: `NO_DATA`, `INSUFFICIENT_SAMPLE` or
    `NONE_BELOW_CEILING`.
- **`recommendations[]`:** the inferred dimension, its training topics (`DIMENSION_TOPICS`)
  and the `/training` route. Never a lesson, never a number.
- **`unsupported[]`:** `enemiesFlashed`, `positions`, `economyClassification`,
  `sideSplitKills`.

## 5. Source gaps found (not fixed in the frontend)

1. **No resolved result or score (L04).** In both real matches, every participant has
   `team = null`, so admission v3 records `L04-MATCH-RESULT-UNRESOLVED` and persists
   `result` / `score_*` as null.
   - `match_rounds.winner_side` and `round_players.side` do exist; for the Nuke match they
     imply 13–6.
   - Deriving the result in the app would bypass the admission contract.
   - The fix belongs in the pipeline: participant team from per-round side or
     `team_number`, an admission ruleset change, then reprocessing. Each step needs
     explicit authorization.
   - Hypothesis, not verified: the team assignment is lost between the parser's
     `team_number` mapping and the RAW participants.
2. **`round_players` kills, deaths and damage are null in every round.** Only `side` is
   written, so per-side kills and damage cannot be shown. `ct_rating` / `t_rating` are
   shown instead.
3. **`round_players.survived` is null.** Survival is computed from events in
   `match_features`; the per-round column is unused.
4. **`matches.played_at`, `match_date` and `duration_seconds` are null.** CS2 demos carry
   no wall-clock date, so the UI shows the processing date and says so.

## 6. Reads and side effects (Fase 2.1)

| Server function     | Used by                         | Side effect                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPlayerOverview` | Dashboard, Matches, Performance | none (RLS read)                                                                                                                                                                                                                                |
| `getXRay`           | `/analysis`                     | none (RLS read)                                                                                                                                                                                                                                |
| `getDnaHistory`     | `/player-dna`                   | none (RLS read)                                                                                                                                                                                                                                |
| `getDnaSummary`     | Dashboard DNA card              | none: reads the latest persisted snapshot; a missing snapshot is `NO_SNAPSHOT`, a failed read is an error                                                                                                                                      |
| `getRealPlayerDna`  | `/player-dna` only              | **writes by design**: refreshes the caller's DNA snapshot (service role, idempotent by `input_digest`) so a profile older than snapshotting gets one. It returns `publishableDna(...)`: dimension values are withheld below the minimum sample |

Snapshots are produced by the pipeline after every processed match
(`jobs.server.ts` → `refreshPlayerDnaSnapshot`). A test fails if any other caller of
`getRealPlayerDna()` appears, or if `xray.functions.ts` gains a write.

## 7. Rules for consumers (AI Coach, Fase 3)

- Use only observations with `status = MEASURED`, citing `matches` and the declared
  aggregation (HS%, ADR, KAST, rating are **means of matches**, not pooled).
- Never use or derive a DNA dimension index unless `indexStatus = READY`.
- Inferences and recommendations only when present; `inferenceBlockedBy` explains absence.
- No result, score, win rate, CS2 PRO Score, enemies flashed, positions or economy class.
- Flash assists: cite as "reported by the game flag", not as an independently verified 0.
- **Fase 3.1 (done):** the Coach context (`coach-context-v1`, `docs/reference/COACH_CONTEXT.md`)
  consumes `xray-v1` and sends no DNA index, "N / 100" or strongest/weakest below the minimum
  sample.
