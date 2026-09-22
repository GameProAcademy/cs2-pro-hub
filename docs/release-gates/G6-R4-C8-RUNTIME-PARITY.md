# G.6-R.4-C.8 — Runtime parity

## Decision

`NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE`

The offline harnesses are `scripts/run_python_wasm_parity.mjs` and `scripts/run_parser_determinism.mjs`. They accept explicit artifacts only, require the same DEM SHA-256 and never discover production files. Missing inputs create machine-readable `NOT_RUN` reports and exit non-zero.

Parity covers header, map, tickrate, playback ticks, players, identity, events, rounds, grenades, bomb, damage, deaths, weapons, economy, tick properties and game state. Normalization sorts object properties only; it preserves array order, duplicates and semantic identity values.

Determinism requires exactly two successful Python runs and two successful WASM runs, four unique run IDs and one DEM SHA. Artifact stability alone is not result determinism.

`STAGED != DEPLOYED`; no staged Railway change was used as evidence.