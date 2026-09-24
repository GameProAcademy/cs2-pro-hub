# Large DEM Browser Memory / Feasibility Gate

Status: `H.1-M CLOSED / H.2 PASS / H.3 EXECUTION NOT READY`

## Decision

The browser parser remains capped at **128 MiB (134,217,728 bytes)**. This is a conservative POC ceiling, not evidence that 128 MiB or any larger size is supported in production. The authorized Cache DEM is **473,748,061 bytes** and was not opened, hashed, parsed, copied, uploaded, or executed in this round.

## Implemented gate

`LARGE_DEM_FEASIBILITY_GATE` now exposes only these states: `NOT_RUN`, `BLOCKED_BY_SIZE`, `BLOCKED_BY_MEMORY`, `UNAVAILABLE`, `SUPPORTED_BY_MEASUREMENT`, `SUPPORTED_WITH_LIMITS`, and `FAILED`.

- `VITE_CLIENT_DEM_LARGE_FILE_EXPERIMENTAL=false` by default.
- Preflight evidence is explicitly `CAPABILITY_HINT`, never proof of parser support.
- Reliable memory evidence is accepted only from `performance.measureUserAgentSpecificMemory`; otherwise the result is `MEMORY_UNAVAILABLE`.
- The audited demoparser2 WASM API requires a contiguous `Uint8Array`; the current parser path therefore still materializes the whole input buffer and is not eligible for large-file support.
- Chunked SHA-256 is separate from parsing, uses 8 MiB chunks in a Worker, supports cancellation, and terminates the Worker on every terminal path.

## Tests

Metadata-only boundary tests cover 128 MiB, 128 MiB + 1 byte, 300 MiB, 400 MiB, 500 MiB, and the exact 473,748,061-byte Cache size without allocating those files. Chunk-stream SHA-256 equivalence is deterministic. No synthetic test is treated as evidence for the real DEM.

## Memory model

| Allocation                         | Current evidence                         |
| ---------------------------------- | ---------------------------------------- |
| File metadata                      | bounded / metadata-only test             |
| Hash chunk                         | bounded to 8 MiB plus SHA state          |
| Main-thread file buffer for parser | full contiguous buffer required          |
| Worker transfer                    | ownership transfer, but still contiguous |
| WASM input                         | contiguous `Uint8Array` required         |
| Parser working memory              | `NOT_MEASURED`                           |
| Compact output                     | capped separately at 2 MiB               |
| Peak browser memory                | `MEMORY_UNAVAILABLE`                     |

## H.2 disposition

H.1-M synthetic memory evidence is complete and H.2 is now `PASS` after the repository Quality Gate accepted the fail-closed real-DEM admission architecture. H.2 still does not authorize a real DEM run.

## H.3 disposition

H.3 now defines the pre-execution evidence envelope for one exact controlled DEM run. The Cache DEM remains `NOT RUN` until exact runtime memory/overhead, parity, determinism, tick authority, player identity, retention, attestation, and explicit execution authorization are independently complete.

## Locks

Canonical admission remains `BLOCKED`; Attempt 9 remains locked; Python×WASM parity and determinism remain `NOT_RUN`; Railway, staging, secrets, migrations, and the real DEM remain unchanged.
