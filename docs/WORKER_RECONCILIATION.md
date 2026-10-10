# Worker reconciliation: what runs, what CI tests, and how to converge

Read-only analysis. Nothing in Railway, the managed database or the deployed
branch was changed. Every step of the plan needs the owner's authorization.

## 1. What runs in production (Railway, read on 2026-10-10)

| Item                        | Value                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project / service           | `CS2 Pro Parser Worker` / `cs2-demo-parser`, environment `production`                                                                                                                                                                                                                                                                                                    |
| Source                      | `GameProAcademy/cs2-pro-hub`, branch `infra/cs2-parser-worker-v8`, root `services/cs2-demo-parser`                                                                                                                                                                                                                                                                       |
| Active deployment           | `1b5778de`, status `SUCCESS`, commit `91aeee853200d0f461d0d36af1781d7fdfa40941`, created 2026-10-05                                                                                                                                                                                                                                                                      |
| Later commits on the branch | `bccf488`, `b957557`: deployments `SKIPPED` (they do not touch the watched path)                                                                                                                                                                                                                                                                                         |
| Builder / start command     | `DOCKERFILE` / `python worker_main.py` (overrides the Dockerfile `CMD`)                                                                                                                                                                                                                                                                                                  |
| Limits                      | 4 vCPU, 4,000,000,000 bytes of memory, 1 replica (`sfo`), restart policy `ALWAYS`                                                                                                                                                                                                                                                                                        |
| Health check                | `/health`, 30 s                                                                                                                                                                                                                                                                                                                                                          |
| Wait for CI                 | `checkSuites: false`                                                                                                                                                                                                                                                                                                                                                     |
| Staged patch                | `d66b5a12-a69e-4b9a-87b6-314f75c471cc`, one change: `deploy` added as `{}`; staged since 2026-09-16, not applied                                                                                                                                                                                                                                                         |
| Variable names              | `PARSER_REVISION`, `PARSER_BUILD_REVISION`, `PARSER_CONTRACT_VERSION`, `PARSE_TIMEOUT_SECONDS`, `MAX_DEMO_BYTES`, `MAX_DEMO_SIZE_BYTES`, `MAX_PAYLOAD_BYTES`, `MAX_RESPONSE_BYTES`, `DOWNLOAD_TIMEOUT_SECONDS`, `DEMO_PIPELINE_BRIDGE_URL`, `DEMO_PIPELINE_BRIDGE_SECRET`, `DEMO_PARSER_TOKEN`, `PARSER_TOKEN`, `ENVIRONMENT`, `GATE_1E1_DEPLOY_NONCE` (values not read) |

Not read, on purpose: variable values. So the revision the worker reports
(`PARSER_REVISION` / `PARSER_BUILD_REVISION`) is not confirmed.

## 2. Three trees

`docs/worker-tree-manifest.json` (generated by
`scripts/reconciliation/worker_tree_manifest.py`, git blob ids only) compares
`services/cs2-demo-parser` at:

| Name           | Commit    | Role                                                                      |
| -------------- | --------- | ------------------------------------------------------------------------- |
| `main`         | `c433fcc` | what Quality Gates and R11.2 test                                         |
| `deployed`     | `91aeee8` | what Railway built                                                        |
| `contract_pin` | `5703b1d` | the revision the app accepts (`src/lib/pipeline/parser/adapter.ts:55-56`) |

History: `main` shares no commit with the other two (956 vs 1,140 and 1,120
exclusive commits). `deployed` is 20 commits ahead of `contract_pin`.

Files: 25 identical in all three, 12 differ, 9 only in `main`, 3 only in
`deployed` and `contract_pin`, 2 only in `main` and `deployed`.

## 3. Behaviour differences that matter

| Area                     | `main`                                                                               | `deployed` (`91aeee8`)                                                                              | `contract_pin` (`5703b1d`)  |
| ------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------- |
| Parse isolation          | in-process thread (`app.py:118-120`)                                                 | child process via `worker_main.py` → `parser_isolated.py`                                           | same files, older versions  |
| Child exit / signals     | not applicable                                                                       | any non-zero exit → `PARSER_ERROR`; signal only logged (`parser_isolated.py:83-93`); no `setrlimit` | same                        |
| Timeout                  | `asyncio.wait_for` on a thread that cannot be interrupted                            | `subprocess.run(timeout=…)` kills the child                                                         | same                        |
| Grenades                 | `parse_grenades()` (all grenade rows)                                                | `parse_grenades(grenades=False)` (`parser_child.py:125`)                                            | not present in that version |
| Tick query               | unbounded request for the sampled ticks                                              | capped by `TICK_QUERY_LIMIT`, default 128 (`parser_child.py:46`)                                    | —                           |
| Capability catalog       | `CATALOG_VERSION = 3`                                                                | `CATALOG_VERSION = 3`                                                                               | `CATALOG_VERSION = 2`       |
| Execution ledger (H3E91) | intent / started / terminal recorded; replay goes to `reconcile` (`worker.py:73-98`) | absent                                                                                              | absent                      |
| HTTP surface             | FastAPI `app.py`, including `/v1/parse`                                              | under `python worker_main.py`: only `/health`, `/version`, `/v1/runtime/preflight`                  | same                        |
| Token comparison         | `hmac.compare_digest` (`app.py:229`)                                                 | `!=` (`app.py:221`, `worker_main.py:46-47`)                                                         | `!=`                        |
| Image contents           | explicit module allowlist                                                            | `COPY . .` (tests and docs included)                                                                | `COPY . .`                  |
| Build identity           | reported from env, not from git (`settings.py:136-137`)                              | same                                                                                                | same                        |

Consequences:

1. Quality Gates and R11.2 on `main` say nothing about the deployed worker.
2. `main` cannot be deployed as the worker without losing isolation: the three
   isolation files are absent and the image allowlist would reject them.
3. The app accepts revision `5703b1d`, the build is `91aeee8`, and the two
   differ in catalog version. If the env vars say `5703b1d`, artifacts are
   stamped with a revision that did not produce them (hypothesis: values unread).
4. The deployed worker already narrows grenade output to projectiles. That is a
   third definition of "grenades", next to the Python reference and WASM.
5. No test in any tree imports `parser_isolated`, `parser_child` or `worker_main`.

## 4. Plan

Each stage is a separate, reviewable change. None is started.

| #   | Stage                                                                                                                                                                                        | Depends on                                                                | Touches production?                                                                              | Acceptance                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | Record the reported revision: read `/version` of the live worker (or the two env values) and write them into the attestation                                                                 | owner reads or authorizes the read                                        | no                                                                                               | the reported revision and the built commit are both on record; mismatch is stated, not inferred    |
| 2   | Tests for the isolation boundary, written against the deployed files in a PR to the deployed branch: child killed by SIGKILL / SIGSEGV, timeout, typed errors, result-file corruption        | —                                                                         | **merging deploys** (watch path) unless the owner pauses deploys or merges with "Wait for CI" on | tests fail on a deliberately broken boundary and pass on the current one                           |
| 3   | Bring isolation to `main`: add `worker_main.py`, `parser_child.py`, `parser_isolated.py` and wire `classify_child_exit`; extend the image allowlist in the Dockerfile and both CI assertions | #74 (failure classes), stage 2 tests                                      | no                                                                                               | R11.2 green; image-contents assertion updated in the same PR; new tests cover the child path       |
| 4   | Decide the grenade definition for production (`grenades=False` or all grenade rows) and make reference, WASM and worker agree, or document the difference in the output contract             | #75 decision                                                              | no                                                                                               | one written definition; the parity contract and the worker cite it                                 |
| 5   | Decide where H3E91 lives: port it to the deployed line, or accept that the deployed worker is outside the ledger                                                                             | owner decision; #78 if the redelivery bound is wanted first               | no                                                                                               | the ledger either covers the deployed surface or the report says it does not                       |
| 6   | Make build identity real: bake the git SHA into the image at build time, separate from the contract revision                                                                                 | stage 1                                                                   | no (code)                                                                                        | `/version` shows both; the app checks the contract revision, the attestation records the build SHA |
| 7   | Turn on "Wait for CI" for the service                                                                                                                                                        | the deployed branch must have a workflow on `push` that covers the worker | **yes (setting)**                                                                                | a failing workflow skips the deployment; verified on a throwaway commit                            |
| 8   | Choose one deploy branch and retire the other lines                                                                                                                                          | stages 3–6                                                                | **yes (source branch)**                                                                          | the deployed commit is an ancestor of the branch CI gates                                          |
| 9   | Resolve the staged patch `d66b5a12` (apply or discard)                                                                                                                                       | owner                                                                     | **yes**                                                                                          | no staged change left unexplained                                                                  |

Stage 2 is the first that can change what runs: a merge to
`infra/cs2-parser-worker-v8` under `services/cs2-demo-parser/**` triggers a
deployment immediately, because `checkSuites` is `false`.

## 5. Not determinable from here

- Values of `PARSER_REVISION`, `PARSER_BUILD_REVISION`, `PARSE_TIMEOUT_SECONDS`, `TICK_QUERY_LIMIT` (the last one is not even in the variable list, so the default 128 applies).
- Which process the kernel kills when the 4 GB limit is hit, and how often it happens.
- Whether the stale-job cron is scheduled.
- What the app deployment runs and which worker revision it expects at runtime.
