# Client-side DEM parser POC — F.2.10

## Status

`POC_IMPLEMENTED`, but **POC_NOT_READY** for a real DEM test. The exact browser binding and WASM checked into the pinned upstream `demoparser2` v0.42.0 source are present and hash-verified. The artifact initializes in Chromium, but no authorized real `.dem` exists, so parser calls, parity and determinism remain `NOT_RUN`.

## Architecture and flow

```text
LOCAL DEM
   |
   v
WEB WORKER
   |
   v
demoparser2 WASM (exact 0.42.0 required)
   |
   +--> SHA256 of DEM bytes
   |
   +--> compact result (bounded samples only)
   |
   +--> forensic/client manifest
   |
   v
SERVER VALIDATOR (authenticated, dry-run, no persistence)
   |
   +--> BLOCKED
   |
   +--> validated untrusted result
            |
            v
      FUTURE CANONICAL GATE
```

The isolated authenticated route is `/client-parser-poc`, gated by public build flag `VITE_CLIENT_DEM_PARSER_POC_ENABLED=true`. It does not modify the existing upload route, parser transport, Railway worker, RAW storage, or Canonical pipeline.

## Trust and security model

The browser is always untrusted. The worker receives the local `ArrayBuffer` as a transferable and never imports server code, Supabase admin clients, credentials, filesystem APIs, or Canonical persistence. The `.dem`, complete ticks, and complete RAW events are forbidden by the compact contract. The dry-run server function authenticates the caller, recalculates the deterministic result digest, validates parser and contract identity, limits, classifications, and forbidden fields, and always returns `canonicalAdmission: BLOCKED` and `persisted: false`.

Canonical persistence separately requires server-derived physical RAW evidence. The approval now carries and verifies final contract, reconciliation, artifact, upload, and root-digest binding. Client manifests cannot satisfy that boundary.

## WASM and Worker

The real inspected published browser surface is the classic wasm-bindgen global with `parseHeader`, `listGameEvents`, `parseEvent`, `parseEvents`, `parseTicks`, and `parseGrenades`. `parsePlayerInfo` is not exported there and is classified `UNAVAILABLE`. The worker supports INIT, load progress, PARSE, bounded event sampling, a controlled three-point tick probe, manifest creation, COMPLETE, structured ERROR, and CANCEL. It never claims full tick-domain authority.

No incompatible package or fake implementation was added. The exact 0.42.0 source artifact is served from the project and verified before initialization; any URL or hash mismatch blocks before parsing.

## Hash, compact result, and manifest

SHA-256 uses the existing incremental project implementation over the actual DEM bytes and produces lowercase 64-hex output. The deterministic digest excludes runtime performance fields. The compact result is capped at 2 MiB, event samples at 1,000, event inventory at 1,024, players at 128, and tick probe at 4,096. The manifest records DEM metadata, parser/runtime/build identity, contract/catalog versions and digests, classifications, limited coverage, semantic status, result digest, timestamp, and performance.

## Performance, large files, and memory

The POC accepts files only up to 128 MiB and transfers the buffer to a worker. This is not evidence that a ~400 MB DEM works. No real large DEM, browser memory profile, or browser compatibility matrix was executed. `performance.memory` is non-standard, so memory remains `UNAVAILABLE` rather than estimated. Hash, parse, total, WASM load, result byte size, and file size are measured when a real parser runs.

## Determinism and parity

Deterministic JSON ordering and digest tests exist. Filename, last-modified, timestamps, and durations are metadata and are not parser truth. A comparator for header, players, event inventory/samples, tick probe, capabilities, and coverage is ready, but no WASM-vs-Python corpus was run. Promotion requires the same DEM corpus, exact parser provenance, documented tolerances, real browser benchmarks, malformed/failure tests, and independent server verification.

## Production migration and fallback

The Python/Railway parser remains the only production parser and fallback. The production upload flow is unchanged. A future phase may source and pin an auditable 0.42.0 WASM build, run real browser and ~400 MB tests, compare against Python, and design a server-authoritative admission protocol. This POC must not be used for production ingestion until those gates pass.

# FASE 2.10 — RELATÓRIO

## Escopo executado

- POC isolada e desligada por padrão: seleção local de `.dem`, Web Worker, SHA-256 incremental, protocolo cancelável, resultado compacto e manifest não confiável.
- Validator server-side dry-run com limites, identidade/versionamento, digest determinístico e bloqueio permanente da admissão Canonical.
- Preparação de paridade cliente versus referência Python sem upload de DEM, ticks completos ou RAW completo.
- Binding adicional entre aprovação RAW, artifact, upload, root digest e provas finais antes da persistência Canonical.

## Evidências e quality gates

| Gate                             | Resultado                                |
| -------------------------------- | ---------------------------------------- |
| Testes focados POC/RAW/Canonical | PASS — 31/31                             |
| Aplicação completa               | PASS — 959/959                           |
| Parser Python                    | PASS — 171; SKIPPED — 10 condicionais    |
| Typecheck                        | PASS                                     |
| ESLint completo                  | PASS — 0 erros; 9 warnings preexistentes |
| Compileall Python                | PASS                                     |
| Diff check                       | PASS                                     |
| Build                            | DELEGATED — harness automático           |
| Browser real com DEM             | NOT_RUN                                  |
| Teste real de 400 MB e memória   | NOT_RUN                                  |
| Paridade real WASM↔Python        | NOT_RUN                                  |

## Restrições preservadas

Nenhum Cache Run, retry, attempt 9, enqueue, claim, Canonical real, migration, secret, deploy Railway, Storage ou histórico de produção foi alterado.

## Limitação bloqueante

O artifact browser/WASM 0.42.0 pinado inicializa em Chromium, mas não existe `.dem` real autorizado para executar o parser. A POC não substitui a autoridade Python/Railway e permanece fail-closed até os testes reais de navegador, memória, paridade e determinismo.

## Gate final

`POC_NOT_READY`

## Marco consolidado F.2.10-A → F.2.10-D

- `F.2.10-A WASM ARTIFACT & WORKER HARDENING: PASS` — exact checked-in upstream artifact, hashes and runtime initialization verified; bit-reproducibility remains partial.
- `F.2.10-B REAL BROWSER DEM: NOT_RUN` — no artifact or authorized real DEM fixture.
- `F.2.10-C PYTHON × WASM PARITY: NOT_RUN` — the 22-dimension comparator is prepared; no same-DEM corpus was executed.
- `F.2.10-D 400MB MEMORY: NOT_RUN` — the POC ceiling is 128 MiB and no browser memory run occurred.
- `CANONICAL ADMISSION: MUST REMAIN BLOCKED`.
- `HOT READINESS: PARTIAL` — compact/bounded contracts exist, but no real runtime output is proven.
- `AI DATA READINESS: BLOCKED` — no trusted, parity-validated semantic data was produced.

# FASE 2.10-A — RELATÓRIO FINAL

## Provenance e runtime

- Fonte auditada: `https://github.com/LaihoE/demoparser`, tag `v0.42.0`, commit `d3767705dc5846d73ed29db50eaeda58778dc934`.
- Build upstream documentado: `wasm-pack build --out-dir www/pkg --target no-modules`.
- O source upstream contém binding/WASM 0.42.0 versionado e preservado com hashes; toolchain e `wasm-pack` não estão integralmente pinados, portanto bit-reprodutibilidade permanece `PARTIAL`.
- Binding e WASM foram identificados e verificados contra `artifact-manifest.json`; nenhum valor foi inventado.
- A superfície WASM não exporta `parsePlayerInfo`; player inventory é `UNAVAILABLE`, sem inferência pelo header.

## Hardening implementado

- Worker classic alinhado ao binding wasm-bindgen `no-modules`, eliminando a incompatibilidade Module Worker + `importScripts`.
- Binding e WASM restritos a same-origin, buscados e verificados por SHA-256 antes da execução.
- `runtimeSurfaceDigest`, `wasmBindingSha256` e `wasmBinarySha256` são identidades independentes.
- Exports são inspecionados em runtime; descoberta de eventos e eventos efetivamente parseados são inventários separados.
- O tick probe é limitado e declara `fullTickDomain=false` e `authoritativeTickDomain=false`.
- Limite conservador da POC: 128 MiB; não representa suporte a DEM de 400 MB.
- Validator bounded recursivo rejeita forbidden keys em qualquer profundidade, ciclos, funções, buffers, typed arrays, Blob/File e objetos exóticos; recomputa os digests de resultado e manifest.
- Feature flag permanece desligada por padrão; o validator nunca persiste e mantém Canonical bloqueado.

## Evidência real e limitações

`WASM_BROWSER_INITIALIZATION: PASS`; `REAL_DEM_RUNTIME: NOT_RUN`. Não há fixture `.dem` autorizada. Não houve teste real Browser → Worker → WASM → DEM, benchmark de memória, teste de 400 MB ou paridade WASM↔Python. Test doubles unitários comprovam apenas contratos, não a execução de DEM.

Nenhum Cache Run, retry, attempt 9, enqueue, claim, Canonical real, migration, secret, deploy Railway, Storage ou histórico de produção foi alterado.

## Gate final

`POC_NOT_READY`

# F.2.10-L/M/N — contract closure

The harness now uses one machine-readable upstream manifest shared by TypeScript and Python, with independently recomputed catalog and contract digests. It contains source-backed API/field/event provenance, 38 explicit event request definitions, objective coverage metrics, and separate lifecycle states. Python artifacts use unique execution IDs while semantic digests exclude operational identity. Browser and Python inputs require explicit authorization metadata bound to filename, size and SHA-256.

`PASS_FOR_AUTHORIZED_REAL_DEM` applies only to the static harness contracts. No authorized DEM was supplied, so `REAL DEM VERIFIED = NO`, `PYTHON × WASM VERIFIED = NO`, `DETERMINISM VERIFIED = NO`, `CANONICAL READY = NO`, and `AI DATA READY = NO`. The operational evidence status remains `POC_NOT_READY / NO_AUTHORIZED_REAL_DEM_FIXTURE`.
