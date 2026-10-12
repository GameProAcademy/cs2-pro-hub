# Controlled Worker Deployment Runbook — H3E91

**Status:** controlled rollout procedure; not a declaration that production is cleared.
**Repository:** `GameProAcademy/cs2-pro-hub`
**Baseline:** PR #89 merge commit `a5dcdfdb6716743025f5159c073b13db2172aee0`.
**Production rule:** do not send real jobs to a new worker until every gate below is evidenced. Do not weaken RAW admission, Canonical, parser parity, or Attempt 9 gates.

## Current known state and hard stop

The production Railway worker was previously observed on branch `infra/cs2-parser-worker-v8`, with an older start command `python worker_main.py`. The worker tree on `main` uses the Dockerfile under `services/cs2-demo-parser` and starts `uvicorn app:app`. These are not interchangeable deployments.

PR #89 adds `workerBuildCommit` to the worker-to-app event and checks it against `H3E91_EXPECTED_WORKER_BUILD_COMMIT` in production before the database RPC. The bridge's current RPC call does **not** yet pass that field to the database. Therefore the identity is currently validated at HTTP ingress but is not independently persisted as a dedicated ledger column. Do not describe this as durable identity audit evidence until Phase 1 has been implemented, migrated in a disposable database, and verified.

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

### 1.3 SQL writer migration — required, not yet applied

The migration must be additive and must be based on the **actual deployed** definition of `public.h3e91_record_execution_event` and its ledger table. Do not guess the table name, parameter order, return type, grants, or security-definer settings. Before authoring the migration, retrieve the function definition and table DDL from the managed project and compare them with the repository's current migration chain.

The migration must:
1. Add `worker_build_commit text NULL` to the actual H3E91 event ledger table.
2. Add a CHECK constraint allowing NULL for historical rows and requiring non-NULL values to match `^[0-9a-f]{40}$` for new Railway rows (use a NOT VALID / validation sequence if existing rows could violate it).
3. Replace the writer function with the same full existing signature plus `_worker_build_commit text`; preserve every existing validation, advisory lock, digest, idempotency, privilege, and return contract.
4. Include the field in the INSERT column/value lists and in any event digest only if the established digest contract explicitly includes immutable event identity. Do not change a digest contract implicitly.
5. On idempotent replay, compare the incoming identity with the stored identity and reject a conflict; never overwrite the first accepted identity.
6. Reapply the exact existing EXECUTE grants and ensure the function owner/security-definer/search_path are unchanged.
7. Include rollback SQL and a disposable-PostgreSQL test proving valid identity inserts, malformed identity rejects, same-event/same-identity replay is idempotent, and same-event/different-identity replay rejects without mutation.

**Do not apply this migration to the managed production database until the real function/table definitions have been captured, the migration hash reviewed, and the disposable test passes.** The previously applied queue/Canonical/grants migrations are not a substitute for this schema change.

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
