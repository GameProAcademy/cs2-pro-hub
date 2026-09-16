# FASE 2.7.2D.5 — Durable claim + primeiro E2E real Cache

## Objetivo

Corrigir o contrato atômico do claim para entregar ao Railway os identificadores reais do job, aplicar e publicar a correção, recuperar somente o job Cache pelo mecanismo oficial e acompanhar o fluxo real até um estado terminal comprovado.

## Execução

1. **Contrato do claim**
   - Criar migration incremental de `claim_demo_parse_message` preservando lock, leitura transacional, lease, concorrência, rejeição e grants atuais.
   - Retornar `user_id` e `attempt_number` diretamente da linha bloqueada de `demo_jobs`, mantendo `attempt` como tentativa técnica da mensagem.
   - Preservar os demais campos estritamente necessários ao worker.

2. **Validação defensiva no APP**
   - Validar integralmente o resultado `claimed` antes de consultar Storage ou criar URL temporária: UUIDs, message ID, SHA-256, tentativas, tamanho e caminho.
   - Falhar explicitamente e registrar somente diagnóstico seguro; sem fallback, valores inventados ou URL em logs.
   - Retornar ao Railway apenas o contrato mínimo solicitado.

3. **Compatibilidade APP ↔ Railway**
   - Conferir os oito endpoints durable e corrigir apenas incompatibilidades reais de nomes/formato.
   - Confirmar que heartbeat/finalize/fail usam `attempt`, enquanto caminho e identidade RAW usam `attempt_number`.
   - Preservar parser isolado, HOT limitado e RAW chunked fora do callback.

4. **Testes e validação estática**
   - Cobrir claim completo, campos ausentes, tentativas distintas, estado vazio, path RAW, idempotência/recovery e contrato Python.
   - Executar testes TypeScript relevantes e completos, typecheck, testes Python, compileall e build Docker do parser.

5. **Aplicação e publicação**
   - Aplicar a migration pelo fluxo oficial do Lovable Cloud e confirmar a definição resultante.
   - Publicar o APP e comprovar que o endpoint atualizado é compatível com o Railway saudável, sem alterar secrets ou o deploy Railway.

6. **Recuperação controlada e E2E Cache**
   - Ler o estado completo do job `a31f5c25-b0d8-41ac-8225-27814cd1732a`, sua mensagem e artefatos relacionados.
   - Se necessário, usar somente recovery/reconciliation existente; não criar upload, resetar tentativa, duplicar mensagem ou apagar histórico.
   - Acompanhar claim, download, parser isolado, chunks, verificações, artifact READY, HOT, completion, auditoria, Canonical, métricas/features e finalização da fila.

## Gates e relatório

- Só declarar **PASS** com evidência real de todos os gates no banco e no fluxo publicado.
- Se houver falha, parar no gate exato e reportar o estado real, sem inventar métricas nem avançar de fase.
- O relatório final incluirá alterações, migration/RPC, testes, APP/Railway, tentativas lógica/técnica, artifact/chunks/bytes/digest/HOT, auditoria, Canonical, match, métricas/features e fila.

## Limites preservados

- Nenhuma alteração de secrets, deploy Railway, arquitetura D.4, dados históricos, upload original ou match legado.
- Nenhum RAW grande no HTTP; `/complete` continua recebendo apenas HOT + referência RAW READY.