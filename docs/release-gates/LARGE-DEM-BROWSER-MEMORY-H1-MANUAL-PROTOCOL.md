# Large DEM Browser Memory H.1-M Manual Protocol

STATUS: H.1-M0 READY / H.1-M NOT RUN

## Preconditions

Use the authenticated administrative route `/admin/memory-lab` in a foreground browser with a secure, cross-origin-isolated context, Worker, File, and `performance.measureUserAgentSpecificMemory` available.

Build the Preview/experimental runtime with `VITE_CLIENT_DEM_MEMORY_LAB=true` and `VITE_CLIENT_DEM_PARSER_POC_ENABLED=false`. Keep `FEATURES.realDemoParser=false`. This public `VITE_*` build setting is not a secret and requires a Preview rebuild after it changes. Repository and production defaults stay OFF.

## Procedure

Confirm the page reports Memory Lab `ENABLED`, secure context `YES`, cross-origin isolation `YES`, Memory API `AVAILABLE`, Worker `AVAILABLE`, File API `AVAILABLE`, real parser `DISABLED`, real DEM `BLOCKED`, Canonical `LOCKED`, and Railway/R5.8 `UNCHANGED`.

Run the synthetic logical File sizes 16, 32, 64, 96, and 128 MiB manually, with three repetitions per size, for exactly 15 runs. Keep the page in the foreground. Do not automate, poll, schedule, upload, persist, or send results to a backend. Use `Reset H.1-M session` only to clear local page state.

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
