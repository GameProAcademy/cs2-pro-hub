# CS2 PRO Hub — release closure report

Living engineering record (one row per defect, updated after every phase). States: `PASS`, `FAIL`, `BLOCKED`, `NOT_PROVEN`. Evidence is linked by SHA, run ID, deployment ID or query time; nothing here is a release approval by itself.

## Phase A — reconnaissance (2026-10-18, 04:05–04:15Z)

| Item | Observed | Source |
|---|---|---|
| `main` | `7b88f68c1797f8a81cacb9b00c140a49a52df978` | `git fetch` |
| PR #151 | open, head `bec14cd1645607f88725863aa302843c750b76be`, base `7b88f68c`, mergeable clean | GitHub API |
| Quality Gates 39094173514 / Queue Semantics 39094173522 | `success`, `head_sha` = `bec14cd1` (exact PR head); 7/7 PR checks green | GitHub API |
| R5.8.3 39041686075 (attempt 3) | `failure` on `7b88f68c` | GitHub API |
| R5.8.4 39093401587 | `failure` on `7b88f68c` (`EXPECTED_ONE_R583_ARTIFACT_GOT_3`) | GitHub API |
| H.3-E 39043542007 (attempt 3) | `failure` on `7b88f68c` | GitHub API |
| PRs #137, #138 (Admission V3) | merged 2026-10-14 / 2026-10-15 | GitHub API |
| PRs #139, #140 (identity-RPC order) | closed unmerged — the historical HTTP 400 must be re-verified | GitHub API |
| PR #148 | open, `dirty`; superseded by #147/#150 on main | GitHub API |
| Worker tree | `bee23155…` identical at `eaaa2c8d`, `7b88f68c` and `bec14cd1`; 5 critical blobs equal the pins | `git rev-parse` |
| Lovable project | `91478977-16c3-4839-ae28-6796024bcfc9`, latest synced commit `7b88f68c` | Lovable API |

## Defects

| # | Defect | Root cause | Fix | Regression evidence | State |
|---|---|---|---|---|---|
| D1 | Worker `/version` `declared_revision_matches=false` (R5.8.3 BLOCKED, H.3-E `DECLARED_REVISION_MISMATCH`) | Railway `PARSER_BUILD_REVISION` held the semantic revision `git:c2e045b0…`; `settings.py` takes `build_revision` only from that variable | Variable set to `git:eaaa2c8d…` (skipDeploys) + redeploy of `ce9b760d` image → deployment `ece1c582` | Both hosts after the change: `build_revision=git:eaaa2c8d…`, `build.commit=eaaa2c8d…`, `declared_revision_matches=true`, `/health ok` (04:17Z) | Runtime `PASS`; R5.8.3 `NOT_PROVEN` until a fresh run |
| D2 | Attestation pins name the replaced deployment `ce9b760d` | D1's redeploy necessarily created deployment `ece1c582` | R5.8.13 forward-only migration + spec/rollback + repository pins (in PR #151) | `test_r5_8_13_committed_artifacts.py` (generator targets, forward-only, fail-closed), probes: idempotence, unknown/mixed pins rejected | `NOT_PROVEN` (CI pending) |
| D3 | App parser lock optional in production (`PARSER_LOCK_NOT_REQUIRED`) | `adapter.ts` detected production with `NODE_ENV`, absent from the published bundle | PR #152: lock mandatory unless `NODE_ENV` is `test`/`development` | 2 tests fail on the old code, pass on the new | `NOT_PROVEN` (CI pending, not published) |
| D4 | Managed DB behind the repository (`SNAPSHOT_FROM_UNEXPECTED_DATABASE_STATE`) | Migrations `20261016100000`, `20261016100100`, `20261016140000`, `20261017180000` never applied; functions at R5.8.10 targets | Apply in order with R5.8.13 after merge | Read-only state 04:13Z | `BLOCKED` |
| D5 | App env overrides `DEMO_PARSER_EXPECTED_REVISION` / `_BUILD_REVISION` = `git:60099ed3…` (stale) | Lovable secrets set for an older worker | Owner sets `git:c2e045b0…` / `git:eaaa2c8d…` in Lovable → Cloud → Secrets | Published `parserLock.*Source = env` | `BLOCKED` (owner action) |
| D6 | R5.8.4 `EXPECTED_ONE_R583_ARTIFACT_GOT_3` | Same-name artifacts from three attempts | Attempt-aware selection in PR #151 | PR #151 tests; needs a full run | `NOT_PROVEN` |
| D7 | `record_demo_identity_event` HTTP 400 after Canonical (job stuck in `processing`) | To re-verify: PRs #139/#140 closed unmerged; migration `20261015040000` applied | — | — | `NOT_PROVEN` |

## 2026-10-23/27 — R5.8.17 release and real-demo end-to-end (evidence)

Status legend: PASS = proven by the cited evidence; FAIL = disproven; NOT PROVEN = no sufficient evidence.

| Item | Status | Evidence |
| --- | --- | --- |
| D24 parser-upgrade reprocess is a new attempt (PR #183) | PASS | migration `20261023080000` (prosrc `09c15ade`); probe 11/11 on CI |
| D24b abandoned reservation not a conflict (PR #187) | PASS | migration `20261023110000` (`09c15ade`→`69dd480b`); Mirage attempt 8 created after the jobless attempt-6 reservation |
| D25 bomb stream absent from inventory = zero (PR #184) | PASS | Dust2 attempt 4 BLOCKED (`round_bomb_defused_flag_unknown`); attempt 5 (job `83a539c1`) admission LIMITED, `blocked_reasons` empty, 17/17 rounds `bomb_defused` non-null |
| R5.8.17 runtime repin (PR #185) | PASS | Railway deployment `02e64c36` (one controlled deploy of `2aa2a497`); recorder `4b097303`, assertion `eb5c01dd`; VERIFIED attestation run 39927982316 (2026-10-23 08:54:31Z) |
| D26 verified lineage through a later attempt (PR #186) | PASS | snapshot v5 (`324ce112`); managed snapshot: 2/2 eligible matches, 2/2 metrics, 2/2 features with verified lineage; activation gate `managed_snapshot=PASS` (run 40436657640) |
| D27 trades unknown without team identity (PR #188) | PASS | Dust2 re-run (dispatch 3): `trade_kills`/`trade_deaths`/`kast` NULL (were 0/0/87.5 while events hold 1 trade kill, 2 traded deaths) |
| D28 Canonical persistence statement timeout (PR #189) | PASS | Mirage attempt 7 failed 3x with statement timeout (8s); after D28 (`statement_timeout=60s`, body `de9bfc8c` unchanged) attempt 8 (job `221f7e42`) persisted at 2026-10-27 02:02Z |
| Dust2 real extraction: parse, RAW, persistence, no duplicate | PASS | job `83a539c1`: parser `git:2aa2a497…`; RAW ready/approved (83 chunks, 2 128 990 rows); 1 match for the sha; 3 446/3 446 events timed |
| Mirage real extraction: parse, RAW, persistence, no duplicate | PASS | job `221f7e42`: parser `git:2aa2a497…`; RAW ready/approved (100 chunks, 2 582 139 rows); same match `95186f3f`; 4 264/4 264 events timed |
| Opening duels | PASS (Dust2, Mirage) | recomputed from persisted kills = stored metrics. Dust2: first kills 2 / first deaths 0. Mirage (attempt 8, re-run after the player selection 2026-10-27 03:32Z): first kills 2 / first deaths 1 (3 attempts); kills 13, deaths 13, assists 8, HS 7/13 = 53.8% also equal |
| Trades | NOT PROVEN on R5.8.17; superseded by D29/R5.8.18 below | participants' team is NULL in every match and per-round sides were missing for most players (`round_players.side`); a real extraction needs per-round team evidence from the parser (new parser release). Correction 2026-10-27: the earlier wording also cited `match_rounds.player_side`, which is a legacy column not written by design (D31) and is not evidence |
| Activation gate | PASS | target `b2208ba3`, run 40443484096 [observed: per-stage decision in the gate's check-run annotation, re-read 2026-10-27]: every stage PASS (quality_gates, f553_post_completion, runtime, parser_lock, bridge_identity, transport, persistence, managed_snapshot, predem_matrix, R5.8.3, R5.8.4). On `5fa78807` F553 had refused a re-run (attempt 2) of a Quality Gates run whose first attempt failed its self-test step (cause not observable from the session) |
| Canonical | NOT STARTED | requires separate explicit approval |

Production incident: the Lovable Cloud database was unreachable from 2026-10-24 11:39Z to 2026-10-27 ~01:45Z (worker `queue poll failed type=HTTPStatusError` every ~5 s; `query_database` refused). Cause not observable from this session; no job or row was changed during the outage.

## 2026-10-27 — D29 / R5.8.18: per-round team identity, trades, KAST and clutch (evidence)

Root cause (D29): the general tick sample is capped (`TICK_SAMPLE_LIMIT` = 4096 rows) and thinned across every event tick, so a round's start tick kept 1–2 players and per-round sides were unknown. Fix: a dedicated `team_num` read at each round's start tick (`_parse_round_sides`, conflicts and spectators dropped, `round_sides_unavailable` warning on error); `metrics.ts` pairs players per round (`sameTeamInRound`) and keeps trades/KAST/clutch NULL on any unknown pairing.

| Item | Status | Evidence |
| --- | --- | --- |
| D29 parser + metrics (PR #192, merge `bc421879`) | PASS | `tests/test_round_sides.py` (5), `teamIdentityPerRound.test.ts` (3); D23/D27 tests updated to remove both `sides` and `team` |
| R5.8.18 runtime repin (PR #193, main `096841c9`) | PASS | Railway deployment `13873137` (SUCCESS 04:19:25Z, commit `bc421879`, parser.py blob `ff3ee9f6`); recorder `d933b9e7`; VERIFIED attestation run 40452174861 (04:53:15Z); owner-set secrets `DEMO_PARSER_EXPECTED_REVISION`/`_BUILD_REVISION` = `git:bc421879…`, `H3E91_EXPECTED_WORKER_BUILD_COMMIT` = `bc421879…` |
| Activation gate | PASS | [observed: per-stage decision in each run's check-run annotation `decision=… <stage>=<status>`; the evidence artifact itself could not be downloaded from the session] run 40453858841 (workflow_run) and run 40461802445 (dispatch, 06:33Z, after the attempt-9 authorization and both regressions), target `096841c9`: decision=PASS, every stage PASS. After PR #194, target `58936820`: run 40467596606 decision=PASS, every stage PASS. The earlier run 40467234829 on the same commit was BLOCKED (quality_gates, f553_post_completion, predem_matrix BLOCKED; main_required_gates SKIPPED) because Queue Semantics Probe triggered it while Quality Gates was still running; nothing was re-run |
| Mirage attempt 9 authorization | PASS | owner decision in chat; `h3e_attempt_authorizations` row for job `8eaf0105` / upload `6947cb4e` / sha `1d98f8b6…` recorded 05:59:20Z; snapshot: 6/6 attempts ≥ 9 authorized, 0 rows not matching their job |
| Dust2 attempt 6 (job `650b87de`): parse, RAW, persistence, no duplicate | PASS | parser `git:bc421879…`; RAW ready/approved; 1 match for the sha (`747c7a6b`, same match); 3 446/3 446 events timed; admission LIMITED (score/result excluded, as before) |
| Mirage attempt 9 (job `8eaf0105`): parse, RAW, persistence, no duplicate | PASS | parser `git:bc421879…`; RAW ready/approved; 1 match for the sha (`95186f3f`, same match); 4 264/4 264 events timed; admission LIMITED |
| Per-round sides | PASS | [reproduced] `round_players.side`: Dust2 17/17 rounds with exactly 5 CT + 5 T (170/170 rows); Mirage 23/23 (230/230); 0 kill events with an unknown side on either demo |
| Trades | PASS (Dust2, Mirage): consistent with the persisted round set; Dust2 see D30 | [reproduced] independent SQL recompute from persisted kills + per-round sides (5 s window) = stored metrics. Dust2: trade kills 1, traded deaths 2. Mirage: trade kills 0, traded deaths 2 |
| KAST | PASS (Dust2, Mirage): consistent with the persisted round set; Dust2 see D30 | [reproduced] recompute = stored. Dust2 94.1 (16/17 rounds). Mirage 69.6 (16/23) |
| Clutch | PASS (Dust2, Mirage): consistent with the persisted round set; Dust2 see D30 | [reproduced] recompute = stored. Dust2 1 attempt / 0 wins (round 14, CT, died, T won). Mirage 2 / 1 (round 1 lost; round 14 survived, CT won) |
| Lineage | PASS | [reproduced] managed snapshot 06:33Z: 2/2 eligible matches, 2/2 metrics, 2/2 features with verified lineage; 0 conflicting executions |
| User isolation | PASS | [reproduced] as `authenticated` with a random `sub`: 0 matches, metrics, events, round rows, jobs, RAW artifacts for both demos; as the owner: 2 matches, 2 metrics rows, 7 710 events, 400 round rows, 2 jobs |
| `match_rounds.player_side` (legacy, D31) | PASS (not a defect) | [reproduced] legacy pre-canonical single-player column, intentionally not written since 2026-09-08 (`6f75024a`); the canonical writer omits it; no reader. The per-player per-round side is `round_players.side` (170/170, 230/230). See `docs/MATCH_ROUNDS_LEGACY_PLAYER_COLUMNS.md`; guarded by `legacyRoundPlayerColumns.test.ts` |
| Canonical | NOT STARTED | requires separate explicit approval |

### Evidence basis (added 2026-10-27)

- **[reproduced]**: the check was re-executed from this session against production (read-only SQL) or the repository, and the result is quoted.
- **[observed]**: read from an annotation or artifact produced by the workflow itself, not re-executed.
- **[inferred]**: concluded from an aggregate result (for example a job conclusion) without per-item output.

No row of the R5.8.18 section remains [inferred]: the activation gate rows were upgraded from the job conclusion to the per-stage annotations. Earlier sections were not re-labelled, except the R5.8.17 activation gate row.

### D30: Dust2 round 1 is not a regulation round (fixed, R5.8.19)

| Item | Status | Evidence |
| --- | --- | --- |
| Finding (before the fix) | FAIL (historical) | [reproduced] Dust2 round 1 (ticks 1–2795): 7 kills, all knives, within 99 ticks; all 10 players switch side between rounds 1–2 and 13–14, against 12–13 on Mirage. 17 rounds persisted where the regulation rounds are 16; the target's round-1 kill and assist counted |
| Root cause | PASS (identified) | [reproduced] `_parse_round_state_transitions` counted every +1 of `total_rounds_played` as a round end and ignored the game resetting the counter. On the exact production DEM: counter 0→1 at tick 2795 (knife round end), back to 0 at tick 3145, `begin_new_match` at 3499 |
| Fix (PR #196, merge `47ed6454`) | PASS | rounds ended before a game round-counter reset are voided when the match goes on after it (counter observed from game state; `begin_new_match` for event-based demos); no rule on round numbers, kill counts or weapons; RAW event tables untouched; voided rounds recorded in a warning carried by the RAW manifest. `tests/test_match_reset_rounds.py`: 9 unit tests + 2 real-DEM tests |
| Local verification on the exact production DEMs | PASS | [reproduced] DEMs staged from the owner's computer, sha256 equal to production. Mirage output identical to the previous parser. Dust2 = previous output minus round 1, renumbered: 16 rounds, halftime switch before round 13; identical RAW event rows (25 458), header, players and gates |
| R5.8.19 release | PASS | [observed] ONE controlled Railway deployment `7179fcce` of `47ed6454` under the watch-pattern freeze (queue idle before the deploy); repin PR #197 (merge `4d2b7143`); migration `20261027100000` applied with md5 guards (recorder `d933b9e7`→`7f78aec6`, assertion `090e73dc`→`bb393072`, workflow guard `f74d8af9` unchanged); app published before the attestation; VERIFIED attestation run 40540697035 (16:25:19Z) |
| Activation gate | PASS | [observed: per-stage check-run annotation] run 40550871360, target `4d2b7143`: decision=PASS, all 17 stages PASS. Earlier runs on the same commit: 40540817450 (started while Quality Gates was running, BLOCKED); 40544942950 FAIL (`queue_semantics`: the recovery job failed at "Start local disposable services" after 36 s, cause not observable from the session; the same job passed on the identical tree `82c6b6a9` of PR head `28142854`); after a failed-jobs-only re-run, 40547381689 BLOCKED (`persistence`: QUEUE_PROBE_MISSING, because GitHub copied the already-passed semantics job into attempt 2 without re-executing it, so it carried no probe annotations); the Queue Semantics workflow was then re-run in full (attempt 3, both jobs executed) and 40550871360 passed. Quality Gates was never re-run; no gate rule changed |
| Dust2 attempt 7 (job `79666c37`) | PASS | [reproduced] parser `git:47ed6454`; RAW ready/approved (83 chunks; 2 128 989 rows = attempt 6 minus the one voided contract round; RAW event rows unchanged); 1 match for the sha (`747c7a6b`, same match); 16 rounds (`matches.round_count` 16), first start tick 3498; 0 knife kills; 3 414/3 414 events timed (32 fewer than attempt 6 = the knife round); 16/16 rounds with 5 CT + 5 T; target sides 1–12 T, 13–16 CT; halftime switch before round 13 |
| Dust2 metrics after D30 | PASS | [reproduced] independent SQL recompute from persisted events and per-round sides = stored: kills 13, deaths 7, assists 4, HS 69.2 %, rounds played 16, KAST 93.8 (15/16), trade kills 1 (round 6), traded deaths 2 (rounds 4, 15), clutch 1 attempt / 0 wins (round 13, CT, died, T won), first kills 2 / first deaths 0, multi-kill rounds 3, ADR 102.4 |
| Attempts and RAW traceability | PASS | [reproduced] attempts 1–7 all kept; 5 → 6 → 7 linked by `superseded_by_job_id`; RAW artifacts of attempts 5, 6 and 7 all ready/approved |
| Lineage | PASS | [reproduced] managed snapshot: 2/2 eligible matches, 2/2 metrics, 2/2 features with verified lineage; 0 conflicting executions |
| User isolation | PASS | [reproduced] random `authenticated` sub: 0 matches, metrics, events, round rows, jobs, RAW artifacts for Dust2; owner: 1 match, 1 metrics row, 3 414 events, 160 round rows, 1 job |
| Mirage | PASS (unaffected) | [reproduced] local output identical under the new parser; production metrics unchanged (23 rounds, KAST 69.6, trades 0/2, clutch 2/1); not reprocessed (would be attempt 10 and need a new authorization) |
| Canonical | NOT STARTED | requires separate explicit approval |
