# cs2-demo-parser (worker)

External demo parsing worker for the CS2 Pro Hub ingestion pipeline.
Deployed on Railway — project `CS2 Pro Parser Worker`, service `cs2-demo-parser`,
root directory `services/cs2-demo-parser`.

* parser: `demoparser2==0.42.0`
* JSON contract version: `1` (different concept from the parser version)
* framework: FastAPI + uvicorn, Docker build from this directory

## Endpoints

| Method | Path        | Purpose                                              |
| ------ | ----------- | ---------------------------------------------------- |
| GET    | `/health`   | liveness only, no external dependency (Railway probe) |
| GET    | `/version`  | immutable parser identity + contract version          |
| POST   | `/v1/parse` | download, verify integrity, parse, return the contract |

`GET /version`:

```json
{
  "parser": { "name": "demoparser2", "version": "0.42.0", "revision": "git:<full-commit-sha>" },
  "contract_version": 1
}
```

`POST /v1/parse` request (field names are frozen):

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

`PARSER_REVISION` identifies the deployed build immutably. Preferred form
`git:<full-commit-sha>` of the commit actually deployed.

* production (`ENVIRONMENT=production`, the Docker default): the revision is
  **mandatory**. Missing, empty or invalid (including the retired
  `pypi-0.42.0`) makes the process fail closed at startup — it does not serve.
* non-production: the revision may be absent and resolves to the explicit
  marker `dev:unpinned`, which is never a valid pinned build id.
* `/version` returns exactly the revision the process runs with (one source, no
  duplicated value that could drift).

The APP pins the same identity through `DEMO_PARSER_EXPECTED_NAME`,
`DEMO_PARSER_EXPECTED_VERSION`, `DEMO_PARSER_EXPECTED_REVISION` and
`DEMO_PARSER_REVISION_REQUIRED`; any divergence is `PARSER_IDENTITY_MISMATCH`
(permanent).

## Environment

| Variable                   | Required            | Notes                                     |
| -------------------------- | ------------------- | ----------------------------------------- |
| `PARSER_TOKEN`             | yes (secret)        | bearer token, never logged or returned    |
| `PARSER_REVISION`          | yes in production   | `git:<full-commit-sha>` of the deployment |
| `PARSER_CONTRACT_VERSION`  | optional            | defaults to `1`; only `1` is supported    |
| `ENVIRONMENT`              | optional            | `production` by default in the image      |
| `MAX_DEMO_BYTES`           | optional            | download ceiling, default 1.5 GB          |
| `MAX_PAYLOAD_BYTES`        | optional            | response ceiling, default 96 MB           |
| `DOWNLOAD_TIMEOUT_SECONDS` | optional            | default 120                               |
| `PARSE_TIMEOUT_SECONDS`    | optional            | default 240                               |

## Download security

HTTPS only, redirects disabled, streaming to a temporary file, incremental
SHA-256, hard byte ceiling, timeouts and guaranteed cleanup. Demos are never
loaded whole into memory.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

The suite covers auth, contract, hash, file size, download failures, parser
errors, timeouts, `/health`, `/version`, the revision lock (production fail
closed and the dev marker) and no-leak guarantees. `demoparser2` is not needed to
run it: the parse boundary is injected.

## Status

GATE 1E.1 closes APP ↔ worker contract, errors, HTTP, retry, auth and revision.
**GATE 02 — REAL PARSER EXECUTION has not been run**: no real `.dem` has been
processed through this worker.
