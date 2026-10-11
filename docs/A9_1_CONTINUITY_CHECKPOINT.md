# A9.1 — Checkpoint de continuidade (2026-10-10 05:50 BRT)

Documento de trabalho. Não autoriza nada: não libera A9.1, Canonical Engine,
Railway nem produção. Nenhum merge, deploy, alteração em Railway/Lovable/banco
ou execução com a demo real foi feito nesta sessão.

## 1. Branch, HEAD, último commit

| Item                     | Valor                                           |
| ------------------------ | ----------------------------------------------- |
| Branch atual             | `feat/a91-grenade-domain-contract-v2`           |
| Commit base desta branch | `a64c372e11f52426a5a9988da07b260d85e1f7d4` (P1) |
| `main` na última leitura | `c433fcc264927ba7e0c8272b1ed89482a3a09128`      |

Este arquivo entra junto com um commit WIP nesta branch (ver seção 3).

## 2. Pull requests desta sessão

| PR                            | Branch → base                                                    | HEAD      | Estado                          | CI no HEAD                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------- | --------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| #72 P0 contrato canônico      | `fix/a91-p0-canonical-parity-contract` → `main`                  | `52878a8` | aberto, `clean`, não mergeado   | Web OK, Contract-sensitive OK, F553 R11.2 OK, `CS2 parser tests` **skipped**                                    |
| #73 P1 memória WASM           | `fix/a91-p1-wasm-memory-columnar` → `main` (empilhado sobre #72) | `a64c372` | aberto, `clean`, não mergeado   | os três acima OK + `Python/WASM harness on public fixture` OK (run 38037605439), `CS2 parser tests` **skipped** |
| #74 exceções não recuperáveis | `fix/parser-nonrecoverable-exceptions` → `main`                  | `3342db9` | aberto, **draft**, não mergeado | Web OK, Contract-sensitive OK, F553 R11.2 OK, `CS2 parser tests` **skipped**                                    |

`CS2 parser tests` é pulado em qualquer PR para `main` por condição do próprio
workflow (`.github/workflows/quality-gates.yml:63-65`, só roda para
`infra/cs2-parser-worker-v8`). Não é falha destes PRs.

Nenhum PR foi aberto para o contrato v2 de granadas.

## 3. Arquivos alterados

### Commitados e enviados

- #72 (`52878a8`): contrato canônico v1 — `scripts/a91/canonical/*`,
  `canonical_schema.{mjs,py}`, `field_compare.mjs`, `cross_runtime.check.mjs`,
  `parity.mjs`, `run_wasm_reference.mjs`, `python_reference.py`, testes,
  `docs/A9_1_CANONICAL_CONTRACT.md`.
- #73 (`a64c372`, 17 arquivos, +1751/−241): `.github/workflows/a91-public-fixture-gate.yml`,
  `docs/A9_1_WASM_MEMORY.md`, `scripts/a91/{wasm_patches.py, wasm_memory.check.mjs,
public_fixture_gate.py, public_fixture_report.mjs, public_fixture_expectations.json,
run_wasm_reference.mjs, rebuild_wasm_large_demo.py, contracts.mjs, diagnostics.mjs,
execute.py, finalize_report.mjs, test_execute.py}`, `scripts/__tests__/a91-harness.test.ts`,
  `services/cs2-demo-parser/{python_reference.py, tests/test_python_reference.py}`.
- #74 (`3342db9`): `services/cs2-demo-parser/parser.py`,
  `services/cs2-demo-parser/tests/test_non_demo_failures.py`,
  `.github/workflows/quality-gates.yml` (dois arquivos de teste a mais no job
  contract-sensitive).

### WIP desta branch (contrato v2 de granadas) — NÃO validado por completo

`scripts/a91/canonical/contract.json`, `canonical/vectors.json`,
`canonical_schema.check.mjs`, `canonical_schema.mjs`, `canonical_schema.py`,
`cross_runtime.check.mjs`, `parity.mjs`, `public_fixture_expectations.json`,
`public_fixture_report.mjs`, `test_canonical_schema.py` (10 arquivos, +323/−58).

Observação: o Prettier chegou a reformatar `canonical/shared_fixture.json`
(só formatação); o arquivo está idêntico ao commit novamente.

## 4. Testes executados

### P1 (`a64c372`) — todos concluídos

| Comando                                                                                                                                                | Resultado                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `vitest run` (scripts, vitest avulso em `/home/claude/vt`)                                                                                             | 25/25                                                                                               |
| `python3 -m unittest discover -s scripts/a91 -p "test_*.py"`                                                                                           | 28/28                                                                                               |
| `pytest -q` em `services/cs2-demo-parser`                                                                                                              | 252 passed, 10 skipped                                                                              |
| `node scripts/a91/contracts-node-checks.mjs`                                                                                                           | 13 pass, 0 fail                                                                                     |
| checks avulsos (`wasm_value_normalization`, `header_probe`, `tick_probe`, `inventory_determinism`, `canonical_schema`, `cross_runtime`, `wasm_memory`) | todos PASS                                                                                          |
| `public_fixture_gate.py` local (WASM pré-compilado do laboratório)                                                                                     | 17/17 checks, 8m21s                                                                                 |
| CI do PR #73                                                                                                                                           | verde, incluindo build fixado (Rust 1.91.1, wasm-pack 0.13.1) e o gate público; passo do gate 5m30s |

### #74 (`3342db9`)

`pytest -q` completo: 259 passed, 10 skipped. `tests/test_non_demo_failures.py`: 13/13.

### WIP v2 (não commitado quando medido)

Rodados depois da implementação do filtro, **antes** das últimas edições em
`public_fixture_expectations.json` / `public_fixture_report.mjs`:
`canonical_schema.check.mjs` PASS (v2, 38 valores, 5 tabelas),
`test_canonical_schema.py` 6/6, `cross_runtime.check.mjs` PASS,
`wasm_memory.check.mjs` PASS.
**Não rodados ainda no estado atual:** vitest, unittest, pytest e o gate público.

### Comandos que falharam e o que foi feito

- `bun install` / `npm install` no repo: registro npm do Lovable bloqueado no
  ambiente. A suíte web completa só roda no CI (verde nos três PRs).
- Download do artefato e do log do run 38037605439 pela API: bloqueado pelo
  proxy (blob storage). O conteúdo do relatório do CI **não foi lido**; só a
  conclusão do job e os tempos dos passos. Digest do artefato:
  `sha256:c83d7104809a78d57f811df02e25894f5a00fe18ace293305dc5d8658a61d041`.
- Primeira execução local do gate público: timeout de 2 min da ferramenta;
  repetida com timeout maior e concluída.
- Falhas intermediárias corrigidas antes do commit: teste de texto
  `wasmExports.memory instanceof`, teste Python sem `authorizationRef`,
  asserts de versão/contagem ao subir o contrato para v2.

## 5. Estado do P0 e do P1

**P0 (#72):** pronto para revisão, CI verde. Contrato canônico v1, envelopes
simétricos, comparação por campo, 12 divergências intencionais detectadas.

**P1 (#73):** pronto para revisão, CI verde.

- Causa do trap reproduzida sem demo: tabela sintética de 4.550.843 linhas +
  473.748.061 bytes de lastro, caminho row-major → `RuntimeError: unreachable`
  em 65.536 páginas (4.294.967.296 bytes), último estágio `parsed_columns_built`
  (dentro de `soa_to_aos`). Caminho column-major completa em 1.486.946.304 bytes.
- Fixture pública: memória WASM de `parseGrenades` 578.813.952 → 193.003.520
  bytes; `normalizedResultDigest` do WASM idêntico antes e depois
  (`7c33eab9…5637e`); digest row-major = column-major (`a92f92da…18d0`).
- Projéteis continuam habilitados; comparador e domínios inalterados; pre-grow removido.
- **Não provado:** que a demo real de 474 MB conclui dentro do orçamento de
  3 GiB, nem que a paridade passa nela. Só uma execução manual do gate real prova.

**Paridade na fixture pública (contrato v1):** `FAIL` medido, 12/14 domínios
comparáveis; só `grenades` (517.048 Python vs 526.259 WASM) e `game_state`.

**Experimento de laboratório (base do WIP v2):** aplicando o predicado do
próprio upstream (`entities.rs:388`: contém Projectile/Grenade/Flash e não
Player), as duas tabelas ficam iguais em sequência: 504.320 linhas em ambos.
As linhas fora do predicado são só `CC4`, `CKnife`, `CWeaponGlock`
(12.728 no Python, 21.939 no WASM).

## 6. Comando em execução

Nenhum. O último comando (suítes + gate público sob v2) foi interrompido antes
de produzir resultado e não há processo em execução.

## 7. Próxima ação exata

1. Rodar no estado atual desta branch: os três checks avulsos, `unittest`,
   vitest de scripts, `pytest` do parser e `public_fixture_gate.py` local
   (~8 min) com `A91_PUBLIC_FIXTURE_PREBUILT_WASM=1`,
   `A91_WASM_ARTIFACT_DIR=/home/claude/lab/pkg2`,
   `A91_WASM_MANIFEST=/home/claude/p1run/manifest.json`,
   `A91_PUBLIC_FIXTURE_PATH=/home/claude/fixture/test_demo.dem`.
   Motivo: o contrato mudou de versão, então os resultados do P1 não valem para v2.
2. Critérios de aceite do v2:
   - todas as suítes verdes;
   - gate público: `diverging_domains_match_ratchet` e
     `diverging_tables_match_ratchet` com conjuntos vazios,
     `contract_exclusions_match_ratchet` com exatamente 12.728 / 21.939 linhas
     e classes `CC4`, `CKnife`, `CWeaponGlock`, domínio com 504.320 linhas;
   - `cross_runtime.check.mjs` continua provando que uma linha extra de classe
     de granada real, ou um valor alterado, ainda dá `FAIL`.
3. Só então: atualizar `docs/A9_1_CANONICAL_CONTRACT.md` (seção v2), commit
   final, e abrir PR **draft** empilhado sobre #73, marcado como decisão do
   proprietário (muda o que conta como domínio de granadas).
4. Depois: relatório final (seções A–I) com a matriz de evidências, a Fase D
   (árvores do worker, pipeline durável, taxonomia de falhas) e a pesquisa externa.

Pendências de decisão do proprietário, não executadas: merge de #72/#73/#74,
contrato v2, taxonomia de falhas (`RESOURCE_EXHAUSTED` etc.), reconciliação
das árvores do worker, execução manual do gate real.

## 8. O que preservar para outra sessão

No GitHub (durável): branches `fix/a91-p0-canonical-parity-contract`,
`fix/a91-p1-wasm-memory-columnar`, `fix/parser-nonrecoverable-exceptions`,
`feat/a91-grenade-domain-contract-v2` (com este checkpoint) e os PRs #72, #73, #74.

Só existe no contêiner desta sessão (se perder, é reconstruível):

- Fixture pública: `LaihoE/demoparser@4131a4fc` `src/parser/test_demo.dem`,
  60.601.900 bytes, sha256 `84a1a419…22cb2`.
- Build WASM de laboratório: é o que `rebuild_wasm_large_demo.build_wasm_artifact()`
  produz; o CI do #73 já o reconstrói.
- Venv Python com `demoparser2==0.42.0`; vitest/prettier avulsos.
- Evidências anexadas pelo proprietário (artefatos e logs dos runs #24 e #25).

Achados da Fase D já levantados (leitura, ainda não escritos no relatório final):

- `main`, `91aeee8` (deploy) e `5703b1d` (pin) não têm histórico comum entre
  `main` e os outros dois; `parser.py`, `adapter.py`, `settings.py`,
  `raw_artifact.py` são idênticos byte a byte nos três.
- `worker_main.py`, `parser_child.py`, `parser_isolated.py` existem em
  `91aeee8` e `5703b1d`, não em `main`; `h3e91_execution.py` só em `main`.
- `parser_isolated.py@91aeee8:83-93`: qualquer retorno ≠ 0 do filho (inclusive
  morte por sinal/OOM) vira `PARSER_ERROR`; não há `setrlimit` em nenhuma árvore.
- `claim_demo_parse_message` (`supabase/migrations/20260916103513…sql:64-73`):
  job `processing` com lease expirado é reassumido com o mesmo `retry_count`;
  não há dead-letter nem uso de `read_ct`.
- `RESOURCE_LIMIT` existe em `src/lib/pipeline/errors.ts` mas nada o emite.
- R11.2 roda em Postgres local descartável no SHA de `main`; não prova nada
  sobre o worker implantado.

## Atualização 06:10 BRT — contrato v2 validado localmente

Rodado no estado desta branch: checks avulsos PASS, `unittest` 29/29, vitest
25/25, `pytest` 252 passed / 10 skipped, Prettier limpo, gate público local
18/18 checks. Paridade na fixture pública sob v2: `PASS`, 14/14 domínios
comparáveis, 40/40 tabelas, 511/511 campos; exclusões publicadas: Python
12.728 (`CC4` 3.776, `CKnife` 3.776, `CWeaponGlock` 5.176), WASM 21.939
(`CC4` 6.639, `CKnife` 6.953, `CWeaponGlock` 8.347); domínio 504.320 linhas
em ambos. Os critérios da seção 7.2 foram atendidos. Próxima ação: relatório
final (seções A–I).
