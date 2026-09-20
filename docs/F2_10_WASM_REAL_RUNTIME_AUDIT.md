# F.2.10-E–H — Real WASM runtime audit

## 1. Provenance

- Repository: `https://github.com/LaihoE/demoparser`
- Tag: `v0.42.0`
- Annotated tag object: `80eadb90cd0a42c4c4b9e5557c9f1b96815ea448` (unsigned)
- Commit: `d3767705dc5846d73ed29db50eaeda58778dc934`
- Source archive SHA-256: `09e9ed89f7a6955da2f4428030bec2df8d0b72a430963e780f67d6f8a1a41168`
- License: MIT

## 2. Artifact

The exact source commit contains a checked-in `no-modules` browser binding and WASM binary. They are preserved under `public/client-parser/demoparser2/0.42.0/` with the upstream license and an evidence manifest.

| File                  |     Bytes | SHA-256                                                            |
| --------------------- | --------: | ------------------------------------------------------------------ |
| `demoparser2.js`      |    20,784 | `d59a85ff33d36387f0fb814991f3b83bd0166eee7b7f4e761aa34ee05d9af756` |
| `demoparser2_bg.wasm` | 3,056,821 | `43c57d499e0acf126bc318b6b552082bf3dfe476b1208efadd922ef2326e8c4f` |

Artifact identity is `PASS` as an exact artifact stored by the pinned upstream source commit. Bit-reproducibility is `PARTIAL`, not PASS.

## 3. Build toolchain

Upstream declares `wasm-pack build --out-dir www/pkg --target no-modules`, disables `wasm-opt` for release, and resolves `wasm-bindgen 0.2.100` in `Cargo.lock`. It does not pin Rust, wasm-pack or protoc.

A local isolated build succeeded with Rust 1.91.1, Cargo 1.91.0, wasm-pack 0.13.1, protoc 32.1 and lld 21.1.7. It produced a different binding (`8eeeabbc…`, 21,429 bytes) and WASM (`abe693c7…`, 3,133,549 bytes). Therefore it proves build feasibility from the commit, but not bit-for-bit reproducibility. `scripts/build-demoparser2-wasm.mjs` records future attempts and fails closed on source, tool, target, output or export failures.

## 4. Runtime surface

Chromium loaded the upstream binding as a Classic Worker-compatible `no-modules` global and initialized the 3,056,821-byte WASM successfully. Observed callable exports:

- `parseHeader`
- `listGameEvents`
- `parseEvent`
- `parseEvents`
- `parseGrenades`
- `parseTicks`
- `listUpdatedFields`

`parsePlayerInfo` and `parseChatMessages` were not observed and remain `NOT_AVAILABLE`. Minimum readiness now requires all four execution-path APIs: `parseHeader`, `listGameEvents`, `parseEvent`, and `parseTicks`.

## 5. Real DEM identity

`NOT_AVAILABLE`. No authorized `.dem` exists in the repository. No arbitrary download, renamed file, mock, historical Storage object or production pipeline input was used.

## 6–20. Field audits

Header, player, event, round, tick, timing, bomb, grenade, weapon, economy, position, aim, score and team execution audits are `NOT_RUN`. The code catalogs these fields and preserves `NOT_PRESENT`, `UNAVAILABLE` and `PARSE_FAILED`, but synthetic tests are not runtime evidence. `team_number` remains side/slot evidence, never team identity. Zero remains a valid timing value. Tick probing remains bounded and does not claim an authoritative or full domain.

## 21. Python × WASM parity

`NOT_RUN`. The comparator and field matrix contract are prepared, but parity requires the same authorized DEM SHA parsed independently by Python 0.42.0 and browser WASM 0.42.0.

## 22. Determinism

`NOT_RUN` for DEM results. Artifact hashes and catalog/contract digests are deterministic; those facts do not substitute for two same-DEM parser runs.

## 23. Browser matrix

| Browser  | Runtime | Real DEM | Validator |
| -------- | ------- | -------- | --------- |
| Chromium | PASS    | NOT_RUN  | NOT_RUN   |
| Firefox  | NOT_RUN | NOT_RUN  | NOT_RUN   |
| Safari   | NOT_RUN | NOT_RUN  | NOT_RUN   |

Universal browser compatibility is not claimed.

## 24. Performance

Only the observed WASM size is recorded. DEM hashing, parsing, total duration, result bytes and memory are `NOT_RUN`/`NOT_AVAILABLE` without a real DEM. Memory is never estimated.

## 25. Limits

The 128 MiB ceiling remains unchanged. Boundary execution is `NOT_RUN`. The 400 MB gate is `NOT_RUN` and blocked by both the current ceiling and the absence of an authorized corpus.

## 26. Canonical decision

`CANONICAL_ADMISSION = MUST REMAIN BLOCKED`. Browser results remain untrusted evidence, validator output is non-persisting, and no Canonical, metrics, features, Player DNA or AI data writes occurred.

## Formal status

- F.2.10-E REAL WASM ARTIFACT: `PASS`
- F.2.10-F REAL RUNTIME: `PASS`
- F.2.10-G REAL DEM: `NOT_RUN`
- F.2.10-H FIELD AUDIT: `NOT_RUN`
- PYTHON_WASM_PARITY: `NOT_RUN`
- DETERMINISM: `NOT_RUN`
- BROWSER_COMPATIBILITY: `PARTIAL`
- LARGE_DEMO: `NOT_RUN`
- CANONICAL_ADMISSION: `MUST REMAIN BLOCKED`
- AI_DATA_READINESS: `MUST REMAIN BLOCKED`
