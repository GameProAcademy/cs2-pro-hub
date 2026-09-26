# H.3-E.9.1-R2 — Execution baseline and read-only ledger

Status: **IMPLEMENTED / BLOCKED / DIAGNOSTIC-ONLY**. This is not an execution authorization.

The server records `baselineStartedAt` at the start of its preflight, before the negative anonymous POST. The additive `h3e91_execution_ledger_after_baseline(timestamptz)` RPC is SQL-only, `STABLE SECURITY DEFINER`, has an empty search path and grants execution only to `service_role`. The baseline is an ephemeral request argument, not a stored authorization. The artifact carries both the baseline and a 600-second freshness verdict; malformed, future, or stale timestamps block readiness.

`historicalStartedJobCount` counts rows with a start and finish before the baseline. The after-baseline counters inspect started jobs spanning the baseline, exact Cache DEM SHA **and** size, and Attempt 9 / 10+ rows. `demo_jobs.started_at` records a worker claim, **not proof that the parser completed or processed a DEM**. Job rows and timestamps can be retried or removed; thus zero rows cannot prove absence of execution. The collector converts zero real/Cache execution counts to `UNKNOWN` and blocks, while positive counts are blocking signals. Missing/invalid timestamps and failed RPC calls also block. These counters must never be called an immutable audit trail or substituted for execution authorization.

The original diagnostic RPC remains the authority for migration/security/provenance/nonce/Canonical counts and historical Attempt 9 locks. The new RPC does not change pins, recorder, data or policy. Evidence remains `UNKNOWN` rather than claiming that any actual DEM, Cache DEM or first valid attestation ran. No workflow was dispatched by this implementation.

Closure needs an independently reviewed, append-only execution event source with durable start evidence and exact Cache identity, plus reviewed collection and temporal validation. Until then H.3-E.9.1-R2 is **BLOCKED**, regardless of other green signals.