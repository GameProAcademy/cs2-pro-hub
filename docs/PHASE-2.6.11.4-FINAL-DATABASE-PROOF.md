# FASE 2.6.11.4 — FINAL DATABASE PROOF

Reproducible proof of the Canonical Match Engine executed against the REAL
project database, through the production code path (`persistCanonicalObservation`,
`persistCanonicalSeriesObservation`, `resolveAgainstAll`, `loadCandidates`,
`resolveFaceitIdentities`) — no SQL rewritten for the proof, no mock client.

## How to reproduce

```bash
bun scripts/canonical-proof.ts
# with a real signed-in session (gates 12, 23, 24):
PROOF_USER_ACCESS_TOKEN=<supabase access token> bun scripts/canonical-proof.ts
```

The script creates its own fixtures (matches, series, 10 temporary auth users
with FACEIT/STEAM identities) and removes every one of them at the end; the
final gates assert zero leftovers.

Last run: **24 PASS / 0 FAIL / 0 SKIPPED**.

## Gate results

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | DEMO observation persisted | PASS | 1 match, 1 round, 2 round events |
| 2 | A canonical match belongs to NO player | PASS | `matches.player_id IS NULL` |
| 3 | `NULL != FALSE` survives persistence | PASS | bomb fields stay `null` when unknown |
| 4 | Cross-source attach converges on ONE canonical match | PASS | FACEIT match id == DEMO match id, `created=false` |
| 5 | Round data of the stronger source survives the weaker observation | PASS | rounds still 1 after FACEIT observation |
| 6 | Idempotency | PASS | 1 match, 1 observation row per source, 10 participants after 4 writes each |
| 7 | Atomic rollback of a failed attach | PASS | `CANONICAL_ATTACH_TARGET_NOT_FOUND`, 0 leftover `match_sources` |
| 8 | A contradicting match is never fused | PASS | distinct canonical match id |
| 9 | 6 PARALLEL writers of the same observation | PASS | 6/6 fulfilled, 1 match, 1 source row, `observation_count=6` |
| 10 | Parallel writers never duplicate the roster | PASS | 10 participants |
| 11 | Anonymous cannot read canonical matches | PASS | `permission denied for table matches` |
| 12 | Signed-in user cannot write canonical tables nor run the routine | PASS | insert/update/delete/`match_sources`/`match_participants`/RPC all denied |
| 13 | Fixtures fully removed | PASS | 0 leftover matches, 0 leftover sources |
| 14 | Identity Graph CASE A (resolved) | PASS | `RESOLVED`, 10 proven SteamID64 |
| 15 | Identity Graph CASE B (unresolved is NOT an error) | PASS | `IDENTITY_UNRESOLVED`, 0 entries |
| 16 | Identity Graph CASE C (query failure) | PASS | `IDENTITY_RESOLUTION_ERROR` |
| 17 | Cross-source EXACT through the real graph, no fingerprint, no shared external id | PASS | `EXACT_MATCH` via `cross_source_roster_identical` |
| 18 | Temporal semantics: DEMO start vs FACEIT start (never finish) | PASS | 20:00 start vs 20:01 start converge; 20:42 finish is not used as a start |
| 19 | Two EXACT candidates => ambiguity, never an arbitrary attach | PASS | `CONFLICT` + `ambiguous_multiple_exact_candidates`, `candidate=null` |
| 20 | Source precedence: weaker source never degrades canonical facts | PASS | `canonical_source=demo`, `round_source=demo`, score untouched |
| 21 | SERIES-ONLY: one series, zero placeholder matches | PASS | 1 `match_sources` with `match_id IS NULL`, 0 matches |
| 22 | Identity fixtures fully removed | PASS | 0 leftover identities |
| 23 | RLS: USER A reads its OWN canonical match | PASS | 1 row with a real session |
| 24 | RLS: a signed-in NON-participant cannot read a foreign match | PASS | 0 rows, no error (silent scoping) |

## Concurrency — scope of the proof

Gate 9 issues six genuinely concurrent writes over independent HTTP/PostgREST
connections, so they land on distinct database backends. What is proven: exactly
one canonical match, exactly one observation row per source, no duplicated
roster, no orphan `match_sources`.

NOT PROVEN (environment limit): backend-PID-level introspection of the six
sessions. `dblink` is unusable here (`2F003: password or GSSAPI delegated
credentials required`) and no privileged introspection RPC exists. The serial
guarantees rest on the transaction-scoped advisory lock inside
`persist_canonical_observation*` plus the unique constraint on
`match_sources(source, external_match_id)`.

## Security posture (verified in the live database)

| Routine | SECURITY DEFINER | search_path | EXECUTE |
|---|---|---|---|
| `persist_canonical_observation` | yes | `""` | `postgres`, `service_role` |
| `persist_canonical_observation_attached` | yes | `""` | `postgres`, `service_role` |
| `persist_canonical_series_observation` | yes | `""` | `postgres`, `service_role` |
| `canonical_attach_source` | yes | `""` | `postgres`, `service_role` |
| `owns_canonical_match` / `owns_canonical_series` | yes | `""` | + `authenticated` (required by the RLS policies) |
| `canonical_source_priority` | no | `""` | + `authenticated` |

Canonical tables: read only for the owner (participation, or
`match_series.discovered_by_player_id`); no anonymous access; no application
write path.

## Runtime proof

Headless Chromium against the running app:

- Visitor: `/` → `/login`, `/login`, `/register`, `/reset-password` — zero console
  errors, zero warnings, zero hydration errors.
- Signed-in player: `/dashboard`, `/matches`, `/profile`, `/upload`, `/training`
  render; `/admin` correctly redirects a non-admin to `/dashboard`.
- One transient dev-only React warning ("state update on a component that hasn't
  mounted yet") appeared once while navigating six routes back-to-back and did not
  reproduce on isolated loads; it is a chart unmount race in the dev bundle, with
  no production effect.

## Test / build status

- `bunx vitest run` — 490/490 passing (includes `src/lib/canonical/__tests__/temporal-and-ambiguity.test.ts`)
- `bunx tsgo --noEmit` — clean
- `bunx eslint .` — 0 errors (8 `react-refresh/only-export-components` warnings, pre-existing)
- build — OK

## Verdict

**FASE 2.6.11.4 CLOSED — READY FOR PHASE 2.7**
