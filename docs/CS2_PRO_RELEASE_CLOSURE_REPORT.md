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
