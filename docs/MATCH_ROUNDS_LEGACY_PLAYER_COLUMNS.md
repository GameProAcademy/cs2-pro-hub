# `match_rounds.player_side` and the other player-scoped round columns are legacy (D31)

Investigated 2026-10-27. Conclusion: **not a defect**. The column is legacy and is intentionally no longer written. The per-player, per-round side lives in `round_players.side`.

## Columns in scope

`match_rounds.player_side`, `player_money_start`, `player_money_end`, `player_equipment_value`, `player_survived`.

`buy_context` also exists on `round_players`, so it is not in scope.

## Evidence

| # | Fact | Reference |
|---|---|---|
| 1 | Created as columns of the uploading player's perspective. The pre-canonical pipeline stored one demo per user; the rounds table carried that player's side, money and survival. | `supabase/migrations/20260903081020_58791137-….sql` lines 106–129; writer added in `82a9eeeb` |
| 2 | The canonical schema keeps them only for backward compatibility. Its header says: "Evolution, not destruction: legacy player-scoped columns stay." | `supabase/migrations/20260906024007_d17f7445-….sql` line 3 |
| 3 | Their only writer was removed when the canonical routine became the single writer of rounds. The removed code was `player_side: sideInRound(match, steamId, round)` in `persistence.server.ts`. That module now says it "no longer inserts a match, rounds or events". | commit `6f75024a` (2026-09-08), `src/lib/pipeline/persistence.server.ts` header |
| 4 | The canonical writer does not list them. `INSERT INTO public.match_rounds (match_id, round_number, start_tick, …, winner_side, win_reason, bomb_*, quality, metadata)` has no player-scoped column. On conflict it only updates the columns it writes, so it neither fills nor erases them ("player-scoped columns … survive"). | `supabase/migrations/20261011130000_canonical_participant_confidence_null.sql` (latest definition); production `persist_canonical_observation(jsonb,uuid,uuid)` prosrc md5 `3420e6cc…`, no occurrence of `player_side` |
| 5 | No schema object depends on them: no constraint, no trigger, no view and no comment. The only triggers on `match_rounds` are the quarantine guards. | production catalog query, 2026-10-27 |
| 6 | No application reader. The only references are in the generated `src/integrations/supabase/types.ts`. Scripts only use `player_money_start` and `buy_context` to prove that the canonical writer preserves them (`scripts/queue/canonical_persistence_probe.py` lines 280–292). | repository search |
| 7 | They cannot hold a correct value in the current model. A canonical match is shared by every user who attaches a demo of it, and `match_participants` / `round_players` hold all 10 players. A single per-round column would hold only one player's side, and it would be overwritten by whichever user attached last. | data model |
| 8 | Production: across all 3 matches with rounds, all five legacy columns are NULL in all 65 rows (25 + 23 + 17). | read-only query, 2026-10-27 |

## Comparison on the two validated matches (read-only)

| | Dust2 `747c7a6b` | Mirage `95186f3f` |
|---|---|---|
| `match_rounds` rows / `player_side` non-null | 17 / 0 | 23 / 0 |
| `round_players` rows / `side` in (CT, T) | 170 / 170 | 230 / 230 |
| Target player rows / with side | 17 / 17 | 23 / 23 |
| Target player sides | 1 CT, 2–13 T, 14–17 CT | 1–12 T, 13–23 CT |
| Rounds where all 10 players switch side | 2, 14 | 13 |

The Mirage pattern is a regulation MR12 match: sides switch at halftime, before round 13.

The Dust2 pattern is shifted by one round. The data points to a round 1 that is not a regulation round:
- all 7 kills in round 1 are knife kills, within 99 ticks;
- every player switches side after it;
- the halftime switch comes before round 14.

This is a separate finding, D30, about which rounds are counted. It is not about `player_side`. See the closure report.

## How to stop this ambiguity from reappearing

1. **Evidence reports** check the per-player side in `round_players.side`. They never use `match_rounds.player_side`. The regression test `src/lib/pipeline/__tests__/legacyRoundPlayerColumns.test.ts` enforces that any closure-report row mentioning `player_side` labels it legacy.
2. **Code:** the same test fails if application code (generated types excepted) references a legacy column, or if the latest canonical round writer starts listing one.
3. **Schema (proposed, not applied):** a forward-only, metadata-only migration, `COMMENT ON COLUMN public.match_rounds.player_side IS 'LEGACY (pre-canonical, single-player perspective); not written since 2026-09-08; use round_players.side'`, with the same comment for the other four columns.
   - It changes no data.
   - It does change the managed migration head, so it must be applied in production in the same release window and needs the owner's authorization.
   - Dropping the columns is **not** recommended: it is destructive, and the canonical persistence probe asserts that these columns are preserved.
