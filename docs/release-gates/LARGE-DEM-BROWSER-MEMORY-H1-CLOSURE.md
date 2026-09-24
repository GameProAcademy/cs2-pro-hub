# Large DEM Browser Memory H.1 Closure

STATUS: H.1-R PASS / H.1-M0 READY / H.1-M SMOKE FAILED TWICE → WORKER LIFECYCLE INSTRUMENTED / RERUN PENDING

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
- [x] Isolate the first failure to the synthetic Worker boundary: the first implementation structured-cloned the synthetic `File` into the Worker; the corrected implementation sends only the validated descriptor and creates/materializes the synthetic fixture inside the Worker.
- [x] Record the second 16 MiB × 1 smoke failure as `MATERIALIZATION_FAILED`; this run predates the latest Worker lifecycle instrumentation and therefore does not identify the underlying Worker stage.
- [x] Instrument the Worker lifecycle with `WORKER_READY`, command/stage events, `messageerror`, distinct Worker `error`, and a sanitized `workerLifecycleStage` result field. The command is now posted only after `WORKER_READY`; file creation and `arrayBuffer()` are separately observable stages.
- [x] Verify the lifecycle instrumentation through the full CI gate: web tests passed, TypeScript passed, lint passed, build passed, parser tests passed, and contract-sensitive parser tests passed on commit `6f8e0f7619fd2d712243e40172f72befca345bed`.
- [ ] Rerun the 16 MiB × 1 smoke test against the corrected Preview build and record only the metadata defined by the manual protocol.
- [ ] After a successful smoke test, execute the complete 15-run H.1-M matrix.

Passing implementation tests do not make H.1 runtime validated. Both browser smoke runs are retained as failed diagnostic observations; neither counts as an accepted H.1-M observation. The next required action is a fresh 16 MiB × 1 smoke run against a Preview build that contains the lifecycle instrumentation. Do not execute the 15-run matrix until that smoke run is accepted. H.1-M remains pending and H.2 remains blocked.
