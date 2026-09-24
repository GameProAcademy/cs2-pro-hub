# Large DEM Browser Memory H.1 Closure

STATUS: H.1-R PASS / H.1-M0 READY / H.1-M SMOKE FAILED → CORRECTION APPLIED / RERUN PENDING

## H.1-R implementation criteria

- [x] Deterministic lifecycle without a concurrent in-flight memory sample.
- [x] Explicit `postMaterializationBytes` after Worker completion.
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
- [x] H.1-M0.1 route isolation headers are implemented on the dedicated Memory Lab route; runtime gate verified in Preview as cross-origin isolated with Memory API available.
- [x] Disabled route is inert and reports `FEATURE_DISABLED`; administrative navigation is hidden.
- [x] Local 15-run H.1-M progress matrix and complete metadata result fields are exposed without persistence.

## Pending closure criteria

- [x] Complete all CI gates for H.1-R: 1,184 web tests, 189 parser tests, 66 contract-sensitive parser tests, TypeScript, lint, and build passed.
- [x] Execute initial H.1-M smoke test (16 MiB × 1) in a compatible foreground browser; the run failed closed with `MATERIALIZATION_FAILED` before materialization completion.
- [x] Isolate the failure to the synthetic Worker boundary: the first implementation structured-cloned the synthetic `File` into the Worker; the corrected implementation sends only the validated descriptor and creates/materializes the synthetic fixture inside the Worker.
- [ ] Rerun the 16 MiB × 1 smoke test against the corrected Preview build and record only the metadata defined by the manual protocol.
- [ ] After a successful smoke test, execute the complete 15-run H.1-M matrix.

Passing implementation tests does not make H.1 runtime validated. The first smoke run is retained as a failed diagnostic observation; it does not count as an accepted H.1-M observation. H.1-M remains pending and H.2 remains blocked.
