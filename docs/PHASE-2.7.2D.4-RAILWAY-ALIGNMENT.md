# FASE 2.7.2D.4 — Railway alignment contract (current worker CI reference)

Status: **READY FOR RAILWAY SYNC**. This document is a CI/runtime-contract reference only. It does not authorize a deploy, a real-demo run, an Attempt 9 creation, or Canonical admission.

## Runtime boundary

Railway owns only the parser/worker runtime under `services/cs2-demo-parser/`. The APP owns orchestration, queue authorization, database and Storage access, RAW verification, forensic audit, Canonical persistence, metrics, features, and pipeline lifecycle.

The Railway service is configured to use the GitHub branch `infra/cs2-demo-parser-worker-v8`. That branch is now present and points to the currently deployed commit `5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`, preserving runtime parity.

Never merge `main` into the worker branch wholesale. Compare and transfer parser files individually. Do not copy APP React code, Canonical persistence, unrelated migrations, secrets, or environment files into the worker runtime.

## Frozen current identity

- Parser: `demoparser2==0.42.0`.
- Parser contract: `1`.
- Current deployed Railway branch: `infra/cs2-demo-parser-worker-v8`.
- Current deployed Railway commit: `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`.
- The deployed revision must remain an immutable `git:<40 lowercase hex>` identity.
- The runtime must report the same semantic and build revision.
- Creating the missing GitHub branch above does not by itself authorize or require a Railway redeploy.

## MUST PRESERVE Railway-specific safeguards

`parser_child.py` is a production-specific safety boundary and must remain present and intact unless a separately audited replacement is proven equivalent.

Required safeguards include:
- child-process isolation;
- bounded tick extraction before native parser invocation;
- `parse_grenades(grenades=False)`;
- RSS/stage diagnostics;
- safe native-parser failure handling;
- no privileged backend credentials in the worker;
- no full signed URLs, bearer tokens, secrets, or unnecessary full hashes in logs.

The worker's bounded tick sample is **diagnostic evidence only**. It must never authorize a full tick-domain claim.

## Contract invariants

- Unknown/absent is never converted to zero, false, or empty string.
- Tickrate is used only when supplied by real parser evidence.
- Duration is never inferred without authoritative tickrate.
- Team slot is not a round side.
- Nickname is not a strong identity.
- Events must be flat and deterministically round-resolvable.
- Unresolvable events remain auditable as dropped/blocked evidence; they must not silently become Canonical.
- RAW evidence remains the authoritative forensic source.
- Canonical admission remains fail-closed.
- `quality_flags` is JSONB and must receive JSONB values, never a PostgreSQL text array.
- RAW READY/audit approval is necessary but not sufficient for Canonical admission.

## CI scope

The parser-worker CI workflow is deliberately limited to:
- Python 3.12;
- dependency installation from `requirements-dev.txt`;
- compileall;
- pytest;
- production revision guard.

The workflow triggers on both the current Railway branch and the legacy `infra/cs2-parser-worker-v8` naming family so historical branches remain testable.

## Real-demo prohibition

Passing this CI does not authorize:
- creation of Attempt 9;
- re-enqueue of Attempt 8;
- mutation of historical matches;
- direct insertion into uploads/jobs/audit logs;
- Canonical persistence;
- metrics/features generation;
- AI Coach consumption.

Those operations require the separate provenance attestation and real-demo gates.

## Current decision

- Worker CI contract reference: maintained.
- Railway deployment: unchanged by this PR.
- Real DEM E2E: not authorized.
- Attempt 9: not authorized.
