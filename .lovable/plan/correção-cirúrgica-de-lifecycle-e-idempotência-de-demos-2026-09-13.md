# Correção cirúrgica de lifecycle e idempotência de demos

## Objetivo
Impedir que uploads/jobs cancelados sejam ressuscitados, preservar idempotência para jobs ativos e processados, manter o retry de falhas e corrigir somente os dois registros de teste identificados.

## Implementação
1. Criar uma RPC transacional única para reservar o slot de upload por usuário + SHA-256.
   - Serializar decisões concorrentes do mesmo conteúdo.
   - Reutilizar sem upload os estados `pending`, `processing`, `cancel_requested` e `processed`.
   - Criar novo `upload_id` e novo caminho quando o histórico anterior estiver `cancelled`.
   - Preservar `failed` para o fluxo existente de Retry, sem reabertura implícita.
2. Tornar o enqueue transacional e condicionado ao estado real do upload/job.
   - Criar o job somente para um upload novo e válido.
   - Retornar o job existente para estados ativos/processados.
   - Recusar `cancelled`, `cancel_requested` e demais estados terminais; nunca usar upsert que force `pending`.
3. Ajustar o cliente para não reenviar bytes quando o slot já representa job ativo, processado ou falho.
4. Adicionar testes explícitos para cancelado com arquivo removido, novo upload após cancelamento, proteção de upload em processamento, processed sem reprocessamento, failed + Retry e enqueue sem ressurreição.
5. Confirmar dependências dos dois jobs e aplicar limpeza restrita:
   - restaurar `f736b6da-7677-4989-abec-05bc8d368002` para `cancelled` coerente;
   - restaurar `b94c46fd-77da-45d3-a3c4-2cfb7e3d035d` para `processed/done`, preservando dados relacionados.
6. Atualizar somente o blocker/correction no roadmap; manter FASE 2.7.2D `NOT CLOSED` e FASE 2.8 não iniciada.

## Validação
- Consultar o banco após a limpeza e provar as invariantes solicitadas.
- Executar testes focados e novos testes, TypeScript, lint e `git diff --check`.
- Confirmar migration aplicada no Lovable Cloud e revisar o estado final dos dois jobs.

## Limites
Sem scheduler, cron, Railway, E2E real, redesign, nova fila ou avanço de fase.
