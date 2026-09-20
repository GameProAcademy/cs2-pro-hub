# demoparser2 0.42.0 — browser/WASM provenance

## Verified source identity

- Repository: `https://github.com/LaihoE/demoparser`
- Upstream tag: `v0.42.0`
- Commit: `d3767705dc5846d73ed29db50eaeda58778dc934`
- Declared upstream command: `wasm-pack build --out-dir www/pkg --target no-modules`
- Rust target: `wasm32-unknown-unknown`
- wasm-bindgen target: `no-modules`

## Artifact status

`VERIFIED_UPSTREAM_SOURCE_ARTIFACT`. The exact pinned commit contains a browser binding and WASM binary under `src/wasm/www/pkg`. Their verified identities are binding `d59a85ff33d36387f0fb814991f3b83bd0166eee7b7f4e761aa34ee05d9af756` (20,784 bytes) and WASM `43c57d499e0acf126bc318b6b552082bf3dfe476b1208efadd922ef2326e8c4f` (3,056,821 bytes).

Reproducibility remains `PARTIAL`: upstream does not pin Rust, wasm-pack or protoc. A local isolated build succeeded but differed byte-for-byte, so its hashes are recorded separately and are not substituted for the upstream artifact. The npm browser package still does not publish 0.42.0, and the Node/native binding is not a browser substitute.

The POC accepts only same-origin URLs and verifies fixed lowercase SHA-256 hashes before initialization. It records binary, binding, runtime-surface, capability-catalog, audit-catalog, contract, result, and manifest identities separately. Missing or mismatched evidence fails closed.

## Runtime surface

Declared candidates are not treated as observed. Chromium observed `parseHeader`, `listGameEvents`, `parseEvent`, `parseEvents`, `parseTicks`, `parseGrenades`, and `listUpdatedFields`. Minimum readiness requires `parseHeader`, `listGameEvents`, `parseEvent`, and `parseTicks`. `parsePlayerInfo` and `parseChatMessages` were not observed; players and chat remain `UNAVAILABLE`.

No DEM result or bit-reproducibility claim was fabricated during this phase.
