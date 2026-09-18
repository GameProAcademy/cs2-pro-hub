# Cache G.4 — Controlled Railway parity sync audit

## 1. Scope and decision boundary

This phase prepared and validated the MAIN side of a surgical Railway synchronization. It did not deploy Railway, execute or requeue Cache, create Canonical data, modify the preserved artifact, alter Storage/database data, or change secrets.

The Railway and staging source refs were not advertised by the accessible repository remote. Therefore no source diff, patch application, or parity claim is fabricated. The result is a complete MAIN baseline and patch design with Railway-dependent gates explicitly blocked.

## 2. Frozen baselines

| Baseline | Requested ref | Observed SHA | Result |
|---|---|---|---|
| MAIN | `595e26badda495d6e4eb5be383681f4a535f7064` | `595e26badda495d6e4eb5be383681f4a535f7064` | PASS |
| Railway | `infra/cs2-parser-worker-v8` | unavailable in local/origin refs | BLOCKED |
| Staging | `infra/cs2-parser-worker-v8-parity-g4` | unavailable in local/origin refs | BLOCKED |
| Running service | read-only `/version` | semantic `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`; build `git:41550d9a4bf5ef818fc1042c75946728084563f7`; contract 1 | OBSERVED, not source parity |

`/health` returned HTTP 200 with role `durable-worker`. Runtime identity proves what is deployed, but cannot substitute for an auditable source-tree comparison.

## 3. File inventory and surgical classification

| File | MAIN SHA-256 | Railway/staging version | Classification | Required treatment | Primary risk |
|---|---|---|---|---|---|
| `parser.py` | `d251108502347401bcba346faf1bdc011054446686b8edffbd3e846dbc06a7eb` | unavailable | MUST SYNC + MERGE | Transfer current parsing/evidence logic while retaining the isolated caller contract | native memory/regression |
| `raw_evidence.py` | `6ea0da59c882e380d602eeba6a89784f5d8921ee69fea231fcecabdc4a9d1104` | unavailable | MUST SYNC | Transfer exact inventories, mappings, reasons, gates, and fail-closed statuses | silent evidence admission |
| `raw_artifact.py` | `32de80c4b571360a6d1d46e6dd41608d185c958363dd735e1fe739d465f30116` | unavailable | MUST SYNC | Transfer deterministic chunking, chain/root digest, manifest, recovery, and limits | artifact corruption |
| `hot_payload.py` | `e41c16d137cd406c9a2088e96e8bf502971fca82d66318587d0635792945ca58` | unavailable | MUST SYNC | Transfer bounded HOT, availability, overflow, provenance, AIM/position/economy, and strict JSON handling | data loss/oversize |
| `adapter.py` | `5b1c851ce893b466fceed93fa229d157e9f55397bb41598a63653939103e9d8c` | unavailable | MUST SYNC | Transfer evidence-only normalization; preserve unknowns and nullable semantics | invented analytics |
| `app.py` | `8c3f8539ff8669cf976ac3c5fad31ae90ec61b997fa0a2125fb26ae5bdae21b8` | unavailable | MUST SYNC + MERGE | Reconcile download/integrity/RAW/HOT flow with isolated parse injection | bypassing isolation |
| `settings.py` | `1b77a0eb92368dc204e91e5affda8e70b4a2613ca3f1c01110570150013c6166` | unavailable | MERGE SURGICALLY | Keep contract/limits/semantic revision validation and Railway build identity | false deployment identity |
| `worker.py` | `fcd9bc7b335bd7d885ff8a69ca145298aca6c523c2656d11f5357350013d38da` | unavailable | MERGE SURGICALLY | Preserve Railway isolation and durable lifecycle; integrate only proven completion/measurement changes | supervisor/OOM regression |
| `demo_integrity.py` | `d9013d1bac85f7ee3aab4a0e5a301909e4bd7da7aa331620e76b051391f26672` | unavailable | MUST SYNC | Preserve streaming structural validation before native parsing | truncated demo admission |
| `errors.py` | `6cbca14d2cf5abb5fef4c4c4bed3b892dd6308a4084dba667626446eba403569` | unavailable | MUST SYNC | Keep the bounded wire taxonomy and safe messages | leakage/taxonomy drift |
| `requirements.txt` | `f379b80234924ec59422aeeb703fdabeba9953149904316f08557b905b936648` | unavailable | MUST SYNC | Require exact `demoparser2==0.42.0` and compare every production dependency | runtime drift |
| `Dockerfile` | `7cd7c1ae03e4b9061aff4f84928c8890d492c861467a07a847fbd89ab0b018c9` | unavailable | MERGE SURGICALLY | Preserve Railway entrypoint/isolation while retaining non-root runtime and fail-closed identity | removing process isolation |
| `parser_isolated.py` | absent from MAIN | unavailable | MUST PRESERVE FROM RAILWAY | Never delete or reconstruct from memory | native crash reaches supervisor |
| `parser_child.py` | absent from MAIN | unavailable | MUST PRESERVE FROM RAILWAY | Preserve bounded stdout/stderr, RSS, tick/grenade guards, cleanup, and private-function integration | OOM/crash |
| `worker_main.py` | absent from MAIN | unavailable | MUST PRESERVE FROM RAILWAY | Preserve durable worker bootstrap and child supervision | worker startup/lifecycle |
| `tests/**`, `pytest.ini`, `requirements-dev.txt` | MAIN available | unavailable | TEST ONLY | Transfer parity regressions to staging validation; production image need not install test dependencies | unproved patch |

No same-name equivalence is assumed. The Railway SHA and per-file hashes remain mandatory inputs to the next controlled step.

## 4. Parser parity baseline

MAIN uses `demoparser2==0.42.0` and exposes `parse_header`, `parse_player_info`, event extraction, `_parse_ticks(demo, sample_ticks)`, and `_parse_grenades(demo)`. Tick evidence is deterministically sampled and remains `SAMPLE`; grenade rows remain separate evidence. Numeric non-finite values become `null` only at strict JSON boundaries. Unknown, absent, empty, and failed capabilities remain distinct.

The Railway child monkey patches cannot be certified compatible without its source. In particular, its calls to `_parse_ticks` and `_parse_grenades` must be compared against the MAIN signatures before staging can pass.

## 5. RAW evidence parity baseline

MAIN exposes event discovery, selected extraction, actually parsed events, returned/preserved/non-null/null-only fields, player information, usercmd capability, game-state requested/returned/preserved/sample fields, mapping inventory, tick sampling, and forensic inventory.

Accepted statuses are exactly `MAPPED`, `DERIVED`, `RAW_ONLY_INTENTIONAL`, `NOT_PRESENT_IN_DEMO`, `UNAVAILABLE`, `PARSE_FAILED`, and `UNMAPPED_BUT_AVAILABLE`. Unknown statuses, `PARSE_FAILED`, `UNMAPPED_BUT_AVAILABLE`, absent/invalid RAW-only reasons, missing inventories, or non-PASS gates block admission. There is no wildcard acceptance.

The preserved Cache artifact remains READY/RAW READY/audit BLOCKED. This audit does not reinterpret or approve it.

## 6. RAW artifact parity baseline

MAIN writes deterministic JSONL gzip with target 4 MiB and hard 8 MiB chunks, physical SHA-256, cross-section `previous_chunk_sha256`, section summaries, deterministic root digest, audit evidence/digest, immutable logical-attempt identity, READY reuse, and bounded total artifact/chunk counts. RAW remains outside HOT and `/complete` receives only HOT plus a READY reference.

## 7. HOT parity baseline

`HotDemoPayloadV1` is contract 1 and explicitly bounds players, rounds, combat, utility, objectives, AIM, position, economy, and warnings. Overflow is visible through section quality and makes the payload partial. Unclassified events remain counted. AIM, position, and economy are emitted only from observed sampled tick fields; unavailable sections remain explicitly unavailable. No RAW evidence or grenade trajectory corpus is embedded in HOT.

## 8. APP and adapter parity baseline

The APP path validates contract, file size, SHA-256, PBDEMS2 framing, HTTPS-only download, redirect denial, timeout, cleanup, parser identity, and bounded external errors. The durable path executes `prepare_evidence()`, `build_hot_payload()`, `RawArtifactWriter.write()`, and APP-owned final admission; the legacy `/v1/parse` behavior remains separate.

The adapter does not promote team slot to team identity, infer CT/T identity, invent winner/score/date, or derive timing without evidence. Unknown values remain absent rather than zero/false/empty.

## 9. Settings and build identity

MAIN supports only contract 1. Production `PARSER_REVISION` must be `git:<40 lowercase hex>` and rejects historical fallbacks. `PARSER_BUILD_REVISION`, when supplied, must also be an exact git SHA. The Railway patch must preserve `RAILWAY_GIT_COMMIT_SHA` as the source of the deployed build revision while keeping semantic and build revisions distinct.

The live service currently proves valid parser/package/contract identity. It does not prove that the unavailable branch contains the MAIN G.4 logic.

## 10. Process isolation and worker lifecycle

Process isolation is mandatory but not present in MAIN. The staging patch must retain `parser_isolated.py`, `parser_child.py`, `worker_main.py`, and the Railway `worker.py` call to `parse_demo_file_isolated`. Child timeout, crash, non-zero return, malformed output, bounded stdout/stderr, cleanup, RSS/stage logging, tick bounding, grenade safety, conversion to `WorkerError`, and supervisor survival require direct Railway-source tests.

MAIN's durable worker proves claim, logical-attempt separation, heartbeat, final lease/cancellation check, bounded completion, failure reporting, and continued queue polling. Railway-specific stale/retry/bootstrap parity remains blocked until source comparison.

MAIN intentionally invokes the parser with `asyncio.to_thread`; its timeout releases the waiter but cannot terminate a native call already running in-process. This is precisely why the Railway-only process boundary must be preserved rather than replaced by MAIN's caller. A second deployment risk is the static default worker id `railway-parser-1`: staging must prove each replica receives a unique `DEMO_PIPELINE_WORKER_ID`, because source and deployment configuration available here cannot establish that guarantee.

## 11. Dependency parity

MAIN pins FastAPI 0.115.6, Uvicorn 0.34.0, HTTPX 0.28.1, and demoparser2 0.42.0. Exact Railway dependency and image parity cannot be established without the branch and image build.

The MAIN image runs as non-root with a private temporary directory. It has no Docker `HEALTHCHECK`; current liveness depends on the platform probing `/health`. This is recorded as an operational limitation, not changed in this phase.

## 12. Security matrix

| Required proof | MAIN | Railway parity |
|---|---|---|
| Unknown RAW → BLOCK | PASS | BLOCKED |
| Missing RAW-only reason → BLOCK | PASS | BLOCKED |
| Invalid RAW-only reason → BLOCK | PASS | BLOCKED |
| Wrong audit digest → BLOCK | PASS | BLOCKED |
| Wrong artifact identity → BLOCK | PASS | BLOCKED |
| Wrong job identity → BLOCK | PASS | BLOCKED |
| Wrong upload identity → BLOCK | PASS | BLOCKED |
| Wrong logical attempt → BLOCK | PASS | BLOCKED |
| Wrong contract → BLOCK | PASS | BLOCKED |
| Wrong parser revision → BLOCK | PASS | BLOCKED |
| Invalid build revision → BLOCK | PASS | BLOCKED |
| Child crash → `WorkerError`, supervisor survives | not owned by MAIN | BLOCKED |
| Completion payload > 8 MiB → BLOCK | PASS | BLOCKED |
| RAW embedded in HOT → BLOCK | PASS | BLOCKED |
| Oversized RAW chunk → BLOCK | PASS | BLOCKED |
| Broken chunk chain → BLOCK | PASS | BLOCKED |

## 13. Test results

| Validation | Result | Detail |
|---|---|---|
| Python parser suite | PASS | 169 passed, 3 skipped |
| Python warnings | WARNING | 2 dependency deprecation warnings from the test client stack |
| RAW/HOT/adapter/worker tests | PASS | included in the Python suite |
| Pipeline + Canonical focused suite | PASS | 554 passed across 38 files |
| Full APP suite | PASS | 918 passed across 64 files; public-build configuration check passed |
| Typecheck | PASS | no diagnostics |
| Compileall | PASS | no diagnostics |
| Diff check | PASS | no whitespace errors |
| Preview build | PASS | latest observability entry reports build OK |
| Railway isolation tests | BLOCKED | Railway/staging source unavailable |
| Staging diff audit | BLOCKED | staging ref unavailable |

The first Python invocation lacked the declared `pytest-asyncio` plugin and produced four environment-only failures. Repeating with `requirements-dev.txt` satisfied produced the authoritative 169 passed / 3 skipped result. No skip was added and no test was removed.

## 14. Gate matrix

| Gate | Status | Evidence |
|---|---|---|
| G4-01 Inventory | PASS | MAIN inventory and classifications recorded |
| G4-02 Main baseline | PASS | exact requested SHA and per-file hashes recorded |
| G4-03 Railway baseline | BLOCKED | source ref unavailable; live identity only |
| G4-04 Parser parity | BLOCKED | no Railway source diff |
| G4-05 RAW evidence parity | BLOCKED | MAIN passes; Railway source unverified |
| G4-06 RAW artifact parity | BLOCKED | MAIN passes; Railway source unverified |
| G4-07 HOT parity | BLOCKED | MAIN passes; Railway source unverified |
| G4-08 APP parity | BLOCKED | MAIN passes; isolated Railway integration unverified |
| G4-09 Adapter parity | BLOCKED | MAIN passes; Railway source unverified |
| G4-10 Settings parity | BLOCKED | Railway environment/source unavailable |
| G4-11 Build identity parity | PARTIAL | live build identity valid; staging source/build absent |
| G4-12 Isolation preserved | BLOCKED | isolation files unavailable |
| G4-13 parser_child compatibility | BLOCKED | child monkey patches unavailable |
| G4-14 Worker lifecycle parity | BLOCKED | MAIN lifecycle passes; Railway implementation unavailable |
| G4-15 Dependency parity | BLOCKED | MAIN pinned; Railway lock unavailable |
| G4-16 Security parity | PARTIAL | MAIN cases pass; child and Railway cases unproved |
| G4-17 Python tests | PASS | 169 passed, 3 skipped, 2 warnings |
| G4-18 TypeScript tests | PASS | focused 554; full APP 918 |
| G4-19 Typecheck | PASS | no diagnostics |
| G4-20 Compileall | PASS | no diagnostics |
| G4-21 Diff check | PASS | no errors |
| G4-22 Build | PASS | latest preview build OK |
| G4-23 Staging diff audit | BLOCKED | staging ref unavailable |
| G4-24 Railway deployment readiness | BLOCKED | G4-03–G4-16 and G4-23 incomplete |

## 15. Exact blockers and required next input

1. Expose an auditable `infra/cs2-parser-worker-v8` ref at a precise SHA.
2. Expose an auditable `infra/cs2-parser-worker-v8-parity-g4` ref at a precise SHA.
3. Compare all listed files and direct imports; preserve the three isolation files and Railway lifecycle/build mechanics.
4. Run isolation-specific tests in the staging tree, including child crash, timeout, malformed output, cleanup, RSS bounds, and supervisor survival.
5. Prove `DEMO_PIPELINE_WORKER_ID` uniqueness for every candidate replica.
6. Build the candidate image and verify its `/health` and `/version` before any separately authorized deploy.

No patch was applied because there was no auditable staging target. Applying MAIN changes to the current APP branch would not constitute Railway parity and could erase the required isolation design.

## 16. Critical decision

1. MAIN READY FOR PARITY = YES
2. RAILWAY CODE READY FOR PARITY = NO
3. PROCESS ISOLATION PRESERVED = NO (not verifiable from available source)
4. BUILD IDENTITY PRESERVED = NO (live identity observed; staging preservation unverified)
5. RAW CONTRACT PARITY = BLOCKED
6. HOT CONTRACT PARITY = BLOCKED
7. CACHE RUN 1 AUTHORIZED = ALWAYS NO FOR THIS PHASE
8. RAILWAY DEPLOY AUTHORIZED BY THIS TASK = NO
9. G4 STATUS = BLOCKED
10. EXACT BLOCKERS = Railway baseline ref unavailable; staging ref unavailable; isolation files unavailable; no source diff; no staging isolation test or candidate image proof.

## 17. Operational confirmation

- Cache Run 1: NOT EXECUTED
- Cache Run 2: NOT EXECUTED
- Retry/requeue: NOT EXECUTED
- Canonical/match/metrics/features: NOT CREATED OR MODIFIED
- Original artifact/chunks/manifest: NOT MODIFIED
- Database/Storage: NOT MODIFIED
- Railway: NOT DEPLOYED
- Secrets: NOT MODIFIED
- Phase 2.8: NOT STARTED