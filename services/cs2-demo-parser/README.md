# cs2-demo-parser (worker)

External demo parsing worker for the CS2 Pro Hub ingestion pipeline.
Deployed on Railway — project `CS2 Pro Parser Worker`, service `cs2-demo-parser`,
root directory `services/cs2-demo-parser`.

* parser: `demoparser2==0.42.0`
* JSON contract version: `1` (different concept from the parser version)
* framework: FastAPI + uvicorn, Docker build from this directory

## Durable RAW boundary

The authoritative surgical sync/deployment runbook is
[`docs/PHASE-2.7.2D.4-RAILWAY-ALIGNMENT.md`](../../docs/PHASE-2.7.2D.4-RAILWAY-ALIGNMENT.md).
Railway's production-only `parser_child.py` memory safeguards must be preserved
when these files are synchronized; never replace the Railway branch wholesale.

Durable jobs persist full evidence as verified JSONL-gzip chunks in the private
`cs2-raw-evidence` bucket. Chunks target 4 MiB and fail closed above 8 MiB, carry
a physical SHA-256 and a cross-section hash chain, and are described by a small
manifest/root digest. The `/complete` callback contains only bounded `hot` data
plus the READY `raw` artifact reference; full RAW arrays never cross that route.

`dispatch_attempt` is used only for queue ownership and leases. The RAW identity
and `attempt-N` path always use the logical `demo_jobs.attempt_number`, so a
technical retry reuses one artifact while a new logical attempt creates another.
The complete `{hot, raw}` body targets 4 MiB and fails closed above 8 MiB.
Unclassified events remain in RAW and make HOT partial without invalidating its
contract. AIM observations, position snapshots, and economy snapshots are
explicitly `not_implemented`; empty arrays do not claim complete coverage.

The APP creates short-lived, object-scoped upload URLs. The Railway worker never
receives a database or Storage credential. The worker transports a deterministic
audit summary, but the APP derives and persists the final audit decision.

## Endpoints

| Method | Path        | Purpose                                              |
| ------ | ----------- | ---------------------------------------------------- |
| GET    | `/health`   | liveness only, no external dependency (Railway probe) |
| GET    | `/version`  | immutable parser identity + contract version          |
| POST   | `/v1/parse` | download, verify integrity, parse, return the contract |

`GET /version`:

```json
{
  "parser": {
    "name": "demoparser2",
    "version": "0.42.0",
    "revision": "git:<semantic-lock-sha>",
    "semantic_revision": "git:<semantic-lock-sha>",
    "build_revision": "git:<exact-build-sha>"
  },
  "contract_version": 1
}
```

`POST /v1/parse` is the legacy/non-durable endpoint. Production queue ingestion
uses HOT + RAW Artifact; the legacy response may contain inline RAW evidence and
must not be used to justify raising the durable 8 MiB ceiling.

Request (field names are frozen):

```json
{
  "contract_version": 1,
  "upload_id": "...",
  "demo_url": "https://...",
  "demo_sha256": "...",
  "file_size": 123456
}
```

Response: `parser`, `contract_version`, `header` (`map`, `game_version`,
`tickrate`, `duration_seconds`, `match_date`, `score`, `teams`), `players`,
`rounds`, `events`, `warnings`. `null` means **no evidence** — nothing is
fabricated (never a tickrate, score, teams, duration or match date).

## Adapter architecture (demoparser2 -> RawParserOutput)

The demoparser2 raw model and the APP contract are two separate layers, so the
parser library can be replaced without touching the canonical pipeline:

```
parser.py                    adapter.py                     app.py
demoparser2 raw material ->  normalize_header()        ->    /v1/parse payload
(header dict, event tables)  normalize_players()             (RawParserOutput)
                             normalize_rounds()
                             normalize_events()
                             resolve_event_round()
                             position normalisation
```

* `parser.py` only runs demoparser2 and classifies its exceptions. It keeps
  "stream could not be read" (`None`) distinct from "stream is empty" (`[]`).
* `adapter.py` is the only translator. Events are **flat** (`{"type", "round",
  ...}`) — the old `{"type", "data"}` nesting is gone. Players use `steam_id`
  (from `steamid`); `team_number` 2/3 becomes `team` `TERRORIST`/`CT`, and
  `side` is left absent because `team_number` describes the team slot at parse
  time, not a per-round side. Sides are never guessed from team names.
* Output ordering is deterministic: players by `steam_id`, rounds by `number`,
  events by `round`, `tick`, `type`, source index.

### Supported events

| demoparser2 event | APP canonical | Fields mapped                                                                             |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `player_death`    | `kill`        | attacker/victim/assister steam ids, weapon, headshot, noscope, blind, penetration, wallbang (`penetrated > 0`), distance, positions |
| `player_hurt`     | `damage`      | attacker, victim, weapon, `dmg_health` -> damage, `dmg_armor` -> armor_damage              |
| `player_blind`    | `flash`       | attacker, victim, `blind_duration` -> flash_duration                                       |
| `bomb_planted`    | `bomb_plant`  | planter steam id, tick                                                                     |
| `bomb_defused`    | `bomb_defuse` | defuser steam id, tick                                                                     |
| `bomb_exploded`   | `bomb_explode`| tick                                                                                       |
| `round_start`     | `round_start` | tick (round boundaries)                                                                    |
| `round_end`       | `round_end`   | tick, `winner` -> `winner_side`                                                            |

Metric coverage: kills/deaths/headshots/assists come from `player_death`, damage
from `player_hurt`, flashes and flash duration from `player_blind`, bomb metrics
from the bomb events, round data from `round_start`/`round_end`. `players_flashed`
is not exposed per event by demoparser2 0.42.0 and is therefore absent, never
fabricated. Economy (`money_start`, `money_end`, `equipment_value`) and per-round
`sides` are not available from these tables: they are omitted and reported in
`warnings` (`economy_unavailable`), never zero-filled.

### Round resolution

1. an explicit positive round number on the raw row wins;
2. otherwise the event tick is matched against the real round windows built from
   `round_start` / `round_end` ticks — the window of round *n* is
   `(end(n-1), end(n)]`, so freeze-time and post-plant events land in the right
   round;
3. events before the first round, after the last known end, or without a tick are
   **omitted** and counted in an explicit warning
   (`N events could not be assigned to a deterministic round and were omitted.`).
   `round = 0` is never emitted.

### NULL semantics and partial parse

`null`/absent means "no evidence"; it is never `0`, `false` or `""`. A bomb event
stream that was read but has no row in a round yields `false` (negative
evidence); a stream that could not be read stays absent. `duration_seconds` is
derived only when a real tickrate exists — the tickrate is never assumed, and
demoparser2's header does not provide one. A demo whose header/players parse but
whose event streams are incomplete stays a **partial parse** with warnings; it is
not reclassified as an invalid demo.


## Error envelope

Every HTTP error, for every status, uses exactly one shape:

```json
{ "detail": { "error_code": "CODE", "message": "safe human-readable message" } }
```

Responses never contain a stack trace, filesystem path, signed URL, bearer
token, full SHA-256, container internals or private Supabase data. Internal logs
may hold technical detail.

## Error / HTTP / retry matrix

| Situation                | HTTP    | Worker code                     | APP code                    | Retry |
| ------------------------ | ------- | ------------------------------- | --------------------------- | ----- |
| missing/invalid token    | 401     | `UNAUTHORIZED`                  | `PARSER_UNAUTHORIZED`       | no    |
| token not allowed        | 403     | `FORBIDDEN`                     | `PARSER_FORBIDDEN`          | no    |
| contract differs         | 409     | `CONTRACT_MISMATCH`             | `PARSER_CONTRACT_MISMATCH`  | no    |
| contract unknown         | 409     | `UNSUPPORTED_CONTRACT_VERSION`  | `PARSER_CONTRACT_MISMATCH`  | no    |
| invalid demo             | 422     | `INVALID_DEMO_FORMAT`           | `INVALID_DEMO_FORMAT`       | no    |
| corrupted demo           | 422     | `CORRUPTED_DEMO`                | `CORRUPTED_DEMO`            | no    |
| unsupported demo variant | 422     | `UNSUPPORTED_DEMO`              | `UNSUPPORTED_DEMO`          | no    |
| sha256 divergence        | 422     | `HASH_MISMATCH`                 | `PARSER_HASH_MISMATCH`      | no    |
| size divergence          | 422     | `FILE_SIZE_MISMATCH`            | `PARSER_FILE_SIZE_MISMATCH` | no    |
| demo above ceiling       | 413     | `DEMO_TOO_LARGE`                | `DEMO_TOO_LARGE`            | no    |
| response above ceiling   | 413     | `PAYLOAD_TOO_LARGE`             | `PARSER_PAYLOAD_TOO_LARGE`  | no    |
| download failed          | 502/503 | `DOWNLOAD_ERROR`/`DOWNLOAD_FAILED` | `PARSER_DOWNLOAD_ERROR`  | yes   |
| download timeout         | 504     | `DOWNLOAD_TIMEOUT`              | `PARSER_TIMEOUT`            | yes   |
| parse timeout            | 504     | `PARSE_TIMEOUT`                 | `PARSER_TIMEOUT`            | yes   |
| unexpected internal bug  | 500     | `PARSER_ERROR`                  | `PARSER_ERROR`              | yes   |

Rules that are enforced by tests:

* download problems are **never** `INVALID_DEMO_FORMAT`;
* integrity problems are **never** `INVALID_DEMO_FORMAT`;
* contract problems are **never** `PARSER_ERROR`;
* only positive evidence about the file produces `INVALID_DEMO_FORMAT`,
  `CORRUPTED_DEMO` or `UNSUPPORTED_DEMO`; any other exception is `PARSER_ERROR`.

## Revision lock (GATE 1E.1)

`PARSER_REVISION` is the semantic compatibility lock retained during the
coordinated rollout. `PARSER_BUILD_REVISION` is the optional exact deployed build
identity. Both use `git:<full-commit-sha>`; neither is inferred from the other.

* production (`ENVIRONMENT=production`, the Docker default): the revision is
  **mandatory** and must be `git:<40 lowercase hex>`. Missing, empty or invalid (including the retired
  `pypi-0.42.0`) makes the process fail closed at startup — it does not serve.
* non-production: the revision may be absent and resolves to the explicit
  marker `dev:unpinned`, which is never a valid pinned build id.
* `/version` preserves `revision`, mirrors it as `semantic_revision`, and returns
  `build_revision` separately (`null` until configured).

The APP pins the same identity through `DEMO_PARSER_EXPECTED_NAME`,
`DEMO_PARSER_EXPECTED_VERSION`, `DEMO_PARSER_EXPECTED_REVISION` and
`DEMO_PARSER_REVISION_REQUIRED`; any divergence is `PARSER_IDENTITY_MISMATCH`
(permanent).

## Environment

| Variable                   | Required            | Notes                                     |
| -------------------------- | ------------------- | ----------------------------------------- |
| `PARSER_TOKEN`             | yes (secret)        | bearer token, never logged or returned    |
| `PARSER_REVISION`          | yes in production   | `git:<full-commit-sha>` of the deployment |
| `PARSER_BUILD_REVISION`    | optional during rollout | exact `git:<full-commit-sha>` deployed build; never inferred |
| `PARSER_CONTRACT_VERSION`  | optional            | defaults to `1`; only `1` is supported    |
| `ENVIRONMENT`              | optional            | `production` by default in the image      |
| `MAX_DEMO_BYTES`           | optional            | download ceiling, default 1.5 GB          |
| `MAX_PAYLOAD_BYTES`        | optional            | HOT completion ceiling; hard-capped at 8 MiB |
| `DOWNLOAD_TIMEOUT_SECONDS` | optional            | default 120                               |
| `PARSE_TIMEOUT_SECONDS`    | optional            | default 240                               |
| `DEMO_PIPELINE_BRIDGE_URL` | yes for queue worker | APP bridge ending in `/pipeline-worker`   |
| `DEMO_PIPELINE_BRIDGE_SECRET` | yes for queue worker | shared bearer; never logged             |
| `DEMO_PIPELINE_WORKER_ID`  | optional            | stable worker identity; default `railway-parser-1` |
| `DEMO_QUEUE_POLL_SECONDS`  | optional            | empty-queue backoff; default 5            |
| `DEMO_QUEUE_HEARTBEAT_SECONDS` | optional        | lease renewal interval; default 60        |

## Durable consumer

When both bridge variables are configured, startup creates one persistent
consumer task. It claims a small message, receives a short-lived private demo
URL only after claim, renews the lease during parsing, and posts the raw parser
contract back to the APP. The APP remains the only canonical writer and archives
the queue message only after durable persistence. A crash before confirmation
leaves the message available for redelivery after the visibility timeout.

The consumer has concurrency 1. `/health`, `/version`, and `/v1/parse` remain
unchanged. No backend privileged credential is present in Railway.

## Download security

HTTPS only, redirects disabled, streaming to a temporary file, incremental
SHA-256, hard byte ceiling, timeouts and guaranteed cleanup. Demos are never
loaded whole into memory. The CS2 magic header `PBDEMS2\x00` is verified before
the native parser is invoked — an extra cheap gate, never a replacement for the
parser's own validation.

## Container security (non-root)

The image creates the user `parser` with the stable UID `10001` and runs with
`USER 10001`. `/app` and the parser scratch directory `/tmp/parser`
(`TMPDIR=/tmp/parser`, mode `700`) are owned by that UID, so the worker can start
uvicorn, download a demo, create and delete its temporary file, and serve
`/health`, `/version` and `/v1/parse` without root.

## Parse timeout limitation (documented, not hidden)

`/v1/parse` runs the parse in a worker thread with `asyncio.wait_for`. On
`PARSE_TIMEOUT` the HTTP request returns immediately, but the native demoparser2
call already in flight is **not** interrupted — Python cannot cancel it. The
bounds that actually apply are `MAX_DEMO_BYTES`, `MAX_PAYLOAD_BYTES` and the
container's own CPU/memory ceilings, plus the guaranteed temp-file cleanup.

RAW chunking bounds transport and persistence memory, but the main parser still
materializes native structures before the writer. It is not full parser
streaming. The Railway branch additionally owns `parser_child.py`; its child
isolation, bounded ticks, `parse_grenades(grenades=False)`, stage/RSS logs and
safe-failure behavior are MUST PRESERVE during surgical synchronization.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

The suite covers auth, contract, hash, file size, download failures, parser
errors, timeouts, `/health`, `/version`, the revision lock (production fail
closed and the dev marker), no-leak guarantees, the adapter (players, header,
rounds, events, round resolution, positions, NULL semantics, determinism) and a
full `RawParserOutput` contract test. `demoparser2` is not needed to run it: the
parse boundary is injected.

### Real demo fixture (GATE 02)

`tests/test_real_demo.py` is written and ready, but it needs a real CS2 demo and
is skipped without one — no demo is ever fabricated. To run it, place a real
`.dem` at `tests/fixtures/sample.dem` or export
`CS2_DEMO_FIXTURE=/absolute/path/to/file.dem`. Fixtures are git-ignored.

## Status

GATE 1E.1 closes APP ↔ worker contract, errors, HTTP, retry, auth and revision.
The adapter now produces the APP `RawParserOutput` contract directly (flat
events, `steam_id`, real rounds).
**GATE 02 — REAL PARSER EXECUTION is still BLOCKED**: no real `.dem` has been
processed through this worker.

