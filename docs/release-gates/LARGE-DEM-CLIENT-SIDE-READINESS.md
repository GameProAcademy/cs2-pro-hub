# Large DEM Client-Side Readiness

## Status

- Architecture preparation: `IMPLEMENTED`
- Unit/static verification: `VERIFIED`
- Real DEM execution: `NOT_RUN`
- Files above 128 MiB: `NOT_SUPPORTED` by the current contiguous-buffer parser path
- R5.8.1: `BLOCKED_OPERATOR_CONFIGURATION`
- Canonical: `BLOCKED`

## Final validation

- Full Vitest suite: `80 files / 1,139 tests PASS` on the preceding readiness commit; a semantic boundary correction is now queued for fresh CI verification.
- Focused parser, Worker and boundary suite: `PASS` on the preceding readiness commit; the preflight boundary regression is now explicitly covered.
- TypeScript: `PASS` on the preceding readiness commit
- ESLint: `PASS` with no errors on the preceding readiness commit
- Preview build: `PASS` on the preceding readiness commit
- Real DEM, browser memory benchmark, parity and determinism: `NOT_RUN`

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

The preflight gate and the execution feasibility gate have intentionally different semantics:

- **Preflight** reports the deterministic input-size boundary even while the experimental gate is OFF. Therefore a file above 128 MiB is `BLOCKED_BY_SIZE` at preflight; this does **not** mean the parser was executed.
- **Execution feasibility** requires the explicit experimental and real-parser gates. With those gates enabled, the current contiguous-buffer parser path classifies files above 128 MiB as `NOT_SUPPORTED`.
- A file at or below 128 MiB can still be `NOT_RUN` when the experimental/real-parser gate is disabled.

| Metadata size | Preflight | Execution feasibility when experimental + real parser are explicitly enabled | Actual parsing |
| --- | --- | --- | --- |
| 128 MiB - 1 | `NOT_RUN` | `SAFE` capability hint | `NOT_RUN` |
| 128 MiB | `NOT_RUN` | `SAFE` capability hint; not a production support claim | `NOT_RUN` |
| 128 MiB + 1 | `BLOCKED_BY_SIZE` | `NOT_SUPPORTED` | `NOT_RUN` |
| 300 MiB | `BLOCKED_BY_SIZE` | `NOT_SUPPORTED` | `NOT_RUN` |
| 400 MiB | `BLOCKED_BY_SIZE` | `NOT_SUPPORTED` | `NOT_RUN` |
| 500 MiB | `BLOCKED_BY_SIZE` | `NOT_SUPPORTED` | `NOT_RUN` |
| 473,748,061 bytes | `BLOCKED_BY_SIZE` | `NOT_SUPPORTED` | `NOT_RUN` |

These are deterministic metadata-only tests; no giant parser buffer or real DEM was created.

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

The next technical gate was H.1-M, which is now CLOSED. The current gate is **H.2 — Real DEM Browser Admission Architecture & Fail-Closed Gate**. It must measure the actual browser/Worker memory behavior of the client-side architecture using only non-production synthetic fixtures or an explicitly authorized fixture, with no real Cache DEM and no production parser admission. The measurement API must be treated as browser-specific evidence, not a universal memory guarantee; availability depends on secure cross-origin-isolated execution.

A larger parser ceiling requires measured evidence sufficient for the exact runtime or a verified streaming-capable parser adapter. The 128 MiB production ceiling remains unchanged until such evidence exists.
