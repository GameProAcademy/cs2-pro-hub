# Phase 2.1.2 — Integration Readiness

Architecture for FACEIT, Gamers Club, Steam/Valve and public profiles.
**No external integration is implemented.** No API client, no OAuth, no scraping,
no crawler, no token storage, no external worker. The demo upload remains the
only functional data source.

## Canonical flow (never bypassed)

```text
SOURCE -> COLLECTOR -> SOURCE ADAPTER -> CANONICAL NORMALIZER
       -> CANONICAL MATCH DATA -> METRICS -> FEATURES -> ANALYSIS
       -> PLAYER DNA -> SCORE -> TRAINING PLAN -> AI COACH
```

The analysis layers never know which source produced the data. No source may
write directly into `match_metrics`, `match_features`, `analyses`,
`analysis_findings`, `player_dna_snapshots` or `player_score_snapshots`.

## Three distinct concepts

| Concept        | Meaning                                       | Storage              |
| -------------- | --------------------------------------------- | -------------------- |
| **Data source**| Where match data came from                    | `matches.data_source`|
| **Identity**   | This external account belongs to this player  | `player_identities`  |
| **Connection** | The player authorised access to that account  | `player_connections` |

- `player_identities.is_verified` is backend/admin only, enforced by
  `guard_identity_verification()`. A player can never self-verify.
- `player_connections` holds **no tokens**. A player may only create a `pending`
  connection and delete their own; `status` and every `last_sync_*` field are
  server-side only, enforced by RLS (no UPDATE policy for `authenticated`) plus
  `guard_connection_status()`.

## Token policy

If OAuth is ever implemented, tokens stay server-side in a secret store: never in
a Data-API readable table, never returned by a loader or server function, never
in browser storage, never logged, never in error messages.

## Capabilities vs coverage

- **Capability** (`SOURCE_CAPABILITIES`): what a source could provide in
  principle. Every non-demo source is `unknown` until its adapter is validated
  against official documentation, permissions, endpoints, rate limits and terms.
- **Coverage** (`DataCoverage`): what was actually obtained for this player.

**Missing data is never zero.** A source that does not report utility damage
yields `null` / `unavailable`, never `0`.

## Analysis readiness

`computeReadiness()` returns `none | partial | ready` with explicit machine-readable
limitations (`low_rounds`, `low_coverage`, `no_utility_data`, `no_economy_data`,
`no_positioning_data`). The UI localises them. A partial sample is always
presented as partial.

## Provenance and deduplication

`matches` gained `data_source`, `source_fetched_at`, `source_version`. A unique
index on `(player_id, data_source, external_match_id)` prevents importing the
same external match twice **per source**. A FACEIT record and its demo stay two
rows: the demo has the higher priority (`SOURCE_PRIORITY.demo = 100`) and is the
authoritative evidence. No automatic merge is implemented.

## Privacy

Only the authenticated player's own accounts, explicitly provided or authorised.
Third-party players are never analysed. Public-profile URLs are validated for
format only — `parsePublicProfileUrl()` performs no network request. Public
profile data never feeds public rankings or cross-player exposure.

## Future public profiles (design only)

A future public player page would read from a dedicated, opt-in, projection of
non-sensitive fields, behind an explicit `TO anon` SELECT policy on a separate
view/table. It is not created in this phase, and nothing today exposes player
data to anonymous readers.

## Files

- `src/lib/sources/sources.ts` — source ids, quality, priority, identity vs connection, audit action names, token policy.
- `src/lib/sources/capabilities.ts` — signals, capability levels, coverage math.
- `src/lib/sources/readiness.ts` — analysis readiness gate.
- `src/lib/sources/adapter.ts` — `SourceAdapter` contract, provenance, `UnimplementedSourceAdapter` (fails loudly).
- `src/lib/sources/registry.ts` — per-source descriptors and adapter lookup.
- `src/lib/sources/publicProfile.ts` — pure URL validation.
- `src/lib/connections.functions.ts` — read-only listing of the player's own connections.
- `src/components/pipeline/SourcesPanel.tsx` — honest UI states.

## Phase 2.1.2.1 — hardening (corrections only)

1. **Match deduplication** — the legacy `UNIQUE (player_id, platform, external_match_id)`
   constraint was dropped. Uniqueness is now `(player_id, data_source, external_match_id)`
   (partial, `external_match_id IS NOT NULL`), so the same game observed through two
   different sources coexists as two rows, while a duplicate from the same source is refused.
2. **Coverage semantics** — `null`/`undefined`/absent = signal missing (`unavailable`);
   `0` = signal present with an observed value of zero (`available`). Zero is never absence.
3. **Provenance** — `SourceProvenance` maps directly onto the existing columns
   (`data_source`, `external_match_id`, `source_fetched_at`, `source_version`) through
   `provenanceToMatchColumns()`. No redundant column exists.
4. **GRANTs** — `anon` holds nothing beyond `SELECT` on the public catalogue.
   `authenticated` cannot write any derived pipeline data
   (`matches`, `match_metrics`, `match_features`, `match_rounds`, `round_events`,
   `demo_jobs`, `analyses`, `analysis_findings`, `player_dna_snapshots`,
   `player_score_snapshots`) and holds no `TRUNCATE`/`TRIGGER`/`REFERENCES` anywhere.
5. **`player_connections.metadata`** — non-sensitive metadata only. Enforced in the
   database by `guard_connection_status()` via `public.jsonb_has_sensitive_key()` and in
   the application by `validateConnectionMetadata()` / `assertSafeConnectionMetadata()`
   (case-insensitive, separator-insensitive, recursive).
6. **Tests** — `src/lib/sources/__tests__/hardening.test.ts` plus checks 25a–25f in
   `supabase/tests/security_checks.sql`.
