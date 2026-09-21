# F.2.10 determinism report

## Status

`NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE`

The determinism evaluator requires the same DEM SHA, at least two normalized Python output digests and at least two normalized WASM output digests. Missing runs return `NOT_RUN`; unequal repeated digests return `FAIL / DETERMINISM_FAIL`. Artifact and contract digest stability is not accepted as parser-result determinism.
