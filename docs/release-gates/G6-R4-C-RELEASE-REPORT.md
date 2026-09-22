# G.6-R.4-C Release Report

| Item                     | Status      | Evidence / reason                                                                                                                                                                      |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                     | EXECUTED    | 2026-09-22 UTC                                                                                                                                                                         |
| App commit               | VERIFIED    | `a7bf5d6cc29b2f1ece6e925fb68fd5ca30612ba5` observed locally; this report does not claim it is the Railway source.                                                                      |
| Railway deployment       | BLOCKED     | Deployment `6330c8c4-a410-45db-a364-4eb47702c2fc` is pinned, but independent API evidence is unavailable.                                                                              |
| Railway commit           | BLOCKED     | `5703b1d88f21ee57fdd1d83722edf30e0f0c6f76` is reported live, but GitHub returned 404 and the branch/commit binding is not independently proven.                                        |
| Parser                   | VERIFIED    | Both live `/version` endpoints reported `demoparser2 0.42.0`.                                                                                                                          |
| Contract                 | VERIFIED    | Both live `/version` endpoints reported contract `1`.                                                                                                                                  |
| Provenance status        | BLOCKED     | Real database count remains `VERIFIED=0`. Freshness is based on `verification_timestamp`; immutable rows cannot be updated or deleted.                                                 |
| Attestor status          | IMPLEMENTED | Deterministic GitHub Actions producer and artifact-attestation workflow exist. `RAILWAY_DEPLOYMENT_EVIDENCE_JSON` plus a server-held HMAC secret are required; neither is fabricated.  |
| CI status                | NOT RUN     | Workflows are implemented for `infra/cs2-parser-worker-v8`; no completed remote run was observed in this phase.                                                                        |
| Matrix status            | VERIFIED    | 375 rows: 194 reconciled, 163 Python-only reviewed, 18 blocked; digest `a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702`. Non-Canonical blocked rows remain explicit. |
| Canonical mapping status | BLOCKED     | Seven required mappings are inventoried; all seven are unverified, zero are authorized, and real same-DEM parity/determinism remain absent.                                            |
| Tick status              | BLOCKED     | Full tick domain has not been proven. Bounded sampling is not accepted as authority.                                                                                                   |
| Python parity            | NOT RUN     | No authorized real same-DEM execution in this phase.                                                                                                                                   |
| WASM parity              | NOT RUN     | No authorized real same-DEM execution in this phase.                                                                                                                                   |
| Determinism              | NOT RUN     | No repeated real Python/WASM executions in this phase.                                                                                                                                 |
| Attempt 8                | VERIFIED    | One upload remains for the fixed user/SHA; no mutation was performed.                                                                                                                  |
| Attempt 9                | NOT RUN     | Count remains zero; reservation/finalization were not called.                                                                                                                          |
| Attempt 10+              | VERIFIED    | Count remains zero.                                                                                                                                                                    |
| Canonical                | BLOCKED     | No admission is authorized while provenance, mapping, tick, parity, determinism, and CI evidence remain blocked.                                                                       |
| Metrics                  | NOT RUN     | No new eligible Canonical data exists.                                                                                                                                                 |
| Features                 | NOT RUN     | No new eligible Canonical data exists.                                                                                                                                                 |
| AI                       | BLOCKED     | No unverified parser output is exposed to coaching.                                                                                                                                    |
| Cleanup                  | NOT RUN     | No object deletion or cleanup was executed.                                                                                                                                            |

## Gate result

`RELEASE_GATE_IMPLEMENTED / RELEASE_GATE_BLOCKED / BLOCKED_BEFORE_ATTEMPT_9`

The global database function checks 22 named conditions and fails closed. The scoped field gate intentionally separates overall matrix health from Canonical mapping health: blocked fields outside Canonical remain visible but do not alone block release. The current Canonical inventory still blocks release because its required mappings have no real parity or determinism proof.

## External prerequisites

- `RAILWAY_DEPLOYMENT_EVIDENCE_JSON`: trusted Railway deployment metadata for the pinned deployment, branch, and commit.
- A server-held `app.settings.parser_attestation_hmac_secret` matching the trusted workflow signer, or an approved OIDC verification path.
- A completed CI run on `infra/cs2-parser-worker-v8` and independently verified artifact attestation.
- Authorized real same-DEM Python/WASM parity, determinism, and full-tick evidence in a later phase.
