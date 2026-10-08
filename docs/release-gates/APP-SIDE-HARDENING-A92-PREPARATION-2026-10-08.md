# App-side hardening / A9.2 preparation

2026-10-08, 09:58–10:03 UTC. **Decision: IMPLEMENTED synthetic preparation / PARTIAL application closure / BLOCKED release.**

No real DEM processed; no workflow dispatched; no parser upstream, WASM bytes, pins, artifact manifest, A9.1 workflow, parity/determinism engine, Canonical admission, Railway, secrets or live database changed. DNA/Coach demonstration flags and 128 MiB browser limit preserved.

| ITEM | STATUS | EVIDENCE |
|---|---|---|
| A. Runtime closure | PARTIAL | Application closure is not certified. Public login/register/reset-password rendered nonblank; anonymous `/upload` redirected to `/login`. No claim of comprehensive error-free browser execution or authenticated-route coverage. Reported legacy UI files excluded from this work. |
| B. Corrections | IMPLEMENTED | Per-run ownership closure, one terminal settlement, abort/terminate/detach/clear-timeout, async fencing after hash await, duplicate READY guard, messageerror, protected startup/URL/postMessage/progress callbacks; typed resource/evidence contracts. |
| C. Files | IMPLEMENTED | Listed below. Existing parser/A9.1 engines unchanged. |
| D. Worker lifecycle | IMPLEMENTED / PARTIAL | 21 synthetic service tests cover constructor/URL/INIT/PARSE failures, onerror/messageerror, cancellation, timeout during hash, duplicate READY, stale completion/rejection/error, truncated hash, callback exceptions, premature result and six terminal codes. Real-browser parser Worker lifecycle and actual traps/OOM remain NOT_PROVEN. |
| E. Memory | PARTIAL | Service keeps File ownership, not contiguous bytes; adapter remains sole whole-file conversion; hash slices and returns digest, not bytes. 128 MiB input and 2 MiB JSON result ceilings unchanged. Fatal detectable memory/trap errors propagate out of optional parsing catches rather than becoming partial results. No large-DEM RSS/peak/copy/OOM proof. |
| F. Browser output checker | IMPLEMENTED / NOT_PROVEN | Official CI already runs checker after build. Neither `.output` nor `dist` exists here; checker reports missing official output, refuses empty/server-only trees, scans source maps and emitted source. Seven synthetic checker tests pass; temporary test trees are not deployment evidence. |
| G. Player DNA | IMPLEMENTED / DEMO_ONLY | `getPlayerDnaState()` validates existing demonstration values and explicitly reports DEMO_ONLY. Legacy getter/UI preserved. Future metric schema requires source, parser/artifact, DEM hash, domain, evidenceRef, calculation type and confidence/status. No real consumer connected. |
| H. AI Coach | IMPLEMENTED / DEMO_ONLY | `getCoachHistoryState()` validates existing demonstration messages. Future context has observed/calculated/inferred/unavailable assertions, evidence references and literal BLOCKED/false authorization. No AI request or private-data consumer introduced. |
| I. Canonical | BLOCKED | Admission untouched. New readiness/context contracts cannot accept authorization=true. Typed app readiness is descriptive only and does not replace authoritative gates. |
| J. Security | IMPLEMENTED / PARTIAL | No live DB/security/secret changes or reads in this phase. Service retains production rejection and route isolation. Worker error protocol restricts codes; API error text reduced to safe codes. No current live policy/deployed bundle proof claimed. |
| K. Tests | IMPLEMENTED | Final `bunx vitest run`: **108 files / 1463 tests passed** at 10:03 UTC, including 36 new tests. Existing disposable database concurrency fixtures run locally, not in Lovable Cloud. Tests use synthetic Workers and Files; they prove mechanics, not DEM/parser success or real parity. |
| L. Build and lint | PARTIAL / BLOCKED | Automatic preview signal `build OK`, last observed 10:03:01 UTC. No manual build/typecheck executed. `PUBLIC_BUILD_CONFIG_OK`; targeted lint of all changed source/test/checker files exits 0. Full lint blocked by pre-existing formatting finding in protected `scripts/a91/wasm_smoke.mjs:58`; 9 existing warnings. Protected A9.1 file not altered to silence lint. Official production bundle absent; no publishing. |
| M. Remaining blockers | BLOCKED | Protected A9.1 lint finding needs an independently permitted source fix; official emitted/deployed browser bundle proof missing; authenticated UI flows and real parser Worker lifecycle/large memory remain unverified; real DNA/Coach consumers not implemented; A9.1 real evidence/independent review missing. |
| N. Next gate | BLOCKED | Review protected source and obtain official CI output, then independently review A9.1 real evidence. Separately approve A9.2 browser testing. No automatic dispatch, no real DEM, Attempt 9+, Canonical, production or Railway authorization follows. |

## Changed files in this phase

- `src/lib/appDataContracts.ts`
- `src/lib/__tests__/appDataContracts.test.ts`
- `src/services/playerService.ts`
- `src/lib/client-parser/clientParser.service.ts`
- `src/lib/client-parser/clientParser.errors.ts`
- `src/lib/client-parser/clientParser.protocol.ts`
- `src/lib/client-parser/clientParser.types.ts` (additive terminal codes only; identity pins/versions unchanged)
- `src/lib/client-parser/clientParser.worker.ts` (application wrapper lifecycle/error handling only)
- `src/lib/client-parser/clientParser.runtime.ts` (fatal propagation only)
- `src/lib/client-parser/largeDemHash.ts`
- `src/lib/client-parser/__tests__/clientParser.service.test.ts`
- `scripts/verify-browser-parser-build.mjs`
- `src/lib/pipeline/__tests__/h3e91BrowserBuildIsolation.test.ts`
- `AGENTS.md`, `roadmap.md`, this report; project constraints memory updated.

## Contract scope and limitations

App states include LOADING/READY/EMPTY/ERROR/NOT_AVAILABLE/DEMO_ONLY/BLOCKED; malformed READY/DEMO_ONLY data becomes explicit ERROR, never a fake empty resource. Upload/processing/player/route/demo identity have pure schemas. Worker COMPLETE checks result/manifest container structure; it is not full envelope validation or Canonical admission. Future evidence schemas are preparation, not trusted-source provenance validation. New demonstration snapshots are additive and not yet wired into all existing UI consumers; no claim of universal contract migration or exhaustive render-state testing.

GitHub read-only ref query returned main `f552b5746cb82e8feb71e996ad0d97d798145914`; local managed HEAD observed subsequently `f7f4bd8d1b1178e785f06466f1b33b5d6de80399`. No tree equality or parser deployed-source parity inferred from these changing revisions; protected surfaces were not reconciled by overwriting external corrections.