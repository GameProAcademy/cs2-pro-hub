# Fase 2.7.2G.6-R.3 — replay real controlado do attempt 9

## Objetivo
Corrigir o último mismatch `quality_flags` JSONB, criar legitimamente o attempt 9 a partir de uma cópia server-side da DEM preservada do attempt 8 e executar um único E2E real, sempre fail-closed.

## Estado confirmado no precheck
- O objeto-fonte do attempt 8 existe em `demos` com 473.748.061 bytes; o objeto do attempt 7 está ausente e não será restaurado.
- Attempts 7 e 8, seus RAW artifacts e o Canonical histórico permanecem intactos; não existe attempt 9.
- `demo_jobs.quality_flags` é JSONB e `finish_demo_job_processed` já persiste JSONB corretamente.
- `persist_demo_projection` publicado ainda converte `quality_flags` para `text[]`; esse é o defeito que causou o `PERSISTENCE_ERROR` do attempt 8.
- Os dois endpoints do parser respondem 200 com `demoparser2 0.42.0`, contrato 1 e revision/semantic/build `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`.

## Implementação
1. Criar migration incremental que redefine somente `persist_demo_projection`, mantendo sua transação, segurança, ACL e `search_path`, mas persistindo `quality_flags` diretamente como JSONB.
2. Adicionar regressões que cobrem arrays JSONB vazios e preenchidos nas duas finalizações, além de impedir nova conversão para `text[]`.
3. Criar uma operação administrativa server-only e master-only para o replay controlado:
   - validar novamente o runtime, fonte, tamanho, SHA declarado, histórico e ausência de attempt 9;
   - reservar o upload pelo lifecycle oficial;
   - exigir attempt 9, vínculo ao job 8 e path próprio;
   - copiar o objeto dentro do bucket, sem baixar para o app;
   - verificar fonte e destino, tamanho, ownership e ausência de overwrite;
   - enfileirar pelo RPC oficial;
   - registrar auditoria sem segredos.
4. Tornar a operação idempotente e recuperável entre reserva/cópia/enqueue, sem permitir attempt 10 ou duplicação de objeto/job.
5. Executar testes locais, validação de tipos, lint, Python, contratos RAW/HOT e build antes da mutação real.

## Execução real e gates
1. Repetir o precheck read-only imediatamente antes da execução.
2. Criar exatamente um upload attempt 9, copiar e verificar a DEM, então enfileirar exatamente um job.
3. Observar o worker real sem claim manual concorrente até estado terminal.
4. Validar claim, download/SHA incremental, isolamento, identidade do parser, RAW novo, chunks/hash chain/root digest e limite HOT.
5. Se o RAW audit não aprovar, parar sem Canonical. Se aprovar, deixar o fluxo oficial decidir Canonical, métricas/features e finalizar job/fila.
6. Não executar cleanup e verificar novamente que o objeto e RAW do attempt 8 continuam intactos.

## Evidência final
- Atualizar roadmap e relatório G.6-R.3 com código/migration/RPC, IDs e paths novos, resultados Railway/parser/RAW/audit/Canonical/métricas/fila/job, `quality_flags` JSONB, comparação factual 8×9 e todos os testes.
- Classificar como `PASS`, `BLOCKED` ou `FAILED` exclusivamente pela evidência observada; qualquer stop condition encerra a fase sem attempt 10.
