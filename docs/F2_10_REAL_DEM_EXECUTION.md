# F.2.10-F real DEM execution

## Status

`NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE`

No real `.dem` exists in the repository, test fixtures or uploaded artifacts. No mock, synthetic demo, precomputed JSON, production Storage object or historical pipeline input was substituted.

## Prepared execution evidence

For `parseHeader`, `listGameEvents`, `parseEvent`, `parseTicks`, and optional `parseGrenades`, the Worker records export presence, call attempt, success, bounded error, duration, normalized result size and normalized digest. Every `parseEvent` call additionally records the event name, actual player/other field arrays passed to the parser, returned fields, missing requested fields, unexpected fields, input/output digests and an evidence reference. The DEM identity is a lowercase SHA-256 calculated from the exact browser bytes.

Discovered-event order and duplicates are retained independently from the normalized inventory. Grenade evidence retains bounded raw samples, separately normalized samples, field inventory, count and digest. Round evidence pairs only observed `round_start`/`round_end` samples and marks missing ends; tick-domain evidence is explicitly a non-authoritative header-derived probe.

## Required before execution

An authorized real `.dem` with documented provenance must be supplied to both the browser WASM and Python demoparser2 0.42.0 harnesses. Their input SHA-256 values must match exactly. Until then F.2.10-F is `BLOCKED`, F.2.10-G/H are `NOT_RUN`, and no runtime evidence file exists.

## F.2.10-L/M/N authorization contract

A browser run now requires structured authorization metadata bound to the selected local file: `authorizedDemo=true`, local provenance/source, filename, byte size, computed SHA-256, authorization reference, and receipt time. The Worker recomputes the SHA after transfer and rejects any mismatch. The Python producer requires the equivalent explicit metadata and verifies filename, size and SHA before parsing.

No DEM was supplied or executed in this phase. Therefore real parsing, parity and determinism remain `NOT_RUN`.

## G.6-R runtime prerequisite

The MAIN parser candidate is frozen at `2f8a76645c6030659f2ed0480469b1452e75f72e`, but the Railway source ref, process-isolation files and candidate image are unavailable. `RAILWAY_RUNTIME_PARITY = BLOCKED`; therefore no real DEM execution is authorized. The candidate file hashes and required runtime surface are recorded in `docs/G6_R_RUNTIME_MANIFEST.md`.
