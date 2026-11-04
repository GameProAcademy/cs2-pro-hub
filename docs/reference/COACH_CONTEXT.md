# AI Coach context contract — `coach-context-v1` (Fase 3.1)

What the model receives as `PLAYER_FACTS` (one system message, together with the rules of
`coachSystemPrompt`). Built by `buildCoachFacts` (`src/lib/coach/coachContext.ts`), pure, from
the caller's own RLS-scoped rows. Guarded by `src/lib/__tests__/coachContext31.test.ts`,
`aiCoach.test.ts` and `coachPresentation.test.ts`.

## Sources (never recomputed here)

| Block                     | Source                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `observations[]`, `sides` | `xray-v1` (`buildXRay`): the same contract `/analysis` renders, with CT/T rounds from `round_players` (`loadSideRounds`) |
| `matches[]`, `totals`     | `match_metrics` per match (`loadPlayerOverview`), counts summed in code                                                  |
| `playerDna`               | `match_features` (`loadPlayerDna`), **only when READY**                                                                  |
| `inferences`              | `xray-v1` inferences (weakest-dimension rule of the training plan), **only when READY**                                  |
| `declared`                | the player's profile: `player_profiles.current_level / experience`, `player_profile_goals`, `player_profile_roles`       |
| `catalogSuggestions`      | catalog items selected for this message (`coachNeeds`; DNA dimensions only when READY)                                   |

## Status of every value

| Status                | Meaning                                                                                                            | Value sent         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `OBSERVED`            | counted from persisted match events (sums: deaths, opening kills, trades, clutches, grenade damage, flash assists) | yes                |
| `DERIVED`             | catalogued formula over observed values (K/D, ADR, KAST, HS%, rating, side ratings)                                | yes                |
| `INFERRED`            | documented rule over observations (X-ray weakest dimensions)                                                       | the rule's reading |
| `NOT_OBSERVED`        | nothing observed (no match / DNA dimension without signal)                                                         | null               |
| `NOT_MEASURED`        | not measured from these matches                                                                                    | null               |
| `INSUFFICIENT_SAMPLE` | below the canonical minimum (DNA: `DNA_MIN_MATCHES = 3`)                                                           | nothing            |
| `UNAVAILABLE`         | excluded on purpose (admission limitation such as L04 for results)                                                 | null               |

Each observation carries `metric`, `status`, `value`, `unit`, `aggregation`, `matches`,
`numerator`, `denominator`, `source` and an optional `note`. Values are rounded once, with the
deterministic rule of Fase 2.1 (`roundHalfUp`, catalog `digits.contract`).

## Rules enforced in code (not only in the prompt)

- **Player DNA:** `playerDna.dimensions`, `strongest`, `weakest` and `inferences` are empty
  unless the DNA is READY _and_ has at least `minimumMatches`. A label that contradicts its
  own sample (READY with 2 of 3) is treated as not ready. No "N / 100" string, no index and no
  ranking reaches the model below the minimum.
- **Flash assists:** sent as `OBSERVED` with a `note`. They are the game's own per-kill
  `assistedflash` flag (`adapter.py` → `normalizer.ts` → `metrics.ts`), read when the demo
  was processed. The per-kill flag is not stored, so the Coach says "the game recorded N"
  and never concludes that the player does not flash for teammates. Enemies flashed is
  `NOT MEASURED`.
- **Result / score / win rate:** `UNAVAILABLE` while the admission excludes them; the prompt
  forbids inferring a result.
- **Dates:** `period.dateBasis` / `matches[].dateBasis` = `processed` means the processing
  date, never the match date.
- **Minimal context:**
  - `matches[]` holds the matches of the maps the message names, else the 10 most recent;
    `totals` and `observations` always cover all matches.
  - DNA signals are sent only when the message is about the profile.
- **Declared preferences:** `declared.status = DECLARED_BY_PLAYER`; a preference, never a
  measurement.
- **Isolation:**
  - The player is the caller's own `player_profiles` row (`ownPlayerIds`).
  - The conversation is proved to be theirs before its history is read.
  - No nickname, file name, Steam id or other player's data enters the facts.
