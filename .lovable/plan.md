# FASE 2.7.2D.3-H — Worker durável e gate forense RAW

## Objetivo
Fechar no código a fronteira de confiança entre a evidência bruta do parser e o Canonical, sem executar demos reais nem alterar o Railway.

## Implementação
1. **Evidência RAW imutável**
   - Ampliar o manifest para inventários reais de header, eventos, player info, game state, ticks, granadas, usercmd, movimento, times, placar, rounds, bomba, dano, mortes, armas e aggregates.
   - Preservar integralmente campos retornados, inclusive desconhecidos, separando inventário disponível, extração selecionada, dados observados e campos mapeados.
   - Marcar ticks amostrados como `SAMPLE`, com limites e truncamento explícitos.

2. **Auditoria e aprovação**
   - Separar validação estrutural/persistência da decisão de admissão.
   - Criar auditoria server-side campo a campo e estado explícito `PASS`, `BLOCKED` ou `FAIL`.
   - Tratar `UNMAPPED_BUT_AVAILABLE` como evidência válida e preservada, mas bloqueada para Canonical.
   - Persistir status, razões, versão da auditoria e aprovação; jobs bloqueados ficam aguardando revisão, sem retry automático.

3. **Defesa do Canonical**
   - Exigir a prova de aprovação antes da normalização.
   - Exigir novamente a mesma prova imediatamente antes da persistência Canonical, impedindo chamadas diretas sem aprovação.
   - Manter idempotência de RAW e Canonical e impedir efeitos após cancelamento.

4. **Hardening do worker durável**
   - Fortalecer claim, heartbeat, fail e finalize com `job_id + message_id + attempt + worker_id + lease válida + estado atual`.
   - Rejeitar worker stale, completion duplicado e heartbeat após perda da lease.
   - Fazer o consumer interromper completion quando heartbeat/cancelamento for rejeitado, preservando retry/redelivery existentes.
   - Validar import e inicialização do worker em checkout limpo.

5. **Banco, testes e documentação**
   - Criar migration mínima para estado bloqueado/auditoria e RPCs endurecidas, com grants restritos ao serviço.
   - Adicionar os 20 testes solicitados, incluindo inventário RAW, campos desconhecidos, gate duplo, lease concorrente, cancelamento e idempotência.
   - Atualizar documentação e roadmap com estados reais: implementado/testado, mas não fechado sem E2E forense com novo `.dem` e deployment Railway posterior.

## Restrições preservadas
- Nenhuma demo real será enviada, processada ou reenfileirada.
- O job “Cache” não será alterado.
- Railway, seus ambientes e deployments não serão modificados.
- Métricas, features, DNA, diagnóstico e coach não avançarão sem aprovação RAW.

## Validação
- Testes TypeScript focados e suíte Python do parser/worker.
- Checagem de tipos, compilação automática e validação SQL/read-only de grants e definições.
- Relatório final completo com limitações e itens ainda `NOT PROVEN`, `BLOCKED` ou `PENDING`.
