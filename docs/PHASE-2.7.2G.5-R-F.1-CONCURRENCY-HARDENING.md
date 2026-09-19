# FASE 2.7.2G.5-R-F.1 — Concurrency hardening

## A. Resumo executivo

PostgreSQL 17.9 local e descartável executou concorrência real com duas conexões independentes. O SQL real das migrations Phase J e G5-R produziu exatamente uma tentativa 8 e um job sob disputa. A janela reserve→enqueue revelou um defeito no cliente: `pending` sem `job_id` era reportado como concluído. O cliente agora resolve o enqueue sem sobrescrever o objeto e falha fechado se os bytes ainda não existem.

**Decisão:** `G5-R-F.1 = PASS`; `G5-R-F = CLOSED`; `READY FOR CACHE RUN 1`; `CACHE RUN 1 NOT EXECUTED`.

## B. Arquivos alterados

- `scripts/pipeline-concurrency-harness.py`
- `src/lib/pipeline/client.ts`
- `src/lib/pipeline/__tests__/gate1d.test.ts`
- `src/lib/pipeline/__tests__/uploadLifecycleIdempotency.test.ts`
- `src/lib/pipeline/__tests__/uploadLifecycleConcurrency.integration.test.ts`
- este relatório, o relatório G5-R-F e `roadmap.md`

## C. Migrations

Nenhuma migration histórica foi editada e nenhuma migration nova foi necessária. O defeito provado estava na interpretação do contrato pelo cliente, não na serialização SQL.

## D. Harness e ambiente PostgreSQL

O harness cria um `initdb` em `/tmp`, inicia PostgreSQL 17.9 em socket e porta aleatórios sob o usuário sem privilégios `lovable`, usa somente `PATH`, `HOME=/tmp` e timeouts locais, e remove o cluster no `finally`. Nenhuma URL, chave ou dado de produção entra no processo.

O schema mínimo reproduz colunas, enums, FKs, índices, trigger de dispatch e ACLs necessários. As implementações reais de `reserve_demo_upload` e `enqueue_demo_job` são carregadas diretamente das migrations `20260915100000` e `20260918235817`; apenas `pgmq.archive/send` é isolado localmente.

## E. Metodologia e conexões concorrentes

Cada disputa usa dois processos `psql`, portanto duas sessões PostgreSQL independentes, disparadas simultaneamente por `ThreadPoolExecutor`. Após cada disputa, uma terceira consulta verifica o estado persistido. O cenário principal foi repetido 50 vezes.

## F. Cenários A–E

- **A:** duas reservas simultâneas sobre attempt 7 `blocked_raw_audit`: uma única reserva attempt 8; a outra reutiliza o mesmo upload.
- **B:** reserve e enqueue: exatamente um novo job, ligado ao upload attempt 8 e ao job anterior.
- **C:** na janela após commit do reserve, a segunda reserva retorna `duplicate=true`, `pending`, `job_id=null`, attempt 8 e o mesmo upload. O SQL não cria órfão adicional; o antigo cliente, porém, encerrava sem job.
- **D:** dois enqueues simultâneos retornam o mesmo job; somente um informa `queued=true`.
- **E:** interleavings reserve/reserve/enqueue preservam uma tentativa, um upload e um job, sem attempt 9.

## G. Cenários F–J

- **F failed:** uma replacement, reason `failed`.
- **G cancelled:** uma replacement, reason `cancelled`.
- **H stale:** uma replacement, reason `stale`; job antigo vai para `failed` e fica fenced.
- **I processed + RAW approved:** nenhuma replacement; ambas retornam o job processado.
- **J legacy unvalidated:** uma replacement, reason `legacy_unvalidated`.

## H. Race encontrada e correção

O banco serializava corretamente, mas `submitDemoWithDependencies()` tratava `duplicate=true + pending + existingJobId=null` como conclusão. Agora esse branch não faz upload nem overwrite: chama o enqueue idempotente para resolver a reserva. Se o objeto ainda não estiver disponível, `enqueueDemoJob` mantém a checagem privada de Storage e o cliente retorna `PROCESSING_ERROR`, sem conclusão falsa ou polling nulo.

## I. Fencing, unicidade e segurança

- `supersedes_job_id`/`superseded_by_job_id` permaneceram bidirecionais e únicos.
- O índice ativo rejeitou duas linhas incompatíveis em `pending/processing/cancel_requested`.
- As RPCs são `SECURITY DEFINER`, têm `search_path` fixado e são negadas a `anon`/`authenticated`, permitidas a `service_role`.

## J. Resultados repetidos

`iterations=50`, `successes=50`, `unexpected duplicates=0`, `failures=0`, `deadlocks=0`, `timeouts=0`, teardown confirmado. A integração automatizada repetiu 25 ciclos e passou.

## K. Testes de regressão e frontend

O teste de cliente cobre recuperação bem-sucedida e falha fechada durante upload em andamento. A suíte de integração consulta contagens, attempts, relação de supersession, reason e IDs persistidos. Nenhuma tela, parser, Railway ou fluxo RAW/Canonical foi alterado.

## L. Cache histórico e Railway

Leitura transacional confirmou job `a31f5c25-b0d8-41ac-8225-27814cd1732a`, upload `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043`, attempt 7, zero attempts posteriores e `superseded_by_job_id=NULL`. Artifact `3a1e5225-f0f2-427a-97b8-c21dac936e7d`: 24/24 chunks, 373.754 rows, 2.799.488 bytes e root digest `ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2`.

Railway permaneceu inalterado: `/health` e `/version` HTTP 200; demoparser2 0.42.0, contract 1, semantic `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`, build `git:e0856de0879454219a9f33c70372a394b3c8b78b`.

## M. Validação e limitações

Testes focados: 30 PASS. Integração PostgreSQL: PASS. Typecheck, py_compile, lint do escopo e diff check: PASS. O build automatizado será registrado pelo harness do projeto. O pgmq real não foi instalado localmente; somente sua fronteira necessária ao lifecycle foi isolada. Nenhum Cache Run, parser real, deploy, secret ou mutação de produção ocorreu.

## N. Matriz G5-R-F.1-01..30

| Gate | Estado | Evidência |
|---|---|---|
| G5-R-F.1-01 disposable PostgreSQL | PASS | PostgreSQL 17.9 em `/tmp`, teardown |
| G5-R-F.1-02 production isolation | PASS | ambiente sanitizado; zero conexão de produção |
| G5-R-F.1-03 schema reproduction | PASS | schema mínimo + SQL real das migrations |
| G5-R-F.1-04 real dual connection | PASS | dois processos `psql` simultâneos |
| G5-R-F.1-05 blocked_raw_audit concurrency | PASS | 50 disputas reais |
| G5-R-F.1-06 exactly one replacement | PASS | uma linha attempt 8 |
| G5-R-F.1-07 attempt_number | PASS | 8; nenhuma 9 |
| G5-R-F.1-08 same SHA | PASS | hash preservado |
| G5-R-F.1-09 supersedes_job_id | PASS | aponta para attempt 7 |
| G5-R-F.1-10 superseded_by_job_id | PASS | aponta para novo job |
| G5-R-F.1-11 no attempt 9 | PASS | contagem persistida zero |
| G5-R-F.1-12 ATTEMPT_ALREADY_SUPERSEDED | PASS | índice/guard e uma única supersessão |
| G5-R-F.1-13 pending idempotency | PASS | mesmo upload/job |
| G5-R-F.1-14 processing idempotency | PASS | lifecycle real preservado |
| G5-R-F.1-15 failed replacement | PASS | reason failed |
| G5-R-F.1-16 cancelled replacement | PASS | reason cancelled |
| G5-R-F.1-17 stale replacement | PASS | reason stale + fencing |
| G5-R-F.1-18 processed RAW-approved | PASS | sem replacement |
| G5-R-F.1-19 legacy_unvalidated | PASS | uma replacement correta |
| G5-R-F.1-20 enqueue idempotency | PASS | um job, mesmo ID |
| G5-R-F.1-21 reserve→enqueue race | PASS | janela reproduzida |
| G5-R-F.1-22 no orphan logical state | PASS | cliente corrige ou falha fechado |
| G5-R-F.1-23 client handling | PASS | regressões executáveis |
| G5-R-F.1-24 service-role ACL | PASS | ACL dinâmica local |
| G5-R-F.1-25 advisory lock | PASS | serialização observada em 50 ciclos |
| G5-R-F.1-26 active SHA uniqueness | PASS | violação esperada comprovada |
| G5-R-F.1-27 regression suite | PASS | 30 testes focados |
| G5-R-F.1-28 frontend | PASS | contrato corrigido; sem polling null |
| G5-R-F.1-29 Cache historical unchanged | PASS | leitura real; attempt máximo 7 |
| G5-R-F.1-30 final readiness | PASS | lifecycle fechado; Run 1 não executado |

## O. Decisão final

G5-R-F.1 = PASS  
G5-R-F = CLOSED  
READY FOR CACHE RUN 1  
CACHE RUN 1 NOT EXECUTED