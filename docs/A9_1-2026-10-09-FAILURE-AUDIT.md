# A9.1 WASM large-demo gate — failure audit (2026-10-09)

## Scope
Read-only diagnosis of GitHub Actions run 37889202183, job 113686045967. No workflow dispatch, no DEM download or parse by this audit, no runtime/database/secrets/Railway mutation, and no Lovable message.

## Confirmed result
- Workflow: `.github/workflows/a91-wasm-large-demo-remediation.yml`
- Job: `rebuild-and-gate`
- Step that failed: `Execute isolated hermetic A9.1 remediation + real DEM gate`
- Failure marker: `A91_STAGE_FAILURE stage=wasm_run_1 reason=WASM_RUN_FAILED`
- Sanitized evidence: `a91_real_dem_report.json` says `status=FAIL`, `reason=WASM_PARSE_FAILURE`, `stage=parse_ticks`.
- `parity_report.json`: `NOT_RUN / PARITY_NOT_REACHED`.
- `determinism_report.json`: `NOT_RUN / DETERMINISM_NOT_REACHED`.
- Safety latches remained false: `canonicalAuthorization=false`, `attempt9Authorization=false`, `productionAuthorization=false`, `canonicalEligible=false`.
- The WASM build itself completed and artifact-manifest hashes were emitted. The failure happened after WASM initialization and after earlier parser API calls; it is not a Rust install/build failure.
- Artifact ID: 11598221085; checksum of uploaded ZIP: `sha256:9daa5880cc109f0ac1ea0790b37fa3d33fed7b7457586b602e19f75508f95ba8`.

## Current root-cause status
The public report deliberately omits the raw exception and retains only a digest, so the exact underlying Rust/WASM error is not recoverable from the public report alone. The pipeline classifies most ordinary exceptions within a parsing call as `WASM_PARSE_FAILURE`; that bucket is too broad to prove whether the underlying fault was API usage, parser rejection, or another exception. The stage and API boundary are confirmed, but the exact low-level root cause is **not yet proven**.

## Critical adjacent risk in the workflow
The same workflow has `contents: write`, defaults `promote_on_pass=true`, and copies the rebuilt binding/WASM/manifest to `public/client-parser/demoparser2/0.42.0` then pushes to `main` if the process returns zero. This audit does not dispatch or change that workflow. A future execution must keep promotion disabled until parity, determinism, artifact review, and explicit operator approval have passed.

## Next safe diagnostic step
Add a local/synthetic regression harness that exercises the exact WASM `parseTicks` argument contract and preserves bounded, sanitized diagnostics. Run only synthetic/unit tests first. Do not re-run the real DEM gate until the failing call and the guardrails are reviewed and the operator explicitly authorizes another real-DEM run.

## Independent infrastructure snapshot at audit time
- Railway production service `cs2-demo-parser` is online, 1/1 replica, latest deployment `1b5778de-3eaf-46f1-9ea5-cba381d95313` SUCCESS.
- Railway has an unrelated staged patch `d66b5a12-a69e-4b9a-87b6-314f75c471cc` (one change), pending since 2026-09-16; it was not accepted or changed.
- This CI failure is in a separate isolated GitHub runner and does not show that Railway production failed.

## Decision
**A9.1 real-Demo gate: FAIL. Parity: NOT RUN. Determinism: NOT RUN. WASM promotion: NOT AUTHORIZED. Attempt 9 / Canonical admission: LOCKED.**
