# H.1-M Runtime Evidence — 2026-09-24

STATUS: ACCEPTED — 15/15 SYNTHETIC OBSERVATIONS

## Scope

Manual foreground-browser execution of the H.1-M synthetic contiguous-input materialization protocol in the dedicated Lovable Preview runtime.

Browser: Chrome 153; the runtime reported user agent `Windows NT 10.0`.

All accepted observations had secure context=true, crossOriginIsolated=true, apiAvailable=true, status=OBSERVED, measurementCount=5, cleanupStatus=CLEANUP_OBSERVED, errorCode=null, workerLifecycleStage=MATERIALIZATION_COMPLETE, workerRuntimeSignal=null, and workerBootstrapProbe=PASS.

The moduleWorkerBootstrapProbe remained FAIL and is diagnostic-only; it is not the measurement Worker acceptance gate.

## Acceptance matrix

| Fixture | R1 | R2 | R3 | Accepted |
|---|---|---|---|---|
| 16 MiB | PASS | PASS | PASS | 3/3 |
| 32 MiB | PASS | PASS | PASS | 3/3 |
| 64 MiB | PASS | PASS | PASS | 3/3 |
| 96 MiB | PASS | PASS | PASS | 3/3 |
| 128 MiB | PASS | PASS | PASS | 3/3 |
| **Total** | **PASS** | **PASS** | **PASS** | **15/15** |

## Numeric runtime evidence

| Size | Rep | Materialized bytes | Peak delta | Cleanup delta | Materialization ms | Worker ms |
|---:|---:|---:|---:|---:|---:|---:|
| 16 MiB | 1 | 16,777,216 | 360,246 | 12,017 | 31.265 | 30,116.665 |
| 16 MiB | 2 | 16,777,216 | 242,633 | 44,441 | 30.640 | 34,193.935 |
| 16 MiB | 3 | 16,777,216 | 304,220 | -3,648 | 30.455 | 33,022.610 |
| 32 MiB | 1 | 33,554,432 | 301,433 | -133,237 | 53.480 | 34,395.515 |
| 32 MiB | 2 | 33,554,432 | 486,785 | -40,877 | 52.370 | 26,065.100 |
| 32 MiB | 3 | 33,554,432 | 295,640 | 20,868 | 52.390 | 31,458.380 |
| 64 MiB | 1 | 67,108,864 | 301,710 | -108,021 | 96.340 | 22,928.200 |
| 64 MiB | 2 | 67,108,864 | 283,155 | -24,616 | 111.870 | 21,158.060 |
| 64 MiB | 3 | 67,108,864 | 357,382 | 34,906 | 99.650 | 22,101.780 |
| 96 MiB | 1 | 100,663,296 | 350,782 | -90,001 | 164.715 | 25,292.625 |
| 96 MiB | 2 | 100,663,296 | 383,271 | -21,965 | 157.195 | 26,852.860 |
| 96 MiB | 3 | 100,663,296 | 370,082 | 2,748 | 151.905 | 28,912.980 |
| 128 MiB | 1 | 134,217,728 | 401,023 | 99,222 | 218.980 | 25,037.165 |
| 128 MiB | 2 | 134,217,728 | 126,094 | -167,766 | 1,199.070 | 36,119.570 |
| 128 MiB | 3 | 134,217,728 | 374,678 | 62,506 | 213.295 | 31,873.260 |

## Exact materialization checks

All 15 runs reported an exact `materializedByteLength` equal to the requested logical fixture size:

- 16 MiB = 16,777,216 bytes
- 32 MiB = 33,554,432 bytes
- 64 MiB = 67,108,864 bytes
- 96 MiB = 100,663,296 bytes
- 128 MiB = 134,217,728 bytes

## Interpretation

These observations establish successful execution of the specified synthetic contiguous-input materialization experiment in the tested browser/runtime.

They do NOT establish:

- real DEM support
- demoparser2/WASM memory behavior
- 300–500 MiB support or safety
- support for the ~311/382/~452 MiB library DEMs
- a safe production memory ceiling above 128 MiB
- production readiness
- Canonical admission
- Railway parser execution
- R5.8 attestation
- parser parity/determinism closure

`peakDeltaBytes` is an observation of the protocol's defined memory samples, not the physical memory cost of the fixture. `observedCleanupDeltaBytes` is arithmetic observation only and is not a leak diagnosis.

## Release state

H.1-M is CLOSED for its stated synthetic diagnostic scope.

H.2 and real DEM processing remain BLOCKED.
