# G.6-R.4-C.10-R1 — Post-hardening readiness

Final state: **IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9**.

## Readiness answers

| Question | State | Evidence |
| --- | --- | --- |
| ACL hardening complete? | YES | Live ACL inspection after migration |
| Nonce table private? | YES | No anon/authenticated/PUBLIC privileges; service role is append-only |
| Provenance table correctly restricted? | YES | No client privileges; service role has read/create only |
| RLS correct? | YES | RLS remains enabled; direct client grants are absent |
| Immutable triggers present? | YES | Both nonce and provenance mutation triggers observed live |
| Event matrix complete? | YES | 40 catalogue events documented |
| Event matrix automatically validated? | YES | Catalogue/document set-equivalence regression test |
| Cache-specific gate clarified? | YES | Dedicated `assert_cache_attempt_9_ready` and compatibility wrappers |
| HMAC configured? | NOT_VERIFIED | External prerequisite; no secret was created or inspected |
| Runtime provenance verified? | NOT_VERIFIED | Live table contains zero rows and zero VERIFIED rows |
| OIDC verified? | NOT_VERIFIED | No production attestation was fabricated or submitted |
| Python/WASM parity executed? | NOT_RUN | Comparator exists; no real DEM execution occurred |
| Determinism executed? | NOT_RUN | Harness requires four independent real runs |
| Tick authority verified? | NOT_VERIFIED | FULL_TICK_DOMAIN_AUTHORITY requires real VERIFIED evidence |
| Identity verified? | NOT_VERIFIED | Real replay and persistence proof remain absent |
| Forensic integrity verified? | NOT_VERIFIED | Controlled real replay was not executed |
| Attempt 9 executed? | NO | Attempt 9 and 10+ remain absent |
| Canonical promotion performed? | NO | 105 mappings, zero authorized, zero verified |
| Cleanup performed? | NO | No deletion or retention action was run |
| Release ready? | BLOCKED | Required production evidence is absent |

## Live ACL validation

| Table | Grantee | Privilege | Expected | Actual | Result |
| --- | --- | --- | --- | --- | --- |
| `parser_attestation_nonces` | anon/authenticated/PUBLIC | any | none | none | PASS |
| `parser_attestation_nonces` | service_role | SELECT, INSERT | only these | only these | PASS |
| `parser_attestation_nonces` | service_role | UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES | none | none | PASS |
| `parser_runtime_provenance` | anon/authenticated/PUBLIC | any | none | none | PASS |
| `parser_runtime_provenance` | service_role | SELECT, INSERT | only these | only these | PASS |
| `parser_runtime_provenance` | service_role | UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES | none | none | PASS |

## Release gate matrix

| Gate | Current status | Required next step |
| --- | --- | --- |
| Security ACL / RLS / nonce | PASS | Preserve current grants and immutability |
| Provenance / OIDC / HMAC / runtime | BLOCKED | Supply independent production attestation through the approved channel |
| Identity / tick / parity / determinism / forensic integrity | NOT_RUN or NOT_VERIFIED | Execute the separate authorized operational phase |
| Mapping / Canonical | BLOCKED | Verify and authorize all 105 mappings; no automatic promotion |
| Attempt 9 | BLOCKED | Satisfy every required gate before controlled replay |
| Cleanup | NOT_RUN | Run only after the future lifecycle permits it |

The migration changed access and gate naming only. It did not create evidence, process or copy a DEM, enqueue work, create Attempt 9, authorize Canonical, run cleanup, alter Railway, or modify historical rows.