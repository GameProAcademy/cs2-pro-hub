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
| Opening duels | PASS (Dust2) / NOT PROVEN (Mirage) | Dust2 first kills 2 / first deaths 0 = recomputed from persisted kills; Mirage metrics await the player selection on attempt 8 |
| Trades | NOT PROVEN | participants' team is NULL in every match (`player_side` NULL in every round); a real extraction needs per-round team evidence from the parser (new parser release) |
| Activation gate | NOT PROVEN | target `5fa78807`: every stage PASS except `f553_post_completion` — the first Quality Gates attempt failed its self-test step (unexplained, logs unreadable from the session; passes locally 68/68) and the re-run made attempt 2, which F553 refuses by design (`R11_PROVENANCE_WORKFLOW_RUN_ATTEMPT`) |
| Canonical | NOT STARTED | requires separate explicit approval |

Production incident: the Lovable Cloud database was unreachable from 2026-10-24 11:39Z to 2026-10-27 ~01:45Z (worker `queue poll failed type=HTTPStatusError` every ~5 s; `query_database` refused). Cause not observable from this session; no job or row was changed during the outage.
