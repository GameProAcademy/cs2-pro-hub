# F.2.10 determinism report

## Status

`NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE`

The determinism evaluator requires the same DEM SHA, at least two normalized Python output digests and at least two normalized WASM output digests. Missing runs return `NOT_RUN`; unequal repeated digests return `FAIL / DETERMINISM_FAIL`. Artifact and contract digest stability is not accepted as parser-result determinism.

Each run carries its own run ID, runtime, DEM SHA-256, parser identity/version/revision, WASM artifact identity when applicable, normalized digest, start time, duration and terminal status. The evaluator requires exactly 2×Python + 2×WASM; extra, failed, mismatched-SHA or identity-inconsistent runs fail closed.

No authorized real DEM exists, so no run manifest or digest has been fabricated. `PYTHON × WASM VERIFIED = NO` and `DETERMINISM VERIFIED = NO`.

## F.2.10-L/M/N identity rules

The evaluator requires exactly two Python and two WASM runs, four distinct run IDs, one DEM SHA, pinned parser identities/revisions, one catalog version/digest, and one contract version/digest. Python uses a UUID execution nonce; run identity and timestamps are excluded from the semantic digest. Duplicate run IDs fail as `DUPLICATE_RUN_IDENTITY`; catalog and contract divergence fail before comparison.
