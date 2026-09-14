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

## Lifecycle and idempotency

- `pending` creates one queue message for the current retry attempt.
- Claim validates message ID, job ID, upload ID, SHA, attempt, and current state.
- Heartbeat renews both the pgmq visibility timeout and `demo_jobs` lease.
- Completion is accepted only for the current claim. Queue archive follows
  successful persistence.
- Failure archives the current message atomically; transient failures re-enter
  `pending` within the existing retry ceiling, which creates the next message.
- Terminal, cancelled, malformed, and stale messages are archived or rejected.
- Existing jobs were not backfilled. `durable_dispatch_enabled` activates only
  for jobs inserted or explicitly moved into `pending` after this migration.

## Security

The bridge uses a dedicated bearer secret and constant-time digest comparison.
The browser cannot execute queue RPCs, and Railway never receives a privileged
database key. Inputs are bounded and validated; errors do not include tokens,
signed URLs, stack traces, or personal data.

## Deployment

APP: configure `DEMO_PIPELINE_BRIDGE_SECRET` and publish.

Railway: configure the same secret, set
`DEMO_PIPELINE_BRIDGE_URL=https://gamepro.network/api/public/pipeline-worker`,
and optionally set worker ID, poll interval, and heartbeat interval. Deploy this
revision. Existing `/health`, `/version`, and `/v1/parse` remain available.

## Validation status

Queue schema and protected RPCs are applied. App contract tests and static types
pass. No real demo was submitted or processed, and the historical Cache job was
not altered. Therefore the phase is **IMPLEMENTATION COMPLETE / REAL E2E NOT YET
PROVEN**, not CLOSED.