# R11.2-R5 disposable lifecycle closure plan

## Outcome
Build and exercise one reconstructable, CI-only lifecycle from the pinned fixture through Storage, the real queue and worker, parser 0.42.0, RAW, HOT, FINISHED, and ACK. Keep every production, Railway, Canonical, historical DEM, and later-attempt lock unchanged. Job A remains fail-closed; only independent Job B can set `final_ci=PASS`.

## Implementation
1. **Reuse and complete the existing contracts**
   - Map the current upload, queue, lease, RAW, HOT/match-source, terminalization, retry, and archive interfaces.
   - Extend the disposable worker rather than introducing parallel production contracts.
   - Make the worker download the exact object named by the claimed job, verify size and SHA-256, and feed those downloaded bytes to the parser.

2. **Create the integrated success path**
   - Persist parser-derived RAW chunks and manifest through the existing database contract and private disposable Storage bucket.
   - Read every object back, independently recalculate chunk chain, manifest, root, and content digests, then commit RAW.
   - Derive HOT only from verified RAW, persist the matching source identity, finish the job only after all prerequisites, then archive the real queue message.
   - Emit bounded snapshots for every identity and transition without secrets.

3. **Exercise recovery and failure paths**
   - Run a real Worker A process, terminate it with SIGKILL at controlled boundaries, expire/reconcile its lease, and recover the same job with a distinct Worker B process.
   - Exercise ACK loss after committed FINISHED state and prove redelivery performs no second parser/RAW/HOT materialization before the final ACK.
   - Exercise an actual parser-boundary failure and preserve PROCESS_ABORTED as distinct from parser failure and cancellation.
   - Prove queue/retry idempotency and exactly-once committed results across the ten required recovery scenarios.

4. **Execute operation-backed matrices**
   - Run at least 16 distinct RAW corruption operations and verify each rejection by recalculation.
   - Run at least 50 genuine concurrent queue/lease/terminal/ACK operations.
   - Run at least 50 materially distinct injected failures across parser, Storage, RAW, HOT, queue, leases, terminalization, and ACK.
   - Record per-case provenance, timestamps, identities, before/after digests, and operational evidence.

5. **Harden evidence and independent attestation**
   - Expand Job A evidence and its verifier to require the full lifecycle, matrices, locks, and same-run provenance while leaving `final_ci=NOT_PROVEN`.
   - Make Job B reconstruct upload→job→queue→worker→parser→RAW→Storage→HOT→terminal→ACK from artifact contents, recalculate all digests and matrix results, and validate completed workflow/jobs/artifact identity.
   - Preserve Docker isolation, parser suites, browser sealing, and all 18 gates.

6. **Validate and iterate in GitHub Actions**
   - Run syntax, focused unit/integration tests, worker lifecycle, Storage/RAW, SIGKILL, ACK-loss, exactly-once, matrix verifier, diff checks, and the existing browser/parser checks.
   - Commit the complete implementation, inspect the real Quality Gates jobs/logs/artifacts/digests, fix the first concrete failure, and repeat until Job B closes or a reproducible external blocker remains.
   - Update the final report and roadmap with only observed evidence, including exact run/job/artifact identities and the 18-gate table.

## Technical constraints
- Accept only disposable localhost endpoints and redact all credentials from output and artifacts.
- Create missing buckets only for the exact `NoSuchBucket` response; verify private status and size limit, then perform write/read/delete checks.
- Do not promote standalone probes, generated rows, synthetic identities, or self-declared PASS values.
- Do not modify production data, production Storage, Railway, secrets, Canonical authorization, historical jobs, or the pinned fixture.
