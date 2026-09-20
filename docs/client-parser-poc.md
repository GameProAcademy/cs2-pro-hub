# Client-side DEM parser POC — F.2.10

## Status

`POC_IMPLEMENTED`, but **POC_NOT_READY** for a real browser test. The required official `demoparser2@0.42.0` browser/WASM distribution is not published in npm. The published browser package stops at `0.15.0`; `@laihoe/demoparser2` is a Node/native binding and was intentionally not installed. Runtime loading therefore fails closed as `CLIENT_PARSER_UNAVAILABLE` unless an exact, reviewed 0.42.0 WASM asset is explicitly configured.

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

Because the exact 0.42.0 asset is unavailable, no dependency or fake implementation was added. Script and binary URLs are optional public build variables; absent URLs intentionally block before parsing.

## Hash, compact result, and manifest

SHA-256 uses the existing incremental project implementation over the actual DEM bytes and produces lowercase 64-hex output. The deterministic digest excludes runtime performance fields. The compact result is capped at 2 MiB, event samples at 1,000, event inventory at 1,024, players at 128, and tick probe at 4,096. The manifest records DEM metadata, parser/runtime/build identity, contract/catalog versions and digests, classifications, limited coverage, semantic status, result digest, timestamp, and performance.

## Performance, large files, and memory

Infrastructure accepts files up to 1.5 GiB and transfers the buffer to a worker. This is not evidence that a ~400 MB DEM works. No real large DEM, browser memory profile, or browser compatibility matrix was executed. `performance.memory` is non-standard, so memory remains `UNAVAILABLE` rather than estimated. Hash, parse, total, WASM load, result byte size, and file size are measured when a real parser runs.

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

| Gate | Resultado |
| --- | --- |
| Testes focados POC/RAW/Canonical | PASS — 31/31 |
| Aplicação completa | PASS — 959/959 |
| Parser Python | PASS — 171; SKIPPED — 10 condicionais |
| Typecheck | PASS |
| ESLint completo | PASS — 0 erros; 9 warnings preexistentes |
| Compileall Python | PASS |
| Diff check | PASS |
| Build | DELEGATED — harness automático |
| Browser real com DEM | NOT_RUN |
| Teste real de 400 MB e memória | NOT_RUN |
| Paridade real WASM↔Python | NOT_RUN |

## Restrições preservadas

Nenhum Cache Run, retry, attempt 9, enqueue, claim, Canonical real, migration, secret, deploy Railway, Storage ou histórico de produção foi alterado.

## Limitação bloqueante

A distribuição browser/WASM publicada não fornece `demoparser2==0.42.0`. A POC não substitui a autoridade Python/Railway e permanece fail-closed até existir um runtime browser compatível e serem executados testes reais de navegador, memória e paridade.

## Gate final

`POC_NOT_READY`
