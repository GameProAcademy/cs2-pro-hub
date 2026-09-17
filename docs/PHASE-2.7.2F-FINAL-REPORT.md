# FASE 2.7.2F.1 → 2.7.2F FINAL — Relatório técnico

## A. Resumo executivo
A fundação de identidade, `participantKey`, métricas player-scoped, dados semânticos e lifecycle E2E está fechada em código e testes. O preflight Railway real passou, e o Cache reservado foi reenfileirado uma única vez pelo lifecycle oficial. A execução chegou ao RAW READY, mas terminou `blocked_raw_audit`; por isso Run 1 não passou, Run 2 não foi iniciada e a fundação permanece BLOCKED.

## B. O que foi implementado
- Participante source-neutral com `participant_key` opcional e Steam externa opcional.
- Polling durável finito, vinculado ao dispatch solicitado, com timeout e detecção de stall.
- Idempotência condicionada a Run 1 processada e Run 2 realmente reenfileirada e terminal.
- Availability de utility baseada em cobertura, com eventos filtrados pelo participante.
- Exposição administrativa separada de `attempt_number`, dispatch e resultado da espera.

## C. O que foi corrigido
- O E2E não relê mais imediatamente após `retry_demo_job`.
- Estado terminal antigo não comprova o novo dispatch.
- Histórico failed reprocessado é Run 1, não uma falsa Run 2.
- O normalizer não descarta participante source-neutral sem Steam e não cria identidade por nickname.
- Parâmetros internos de métricas não tratam mais a chave de correlação como Steam por definição.

## D. O que já estava correto e foi preservado
Contrato parser `1`, revision lock, fila durável, RPC oficial, isolamento Railway, RAW JSONL gzip integral, chunks 4/8 MiB, hash chain/root digest, NaN/Infinity→null, HOT compacto, Canonical, attachment e provenance existentes.

## E. Testes executados
- APP completo: 64 arquivos, 894 passed, 0 failed.
- Focados: 4 arquivos, 81 passed, 0 failed.
- Parser/RAW/HOT: 154 passed, 3 skipped, 0 failed; 1 warning de depreciação.
- Typecheck: PASS.
- Python compileall: PASS.
- Diff check: PASS.
- Build automático: PASS.
- Segurança backend: nenhum finding ativo novo; 1 warning previamente ignorado pelo usuário.
- Dependências: 2 advisories high transitivos em `js-yaml` via framework, sem atualização direta indicada pelo scanner.

## F. Participant Key Audit
`participantKey` é resolvido antes de Steam. Pode diferir de Steam e pode existir com `steamId=null`. Participante inexistente falha com `PLAYER_IDENTITY_UNRESOLVED`. Nickname sem chave real é descartado, nunca promovido a identidade.

## G. Identity Audit
Steam/FACEIT/Gamers Club reais mantêm precedência; nickname é contexto. Método, source, confidence e confirmation permanecem separados. Decisões/provenance existentes foram preservados; nenhuma integração fake foi criada.

## H. AIM/POSITION/ECONOMY/UTILITY Matrix
| DATA CLASS | RAW SOURCE | HOT SOURCE | CANONICAL | PLAYER SCOPED | AVAILABILITY | NULL RULE | QUALITY |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AIM | tick samples integrais | aim observations bounded | metadata | sim | complete/limited/unavailable | ausência ≠ zero | rows/limit/overflow |
| POSITION | tick samples integrais | position snapshots bounded | metadata | sim | complete/limited/unavailable | ausência ≠ origem | rows/limit/overflow |
| ECONOMY | rounds/ticks integrais | economy snapshots bounded | metadata/round | sim | complete/limited/unavailable | ausência ≠ saldo zero | rows/limit/overflow |
| UTILITY | events + trajetórias integrais | events compactos | canonical events | sim | available/unavailable | sem cobertura = NULL | missing_utility |

## I. RAW Audit
RAW não foi reduzido, sampled adicionalmente ou carregado no callback. Trajetórias permanecem RAW. No Cache real, o artefato `3a1e5225-f0f2-427a-97b8-c21dac936e7d` ficou READY, com 24/24 chunks verificados, 373.754 linhas, 2.799.488 bytes e root digest `ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2`. A decisão semântica do manifest permaneceu `audit_status=blocked`; o APP corretamente impediu a admissão Canonical.

## J. Retry/Lifecycle Audit
`retry_demo_job` é o mecanismo único. `attempt_number` permanece lógico; `retry_count` é dispatch. Nenhum update direto ou chamada a `processJob()` foi introduzido.

## K. E2E Waiting Audit
O runner exige observar o dispatch esperado e aguarda `processed`/`failed`. Pending até timeout vira `E2E_WAIT_TIMEOUT_PENDING`; processing expirado/sem heartbeat vira `E2E_WORKER_STALLED`. Ambos resultam em BLOCKED.

## L. Idempotency Audit
A lógica só compara idempotência quando Run 1 processa e Run 2 solicitada termina. Como Run 1 foi bloqueada, Run 2 não foi iniciada e a prova real permanece BLOCKED.

## M. Railway Preflight
`GET /health`: HTTP 200. `GET /version`: HTTP 200 com `demoparser2@0.42.0`, contract `1`, semantic revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b` e build revision `git:5d19890cdf8a018469761c597c650016791342d3`. Status: PASS.

## N. Cache Real E2E
Run 1 executada pelo mesmo job `a31f5c25-b0d8-41ac-8225-27814cd1732a` e upload `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043`, sem novo upload. A RPC oficial preservou `attempt_number=7` e avançou o dispatch de `retry_count=1` para `2`; a mensagem 15 foi lida uma vez e arquivada. O job terminou `blocked_raw_audit` em `2026-09-17T12:13:33Z`, após cerca de 60,63 s, com `RAW_AUDIT_BLOCKED` e sem match Canonical.

## O. Cache Idempotency
NOT_RUN. Run 2 é proibida até Run 1 PASS; depende da resolução do bloqueio semântico do RAW audit.

## P. Performance
PARTIAL. Observado no banco: cerca de 60,63 s entre claim e terminal, 24 chunks, 373.754 linhas e 2.799.488 bytes RAW comprimidos. RSS e breakdown download/parser/HOT não ficaram disponíveis nos logs APP publicados; não são declarados como PASS.

## Q. Security
RPC de retry continua somente `service_role`; validação master/ownership e audit log permanecem server-side; nenhum secret foi movido ao frontend. O scan não encontrou finding ativo novo relevante à fase.

## R. Gate Matrix
| GATE | STATUS | EVIDENCE | BLOCKER | FILES/AREAS |
| --- | --- | --- | --- | --- |
| G1 Identity | PASS | testes/state machine/provenance | — | identity/attachment |
| G2 ParticipantKey | PASS | Steam diferente/nula e unresolved testados | — | normalizer/metrics |
| G3 Metrics | PASS | suíte player-scoped | — | metrics |
| G4 AIM | PASS | isolamento + availability | — | semantic data/HOT |
| G5 POSITION | PASS | isolamento + availability | — | semantic data/HOT |
| G6 ECONOMY | PASS | isolamento + availability | — | semantic data/HOT |
| G7 UTILITY | PASS | evento player-scoped + coverage | — | semantic data/events |
| G8 NULL semantics | PASS | ausência preservada | — | metrics/semantic data |
| G9 RAW | PASS | 153 parser tests | — | RAW writer/artifact |
| G10 Retry | PASS | RPC única e grants | — | lifecycle migration/functions |
| G11 E2E lifecycle | PASS | sem bypass direto | — | E2E runner |
| G12 E2E waiting | PASS | 5 testes de polling | — | e2eWaiting |
| G13 Idempotency | BLOCKED | lógica pronta; Run 2 não iniciada | Run 1 não passou | E2E verdict/runner |
| G14 Security | PASS | scan da fase sem finding ativo novo | — | auth/RPC/secrets |
| G15 Railway preflight | PASS | health/version 200; parser, contract, semantic e build pins exatos | — | Railway/parser endpoint |
| G16 Cache Run 1 | BLOCKED | dispatch 2 consumido; RAW READY; terminal `blocked_raw_audit` | manifest RAW não aprovado | Cache reservado |
| G17 Cache Run 2 | NOT_RUN | bloqueada por design | depende de G16 PASS | Cache reservado |
| G18 Cache Idempotency | NOT_RUN | não comparado | depende de G16/G17 PASS | Cache reservado |
| G19 Canonical | PASS | testes canonical + handoff | — | canonical/normalizer |
| G20 Projection | PASS | seleção player-scoped testada | — | metrics/features/persistence |
| G21 Performance | PARTIAL | 60,63 s; 24 chunks; 373.754 rows; 2.799.488 bytes | RSS/breakdown ausentes e Run 1 bloqueada | Railway/Cache |
| G22 Documentation | PASS | matriz e lifecycle documentados | — | docs/roadmap |

## S. Blockers remanescentes
1. Identificar e resolver os gates/mapeamentos semânticos que deixaram o manifest RAW real como `audit_status=blocked`, sem enfraquecer o fail-closed.
2. Reexecutar Run 1 pelo lifecycle oficial somente após a correção comprovada.
3. Executar Run 2 e comparar convergência/duplicação somente após Run 1 PASS.
4. Coletar RSS e breakdown completo de performance em execução aprovada.

## T. Recomendação de gate final
**FASE 2.7.2 FINAL — BLOCKED / Foundation não pode avançar.** Bloqueios: G16 RAW audit semântico; G17–G18 não executados; G21 parcial. Não iniciar a Fase 2.8.
