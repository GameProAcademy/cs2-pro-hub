# Large DEM browser memory measurement

STATUS: H.1-R PASS / H.1-M0 PASS / H.1-M0.1 PASS / H.1-M COMPLETE — 15/15 SYNTHETIC RUNTIME OBSERVATIONS

## 1. Scope

This phase provides a local browser laboratory for controlled, synthetic memory observations.

## 2. Classification

Every report is `EXPERIMENTAL`, `DIAGNOSTIC_ONLY`, `NON_PRODUCTION`, and `NO_REAL_DEM`.

## 3. Non-goals

It does not parse a DEM, exercise demoparser2/WASM, validate gameplay semantics, authorize Canonical, or support production admission.

## 4. Current execution status

H.1-M was executed manually in the dedicated Preview runtime on 2026-09-24. All 15 protocol runs were accepted: 16, 32, 64, 96, and 128 MiB, three repetitions each.

The detailed evidence is recorded in `LARGE-DEM-BROWSER-MEMORY-H1-M-RUNTIME-EVIDENCE-2026-09-24.md`.

## 5. Feature gate

`VITE_CLIENT_DEM_MEMORY_LAB` is public, non-secret, independent, and false by default.

The official authenticated administrative surface is `/admin/memory-lab`. It depends only on this Memory Lab gate and browser capabilities; it does not depend on `VITE_CLIENT_DEM_PARSER_POC_ENABLED`. When disabled, the route renders `FEATURE_DISABLED` and does not mount the laboratory. The administrative navigation entry is hidden.

## 6. Required browser capabilities

Execution requires Worker and File APIs, a secure context, cross-origin isolation, and `performance.measureUserAgentSpecificMemory`.

## 7. Fail-closed behavior

A missing capability produces a factual unavailable state. There is no `performance.memory` fallback and no inferred measurement.

## 8. Fixtures

Fixtures are locally generated, deterministic, synthetic logical `File` objects without DEM semantics. A fixture's declared size is its logical byte length, not a claim about its physical browser-memory footprint.

## 9. Approved sizes

Only 16, 32, 64, 96, and 128 MiB are accepted.

## 10. Hard ceiling

`MAX_SYNTHETIC_FIXTURE_BYTES` derives from the existing `CLIENT_DEMO_MAX_BYTES`. Values above 128 MiB are rejected before allocation.

## 11. Input boundary

The dedicated Worker reuses the contiguous-input materialization boundary. For the H.1-M experiment, the Worker creates the synthetic fixture and materializes its ArrayBuffer internally.

The Worker retains the resulting contiguous ArrayBuffer until the runner completes the `postMaterialization` sample. Only then does the runner send the explicit release command and wait for the `MATERIALIZATION_RELEASED` acknowledgement before terminating the Worker.

## 12. Parser isolation

The Worker does not import or call parser, WASM, server, database, Storage, Railway, attestation, or Canonical APIs.

## 13. Measurement sequence

A run follows an explicit sequence: validate capabilities; sample baseline; create the synthetic logical File; sample post-fixture and pre-materialization; create the Worker; send the command; receive start and completion events; sample post-materialization while the contiguous ArrayBuffer remains retained in the Worker; request release; wait for release acknowledgement; terminate the Worker; stabilize; and sample post-cleanup.

There is no concurrent or guaranteed sample during materialization.

## 14. Evidence semantics

The displayed peak is `max(postFixtureBytes, preMaterializationBytes, postMaterializationBytes)`. It is the maximum of those observed samples, not an absolute peak, a sample guaranteed during materialization, or a universal guarantee. The post-cleanup sample is not included.

## 15. Cleanup semantics

The Worker is explicitly released and terminated and references/listeners are cleaned up. `observedCleanupDeltaBytes` is only the arithmetic difference between post-cleanup and baseline. Positive, zero, and negative values all receive the neutral `CLEANUP_OBSERVED` status and do not diagnose a leak, stability, reclamation, or browser behavior. An unavailable cleanup sample is `CLEANUP_MEASUREMENT_UNAVAILABLE`.

## 16. Timeout and cancellation

Each run is bounded to at most 60 seconds. Timeout, cancellation, Worker error, and malformed messages terminate the Worker and fail closed.

## 17. Repetitions

The operator may request one to three foreground runs. There is no polling, background loop, or automatic execution.

The H.1-M protocol is 15 explicit runs: 16, 32, 64, 96, and 128 MiB, with three repetitions per size. The page shows a local progress matrix; opening the page or changing a control never starts a run.

## 18. Data handling

Results remain in React memory. No bytes are returned from the Worker, persisted, uploaded, logged, or sent to analytics.

## 19. Diagnostic report

The copy action emits textual JSON containing metadata and numeric observations only. It includes no fixture bytes or user files.

## 20. Interpretation and release locks

Synthetic observations cannot establish that 128 MiB is safe, that 300–500 MiB is supported, or that parser memory is known.

The 128 MiB ceiling, real-parser flag, real DEM, parity, determinism, Attempt 9/10+, Canonical, Railway, database, Storage, secrets, and attestation gates remain unchanged.

## 21. Evidence Integrity / H.1-R

1. No measurement is represented as guaranteed to occur during materialization.
2. The runner records only baseline, post-fixture, pre-materialization, post-materialization, and post-cleanup samples.
3. `observedPeakBytes` is the maximum of three observed pre-cleanup samples, not an exact runtime peak.
4. `observedCleanupDeltaBytes` is observational arithmetic, not a memory diagnosis.
5. Fixture size describes a synthetic logical File, not its physical footprint.
6. Worker messages are schema-validated and malformed or foreign-request events fail closed.
7. Timeout, cancellation, Worker errors, and all completion paths terminate the Worker and remove listeners.
8. Reports contain serializable metadata only and remain local.
9. No result demonstrates that 300–500 MiB is safe, that a real DEM can be processed, or that the 128 MiB limit may increase.
10. No result authorizes production, Canonical, attestation, backend persistence, or H.2.

## 22. H.1-M runtime configuration and closure

The accepted runtime was an isolated Preview/experimental build. The production/repository defaults remain OFF.

H.1-M is CLOSED for the stated synthetic diagnostic experiment after 15/15 accepted observations.

The separate `moduleWorkerBootstrapProbe` remained `FAIL` in the reports. This is diagnostic-only and is not the measurement Worker path. The successful measurement path is the Vite-managed `?worker&inline` Worker, which reached `MATERIALIZATION_COMPLETE` in all 15 accepted runs.

No real DEM, parser/WASM, backend request, persistence, analytics, Railway request, Canonical admission, R5.8 action, or attestation was performed.
