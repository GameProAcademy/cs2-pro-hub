# CS2 PRO Score — `pro-score-v1`

Source of truth: `src/lib/proScore.ts` (pure, deterministic, no I/O). Read by
`getProScore` (`src/lib/proScore.functions.ts`, GET, authenticated, RLS, no write, no service
role) and by the AI Coach (`buildCoachFacts({ proScore })`). Tests:
`src/lib/__tests__/proScore.test.tsx`.

## What it is

A 0–100 index of the player's **measured performance** over their own processed matches.

```
score = 100 × Σ(wᵢ · vᵢ) / Σ(wᵢ)                 over the AVAILABLE components i
vᵢ    = Σ(valueᵢₘ · sampleᵢₘ) / Σ(sampleᵢₘ)      over eligible matches m that observed i
```

Every `vᵢ` is a `[0,1]` signal already produced by the feature pipeline and described in
`features.catalog.ts` (`direction: "up"`). No new reference value, benchmark or population
is introduced.

## What it is not

- Not a percentile, rank, tier or comparison with other players or professionals. There is
  no reference population; `percentile` and `tier` are always `null`. **50 does not mean
  "average".**
- Not the per-match rating and not the Player DNA. Style / neutral signals never enter.

## Components and weights

| Component          | Signal                           | Weight | Sample (pooling weight)  |
| ------------------ | -------------------------------- | -----: | ------------------------ |
| Round contribution | `decision_making.kast`           |   0.25 | rounds                   |
| Damage             | `aim.damage_per_round` (ADR÷100) |   0.20 | rounds                   |
| Kills              | `aim.kills_per_round`            |   0.15 | rounds                   |
| Duel balance       | `dueling.kd_balance`             |   0.15 | rounds                   |
| Survival           | `survivability.survival_rate`    |   0.10 | rounds                   |
| Opening duels      | `dueling.opening_success`        |   0.10 | opening duels (≥ 10)     |
| Clutches           | `clutch.clutch_win_rate`         |   0.05 | clutch situations (≥ 10) |

**The weights are a documented design decision of v1, not a statistical fit** — the product
has no population to fit them on. Rationale: signals observed every round carry 0.85
(broadest outcome signal first); the two event-sampled signals are rarer and noisier and
carry 0.15. The per-match `rating` is excluded because it already blends kills, deaths and
damage. Weights change only with a new version string.

## Eligibility, missing data and states

| Rule                                                      | Constant                          |
| --------------------------------------------------------- | --------------------------------- |
| Matches read partially (`partial_parse`) are not eligible | —                                 |
| Duplicated `match_id` counts once                         | —                                 |
| Minimum eligible matches                                  | `PRO_SCORE_MIN_MATCHES = 3`       |
| Event components need this many pooled events             | `PRO_SCORE_MIN_EVENT_SAMPLE = 10` |
| Minimum share of weight available                         | `PRO_SCORE_MIN_COVERAGE = 0.75`   |

A missing value is never zero. A component that was not observed (`NOT_OBSERVED`) or is
below its event sample (`THIN_SAMPLE`) leaves the calculation and its weight leaves the
denominator; `coverage` reports the share of weight used. A value without its own positive
sample is skipped, not guessed. An observed 0 is a real 0.

States: `EMPTY` (no eligible match) · `INSUFFICIENT_SAMPLE` (< 3 matches) ·
`INSUFFICIENT_COVERAGE` (< 75% of weight) · `READY`. Only `READY` has a number.

## Confidence (sample size only)

From pooled rounds `n`; worst-case standard error of a per-round proportion is `√(0.25/n)`:
`PROVISIONAL` n < 150 · `MODERATE` 150 ≤ n < 300 (≤ 4.1 points) · `HIGH` n ≥ 300 (≤ 2.9).
It says nothing about skill.

## Persistence and history

None in v1. The Score is recomputed on read from `match_features`, so it can never disagree
with its inputs and needs no migration. The pre-existing empty table
`player_score_snapshots` (columns `score`, `percentile`, `tier`) has no producer and is
**not** used: its shape presumes a percentile and a tier that do not exist. History needs a
new additive, versioned table and is deferred to the evolution module (Phase 4.2 G).

## Known limitations

1. Weights are not fitted (see above).
2. `damage_per_round` and `kills_per_round` are clamped to 1 **per match** by the feature
   pipeline before pooling, so an exceptional match is under-counted.
3. `kd_balance` and `survival_rate` are pooled by rounds — an approximation of the pooled
   ratio, since the per-match kill/death counts are not in `match_features`.
4. No map, side, role or opponent-strength context: the same value on different maps is not
   adjusted.
5. Quarantined matches are excluded upstream (`loadPlayerDna`, fail closed).

## Worked example (production, read-only, 2026-11-10)

Test account, 3 complete matches, 63 rounds: KAST 0.762, damage 0.825, kills 0.603, duel
balance 0.524, survival 0.460; opening duels 8 and clutches 4 are below 10 → unavailable.
Coverage 85%, score **67.1**, confidence `PROVISIONAL`.
