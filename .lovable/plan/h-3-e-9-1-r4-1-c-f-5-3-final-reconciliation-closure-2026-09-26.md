# H.3-E.9.1-R4.1-C/F.5.3 — Final reconciliation closure

## Goal
Close the remaining local/source/synthetic H3E91 proof gaps before R4.2, while keeping Railway, real DEM execution, Cache runs, Attempt 9+, attestation, and Canonical authorization blocked.

## Implementation
- Add a minimal authoritative lifecycle-read database function: `SECURITY DEFINER`, empty `search_path`, executable only by `service_role`, returning only lifecycle and terminal reconciliation fields.
- Add an authenticated, bounded reconciliation action for the Railway worker and a strict Python client contract.
- Update durable replay handling to read authoritative lifecycle state and suppress all parser reruns and incompatible terminal writes.
- Recover queue completion only when authoritative persisted completion material exists; otherwise return an explicit reconciliation-required state without fabricating output.
- Keep deterministic identity as job + attempt + upload and stable event IDs per execution transition.

## Proofs
- Add database ACL and lifecycle-state tests for NONE, INTENT_ONLY, STARTED, FINISHED, FAILED, ABORTED, INVALID, and read failures.
- Add independent HTTP original/retry/retry concurrency tests using fresh requests and recorder instances.
- Expand durable-worker tests for every lifecycle state, lost STARTED/terminal acknowledgements, terminal-before-completion, and completion acknowledgement loss.
- Expand the disposable PostgreSQL race harness for lifecycle, identity, event, and retry conflicts with post-race invariant checks.
- Complete failure-injection coverage across recorder, bridge, lifecycle read, heartbeat, terminal evidence, queue completion/failure, and reconciliation.

## Verification and release evidence
- Revalidate live database writer and lifecycle-reader privileges without inserting production ledger rows.
- Run the complete web, TypeScript, lint, build, browser-sealing, Python, H3E91, disposable PostgreSQL, contract, and Docker checks.
- Reconcile coverage, provenance, release-gate documentation, and roadmap using only observed evidence.
- Preserve external CI GREEN as reported, but do not claim new deployed Railway parity or runtime proof; R4.2 remains open and production activation remains blocked.
