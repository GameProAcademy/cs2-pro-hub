# Fechamento definitivo da fundação 2.7.2

## Objetivo
Fechar os gates independentes de ingestão, identidade, parser, Canonical, projeções, RAW Evidence, retry, E2E, idempotência, cancelamento, observabilidade e performance, usando a demo Cache real e a infraestrutura existente. A Fase 2.8 não será iniciada.

## Execução
1. **Auditoria e preflight**
   - Comparar código, testes, documentação e configuração com os requisitos G1–G22.
   - Validar `/health` e `/version` em produção, incluindo `demoparser2 0.42.0`, contrato 1, revision semântica e build revision exatas.
   - Confirmar que o runner usa segurança master server-side, retry oficial, fila durável e polling do novo dispatch, sem bypass ou estado terminal antigo.

2. **Correções mínimas antes do E2E**
   - Corrigir apenas lacunas comprovadas em participantKey/Steam opcional, métricas e semântica NULL, RAW/NaN, idempotência, cancel race, observabilidade ou evidência E2E.
   - Preservar arquitetura, schemas, contratos públicos, parser, worker, buckets, histórico e integrações existentes.
   - Adicionar testes comportamentais somente para cada lacuna corrigida.

3. **Cache Run 1 real**
   - Usar o job `a31f5c25-b0d8-41ac-8225-27814cd1732a` e upload `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043` pelo lifecycle oficial.
   - Capturar estado anterior, reenfileirar oficialmente quando aplicável, observar novo dispatch e aguardar estado terminal com polling finito.
   - Não alterar status manualmente, não chamar `processJob()` e não criar dados artificiais.

4. **Auditoria de evidência**
   - Validar match/source únicos, participantes, rounds, round players, eventos, attachment, projection, métricas e AIM/POSITION/ECONOMY/UTILITY player-scoped.
   - Validar artifact RAW READY, manifest, chunks, cadeia de hashes, section digests, root digest, limites e serialização segura de valores não finitos.
   - Registrar tempos e recursos reais disponíveis, sem estimativas inventadas.

5. **Cache Run 2 e idempotência**
   - Executar retry oficial somente após Run 1 com evidência completa.
   - Observar novo dispatch e terminal state.
   - Comparar IDs, fingerprint/upload, identidade do jogador, contagens e projeções por jogador; exigir convergência sem duplicação.

6. **Regressões e fechamento**
   - Validar cancelamento concorrente, classificação de falhas, segurança, observabilidade, testes unitários/integrados e regressão completa.
   - Atualizar somente documentação e roadmap necessários, preservando todo o corpus histórico.
   - Emitir relatório técnico completo e matriz G1–G22 usando apenas PASS, FAIL, BLOCKED ou NOT RUN, concluindo explicitamente se a fundação pode avançar para a Fase 2.8.

## Restrições
- Não iniciar Player DNA, Score, AI Coach, ML, coaching ou recomendações.
- Não alterar Railway, parser revision, dependências, backend, bucket, secrets ou schema sem causa técnica comprovada.
- Não apagar nem reescrever demos, tentativas, RAW ou histórico.
- Não usar mocks ou fixtures como prova do E2E real.
