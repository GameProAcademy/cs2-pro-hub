# R5.8.3 repair and R5.8.4 preparation

## Scope
- Repair direct execution of the read-only R5.8.3 Python preflight without relying on implicit `PYTHONPATH`.
- Add regression coverage for the exact workflow entrypoint and preserve immutable workflow action pins.
- Prepare a fail-closed, evidence-driven 32-gate reconciliation representation for R5.8.4 without running attestation or authorizing execution.
- Update only release-gate documentation and targeted tests needed to reflect the actual state.

## Implementation
1. Bootstrap the repository root deterministically before importing the shared attestation module; keep one implementation and unchanged security contracts.
2. Add a subprocess regression test proving the script reaches argument/runtime validation rather than failing module import.
3. Validate workflow syntax, triggers, fetched runtime branch, explicit pytest installation, artifact retention, and SHA-pinned actions.
4. Audit the 32 gates and encode missing/error evidence as `NOT_PROVEN` or `BLOCKED`, never optimistic success.
5. Run syntax checks, focused Python suites in an isolated environment, TypeScript checks, lint, frontend tests, build, browser parser sealing, and diff review.

## Safety boundaries
- No Attempt 9/10+, real DEM, queue claim/publish, RAW production write, Canonical authorization, attestation dispatch, database mutation, Railway mutation/deploy, secret change, or provenance write.
- R5.8.3 green means only ready for a separately authorized fresh attestation preflight; it never grants execution authority.
