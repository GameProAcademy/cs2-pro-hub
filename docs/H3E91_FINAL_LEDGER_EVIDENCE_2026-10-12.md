# H3E91 Final Ledger Evidence — 2026-10-12

## Decision

**Worker build-identity gate: PASS. Durable managed-ledger gate: BLOCKED pending direct database evidence.**

This document records the independent checks performed after deployment of `main`. It does not declare the H3E91 production rollout complete, and it does not authorize production synthetic writes, DEM processing, RAW admission, Canonical promotion, or Attempt 9.

## Worker identity and liveness

Evidence reported by the project owner from the public Railway endpoints on 2026-10-12:

- `GET /health` returned `{"status":"ok"}`.
- `GET /version` reported `build.commit = 10815fb44e165963adfaf07f71c474ca628f4b7f`.
- `build.embedded = true`.
- `build.source = "railway"`.
- `build.declared_revision_matches = true`.
- Parser revision: `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`.

The GitHub combined status for the merge commit `10815fb44e165963adfaf07f71c474ca628f4b7f` reports the Railway service check as `success`. These facts establish worker liveness and image identity; they do not establish database persistence.

## Repository implementation reviewed

- Migration: `supabase/migrations/20261012100000_h3e91_worker_build_identity.sql`.
- Ledger table: `public.h3e91_execution_evidence_ledger`.
- New writer overload adds `_worker_build_commit`, includes it in the digest and insert, rejects missing/malformed Railway identity, checks identity consistency across lifecycle transitions, and revokes service-role execution on the legacy overload.
- Test harness: `scripts/h3e91-writer-concurrency.py`.
- Commit `3a903a347ffbfb65675d64afb1f6235d8cb38f2d` adds disposable PostgreSQL assertions for persistence, idempotent replay, conflicting identity rejection without mutation, malformed identity rejection, and revocation of the legacy writer.

The test source is present in GitHub. The source code alone is not proof that the test actually passed in the current release candidate; a successful CI job/artifact for the exact merge/deploy SHA must be retained.

## Managed database inspection result

The connected Supabase integration returned an empty project list (`projects: []`). It therefore does not expose the Lovable Cloud-managed database used by the published application. No SQL was run and no migration was applied by this audit.

Consequently, the following remain **unverified against the live managed database**:

1. Migration `20261012100000_h3e91_worker_build_identity.sql` is present in the managed migration history.
2. Column `worker_build_commit` exists on `public.h3e91_execution_evidence_ledger`.
3. The live 18-argument writer definition, ownership, `SECURITY DEFINER`, `search_path`, and grants match the intended reviewed contract.
4. The live legacy 17-argument overload no longer has EXECUTE permission for `service_role`.
5. Positive durable insert, idempotent replay, conflicting identity rejection without mutation, malformed/missing identity rejection, and historical-row preservation have passed on disposable PostgreSQL and/or been verified with suitable retained evidence.

## Required next actions

1. Obtain read-only schema/migration introspection through the actual Lovable Cloud database administration path; do not use the empty personal Supabase account as a substitute.
2. Run or retrieve the disposable PostgreSQL writer test result for the exact code under review. Preserve the CI run URL and artifact/log proving the assertions passed.
3. Compare live `pg_get_functiondef`, `pg_get_function_identity_arguments`, ledger columns, owner, `prosecdef`, `proconfig`, and grants with the reviewed migration.
4. If live schema differs, stop and reconcile the migration against the actual managed definition before applying anything.
5. After evidence is collected, update the release checklist and make a separate, reviewed decision about whether the H3E91 ledger gate can be marked PASS.

## Safety boundary

- No message or prompt was sent to Lovable by this audit.
- No production database was queried or mutated through the connected Supabase tool.
- No synthetic event was sent to the production ledger.
- Worker `/health` and `/version` checks are read-only.
- Do not close Stage 3 solely on the basis of worker health, embedded identity, or a green Railway deployment.
