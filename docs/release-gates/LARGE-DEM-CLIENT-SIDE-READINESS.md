# Large DEM Client-Side Readiness

## Status

- Architecture preparation: `IMPLEMENTED`
- Unit/static verification: `VERIFIED`
- Real DEM execution: `NOT_RUN`
- Files above 128 MiB: `NOT_SUPPORTED`
- R5.8.1: `BLOCKED_OPERATOR_CONFIGURATION`
- Canonical: `BLOCKED`

## Architecture before

The local POC validated metadata on the main thread, loaded the complete `File` into an `ArrayBuffer`, synchronously hashed that buffer, transferred it to a parser Worker, hashed it again, and passed one contiguous `Uint8Array` to demoparser2 WASM calls. The separate chunked hash Worker and feasibility module existed but were not integrated.

## Architecture after

The selected `File` is validated by metadata and evaluated by the feasibility gate. SHA-256 runs in a dedicated Worker over 8 MiB `File.slice()` chunks and returns only progress, size, and digest. The `File` is then structured-cloned to the parser Worker. The only authorized whole-file materialization is the parser input adapter inside that Worker. React never receives raw DEM bytes.

## Parser capability

| Property | Classification |
| --- | --- |
| Parser | demoparser2 0.42.0 |
| Runtime | wasm-browser-worker |
| Input | `CONTIGUOUS_BUFFER` |
| Requires contiguous buffer | `VERIFIED: true` |
| Streaming parsing | `NOT_SUPPORTED` |
| Chunked hashing | `IMPLEMENTED` |
| Real large-file runtime observation | `NOT_RUN` |

The current exported WASM API accepts a `Uint8Array`. `File.slice()` support in the hash Worker does not imply chunked or streaming parser support.

## Memory model

The browser-owned `File`, parser Worker `ArrayBuffer`, WASM linear memory, parser structures, temporary WASM boundary copies, and compact result are distinct allocations. Known values are file size, contiguous input size, 8 MiB hash chunk, and a 2 MiB result ceiling. WASM and parser overhead are `unknown`; peak memory remains `HYPOTHESIS` and is never reported as a measurement. The current API may copy the contiguous input into WASM for parser calls.

## Boundaries

| Metadata size | Parsing status |
| --- | --- |
| 128 MiB - 1 | `SAFE` only when both parser experiment flags and capabilities are available |
| 128 MiB | `SAFE` under the same conditions; not a production support claim |
| 128 MiB + 1 | `NOT_SUPPORTED` |
| 300 MiB | `NOT_SUPPORTED` |
| 400 MiB | `NOT_SUPPORTED` |
| 500 MiB | `NOT_SUPPORTED` |
| 473,748,061 bytes | `NOT_SUPPORTED / NOT_RUN` |

These are deterministic metadata-only tests; no giant buffers or real DEM were created.

## Security and retention

- Raw DEM bytes are not returned to React, JSON, logs, analytics, or the database by this local flow.
- The local file is not persisted by the readiness architecture.
- Only bounded normalized output can reach server validation, which remains non-canonical and fail-closed.
- Existing 24h/72h retention applies to the separate remote ingestion pipeline and was not changed.

## Evidence classification

- `IMPLEMENTED`: capability contract, parser input boundary, hash Worker integration, deterministic gate, UI status, message guards.
- `VERIFIED`: source/static tests for Worker chunking, main-thread whole-file read prohibition, boundaries and fail-closed capability handling.
- `NOT_RUN`: real Cache DEM, browser memory measurement, parity, determinism, first attestation.
- `BLOCKED`: `LARGE_DEM_REAL_EXECUTION_STATUS`, Attempt 9/10+, Canonical.
- `NOT_SUPPORTED`: parsing above 128 MiB with the current contiguous-buffer WASM runtime.
- `HYPOTHESIS`: WASM/parser overhead and peak browser memory.

## Next gate

The next technical gate is a separately authorized controlled browser memory measurement with the exact runtime and a non-production synthetic/authorized fixture. It must not run until operator configuration and execution authorization are independently complete. A larger parser ceiling requires measured evidence or a verified streaming-capable parser adapter.