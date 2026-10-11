# `persist_canonical_observation`: what a repeated write does

Evidence: `scripts/queue/canonical_persistence_probe.py` on a disposable
database (synthetic fixture). It compares row counts and a content digest of
every table the routine writes, before and after each call. Nothing here was
measured on a real match.

## Semantics, stated

| Case                                                              | Result                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Same observation written again (retry, lost ACK, re-run)          | no stored fact changes; `match_sources.observation_count` increments; `matches.source_fetched_at` moves |
| 8 identical concurrent writes                                     | one match, one `created`, no duplicate participant, round, player row or event                          |
| Write that fails (unknown participant or round)                   | nothing persisted; a previous state stays intact                                                        |
| Unknown identity confidence written again                         | stays `NULL` (was: became `0`)                                                                          |
| Known identity confidence                                         | never decreases; an unknown value does not erase it                                                     |
| Re-execution with fewer rounds, by the round-authoritative source | `round_players`, `round_events` replaced; **`match_rounds` rows of absent rounds deleted** (was: kept)  |
| Rounds still present                                              | same row updated in place; player-scoped columns survive                                                |
| Lower-priority source with fewer rounds                           | cannot touch rounds                                                                                     |
| Same demo from a second upload                                    | same match                                                                                              |

### Decision on `match_rounds`

Before: a re-execution that produced fewer rounds left the extra `match_rounds`
rows behind, with no players and no events, while `matches.round_count` already
said the smaller number. The comment in the routine ("ROUND rows are updated in
place") explains why rows are not recreated; it never said absent rounds should
remain.

Now: inside the block that already requires round authority
(`_priority >= canonical_source_priority(existing round source)`), rounds whose
number is not in the incoming observation are deleted in the same transaction.
The only tables that reference `match_rounds` are `round_players` and
`round_events`, both already replaced in that block, so nothing else cascades.

When this can happen in practice: the parser is deterministic for a given demo
and version, so it needs a parser/contract change or a higher-priority source.

## Rows already stored as `0`

The migration does not rewrite existing rows.

Read-only check of the managed database on 2026-10-11: 1 match, 10
participants, all with `identity_confidence = 0`; the match's source row has
`observation_count = 4`. No participant has `NULL` or a positive value.

What supports "these were `NULL`": the first and the current version of the
demo adapter emit only `1` (the correlated target) or `null`; the FACEIT
adapter emits `null`. No adapter emits `0`.

What is missing: the eight intermediate versions of the demo adapter were not
read, and nothing in the row records what the first write stored. So the
original value is a strong inference, not a proven fact, and it is left as is.
If the owner decides to restore it, the statement is one line and should be
run deliberately, not by a migration:

```sql
-- only after reviewing which rows it touches
UPDATE public.match_participants SET identity_confidence = NULL
 WHERE identity_confidence = 0;
```
