# F.2.10 determinism report

## Status

`NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE`

The determinism evaluator requires the same DEM SHA, exactly two normalized Python output digests and exactly two normalized WASM output digests. Missing runs return `NOT_RUN`; unequal repeated digests return `FAIL / DETERMINISM_FAIL`. Artifact and contract digest stability is not accepted as parser-result determinism.

Each run carries its own run ID, runtime, DEM SHA-256, parser identity/version/revision, WASM artifact identity when applicable, normalized digest, start time, duration and terminal status. The evaluator requires exactly 2×Python + 2×WASM; extra, failed, mismatched-SHA or identity-inconsistent runs fail closed.

The future fixture identity is pinned, but no real execution occurred in this preparation; no real run manifest or digest has been fabricated. `PYTHON × WASM VERIFIED = NO` and `DETERMINISM VERIFIED = NO`.

## A9.1-R1.1 preparation

The report records pythonDeterministic, wasmDeterministic, identityStable, artifactStable, catalogStable, contractStable, demoStable and determinismDecision. Runtime fingerprints are complementary only. Exactly four unique successful full-file runs and all stable identities are mandatory. Normalized output digests are compared within each runtime, never across run IDs, timestamps or durations. PASS parity plus FAIL determinism, or the converse, remains FAIL. All authorization flags and canonicalEligible remain false. Browser large-DEM A9.2 is LOCKED and separate.

## F.2.10-L/M/N identity rules

The evaluator requires exactly two Python and two WASM runs, four distinct run IDs, one DEM SHA, pinned parser identities/revisions, one catalog version/digest, and one contract version/digest. Python uses a UUID execution nonce; run identity and timestamps are excluded from the semantic digest. Duplicate run IDs fail as `DUPLICATE_RUN_IDENTITY`; catalog and contract divergence fail before comparison.
