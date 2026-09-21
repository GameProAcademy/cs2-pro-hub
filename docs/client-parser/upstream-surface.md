# demoparser2 0.42.0 surface audit

## Provenance

- Repository: `https://github.com/LaihoE/demoparser`
- Tag: `v0.42.0`
- Commit: `d3767705dc5846d73ed29db50eaeda58778dc934`
- Browser artifact: checked-in upstream `no-modules` binding and WASM, verified by the hashes in `artifact-manifest.json`
- Observed callable exports: `parseHeader`, `listGameEvents`, `parseEvent`, `parseEvents`, `parseGrenades`, `parseTicks`, `listUpdatedFields`
- Not observed: `parsePlayerInfo`, `parseChatMessages`

## Separation of claims

The executable surface keeps these states independent: upstream support, project catalog inclusion, runtime export presence, requestability, call attempt, parse success, semantic validation, normalization, parity and Canonical eligibility. Documentation or a project catalog never counts as runtime support. A missing export is `UNAVAILABLE`; an unexecuted request is `NOT_RUN`; an exception is `PARSE_FAILED`.

The current catalog contains 175 field rows and 38 event-specific requests. The requests are grouped by combat, bomb, economy, weapon, utility, round and shared context, and the Worker records the exact arrays passed to each `parseEvent` call. Unknown discovered events are still attempted with an explicit empty request rather than silently inheriting unsupported semantics.

## Current evidence

- Runtime initialization in Chromium: previously observed for the pinned artifact.
- Authorized real DEM: absent.
- Field execution: `0 / 175`.
- Python × WASM parity: `NOT_RUN`.
- Determinism: `NOT_RUN`.
- Canonical eligibility: `false` for every field and result.

This report does not claim that every catalog field is supported upstream. Those values remain `UPSTREAM_NOT_VERIFIED` until source-level or same-runtime evidence can establish them without inference.
