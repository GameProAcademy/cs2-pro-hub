# FASE 2.6 — Canonical Match Engine (source-neutral match data)

Status: **domain layer + database + persistence implemented**
(2.6.0, 2.6.1, 2.6.2, 2.6.3, 2.6.4, 2.6.5, 2.6.6, 2.6.7, 2.6.8).
The demo collector writes through the canonical engine. FACEIT wiring is the
next step — see “Open work”.

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

## Database (2.6.2) — evolution, not destruction

New tables, all RLS-enabled, `SELECT` only for the participating player
(`owns_canonical_match` / `owns_canonical_series`), writes exclusively server-side:

| Table | Holds |
| --- | --- |
| `match_series` | BO2/BO3 parent: maps won per slot, never round score |
| `match_sources` | one row per source OBSERVATION; provenance is never overwritten |
| `match_participants` | who played, with or without an internal player id |
| `round_players` | per-player round state (side, survival, economy, duels) |

`matches` gained neutral columns (`series_id`, `map_number`, `team_a/team_b`,
`score_team_a/score_team_b`, `winner_team`, `played_at`, `started_at`,
`finished_at`, `canonical_status`, `finished`, `terminal`, `round_count`,
`quality`, `coverage`, `content_fingerprint`, `canonical_source`,
`round_source`) and `player_id` is now nullable — a match does not belong to a
player. `match_rounds` gained `winning_team`, `win_reason`, time bounds, quality
and metadata, and its bomb flags accept `NULL` (unknown ≠ false).
`round_events` gained `match_source_id` and the original source identifiers.
Every legacy player-scoped column stays readable until the projection replaces it.

## Persistence (2.6.5)

`public.persist_canonical_observation(_bundle jsonb, _owner_player_id uuid,
_upload_id uuid)` — one `SECURITY DEFINER` routine, `search_path = ''`,
`EXECUTE` for `service_role` only. Called from
`canonical.persistence.server.ts`.

- Transactional: an observation is stored completely or not at all.
- Idempotent: `(source, external_match_id)`, then `(source, fingerprint)`, then
  the upload id — reprocessing updates instead of duplicating.
- `pg_advisory_xact_lock` serialises concurrent writes of the same observation.
- Source priority decides who may WRITE canonical facts; a weaker source never
  overwrites a stronger one, and rounds/events are only replaced by a source
  that actually has them.
- Rejects loudly: `CANONICAL_BUNDLE_INVALID`, `CANONICAL_SCHEMA_UNSUPPORTED`,
  `CANONICAL_OBSERVATION_UNIDENTIFIABLE`.

## Open work (next step, not silently assumed done)

- Wiring the FACEIT collector through `faceitToCanonicalBundles` +
  `persistCanonicalObservation` (the demo collector already writes through it in
  `src/lib/pipeline/jobs.server.ts`).
- Reading the UI from the canonical projection instead of the legacy
  player-scoped columns.
- Metrics/features derived from `round_players` instead of the player columns on
  `match_rounds`.

## Tests

`canonical.test.ts` (22), `resolver.test.ts` (15), `persistence.test.ts` (7).
