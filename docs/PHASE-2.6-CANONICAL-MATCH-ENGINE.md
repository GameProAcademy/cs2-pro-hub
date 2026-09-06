# FASE 2.6 — Canonical Match Engine (source-neutral match data)

Status: **domain layer implemented (2.6.0, 2.6.1, 2.6.3, 2.6.4, 2.6.6, 2.6.7, 2.6.8).**
Database migration (2.6.2) and transactional persistence (2.6.5) are **NOT applied yet** —
see “Open work”.

## Why

Match data used to be shaped by the source that produced it: `matches` carried
`player_id`, `upload_id`, `score_player`, `score_opponent` — a player's viewpoint,
not a match. That model cannot express a BO3, cannot hold two sources observing
the same map, and turns “the source said nothing” into `0`.

## Rules the code enforces

| Rule | Where |
| --- | --- |
| SOURCE ≠ CANONICAL MATCH — a source yields an *observation* | `CanonicalMatchSource` |
| MATCH ≠ PLAYER — no player-relative field on a match | `CanonicalMatch`, test A |
| A canonical match is ONE playable map; BO2/BO3 is an optional series | `CanonicalSeries` |
| One canonical model, no per-source parallel model | `CanonicalMatchBundle` |
| Participants exist without an internal player id | `CanonicalParticipant` |
| Neutral round facts separated from per-player round state | `CanonicalRound` / `CanonicalRoundPlayer` |
| Events keep the source identifiers even when resolved | `CanonicalEvent` |
| NULL ≠ ZERO everywhere | every nullable field + tests |
| Quality/coverage per layer, with reasons — never a magic number | `canonical.quality.ts` |
| Three independent version axes | `canonical.versions.ts` |
| Source priority is a READ preference, never an automatic merge | `canonical.resolver.ts` |
| Gamers Club stays blocked and fails loudly | `adapters/gamersclub.adapter.ts` |

## Layout

```
src/lib/canonical/
  canonical.versions.ts     CANONICAL_SCHEMA_VERSION = 2, SOURCE_CONTRACT_VERSIONS
  canonical.types.ts        series / match / sources / participants / rounds / events
  canonical.quality.ts      quality + coverage, hasAnalyticalCoverage()
  canonical.adapter.ts      CanonicalSourceAdapter contract + UnavailableCanonicalAdapter
  canonical.resolver.ts     Match Identity Resolver
  canonical.projection.ts   PlayerMatchProjection (win/loss/my score are DERIVED)
  adapters/demo.adapter.ts        parsed demo -> canonical
  adapters/faceit.adapter.ts      FACEIT match/series -> canonical
  adapters/gamersclub.adapter.ts  blocked, fails loudly
```

## Match Identity Resolver

Evidence order, strongest first:

1. identical content fingerprint (same demo file) → `EXACT_MATCH`
2. same source + same external id → `EXACT_MATCH`
3. cross-source: same map + ≤20 min apart + ≥6 shared participants → `PROBABLE_MATCH`
4. weaker overlap → `POSSIBLE_MATCH` (`requiresReview`)
5. contradictory map or score → `CONFLICT` (`requiresReview`)

Only `EXACT_MATCH` may attach automatically (`canAttachAutomatically`). A conflict
is never hidden behind a weaker positive result.

## Source honesty

- **demo** — rounds, per-round player state and events. Analytically usable.
- **faceit** — match-level only: quality `degraded` with reasons `no_round_data`,
  `no_event_data`, `no_player_round_state`. A BO3 with no per-map score yields the
  series and **no invented map rows**. FACEIT demos are never downloaded.
- **gamers_club** — `external_access_blocked`.
- **steam** — identity only; never a match source.

## Open work (next step, not silently assumed done)

- **2.6.2 database**: tables `match_series`, `match_sources`, `match_participants`,
  `round_players`, plus the neutral columns on `matches`/`match_rounds`, with RLS,
  grants and `SECURITY DEFINER` routines. Evolution, not destruction: existing
  tables keep their data and the legacy player-scoped columns stay readable until
  the projection replaces them.
- **2.6.5 persistence**: one transactional, idempotent `SECURITY DEFINER` routine
  per observation, keyed on `(source, external_match_id)` / fingerprint.
- Wiring the demo and FACEIT collectors to write through the canonical engine.

## Tests

`src/lib/canonical/__tests__/canonical.test.ts` (22) and `resolver.test.ts` (15).
