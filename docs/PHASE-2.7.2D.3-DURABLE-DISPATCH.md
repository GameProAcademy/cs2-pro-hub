# FASE 2.7.2D.3 — Durable demo dispatch

## Architecture

`demo_jobs` remains the lifecycle source of truth. `pgmq` supplies one durable
transport queue named `demo_parse`; no custom queue table exists. Messages carry
only job/upload identifiers, SHA-256, attempt, schema version, and request time.
They never contain demo bytes or a signed URL.

The existing scheduler now performs bounded recovery, queue reconciliation,
temporary-file cleanup, and FACEIT work. It never parses a demo. A persistent
Railway consumer calls the authenticated APP bridge to claim work. Only then does
the APP mint a short-lived private URL. Railway downloads and verifies the file,
runs demoparser2, renews its lease, and sends the existing RawParserOutput back.
The APP alone writes RAW evidence, canonical data, projections, and final status.

## RAW forensic admission

RAW evidence is immutable forensic material; Canonical is derived semantic data.
The APP persists RAW before normalization, inventories available and selected
parser material separately, and preserves unknown fields in the mapping inventory.
Canonical admission requires an explicit versioned `PASS` decision. Available but
unmapped material produces `blocked_raw_audit`, preserves the RAW report, and is
terminal for automatic delivery so it cannot enter a retry loop. Canonical
persistence verifies the persisted approval again before writing derived data.

## Lifecycle and idempotency

- `pending` creates one queue message for the current retry attempt.
- Claim validates message ID, job ID, upload ID, SHA, attempt, and current state.
- Heartbeat renews both the pgmq visibility timeout and `demo_jobs` lease.
- Completion is accepted only for the current claim with an unexpired lease.
  Stale workers, duplicate completion, and heartbeat after lease loss are rejected.
  Queue archive follows successful persistence or a terminal RAW audit block.
- Failure archives the current message atomically; transient failures re-enter
  `pending` within the existing retry ceiling, which creates the next message.
- Terminal, cancelled, malformed, and stale messages are archived or rejected.
- Existing jobs were not backfilled. `durable_dispatch_enabled` activates only
  for jobs inserted or explicitly moved into `pending` after this migration.

## Security

The bridge uses a dedicated bearer secret and constant-time digest comparison.
The browser cannot execute queue RPCs, and Railway never receives a privileged
Inputs are bounded while streaming and validated; errors do not include tokens,
signed URLs, stack traces, or personal data.

## Deployment

APP: configure `DEMO_PIPELINE_BRIDGE_SECRET` and publish.

Railway: configure the same secret, set
`DEMO_PIPELINE_BRIDGE_URL=https://gamepro.network/api/public/pipeline-worker`,
and optionally set worker ID, poll interval, and heartbeat interval. Deploy this
revision. Existing `/health`, `/version`, and `/v1/parse` remain available.

## Validation status

Queue schema, RAW audit schema, and protected RPCs are applied. Focused APP and
worker contract tests cover RAW preservation/admission, stale leases, cancellation,
retry, and idempotent finalization. No real demo was submitted or processed, the
Railway deployment was not changed, and the historical Cache job was not altered.
Therefore the phase is **IMPLEMENTED / HARDENED / TESTED IN CODE — REAL FORENSIC
E2E NOT YET PROVEN**, not CLOSED.

The required scenarios are covered across the focused TypeScript and Python
suites: RAW persistence and blocking semantics (1–5), dual Canonical admission
defense (6–8), lease takeover/stale worker/finalization behavior (9–13, 16),
Canonical idempotency and cancellation (14–15), worker import/contract behavior
(17), and manifest inventory plus unknown-field preservation (18–20).