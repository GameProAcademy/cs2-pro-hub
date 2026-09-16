# FASE 2.7.2D.4-B.2–B.5 — Railway alignment contract

Status: **READY FOR RAILWAY SYNC**. This document does not authorize a deploy or a real-demo run.

## Runtime boundary

Railway owns only the parser/worker runtime under `services/cs2-demo-parser/`. The APP owns orchestration, queue authorization, database and Storage access, RAW verification, the final forensic audit decision, Canonical persistence, metrics, and pipeline lifecycle.

The Railway branch is `infra/cs2-parser-worker-v8`. Never merge `main` into it wholesale. Compare and transfer parser files individually. Do not copy `src/lib/pipeline/`, `src/routes/`, React code, Canonical persistence, migrations, or APP-only runtime code.

### File matrix

| Category | Files | Rule |
| --- | --- | --- |
| MUST SYNC | `app.py`, `worker.py`, `settings.py`, `hot_payload.py`, `raw_artifact.py`, `raw_evidence.py`, `demo_integrity.py`, `parser.py`, `adapter.py`, `errors.py`, `Dockerfile`, `requirements.txt` | Compare individually and apply only the parser contract changes. Include any other module imported directly by these files. |
| MUST PRESERVE FROM RAILWAY | `parser_child.py` and its caller; Railway service/start configuration | Preserve child-process isolation, bounded tick extraction, `parse_grenades(grenades=False)`, RSS/stage logging, and safe failure behavior. This file is not present in APP `main`, so it must never be deleted or replaced blindly. |
| TEST ONLY | `tests/`, `pytest.ini`, `requirements-dev.txt` | Sync to CI/audit workspace; not required in the production image. |

Before synchronization, produce a file-by-file diff. A missing Railway checkout or missing `parser_child.py` blocks deployment approval; it does not justify reconstructing that production optimization from memory.

## Frozen contracts

- Parser: `demoparser2==0.42.0`.
- Parser contract version: `1`; parser version and contract version are independent.
- Production revision: `PARSER_REVISION=git:<40 lowercase hex>`, matching the build actually deployed. Missing, opaque, `unknown`, `none`, or package-version fallbacks fail startup.
- Durable completion: `{ "hot": {...}, "raw": {...} }`, target 4 MiB and hard maximum 8 MiB.
- RAW never crosses `/complete`; the reference must be READY.
- RAW chunks: JSONL gzip, target 4 MiB, hard maximum 8 MiB, physical-byte SHA-256, cross-section `previous_chunk_sha256`, section digests, deterministic root digest, and manifest.
- Artifact path: `{user_id}/{upload_id}/attempt-{demo_jobs.attempt_number}`. `dispatch_attempt` is only queue/lease ownership. A technical retry reuses the logical artifact; a new logical attempt creates a new prefix.
- Unclassified events remain in RAW, increment `unclassified_event_rows`, and make HOT partial without invalidating it.
- AIM, position, and economy remain empty and `not_implemented`; no values are inferred.
- After READY, identity, chunks, manifest, root, and audit decision are immutable.
- Railway receives signed object-scoped upload URLs only. It must not receive a service-role key, database password, or permanent Storage credential.

The worker transports `audit_evidence`; the APP derives and persists `approved` or `blocked`. A worker-provided `manifest.audit_status` is informational and cannot approve Canonical admission. Canonical remains gated by READY, verified chunks, valid chain/root/manifest, APP-approved RAW audit, and a valid HOT contract.

## Legacy endpoint

`POST /v1/parse` is the legacy, non-durable contract and may still return inline `raw_evidence`. Do not remove or silently change it during Railway alignment. Its configured response ceiling may make large historical responses fail with `PAYLOAD_TOO_LARGE`; this conflict must not be resolved by raising the durable 8 MiB ceiling. Production ingestion uses the durable queue path.

## Memory and observability

RAW writing is incremental for transport and persistence, but the current parser still materializes large native structures before chunking. This is not full parser streaming, and no demoparser2 callback support is claimed.

The Railway-specific `parser_child.py` must retain parser isolation, bounded tick extraction, `parse_grenades(grenades=False)`, RSS measurements, stage logs, and safe failure. Logs may identify job, message, dispatch attempt, logical attempt, stage, artifact, section, chunk, row/byte counts, short digest prefixes, and RSS. They must never contain signed URLs, bearer tokens, secrets, sensitive paths, or unnecessary full SHA values.

## B.2 — Surgical synchronization

1. Check out `infra/cs2-parser-worker-v8` separately; do not merge `main`.
2. Record the APP revision lock expected by the current code: `git:45c75ffe92ff386bd07affc16ec1d635e81e6371`. The deployed parser build must report that exact immutable identity or the APP gate remains closed.
3. Diff each MUST SYNC file and its direct imports.
4. Reconcile `parser_child.py` manually, preserving all Railway memory safeguards.
5. Run parser and contract tests in the candidate tree.
6. Confirm the candidate diff contains no APP files, migrations, data changes, secrets, or environment files.

## B.3 — Environment/configuration audit

Check names and presence without printing values.

| Variable | Production contract |
| --- | --- |
| `PARSER_TOKEN` | required secret |
| `PARSER_REVISION` | required `git:<deployed 40-hex commit>` |
| `PARSER_CONTRACT_VERSION` | `1` |
| `ENVIRONMENT` | `production` |
| `MAX_DEMO_BYTES` | `1610612736` (1.5 GiB); do not raise |
| `MAX_PAYLOAD_BYTES` | at most `8388608`; target remains 4 MiB |
| `DOWNLOAD_TIMEOUT_SECONDS` | audited deployment value |
| `PARSE_TIMEOUT_SECONDS` | audited deployment value |
| `DEMO_PIPELINE_BRIDGE_URL` | canonical APP bridge ending in `/api/public/pipeline-worker` |
| `DEMO_PIPELINE_BRIDGE_SECRET` | required shared secret |
| `DEMO_PIPELINE_WORKER_ID` | stable worker identity |
| `DEMO_QUEUE_POLL_SECONDS` | positive bounded interval |
| `DEMO_QUEUE_HEARTBEAT_SECONDS` | positive and safely below lease duration |

Gate B.3 fails on a missing/mismatched variable, an unpinned revision, a payload ceiling above 8 MiB, or any privileged backend/Storage credential exposed to Railway.

## B.4 — Controlled deployment gate

Not executed in this phase. Before deployment:

1. Require an approved file-by-file diff and green candidate tests.
2. Record the currently deployed Railway revision and image for rollback.
3. Verify the candidate revision equals `PARSER_REVISION` and APP expected revision.
4. Deploy one worker with queue consumption disabled or no real claim eligibility.
5. Verify `/health` and `/version`; `/version` must report name `demoparser2`, version `0.42.0`, contract `1`, and the exact revision.
6. Verify sanitized startup/stage/RSS logs and bridge authentication without claiming the reserved real job.
7. Enable consumption only after explicit approval. Roll back immediately on startup loops, identity mismatch, unauthorized bridge responses, memory regression, or contract failure.

## B.5 — Smoke-test gate

Not executed in this phase. The reserved Cache job/upload may be used only after B.2–B.4 approval. Do not create another attempt, re-enqueue, mutate history, or force database state.

Measure and record RSS before parsing, after ticks, after grenades, after RAW preparation, after RAW completion, and peak RSS; parsing time; grenade row count; tick row count; completion body bytes; RAW chunk totals; and final lifecycle. Then verify Storage, `PBDEMS2`, SHA/size, parser identity, HOT bounds, RAW physical hashes, chain/root/manifest, APP audit, Canonical, metrics, idempotency, and historical LEGACY/UNVALIDATED preservation. Any failed gate leaves the real E2E **NOT READY** and must be reported by exact invariant rather than labeled generically as corruption.

## Current decision

- B.2 contract and sync plan: ready.
- B.3 audit checklist: ready, not executed against Railway values.
- B.4 controlled deploy: not executed.
- B.5 real smoke test: not executed.
- Overall: **READY FOR RAILWAY SYNC**, not **READY FOR REAL E2E**.