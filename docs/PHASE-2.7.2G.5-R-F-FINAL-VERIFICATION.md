# FASE 2.7.2G.5-R-F — Final verification

## 1. Resumo executivo

A correção G.5-R está aplicada e coerente com o schema real. A migration, contratos TypeScript, lifecycle existente, segurança service-role-only, admissão RAW→Canonical e histórico Cache foram auditados. As suítes, typecheck, compileall, build, diff check, lint do escopo e smoke do frontend atual passaram.

O teste concorrente real não foi executado porque o ambiente disponível oferece somente consultas read-only ou mutações autocommit no banco de produção. Não existe banco Postgres descartável/testcontainer no projeto, e duas sessões com rollback coordenado não podem ser abertas pelas ferramentas disponíveis. Executar esse teste no banco real criaria dados de produção, o que é proibido nesta fase. Portanto, G5-R-F-19 permanece `BLOCKED` e a fase não pode declarar readiness.

**Decisão:** `G5-R-F = PARTIAL/BLOCKED — NOT READY FOR CACHE RUN 1`.

## 2. O que foi auditado

- Migration `20260918235817_30712b60-cf57-4adc-89e5-3fbd7bdee5a4.sql` e sua linhagem de reserve/enqueue.
- Schema real de `uploads`, `demo_jobs`, `raw_evidence_artifacts`, `raw_evidence_chunks` e `raw_demo_evidence_reports`.
- Constraints, índices, advisory lock, lock ordering e ACLs das RPCs.
- Diff real desde `20106abeb6a145cdbe34612a3ec860bfd13251e3`.
- Canonical fail-closed, contratos RAW/HOT, identidade e lifecycle.
- Arquitetura frontend TanStack atual, rotas públicas, autenticadas e admin.
- Estado vivo do job, upload e artifact Cache históricos.

## 3. O que foi alterado

Nesta verificação foram adicionados somente este relatório e a atualização factual do roadmap. Os dois arquivos TypeScript já pertencentes à G.5-R foram formatados para remover os erros de lint do próprio escopo, sem mudança semântica.

Não houve migration adicional, alteração de schema/dados, Railway, secrets, Storage, RAW, artifact, Canonical, parser ou execução do Cache.

## 4. O que foi provado dinamicamente

- Schema, constraints, índices e privilégios foram consultados diretamente no banco.
- Histórico Cache foi relido diretamente: tentativa máxima continua 7 e existem zero tentativas posteriores.
- Artifact foi relido diretamente: READY/RAW READY/audit BLOCKED, 24/24 chunks verificados, 373.754 rows, 2.799.488 bytes e root digest histórico preservado.
- Browser real abriu `/`, `/login`, `/register`, 404, `/dashboard`, `/upload`, `/matches`, `/performance`, `/player-dna`, `/analysis`, `/coach`, `/profile` e `/admin`, sem `ReferenceError`, `TypeError` ou rejeição não tratada.
- Suítes e build foram executados no estado atual.

## 5. Teste de concorrência

### Metodologia disponível

Foi verificada a possibilidade de duas conexões Postgres independentes dentro de uma transação descartável. O projeto não possui harness de banco local/testcontainer. As ferramentas de banco disponíveis não expõem sessões transacionais concorrentes com rollback coordenado; executar as RPCs nelas faria commit em produção.

### Resultado

- Resultado: `BLOCKED`.
- Attempts temporários criados: **0**.
- Uploads temporários criados: **0**.
- Jobs temporários criados: **0**.
- IDs temporários: nenhum.
- Rollback: não aplicável, pois nenhuma mutação foi iniciada.

A evidência estrutural confirma advisory lock idêntico em reserve/enqueue, índice único de uma supersessão e `ATTEMPT_ALREADY_SUPERSEDED`. Isso não substitui prova dinâmica de corrida.

### Prova ainda necessária

Executar em Postgres descartável duas conexões simultâneas para o mesmo usuário+SHA, dentro de um fixture isolado: reservar concorrente, subir somente um objeto de teste ou exercitar enqueue em fixture transacional, comprovar exatamente um attempt novo, a segunda chamada idempotente, supersessão bidirecional e rollback/teardown integral.

## 6. Frontend

A arquitetura atual usa `src/routes`, root shell, `I18nProvider`, `AppShell`, layouts de autenticação/admin e boundaries atuais. A auditoria estática não encontrou variável sem declaração, chamada inválida de `name`, `value`, `url` ou `length`, import inexistente, destructuring incorreto ou hook fora de contexto nas áreas atuais auditadas.

Smoke público e autenticado: **PASS**. As 13 rotas testadas responderam com o destino esperado e sem erros críticos de runtime. Nenhum bug real foi encontrado ou corrigido.

## 7. Testes

| Verificação | Resultado |
|---|---|
| Vitest completa | PASS — 921 testes |
| Focados lifecycle/RAW/HOT/Canonical/identity | PASS — 179 testes |
| Parser/RAW/HOT/adapter/worker | PASS — 162; SKIP — 10 testes dependentes de fixture real opcional |
| TypeScript (`tsgo`) | PASS |
| Python `compileall` | PASS |
| Build de produção | PASS |
| `git diff --check` | PASS |
| Lint do escopo G.5-R | PASS |
| Lint global | `BLOCKED_BY_BASELINE` — somente problemas preexistentes fora dos arquivos G.5-R-F |

O linter do banco mantém 15 findings preexistentes: quatro tabelas server-only sem policy, uma extensão em `public` e dez funções legadas executáveis por authenticated. As duas RPCs deste escopo foram verificadas separadamente como inacessíveis a `PUBLIC`, `anon` e `authenticated`, com execução apenas por `service_role`.

## 8. Railway

Nenhuma configuração ou implantação foi alterada. Leitura de `/health` e `/version`: serviço saudável, papel durable-worker e contract version 1.

## 9. Cache histórico

- Job: `a31f5c25-b0d8-41ac-8225-27814cd1732a`.
- Upload: `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043`.
- Artifact: `3a1e5225-f0f2-427a-97b8-c21dac936e7d`.
- Estado: `blocked_raw_audit` / `raw_audit`; tentativa 7; dispatch 2; retry 2.
- SHA preservado; nenhuma tentativa 8 foi criada.
- Artifact: 24 chunks verificados, 373.754 rows, 2.799.488 bytes, root digest `ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2`.
- Nenhum report aprovado para Canonical; `superseded_by_job_id` permanece nulo.

## 10. Roadmap

G.5-R-F foi registrado como `PARTIAL/BLOCKED`; Cache Run 1 e Run 2 continuam não executados, e a Fase 2.8 permanece bloqueada.

## 11. Matriz G5-R-F-01..35

| Gate | Estado | Evidência |
|---|---|---|
| G5-R-F-01 — schema audit | PASS | Schema real consultado |
| G5-R-F-02 — migration audit | PASS | Incremental, não destrutiva e sem mutação histórica |
| G5-R-F-03 — blocked_raw_audit replacement | PASS | Branch explícito na RPC viva |
| G5-R-F-04 — new upload identity | PASS | Novo UUID/path no contrato; sem execução real |
| G5-R-F-05 — new job identity | PASS | Enqueue cria job próprio; sem execução real |
| G5-R-F-06 — attempt_number | PASS | `GREATEST(previous)+1` |
| G5-R-F-07 — supersedes_job_id | PASS | Propagado upload→job |
| G5-R-F-08 — superseded_by_job_id | PASS | Atualização bidirecional protegida |
| G5-R-F-09 — raw_audit_blocked reason | PASS | Constraints, RPC e TypeScript alinhados |
| G5-R-F-10 — same SHA | PASS | SHA copiado para a nova tentativa |
| G5-R-F-11 — old attempt immutable | PASS | Branch não atualiza tentativa bloqueada; histórico vivo intacto |
| G5-R-F-12 — duplicate post-replacement | PASS | Active index + retorno pending |
| G5-R-F-13 — processed idempotency | PASS | Exige processed + RAW aprovado |
| G5-R-F-14 — pending/processing idempotency | PASS | Retorno duplicado sem nova reserva |
| G5-R-F-15 — failed replacement | PASS | Semântica preservada |
| G5-R-F-16 — cancelled replacement | PASS | Semântica preservada |
| G5-R-F-17 — stale replacement | PASS | Semântica e fencing preservados |
| G5-R-F-18 — ATTEMPT_ALREADY_SUPERSEDED | PASS | Guard e índice único presentes |
| G5-R-F-19 — REAL CONCURRENCY TEST | BLOCKED | Sem banco descartável/sessões com rollback; produção não foi mutada |
| G5-R-F-20 — service-role security | PASS | ACL, SECURITY DEFINER e search_path verificados no banco |
| G5-R-F-21 — frontend static audit | PASS | Arquitetura atual sem defeitos encontrados |
| G5-R-F-22 — frontend runtime smoke | PASS | 13 rotas, zero erros críticos |
| G5-R-F-23 — parser tests | PASS | 162 PASS / 10 SKIP |
| G5-R-F-24 — pipeline tests | PASS | Suíte completa e focada passaram |
| G5-R-F-25 — Canonical tests | PASS | Persistência/admission fail-closed passaram |
| G5-R-F-26 — RAW tests | PASS | Evidência/contratos passaram |
| G5-R-F-27 — TypeScript | PASS | `tsgo` |
| G5-R-F-28 — compileall | PASS | Parser compilado |
| G5-R-F-29 — build | PASS | Client e SSR produzidos |
| G5-R-F-30 — diff check | PASS | Sem whitespace errors |
| G5-R-F-31 — lint | PARTIAL | Escopo PASS; global bloqueado pelo baseline |
| G5-R-F-32 — Railway unchanged | PASS | Somente probes read-only |
| G5-R-F-33 — historical Cache unchanged | PASS | Estado e contagens relidos; tentativa máxima 7 |
| G5-R-F-34 — roadmap synchronized | PASS | Estado factual registrado |
| G5-R-F-35 — Cache Run 1 NOT EXECUTED | PASS | Zero attempts após 7 |

## 12. Riscos e gaps remanescentes

1. Falta a corrida real em banco descartável para validar bloqueio sob duas sessões simultâneas.
2. O lint global continua bloqueado pelo baseline preexistente; o escopo G.5-R está limpo.
3. Os 15 findings legados do linter do banco permanecem fora deste escopo.

## 13. Decisão final

**G5-R-F = PARTIAL/BLOCKED — NOT READY FOR CACHE RUN 1**