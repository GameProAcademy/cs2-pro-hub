# demoparser2 0.42.0 — browser/WASM provenance

## Verified source identity

- Repository: `https://github.com/LaihoE/demoparser`
- Upstream tag: `v0.42.0`
- Commit: `d3767705dc5846d73ed29db50eaeda58778dc934`
- Declared upstream command: `wasm-pack build --out-dir www/pkg --target no-modules`
- Rust target: `wasm32-unknown-unknown`
- wasm-bindgen target: `no-modules`

## Artifact status

`UNAVAILABLE`. The repository contains no reviewed browser binding or WASM binary for 0.42.0, no binary or binding hash, no artifact size, and no fully pinned Rust/wasm-pack toolchain. The npm browser package does not publish 0.42.0. The Node/native binding is not a browser substitute.

The POC therefore accepts only same-origin URLs with independently configured lowercase SHA-256 hashes. It hashes both files before initialization, inspects exports after initialization, and records binary, binding, runtime-surface, capability-catalog, audit-catalog, contract, result, and manifest identities separately. Missing or mismatched evidence fails closed.

## Runtime surface

Declared candidates are not treated as observed. Runtime inspection recognizes `parseHeader`, `listGameEvents`, `parseEvent`, `parseEvents`, `parseTicks`, `parseGrenades`, `parsePlayerInfo`, and `parseChatMessages`. Minimum readiness requires the core header/event/tick functions. `parsePlayerInfo` is used only when observed; otherwise players remain `UNAVAILABLE`.

No artifact, hash, export, DEM result, or reproducibility claim was fabricated during this phase.
