# Plano — FASE 2.7.2G.6-R.4-C.7 → C.10

## Objetivo
Concluir a infraestrutura pré-Attempt 9 para attestation, paridade Python/WASM, determinismo, autoridade de ticks e auditoria forense, mantendo a release bloqueada até existirem provas externas reais.

## Implementação
- Consolidar uma autoridade operacional única para a release versionada de 105 campos; manter o inventário legado apenas como histórico e bloquear qualquer mismatch de release, digest, versão ou contagem.
- Produzir uma auditoria determinística dos 105 campos com categorias mutuamente exclusivas, soma exata e invariantes de autorização/paridade/determinismo, sem autorizar nenhum campo.
- Formalizar `TickDomainAuthority` e a auditoria integral de intervalos/ticks, distinguindo autoridade real de fixtures e mantendo dados reais como `NOT_RUN`/`BLOCKED`.
- Criar harnesses offline para o mesmo DEM em Python e WASM, normalização explícita, paridade, determinismo e relatório forense completo; não executar qualquer DEM nesta fase.
- Fortalecer attestation, HMAC, freshness, nonce/replay protection, OIDC, vínculo Git/Railway/runtime e provenance, rejeitando qualquer evidência incompleta ou artificial.
- Fechar o gate único pré-Attempt 9 e as barreiras contra Attempt 9/10+, admissão Canonical e cleanup enquanto o estado não for `READY_TO_EXECUTE_ATTEMPT_9`.
- Criar matriz de eventos/capabilities, checklist do DEM real e relatórios C.7–C.10, preservando fatos históricos e distinguindo implementado, verificado, bloqueado e não executado.

## Validação
- Adicionar testes A–AE e integração bloqueada com fixtures marcadas `TEST_FIXTURE_ONLY`.
- Executar testes Python e TypeScript focados, typecheck, lint e verificações de formatação/diff.
- Confirmar read-only: Attempt 8 preservado, Attempts 9/10+ ausentes, zero provenance VERIFIED e zero promoção Canonical.

## Restrições preservadas
- Nenhum DEM real será copiado, processado, baixado ou excluído.
- Nenhum replay, Attempt 9/10+, cleanup, promoção Canonical, mutação Railway ou alteração de secrets será executado.
- A release `canonical-demo-v2` e seus 105 mappings não serão alterados nem artificialmente verificados.
