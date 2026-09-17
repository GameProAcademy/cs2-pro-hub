# FASE 2.7.2F.1 → 2.7.2F FINAL — Relatório técnico

## A. Resumo executivo
A fundação de identidade, `participantKey`, métricas player-scoped, dados semânticos e lifecycle E2E foi fechada em código e testes. O Cache real não foi executado: `/health` responde, mas `/version` não comprova contract `1` e revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`; logo o gate continua BLOCKED.

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
- APP completo: 64 arquivos, 890 passed, 0 failed.
- Focados: 4 arquivos, 71 passed, 0 failed.
- Parser/RAW/HOT: 153 passed, 3 skipped, 0 failed; 1 warning de depreciação.
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
RAW não foi reduzido, sampled adicionalmente ou carregado no callback. Trajetórias permanecem RAW. Serialização determinística, SHA físico, previous chunk SHA, section digest, root digest e manifest permanecem inalterados.

## J. Retry/Lifecycle Audit
`retry_demo_job` é o mecanismo único. `attempt_number` permanece lógico; `retry_count` é dispatch. Nenhum update direto ou chamada a `processJob()` foi introduzido.

## K. E2E Waiting Audit
O runner exige observar o dispatch esperado e aguarda `processed`/`failed`. Pending até timeout vira `E2E_WAIT_TIMEOUT_PENDING`; processing expirado/sem heartbeat vira `E2E_WORKER_STALLED`. Ambos resultam em BLOCKED.

## L. Idempotency Audit
A lógica só compara idempotência quando havia Run 1 processada e a Run 2 solicitada terminou. A prova real do Cache continua não executada.

## M. Railway Preflight
`GET /health`: saudável. `GET /version`: `not_found`. Identidade, contrato e revisão exata não foram comprovados. Status: BLOCKED.

## N. Cache Real E2E
NOT_RUN/BLOCKED. O job `a31f5c25-b0d8-41ac-8225-27814cd1732a` e o upload reservado não foram reenfileirados nem alterados.

## O. Cache Idempotency
NOT_RUN. Depende de duas execuções reais terminais após preflight PASS.

## P. Performance
NOT_RUN. Sem execução real não existem números novos de duração, RSS, pico, chunks ou eventos.

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
| G13 Idempotency | BLOCKED | lógica pronta | duas execuções reais ausentes | E2E verdict/runner |
| G14 Security | PASS | scan da fase sem finding ativo novo | — | auth/RPC/secrets |
| G15 Railway preflight | BLOCKED | health ok; version not_found | worker não expõe identidade | Railway/parser endpoint |
| G16 Cache Run 1 | BLOCKED | não executado | G15 | Cache reservado |
| G17 Cache Run 2 | NOT_RUN | não executado | depende de G16 PASS | Cache reservado |
| G18 Cache Idempotency | NOT_RUN | não comparado | depende de G16/G17 | Cache reservado |
| G19 Canonical | PASS | testes canonical + handoff | — | canonical/normalizer |
| G20 Projection | PASS | seleção player-scoped testada | — | metrics/features/persistence |
| G21 Performance | NOT_RUN | sem run real | G15 | Railway/Cache |
| G22 Documentation | PASS | matriz e lifecycle documentados | — | docs/roadmap |

## S. Blockers remanescentes
1. Railway precisa responder `/version` com parser, versão, contract `1` e revision exata.
2. Depois disso, executar Run 1 e Run 2 reais do mesmo Cache pelo lifecycle oficial.
3. Coletar performance e comparar convergência/duplicação somente após ambos os terminais.

## T. Recomendação de gate final
**FOUNDATION IMPLEMENTED / CACHE E2E BLOCKED.** Não iniciar a Fase 2.8 até G15–G18 e G21 terem evidência real suficiente.
