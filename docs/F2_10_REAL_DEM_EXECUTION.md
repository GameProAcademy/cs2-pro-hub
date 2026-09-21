# F.2.10-F real DEM execution

## Status

`NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE`

No real `.dem` exists in the repository, test fixtures or uploaded artifacts. No mock, synthetic demo, precomputed JSON, production Storage object or historical pipeline input was substituted.

## Prepared execution evidence

For `parseHeader`, `listGameEvents`, `parseEvent`, `parseTicks`, and optional `parseGrenades`, the Worker records export presence, call attempt, success, bounded error, duration, normalized result size and normalized digest. The DEM identity is a lowercase SHA-256 calculated from the exact browser bytes.

## Required before execution

An authorized real `.dem` with documented provenance must be supplied to both the browser WASM and Python demoparser2 0.42.0 harnesses. Their input SHA-256 values must match exactly. Until then F.2.10-F is `BLOCKED`, F.2.10-G/H are `NOT_RUN`, and no runtime evidence file exists.