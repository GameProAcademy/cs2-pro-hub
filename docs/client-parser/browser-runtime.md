# Client parser browser runtime

## Harness

The authenticated `/client-parser-poc` route is an isolated harness behind `VITE_CLIENT_DEM_PARSER_POC_ENABLED=true`; the default is OFF and is protected by a build-time regression check. The validator endpoint also fails closed while the server flag is not exactly `true`.

The harness selects one local `.dem`, rejects empty/non-DEM inputs and files above 128 MiB, creates a Classic Worker compatible with wasm-bindgen `no-modules`, verifies same-origin binding/WASM bytes, initializes the runtime, hashes transferred DEM bytes, and returns only a compact result and manifest. It does not upload or persist the DEM, full ticks, or RAW events.

Worker cancellation is terminal for the pending promise. Worker state and cancellation markers are cleaned after completion, cancellation, or failure. Errors distinguish artifact absence/invalidity, hash mismatch, load/init/runtime failure, invalid/corrupt/unsupported DEM, limits, cancellation, contract mismatch, and parity failure.

## Measurements and execution matrix

The contract records file/result bytes and startup, load, hashing, parsing, total duration, and memory only when observable. `performance.memory` is non-standard; unavailable memory is not estimated.

| Browser | Real 0.42 WASM | Real DEM | 128 MiB boundary | Memory profile | Result |
| --- | --- | --- | --- | --- | --- |
| Chrome | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | BLOCKED |
| Firefox | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | BLOCKED |
| Safari | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | BLOCKED |

The requested ~400 MB gate cannot be run under the current conservative 128 MiB POC ceiling and remains `NOT_RUN`. No browser support claim follows from unit tests.