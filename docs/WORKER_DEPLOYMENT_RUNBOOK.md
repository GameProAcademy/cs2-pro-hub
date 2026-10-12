# Controlled Worker Deployment Runbook — H3E91

**Status:** controlled rollout procedure; not a declaration that production is cleared.
**Repository:** `GameProAcademy/cs2-pro-hub`
**Baseline:** PR #89 merge commit `a5dcdfdb6716743025f5159c073b13db2172aee0`.
**Production rule:** do not send real jobs to a new worker until every gate below is evidenced. Do not weaken RAW admission, Canonical, parser parity, or Attempt 9 gates.

## Current known state and hard stop

The production Railway worker was previously observed on branch `infra/cs2-parser-worker-v8`, with an older start command `python worker_main.py`. The worker tree on `main` uses the Dockerfile under `services/cs2-demo-parser` and starts `uvicorn app:app`. These are not interchangeable deployments.

PR #89 adds `workerBuildCommit` to the worker-to-app event and checks it against `H3E91_EXPECTED_WORKER_BUILD_COMMIT` in production before the database RPC. The current `main` branch still lacks the persistence argument. This review branch patches the bridge to pass `_worker_build_commit` and adds an incremental SQL overload plus disposable-writer assertions. This is not yet proof of live persistence: the migration must pass CI and a disposable PostgreSQL run, and the actual managed function/table definition must be compared before any production application.

The earlier runbook recorded `Wait for CI` as off and a staged Railway patch `d66b5a12-a69e-4b9a-87b6-314f75c471cc`. Those are historical observations, not proof of the current dashboard state. Re-read the current Railway UI before acting. Do not apply the staged patch; discard it after verifying its contents because applying it may trigger a deployment.

## Phase 1 — Resolve H3E91 build-identity persistence

### 1.1 Contract and data model

Use a nullable column for backward-compatible historical rows, but require a valid full lowercase SHA-1-shaped commit (`^[0-9a-f]{40}$`) for every new production event from `source = 'RAILWAY'`. Keep the app-side comparison as a separate ingress check; the database column is audit evidence, not a replacement for authentication.

Required end state:
- `worker_build_commit` is persisted on each event row.
- The database writer validates the value and rejects malformed non-null values.
- The app passes the field to the writer RPC.
- The Python worker continues to obtain identity only from image-embedded `BUILD_INFO.json`; never trust a runtime environment variable as the image identity.
- Replays remain idempotent: a repeated event ID cannot mutate its previously stored build identity.
- Existing rows remain NULL; do not backfill guessed identities.

### 1.2 TypeScript RPC argument

In `src/lib/pipeline/h3e91ExecutionBridge.server.ts`, add the argument to the existing `supabaseAdmin.rpc("h3e91_record_execution_event", ...)` object:

```ts
_worker_build_commit: event.workerBuildCommit,
```

Do not remove the production checks that reject an unset `H3E91_EXPECTED_WORKER_BUILD_COMMIT` or a mismatched event identity. Validate the value before invoking the RPC:

```ts
const validBuildCommit =
  event.workerBuildCommit !== null &&
  /^[0-9a-f]{40}$/.test(event.workerBuildCommit);

if (event.source === "RAILWAY" && !validBuildCommit) {
  return Response.json({ code: "H3E91_WORKER_BUILD_IDENTITY_MISSING" }, { status: 503 });
}
```

Place this check after parsing/authentication and before any database RPC. Keep it scoped to the Railway source so unrelated legacy app events are not silently reclassified.

### 1.3 Exact source signature and incremental migration

The source-defined writer signature in migration `20260926031627_12654b87-3876-4c60-8916-6a0f296adda8.sql` is:

```sql
public.h3e91_record_execution_event(
  _event_id uuid, _execution_id uuid, _event_type text, _upload_id uuid,
  _correlation_id uuid, _job_id uuid, _attempt_number integer,
  _demo_sha256 text, _file_size bigint, _parser_name text,
  _parser_version text, _parser_revision text, _execution_surface text,
  _source text, _metadata_digest text, _outcome_code text, _event_version integer
) RETURNS jsonb
```

The source ledger is `public.h3e91_execution_evidence_ledger`. Migration `20260926013427_...` creates it; later migrations add event identity fields and the writer. **This signature is verified against repository migrations, not freshly introspected from the live managed database in this change.** Before production application, compare the live `pg_get_functiondef`, `pg_get_function_identity_arguments`, table columns, owner, `prosecdef`, `proconfig`, and grants. If the managed definition differs, regenerate the migration from the live definition instead of overwriting unknown changes.

The candidate migration is `supabase/migrations/20261012100000_h3e91_worker_build_identity.sql`. It adds nullable `worker_build_commit text` (legacy rows remain NULL), validates the SHA format when present, and adds an 18-argument overload that requires a lowercase 40-character SHA for every new Railway event, rejects build identity on APP events, includes the identity in the event digest and INSERT, and rejects subsequent lifecycle transitions with a different build identity. It preserves the writer's existing transition checks, advisory locks, digest, return contract and SECURITY DEFINER behavior. It revokes `service_role` EXECUTE on the legacy 17-argument overload, making old callers fail closed rather than insert events without identity.

The TypeScript bridge now passes `_worker_build_commit: event.workerBuildCommit`; the bridge unit test asserts the exact RPC argument. The Python recorder already reads the identity from embedded `BUILD_INFO.json` and includes `workerBuildCommit` in each event. Runtime environment variables must not override the embedded identity.

**The migration is committed only on this review branch; it has not been applied to the managed database.** Before production migration:
1. Read the real managed function/table metadata using a read-only connection.
2. Compare live writer/table semantics to the source migration; regenerate if drift exists.
3. Run the migration and writer concurrency/identity tests on disposable PostgreSQL.
4. Prove valid identity inserts, malformed/missing Railway identity rejects, identical replay is idempotent, conflicting identity rejects without mutation, and old 17-argument calls fail closed.
5. Verify all historical rows are unchanged, existing unknown identities remain NULL, and owner/security/grants are correct.
6. Only after review and disposable PASS, use the separately authorized managed migration procedure with exact hashes and post-apply read-only verification.

### 1.4 Python payload

In `services/cs2-demo-parser/h3e91_execution.py`, the existing payload already sets:

```py
"workerBuildCommit": self.worker_build_commit,
```

Keep that value sourced from `image_build_identity()`. Add/retain a test that writes a valid `BUILD_INFO.json` with a full SHA and verifies it appears unchanged in the event JSON; test missing/malformed build info yields no valid identity and the production bridge rejects it before the DB call. Do not let an environment variable override the embedded value.

### 1.5 Required proof artifact

Run the relevant unit tests, queue semantics probe, and real worker/bridge/storage E2E against disposable services. Save the reports. Required assertions:
- matching identity → one ledger row with `worker_build_commit = expected SHA`;
- missing/mismatched identity → HTTP 503 and zero new ledger rows;
- duplicate replay → one row, same identity;
- conflicting replay → rejected and original row unchanged.

Until those assertions are true, Phase 1 is BLOCKED.

## Phase 2 — GitHub branch protection and Lovable bypass

URL: repository → **Settings → Rules → Rulesets** → ruleset `main-protection`.

1. Open `main-protection`; verify enforcement is **Active** and target includes the default branch `main`.
2. Under **Branch rules**, enable **Require a pull request before merging**. Require at least one approval if compatible with the team's operating model; do not configure an empty approval count as a substitute for status checks.
3. Enable **Require status checks to pass**. Add the exact check context `Main required gates` after confirming that name on a successful run for the current workflow. Also require the underlying checks that are consistently present and not skipped (web tests/lint/build, contract-sensitive parser tests, F553 R11.2 execution). Do not rely on a path-filtered or skipped check as a required gate.
4. Enable **Block force pushes** and **Restrict deletions**. Do not enable a bypass that applies to all users or all rules.
5. Under **Bypass list**, click **Add bypass** and choose the GitHub App identity for Lovable (not a human user or a similarly named personal account). Select **Always allow** only if the UI explicitly offers that option and the intended scope is direct push to `main`; otherwise select the narrowest available bypass mode that permits the required Lovable sync. Verify the exact App identity and scope before saving.
6. Save the ruleset and reopen it. Verify the Lovable App is listed as the only intended bypass actor, `main` is still targeted, PR requirement and status checks remain enabled for everyone else, force pushes are blocked, and deletion is restricted.
7. Run a controlled test using a non-production test branch/app sync first. Confirm ordinary users cannot push directly to `main`, and a normal PR cannot merge with a failing required gate.

**Important:** a bypass exception means the App can circumvent whatever rules the selected bypass mode covers. Railway Wait for CI is a deployment gate, not a replacement for GitHub branch protections, and skipped workflows may not block a Railway deployment. Verify the current Railway setting rather than assuming it is on. Never disable all protections merely to repair synchronization.

## Phase 3 — Lovable Web application environment

Configure variables only in the server-side environment/secrets facility used by the published Lovable Cloud application. Do not expose these in browser code, client-prefixed variables, logs, or public build output.

| Key | Exact value rule | Purpose |
|---|---|---|
| `H3E91_EXPECTED_WORKER_BUILD_COMMIT` | Exact lowercase 40-character commit SHA embedded in the *homologated worker image* | H3E91 ingress allowlist |
| `DEMO_PARSER_EXPECTED_REVISION` | Exact parser revision string reported by the homologated worker's `/version` endpoint, normally `git:<40-char SHA>` if that is what the adapter contract expects | Adapter revision pin |
| `DEMO_PIPELINE_BRIDGE_SECRET` | Existing secret value, unchanged and shared only with the trusted worker | Bearer authentication |
| `DEMO_PIPELINE_BRIDGE_URL` | Existing canonical server-side app base URL used by the worker | Bridge destination |

Do not guess the commit or revision from the current `main` SHA alone: the worker image's `BUILD_INFO.json` must confirm the embedded commit. Keep all existing unrelated app secrets unchanged. Never paste secret values into this runbook or chat.

Before publication:
1. Deploy the worker to a separate non-production Railway service.
2. Read `/version`; require HTTP 200, `build.embedded = true`, and a full commit SHA.
3. Confirm the parser revision returned by `/version` exactly matches the adapter's expected revision.
4. Set `H3E91_EXPECTED_WORKER_BUILD_COMMIT` to the verified image commit on the **server** side of the app.
5. Run the production-mode bridge integration tests with both matching and mismatching identities against a disposable database.
6. Publish the app, then verify the published app's build/revision before routing real jobs.

If the Lovable UI does not provide a supported server-side environment setting for a key, do not invent a client-side substitute. Resolve the supported secret/configuration path first.

## Phase 4 — Railway cutover and smoke test

### 4.1 Preflight

In Railway, open project → environment **production** → service **cs2-demo-parser** → **Settings → Source**.

Before changing anything:
- Record current deployment ID, commit, branch, root directory, start command, variables *by name only*, health check, replica count, and resource limits.
- Confirm **Wait for CI** is ON and the current connected GitHub repository has a successful non-skipped workflow/check suite for the exact target commit.
- Inspect staged changes. Discard the previously observed staged patch only after verifying it is the empty `deploy: {}` patch; do not click Deploy on that patch.
- Keep the old deployment available for rollback.

### 4.2 Prefer a second service for first deployment

Create a separate Railway service from the same repository, branch `main`, root directory `services/cs2-demo-parser`. Configure the required existing secrets securely without displaying or copying them into logs. Let the Dockerfile define the process. Do not route production jobs to this service during the first boot.

In **Settings → Deploy** (wording may vary), clear the legacy custom Start Command `python worker_main.py` so the image's Dockerfile CMD runs:

```sh
uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}
```

Do not set a replacement command unless the Dockerfile is intentionally changed and reviewed. Confirm root directory exactly `services/cs2-demo-parser`.

### 4.3 Read-only smoke checks

Use the service's private/public base URL as appropriate; do not put bearer tokens in the command or use a real user's demo URL. First run:

```sh
BASE_URL="https://<homologation-service-domain>"
curl --fail-with-body --silent --show-error "$BASE_URL/health"
printf '\n'
curl --fail-with-body --silent --show-error "$BASE_URL/version"
printf '\n'
```

Pass criteria:
- `/health` returns HTTP 200.
- `/version` returns HTTP 200 and reports the embedded build identity.
- `build.embedded` is true and `build.commit` is a full 40-character SHA.
- Parser revision is the exact value configured in `DEMO_PARSER_EXPECTED_REVISION`.
- No secret, demo URL, or full demo digest appears in output.

Then call the repository's supported runtime preflight against the homologation service and a public fixture using the existing CI harness. Do not invent a new production endpoint or send a real demo through an unverified worker. The preflight must prove the same required scenarios as the queue recovery E2E and must target a disposable database, not the managed production database.

### 4.4 Production cutover

Only after Phase 1–3 pass:
1. Publish the app with the verified expected worker commit.
2. Verify the published app's health/build and one matching-identity bridge event against a disposable or explicitly approved controlled test scope.
3. Change the production service source branch to `main`, root directory to `services/cs2-demo-parser`, and remove the legacy Start Command override.
4. Wait for CI and deploy only the exact SHA that passed gates.
5. Verify deployment status **SUCCESS**, then `/health`, `/version`, and runtime preflight.
6. Run one authorized controlled job; verify one event per lifecycle transition, the persisted `worker_build_commit`, idempotency, and cleanup. Do not permit Canonical/Attempt 9 promotion as part of this smoke test.
7. Observe logs and queue state before increasing traffic.

### 4.5 Rollback

If any health/version/preflight/bridge/ledger check fails:
- Stop routing jobs to the new service.
- Restore the previous Railway deployment/branch and its previous start command.
- Restore the app-side expected worker commit to the last known compatible worker only if that pairing was independently verified.
- Do not roll back additive schema blindly; preserve the new nullable column/function unless a reviewed migration rollback proves it safe.
- Record deployment IDs, commit SHAs, timestamps, status codes, and redacted evidence. Never include tokens or signed URLs.

## Release checklist

- [ ] H3E91 writer migration reviewed against actual managed function/table DDL; not guessed.
- [ ] Disposable DB test proves persisted matching identity, rejects mismatches, and preserves idempotency.
- [ ] All required CI checks pass on the exact merge/deploy SHA.
- [ ] GitHub ruleset is active; required status checks and PR requirement are verified; Lovable bypass is scoped and verified.
- [ ] Railway Wait for CI is visibly ON; staged patch is not pending.
- [ ] Homologation image reports embedded full commit and exact parser revision.
- [ ] Lovable server-side variables set to verified values; no secret exposed.
- [ ] App published and worker/app pair verified.
- [ ] Production smoke test succeeds and persisted identity is independently queried.
- [ ] Rollback target is available.

**Current decision:** do not perform the production cutover merely because PR #89 and CI are green. The database writer migration and positive durable-identity proof are mandatory release gates.


## Controlled smoke-test protocol (post-deploy)

**Never send a synthetic execution event to the production ledger.** A fake job ID would still create durable audit data. Production smoke tests below are read-only; the positive bridge write must run against a homologation app/bridge connected to disposable PostgreSQL. This avoids contaminating production metrics, RAW, Canonical, queue, or Attempt 9.

### A. Read-only worker endpoints

```sh
set -euo pipefail
BASE_URL="https://<worker-domain>"
EXPECTED_WORKER_COMMIT="<verified-40-char-lowercase-image-sha>"
health="$(curl --fail-with-body --silent --show-error "$BASE_URL/health")"
printf '%s\n' "$health"
version="$(curl --fail-with-body --silent --show-error "$BASE_URL/version")"
printf '%s\n' "$version"
printf '%s' "$version" | jq -e --arg sha "$EXPECTED_WORKER_COMMIT" \
  '.build.embedded == true and .build.commit == $sha'
printf '%s' "$version" | jq -e \
  '.parser.revision != null and .contract_version != null'
```

Pass criteria: both endpoints return HTTP 200; `/version` reports `build.embedded: true`, the exact embedded commit, parser revision and contract version. Compare the exact parser revision with `DEMO_PARSER_EXPECTED_REVISION`. Do not print environment variables or secrets. These calls do not write data.

### B. Synthetic positive bridge event — disposable database ONLY

Run this only against a non-production app deployment configured with `NODE_ENV=production` and `H3E91_EXPECTED_WORKER_BUILD_COMMIT` equal to the verified image SHA, connected to a disposable database. Never point it at the published production app or managed production DB.

```sh
set -euo pipefail
set +x
export BRIDGE_URL="https://<homologation-app-domain>/api/public/h3e91-execution-event"
read -rsp 'Homologation bridge secret: ' DEMO_PIPELINE_BRIDGE_SECRET; echo
export DEMO_PIPELINE_BRIDGE_SECRET
export WORKER_BUILD_COMMIT="<verified-40-char-lowercase-image-sha>"

curl --fail-with-body --silent --show-error \\
  -H "Authorization: Bearer $DEMO_PIPELINE_BRIDGE_SECRET" \\
  -H 'Content-Type: application/json' -X POST "$BRIDGE_URL" \\
  --data-binary @- <<JSON
{
  "protocol":"H3E91_EXECUTION_BRIDGE_V1",
  "eventId":"b3685a02-6d38-4f19-8b19-7c9810808773",
  "executionId":"8d1b3d98-ddde-4500-bb8e-039d69907b9d",
  "uploadId":"bf506999-b9bf-409b-b3ae-8545e617caab",
  "correlationId":"37db9ea7-2af0-4ee2-b154-e0d6a5ec5d90",
  "jobId":"2f8a2c6c-2b77-4c60-8b2e-2f8a2c6c0001",
  "attemptNumber":1,
  "demoSha256":null,"fileSize":null,
  "parserName":null,"parserVersion":null,"parserRevision":null,
  "workerBuildCommit":"$WORKER_BUILD_COMMIT",
  "metadataDigest":null,
  "executionSurface":"RAILWAY_DURABLE_WORKER","source":"RAILWAY",
  "eventVersion":1,"outcomeCode":null,"eventType":"EXECUTION_INTENT"
}
JSON
unset DEMO_PIPELINE_BRIDGE_SECRET
```

Expected first response: HTTP 201, `status = INSERTED`. Repeating the identical payload should return HTTP 200, `status = IDEMPOTENT_REPLAY`. Verify in disposable PostgreSQL that the row stores `worker_build_commit = WORKER_BUILD_COMMIT`. A mismatched SHA against the app's expected commit must return HTTP 503 `H3E91_WORKER_BUILD_IDENTITY_MISMATCH` before RPC. Test same-event conflicting identity directly in the disposable DB harness and verify the original row is unchanged.

The synthetic `jobId` is a UUID-shaped ledger reference only; it is not inserted into `demo_jobs` and does not dispatch a queue job. Do not send a terminal event or parse a DEM for this smoke test.

### C. No-contamination and cleanup checks

- Compare production `demo_jobs`, `uploads`, H3E91 ledger, queue, Canonical tables and product metrics read-only before/after; require zero delta. The synthetic ledger event/replay must exist only in disposable PostgreSQL.
- Confirm no DEM bytes, RAW artifact or Canonical row was created.
- For parser E2E, use the existing disposable-database CI harness and a public fixture. Check cleanup evidence for success, failure, timeout and cancellation; HTTP 200 alone does not prove temporary-file cleanup.
- Retain redacted artifacts and remove the disposable service/database after testing. Never print secrets or signed URLs.

### D. Production gate

Production may receive read-only `/health` and `/version` checks until the managed writer migration is reviewed/applied and the durable positive path has been proven. A synthetic production event is not an acceptable smoke test. Green endpoints prove liveness/build identity, not ledger persistence or authorization for RAW, Canonical, or Attempt 9.
