# Large DEM browser memory measurement

STATUS: IMPLEMENTED / MEASUREMENT NOT YET EXECUTED

## 1. Scope

This phase adds a local browser laboratory for controlled, synthetic memory observations.

## 2. Classification

Every report is `EXPERIMENTAL`, `DIAGNOSTIC_ONLY`, `NON_PRODUCTION`, and `NO_REAL_DEM`.

## 3. Non-goals

It does not parse a DEM, exercise demoparser2/WASM, validate gameplay semantics, authorize Canonical, or support production admission.

## 4. Current execution status

No browser measurement has been executed or recorded by this implementation work. Runtime evidence remains `NOT_RUN`.

## 5. Feature gate

`VITE_CLIENT_DEM_MEMORY_LAB` is public, non-secret, independent, and false by default.

## 6. Required browser capabilities

Execution requires Worker and File APIs, a secure context, cross-origin isolation, and `performance.measureUserAgentSpecificMemory`.

## 7. Fail-closed behavior

A missing capability produces a factual unavailable state. There is no `performance.memory` fallback and no inferred measurement.

## 8. Fixtures

Fixtures are locally generated, deterministic, synthetic byte patterns without DEM semantics.

## 9. Approved sizes

Only 16, 32, 64, 96, and 128 MiB are accepted.

## 10. Hard ceiling

`MAX_SYNTHETIC_FIXTURE_BYTES` derives from the existing `CLIENT_DEMO_MAX_BYTES`. Values above 128 MiB are rejected before allocation.

## 11. Input boundary

The dedicated Worker reuses `readContiguousDemoInput`, the sole whole-input materialization boundary.

## 12. Parser isolation

The Worker does not import or call parser, WASM, server, database, Storage, Railway, attestation, or Canonical APIs.

## 13. Measurement sequence

A run observes baseline, post-fixture, pre-materialization, materialization-period, completion, and post-cleanup memory samples.

## 14. Evidence semantics

The displayed peak is the highest observed browser memory sample, not an exact peak or universal guarantee.

## 15. Cleanup semantics

The Worker is terminated and references and listeners are released. A positive post-cleanup delta means `residual observed memory delta`; it does not prove a memory leak.

## 16. Timeout and cancellation

Each run is bounded to at most 60 seconds. Timeout, cancellation, Worker error, and malformed messages terminate the Worker and fail closed.

## 17. Repetitions

The operator may request one to three foreground runs. There is no polling, background loop, or automatic execution.

## 18. Data handling

Results remain in React memory. No bytes are returned from the Worker, persisted, uploaded, logged, or sent to analytics.

## 19. Diagnostic report

The copy action emits textual JSON containing metadata and numeric observations only. It includes no fixture bytes or user files.

## 20. Interpretation and release locks

Synthetic observations cannot establish that 128 MiB is safe, that 400–500 MiB is supported, or that parser memory is known. The 128 MiB ceiling, real-parser flag, real DEM, parity, determinism, Attempt 9/10+, Canonical, Railway, database, Storage, secrets, and attestation gates remain unchanged.
