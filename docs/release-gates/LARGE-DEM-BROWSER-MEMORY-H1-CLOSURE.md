# Large DEM Browser Memory H.1 Closure

STATUS: H.1-R PASS / H.1-M0 PASS / H.1-M0.1 PASS / H.1-M PASS — 15/15 SYNTHETIC RUNTIME OBSERVATIONS ACCEPTED

## H.1-R implementation criteria

- [x] Deterministic lifecycle without a concurrent in-flight memory sample.
- [x] Explicit `postMaterializationBytes` after Worker completion.
- [x] Retained contiguous `ArrayBuffer` remains reachable in the Worker until the post-materialization sample completes.
- [x] Explicit materialization-release handshake occurs only after the post-materialization sample.
- [x] Observed peak limited to post-fixture, pre-materialization, and post-materialization samples.
- [x] Neutral cleanup status and observational delta only.
- [x] Logical fixture-size semantics documented.
- [x] Timeout, cancellation, malformed events, foreign request IDs, and Worker errors fail closed.
- [x] Worker termination and listener cleanup covered by tests.
- [x] Results and copied reports are metadata-only.
- [x] Parser, WASM, backend, persistence, analytics, Railway, R5.8, attestation, and Canonical remain isolated.
- [x] Feature flag remains false by default; real parser remains false; 128 MiB remains the hard ceiling.
- [x] Dedicated authenticated `/admin/memory-lab` surface depends only on the Memory Lab flag.
- [x] Parser POC remains independent and OFF by default.
- [x] H.1-M0.1 route isolation headers are implemented on the dedicated Memory Lab route; Preview runtime was verified as cross-origin isolated with Memory API available.
- [x] Disabled route is inert and reports `FEATURE_DISABLED`; administrative navigation is hidden.
- [x] Local 15-run H.1-M progress matrix and complete metadata result fields are exposed without persistence.

## H.1-M runtime acceptance

The manual foreground-browser protocol was completed on the dedicated Lovable Preview runtime on 2026-09-24.

Matrix:

| Fixture | Repetitions | Accepted observations |
|---|---:|---:|
| 16 MiB | 3 | 3/3 |
| 32 MiB | 3 | 3/3 |
| 64 MiB | 3 | 3/3 |
| 96 MiB | 3 | 3/3 |
| 128 MiB | 3 | 3/3 |
| **Total** | **15** | **15/15** |

Every accepted observation reported:

- `status=OBSERVED`
- exact `materializedByteLength` equal to the requested fixture size
- `measurementCount=5`
- `cleanupStatus=CLEANUP_OBSERVED`
- `errorCode=null`
- `workerLifecycleStage=MATERIALIZATION_COMPLETE`
- `workerRuntimeSignal=null`
- `workerBootstrapProbe=PASS`
- secure context and cross-origin isolation enabled
- Memory API available
- no real DEM/parser execution

The complete numeric evidence is recorded in `docs/release-gates/LARGE-DEM-BROWSER-MEMORY-H1-M-RUNTIME-EVIDENCE-2026-09-24.md`.

## Runtime observations and interpretation

The accepted runs demonstrate that the current synthetic contiguous-input materialization path completed successfully for 16, 32, 64, 96, and 128 MiB fixtures in the tested Chrome 153 foreground Preview environment.

The measured memory values remain observational. `performance.measureUserAgentSpecificMemory()` does not provide an exact physical peak or a guaranteed sample of every allocation. `observedPeakBytes` is only the maximum of the protocol's defined samples. `observedCleanupDeltaBytes` is arithmetic observation only and is not a leak diagnosis.

The observed `materializedByteLength` values prove that the Worker created the requested contiguous ArrayBuffer sizes. They do not prove that the browser exposes an equivalent byte-for-byte increase in the aggregate memory metric.

## Diagnostic-only module probe

`moduleWorkerBootstrapProbe=FAIL` remained present in the accepted reports. It is not the Worker path used by the successful measurement execution and is not an H.1-M acceptance gate.

The actual Vite-managed `?worker&inline` measurement Worker completed the lifecycle successfully, including `MATERIALIZATION_COMPLETE`, across all 15 accepted observations.

## Release locks

H.1-M completion does NOT authorize any of the following:

- real DEM upload or parsing
- demoparser2/WASM execution against a real DEM
- increasing the 128 MiB synthetic ceiling
- claiming 300–500 MiB support or safety
- claiming support for the 300–500 MiB library DEMs
- Canonical admission
- production enablement
- backend persistence
- Railway parser execution
- R5.8 attestation
- parser parity/determinism closure
- H.2

Those gates remain independently blocked or locked.

## Closure decision

H.1-M is CLOSED as a synthetic browser-memory diagnostic experiment for the specified 15-run matrix.

H.2 and real DEM processing remain BLOCKED pending their separate release criteria.
