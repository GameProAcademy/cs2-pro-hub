# G.6-R runtime and cleanup authority manifest

## Candidate identity

- Candidate commit: `2f8a76645c6030659f2ed0480469b1452e75f72e`
- Parser: `demoparser2` `0.42.0`
- Contract: `1`
- Required revision: `git:2f8a76645c6030659f2ed0480469b1452e75f72e`

## Runtime file SHA-256

| File                    | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `parser.py`             | `cc068c44cbe2fa788868d1701725b938a81298cf6d239d867b0c7d1e7e38de33` |
| `adapter.py`            | `f3c7c43f86c19cc0cd2eed4bb0513835cf67f149874357e4b76d73bc04a4ebe2` |
| `settings.py`           | `1b77a0eb92368dc204e91e5affda8e70b4a2613ca3f1c01110570150013c6166` |
| `app.py`                | `8c3f8539ff8669cf976ac3c5fad31ae90ec61b997fa0a2125fb26ae5bdae21b8` |
| `worker.py`             | `fcd9bc7b335bd7d885ff8a69ca145298aca6c523c2656d11f5357350013d38da` |
| `raw_evidence.py`       | `f83045495e2b286c032668cff4380f786917ecf624e461256ae06ac557d15cea` |
| `raw_artifact.py`       | `a9b63d70da6897abab4e2a7f8d1c58b0ed7489c88bbff429dd9011dadc40dd63` |
| `forensic_audit.py`     | `b57d85a2405ca53805d200a50fe14e0d1a284c81c84075a2fc76fd0e49454894` |
| `raw_manifest_audit.py` | `93ec1218a877151584b99ca550e0a2bcc50c612d96c57d07bd9400899a949e34` |
| `demo_integrity.py`     | `d9013d1bac85f7ee3aab4a0e5a301909e4bd7da7aa331620e76b051391f26672` |
| `hot_payload.py`        | `e41c16d137cd406c9a2088e96e8bf502971fca82d66318587d0635792945ca58` |
| `capability_catalog.py` | `1a53817f41fc79ee0fbaaf537d37cf2296018e6be3e0343adda370a1f32caa56` |
| `requirements.txt`      | `f379b80234924ec59422aeeb703fdabeba9953149904316f08557b905b936648` |
| `Dockerfile`            | `7cd7c1ae03e4b9061aff4f84928c8890d492c861467a07a847fbd89ab0b018c9` |

## Runtime surface

The candidate contains `_parse_event_with_context`, `_available_events`, `_parse_ticks`, `_parse_grenades`, `_audit_full_tick_domain`, `_discover_updated_fields`, `build_raw_evidence`, `extract_raw_material`, and `parse_demo_file`.

## Railway comparison

The requested `infra/cs2-parser-worker-v8` ref is absent from all accessible repository refs, and no Railway connection is available. The runtime source, process-isolation files, candidate image, and deployment environment cannot be compared or changed from this project.

Therefore `RAILWAY_RUNTIME_PARITY = BLOCKED`. This manifest is a MAIN candidate baseline only; it is not evidence of a deploy or runtime parity.

## Cleanup authority

`DEMO_CLEANUP_AUTHORITY = G6_VERIFIED_DELETE_ONLY`. Physical execution is disabled in application code and declared disabled by the service-role-only database authority function. Cron, cancellation, successful processing, and the administrative action cannot start deletion during G.6-R. The verified deletion implementation remains isolated for a separately approved operational gate.

No DEM, cleanup, retry, parse, Cache Run, Canonical write, AI operation, deploy, secret change, or historical rewrite was executed.
