# FASE 2.6.11.5 — FINAL FACEIT PRODUCTION PIPELINE E2E CLOSURE

Status: **FASE 2.6.11.5 CLOSED — READY FOR PHASE 2.7**

Classification vocabulary: `PASS` / `FAIL` / `BLOCKED` / `NOT_PROVEN`.
`BLOCKED` and `NOT_PROVEN` are **never** reported as `PASS`.

Evidence artefact (re-runnable): `bun scripts/faceit-pipeline-proof.ts`
Runtime evidence scripts: `/tmp/browser/rt2/signedout.py`, `/tmp/browser/rt2/authed.py`

---

## 1. Audit — what was actually missing at the start of this phase

1. The cross-source closure evidence in the repository was a **mock** proof
   (`fakeDb`) whose file name claimed to be "the production proof". Component
   behaviour was proven; the real database and the real production entry point
   were not.
2. The production entry point (`persistFaceitObservation`) had never been
   exercised end-to-end against the real database with real Identity Graph rows.
3. The admin area raised `ADMIN_FORBIDDEN` / `Unauthorized: No authorization
   header provided` in the browser for users who were simply **not signed in**.
4. Two client-side navigation faults remained: a hydration mismatch when
   `/admin` was opened directly while signed out, and a React
   "state update on a component that hasn't mounted yet" from the authenticated
   gate's effect-based redirect.

## 2. Root cause

| Fault | Root cause |
| --- | --- |
| `Unauthorized: No authorization header provided` | The admin gate called an authenticated server function before knowing whether a browser session existed at all. With no session there is no bearer token, so `requireSupabaseAuth` correctly answered `Unauthorized` — an authentication answer surfaced as an application error. |
| `ADMIN_FORBIDDEN` surfacing as an error | A legitimate authorisation denial for a non-admin was propagated as a thrown error instead of a decided outcome. |
| Hydration mismatch on `/admin` | `beforeLoad` threw `redirect()` while React was still hydrating the server markup, so the rendered route changed mid-hydration. |
| "state update on a component that hasn't mounted yet" | The authenticated gate navigated from an effect (double `requestAnimationFrame`), which can fire after the router already unmounted the match. |

## 3. Changes made in this phase

Production code (surgical):

- `src/routes/_authenticated/route.tsx` — the gate still **decides**
  fail-closed in `beforeLoad` (session + `status = active`, otherwise sign-out),
  but now **navigates declaratively** with `<Navigate to="/login" replace />`.
  No effect-based navigation, no redirect thrown during hydration.
- `src/routes/_authenticated/admin/route.tsx` — authorisation is resolved into
  an explicit gate (`ok` | `signin` | `forbidden`) and navigated declaratively.
  A missing browser session is answered locally (no tokenless server call);
  authorisation itself is still decided **server-side** by `getAdminSession()`;
  an undetermined backend answer still renders the controlled
  `ADMIN_UNAVAILABLE` error screen. Fail-closed is preserved: children render
  only on `gate === "ok"`.

Evidence code:

- `scripts/faceit-pipeline-proof.ts` — 19 gates against the **real database**
  through the **real production path**, with real Identity Graph rows, real
  accounts, and full cleanup in `finally`.
- `src/lib/canonical/__tests__/production-cross-source-identity-closure.test.ts`
  renamed to `unit-mock-cross-source-identity-closure.test.ts`, with its header
  and `describe` corrected to state plainly that it is a **unit/mock** proof and
  to point at the real E2E proof. No test assertion was weakened.

No schema change, no migration, no change to Auth, Steam Identity, Gamers Club,
FACEIT hardening, Profile, Identity Graph or the Canonical Match Engine.

## 4. Production flow proven

```
FACEIT payload (no SteamID64 anywhere in it)
  -> faceitParticipants()            roster extraction (FACEIT ids only)
  -> resolveFaceitIdentities()       Identity Graph: FACEIT id -> profile -> SteamID64
  -> discoverCanonicalCandidates()   candidates via match_participants.steam_id64 + time window
  -> resolveAgainstAll()             deterministic resolution + ambiguity detection
  -> canConvergeCrossSource()        EXACT_MATCH only, never under review
  -> persistFaceitObservation()      RPC persist_canonical_observation_attached (single transaction)
```

## 5. Gate-by-gate evidence (real database, run `35020fe0` and successor)

| Gate | Result | Evidence |
| --- | --- | --- |
| 01 Identity Graph fixtures | PASS | 20 real accounts, 20 FACEIT + 20 STEAM identities; no SteamID64 in any FACEIT payload |
| 02 roster extraction | PASS | 10 FACEIT participants, 0 SteamIDs present in the payload |
| 03 identity resolution | PASS | `RESOLVED`, 10/10 via the graph only |
| 04 demo observation | PASS | canonical match created, player-neutral |
| 05 production convergence | PASS | `EXACT_MATCH`, confidence 1, attached to the demo match |
| 06 no fingerprint / no shared id | PASS | FACEIT fingerprint `null`, external ids not shared |
| 07 temporal anchor | PASS | `started_at` anchors; `finished_at`/`match_date` (end) do not |
| 08 single canonical truth | PASS | 1 match, 2 sources (`demo`,`faceit`), 10 unique participants |
| 09 no invented identity | PASS | every participant traced to an Identity Graph row |
| 10 idempotency | PASS | replay created 0, still 1 match / 2 sources / 10 participants |
| 11 concurrency (request level) | PASS | 6 simultaneous production calls → 1 match, 2 sources |
| 11b independent backend PIDs | NOT_PROVEN | the sandbox cannot inspect PostgreSQL backend PIDs; safety rests on the in-transaction advisory lock plus the unique constraint on `match_sources(source, external_match_id)` |
| 12 negative convergence | PASS | similar-but-different → `PROBABLE_MATCH`, not attached, separate match |
| 13 unresolvable identity | PASS | `IDENTITY_UNRESOLVED` → `NO_MATCH`, nothing invented |
| 14 query error ≠ absence | PASS | `IDENTITY_RESOLUTION_ERROR: permission denied for table player_identities` |
| 15 ambiguity | PASS | two EXACT candidates → `CONFLICT`, no arbitrary attach |
| 16 atomic rollback | PASS | `CANONICAL_ATTACH_TARGET_NOT_FOUND`, 0 leftover sources |
| 17 player-neutral discovery | PASS | the attached target had `player_id = NULL` when it was discovered, while the FACEIT observation was collected **for** a player |
| 18 cleanup | PASS | 0 matches, 0 sources, 0 identities left behind |

Totals: **PASS = 18, FAIL = 0, BLOCKED = 0, NOT_PROVEN = 1 (gate 11b)**.

### Documented observation (not a gate)

After a successful attach, `matches.player_id` holds the collecting player.
That column is a **per-player projection**, not an identity or discovery signal:
candidate discovery keys on `match_participants.steam_id64` plus the temporal
window (gate 17 proves the target was found while its `player_id` was `NULL`).
An earlier draft of gate 17 asserted the stronger claim "no canonical match ever
carries an owner", which the architecture does not promise; the gate was
corrected rather than the production behaviour.

## 6. Security posture

- Canonical persistence routines are `SECURITY DEFINER` with
  `search_path = ''`, executable only by `postgres` / `service_role`.
- `matches` / `match_sources` / `match_series` reads are owner-scoped; `anon`
  has no access; the application never writes them directly.
- Database linter: 14 informational/warning findings, all pre-existing and
  intentional — 4 "RLS enabled, no policy" on server-role-only tables (zero
  access is the intent) and 10 `SECURITY DEFINER` helpers callable by signed-in
  users because RLS policies themselves call them (`has_role`, `owns_*`).
- No credential, token, state or verifier is logged by any code touched here.

## 7. Runtime proof (real browser, `http://localhost:8080`)

Signed out — `/`, `/login`, `/register`, `/reset-password` render; `/dashboard`
and `/admin` land on `/login`. **Zero** console errors and **zero** page errors,
including the previously failing direct `/admin` load.

Signed in as a non-admin player (`thg`) — `/dashboard`, `/matches`, `/profile`,
`/upload`, `/training` all render the authenticated shell; `/admin` correctly
lands on `/dashboard`. **Zero** console errors, **zero** page errors, no
`ADMIN_FORBIDDEN`, no `Unauthorized: No authorization header provided`.

## 8. Verification results

- `bunx tsgo --noEmit` — clean.
- `bunx eslint .` — 0 errors (8 pre-existing `react-refresh` warnings in shadcn
  UI files and `src/i18n/index.tsx`).
- `bunx vitest run` — **490/490 passed**, 32 files.
- Build — `build OK`.
- Real-database E2E — 18 PASS / 0 FAIL / 1 NOT_PROVEN (gate 11b).

## 9. Verdict

**FASE 2.6.11.5 CLOSED — READY FOR PHASE 2.7**

Gate 11b remains `NOT_PROVEN` and is reported as such: it is an environment
limitation of the sandbox, not a defect, and the concurrency invariant is
otherwise enforced by the in-transaction advisory lock and the unique
constraint. Nothing from Phase 2.7 was started.
