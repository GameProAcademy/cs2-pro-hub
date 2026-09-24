# Large DEM Browser Memory H.1-M Manual Protocol

STATUS: PREPARED / NOT EXECUTED

## Preconditions

Use a foreground browser in a secure, cross-origin-isolated context with Worker, File, and `performance.measureUserAgentSpecificMemory` available. Enable the Memory Lab flag only in the local experimental runtime. Do not enable the real parser.

## Procedure

Run the synthetic logical File sizes 16, 32, 64, 96, and 128 MiB manually, with three repetitions per size. Keep the page in the foreground. Do not automate, poll, schedule, upload, persist, or send results to a backend.

## Permitted evidence

Record only:

- `fixtureSizeBytes`
- `repetition`
- `baselineBytes`
- `postFixtureBytes`
- `preMaterializationBytes`
- `postMaterializationBytes`
- `postCleanupBytes`
- `observedPeakBytes`
- `peakDeltaBytes`
- `observedCleanupDeltaBytes`
- `materializationDurationMs`
- `workerDurationMs`
- `materializedByteLength`
- `measurementCount`
- browser capability metadata
- timestamp
- status and sanitized error metadata

## Interpretation limits

The fixture size is logical, not its guaranteed physical memory footprint. Samples are observations at defined points, not an exact peak or guaranteed in-flight materialization measurement. Cleanup delta is not a leak diagnosis. Results do not demonstrate production support, real DEM processing, parser/WASM memory, 400–500 MiB safety, a higher limit, Canonical admission, or attestation readiness.

This protocol must not be executed as part of implementation hardening.
