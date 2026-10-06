# F.2.10 Python × WASM parity report

## Status

`NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE`

The field-level comparator is prepared for header, players, identity, rounds, events, ticks, timing, map, score, teams, bomb, deaths, damage, grenades, weapons, economy, position, movement, aim, health, armor and aggregates. Each field preserves source availability, parse status, type, null, samples, normalization, equality and evidence reference.

No Python or WASM reference output was generated. No field or event has runtime parity. `parsePlayerInfo` remains unavailable on the observed WASM surface and cannot be replaced by event-derived identity.

## A9.1-R1.1 capability-aware preparation

All 16 A9.1 domains remain present. Comparable domains require PASS; unavailable runtime APIs yield explicit NOT_COMPARABLE, equal=null and NOT_AVAILABLE_ON_WASM. This exclusion is neither equality nor a domain PASS. Missing evidence without a supported reason, semantic mismatch, parse failure, NOT_RUN or BLOCKED prevents gate PASS. Domain lists and parity_digest bind statuses, availability, normalized values and reasons. Synthetic equal/excluded cases validate mechanics only; real parity is still NOT_RUN.

The pinned artifact exposes seven functions and omits parsePlayerInfo/parseChatMessages. The catalog marks only parsePlayerInfo upstreamSupported=true: UPSTREAM_SUPPORTED_BUT_RUNTIME_EXPORT_MISSING. Chat upstream support is false in the pinned catalog. No reconstruction or inferred identity is authorized. Differences in Python/WASM evidence shapes remain honest FAIL, not silently discarded.

The executable Python reference producer is `services/cs2-demo-parser/python_reference.py`. It accepts only an explicit existing `.dem` path, enforces its existing 1,500 MiB ceiling, hashes the exact bytes, invokes the existing Python parser, emits bounded domain evidence plus a SHA-bound run identity, and leaves `canonicalEligible=false`/`persisted=false`. With no path it returns exactly `NOT_RUN / NO_AUTHORIZED_REAL_DEM_FIXTURE`; it does not discover historical or production data.

The browser/client POC limit remains 128 MiB. A9.1 real-Dem execution is an isolated validation harness and does not constitute production browser support.

The comparator preserves array order and duplicates, sorts object keys only, and distinguishes missing, `null`, `0`, `false`, type mismatch, value mismatch, unavailable API and parse failure. Determinism requires exactly two successful Python runs and two successful WASM runs with the same valid DEM SHA and stable parser/artifact identities.

## F.2.10-L/M/N admission prerequisites

Python and WASM consume the same catalog/contract identity from `upstream-surface-manifest.json`. `CATALOG_MISMATCH` or `CONTRACT_MISMATCH` stops comparison before field values are compared. Every event request is explicit and carries its event, field, kind, request reason, semantic purpose, upstream evidence, catalog version/digest, parser version/revision, and DEM SHA.

Grenade evidence preserves bounded raw values and emits a separate conservative normalized record. Identity and lifecycle remain `UNRESOLVED / RAW_ONLY`; key sorting is not semantic normalization. Rounds separate `observedRoundNumber` from `derivedRoundIndex` and declare sample limits. Tick evidence remains `FIRST_MIDDLE_LAST / PROBE_ONLY / authoritativeDomain=false`.

## G.6-R status

No Python or WASM execution occurred. Railway runtime parity is also `BLOCKED`: the approved MAIN candidate has a machine-readable hash baseline, but the Railway branch/source, isolation layer and candidate image are unavailable for comparison. This does not change the report status: Python×WASM parity and real determinism remain `NOT_RUN`.
