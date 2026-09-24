# Large DEM Browser Memory H.1-M Manual Protocol

STATUS: H.1-M COMPLETE — 15/15 ACCEPTED OBSERVATIONS

## Preconditions

Use the authenticated administrative route `/admin/memory-lab` in a foreground browser with a secure, cross-origin-isolated context, Worker, File, and `performance.measureUserAgentSpecificMemory` available.

The accepted runtime evidence was collected on 2026-09-24 in Chrome 153 on the dedicated Lovable Preview runtime. Repository and production defaults remain OFF.

## Procedure

The synthetic logical File sizes 16, 32, 64, 96, and 128 MiB were executed manually with three foreground repetitions per size, for exactly 15 runs. No automation, polling, scheduling, upload, persistence, backend reporting, or analytics were used.

The page reported Memory Lab ENABLED, secure context YES, cross-origin isolation YES, Memory API AVAILABLE, Worker AVAILABLE, File API AVAILABLE, real parser DISABLED, real DEM BLOCKED, Canonical LOCKED, and Railway/R5.8 UNCHANGED.

## Acceptance matrix

| Fixture | R1 | R2 | R3 | Result |
|---|---|---|---|---|
| 16 MiB | PASS | PASS | PASS | 3/3 |
| 32 MiB | PASS | PASS | PASS | 3/3 |
| 64 MiB | PASS | PASS | PASS | 3/3 |
| 96 MiB | PASS | PASS | PASS | 3/3 |
| 128 MiB | PASS | PASS | PASS | 3/3 |
| **Total** | **PASS** | **PASS** | **PASS** | **15/15** |

## Permitted evidence

The runtime report recorded:

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

The fixture size is logical, not a guaranteed physical memory footprint. Samples are observations at defined points, not an exact peak or guaranteed in-flight materialization measurement. Cleanup delta is not a leak diagnosis.

The experiment does not demonstrate production support, real DEM processing, parser/WASM memory behavior, 300–500 MiB safety, a higher limit, Canonical admission, Railway execution, attestation readiness, or H.2 readiness.

## Closure

The complete 15-run runtime evidence is recorded in `docs/release-gates/LARGE-DEM-BROWSER-MEMORY-H1-M-RUNTIME-EVIDENCE-2026-09-24.md`.

H.1-M is complete for its stated synthetic diagnostic scope. No real DEM or parser gate was opened by this protocol.
