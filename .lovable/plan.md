# Controlled retry do Cache attempt 8

## Objetivo
Reutilizar exclusivamente o upload/job do attempt 8 pelo mecanismo oficial, provar o fluxo real até Canonical e finalização, e preservar integralmente os attempts 7/8 e seus artefatos históricos. Attempt 9, novo upload, Run 2, métricas/features artificiais e AI Coach permanecem proibidos.

## Execução
1. **Preflight sem mutação**
   - Confirmar parser/round reconstruction, validações Canonical, aprovação RAW por artifact, finalização JSONB, workflow de qualidade e ausência de attempt 9.
   - Confirmar Railway `/health` e `/version`, deployment/revisions esperados, saúde do banco e estado exato dos attempts 7/8.
   - Executar testes completos do app, lint, build e parser; parar antes do retry em qualquer falha crítica.
2. **Retry único e oficial**
   - Verificar que o mecanismo existente reutiliza exatamente upload `d89b697f-c40d-42f4-ae51-040e4e8cabba` e job `d1851c49-820a-426b-86c6-0ea4623b4f41` sem criar attempt 9.
   - Acionar uma única vez o retry/recovery oficial e monitorar fila, claim, Railway, parser, RAW audit, Canonical e finalização até estado terminal.
   - Parar imediatamente se o contrato tentar criar novo upload/attempt, se ocorrer falha crítica ou se o job já estiver em andamento.
3. **Auditoria forense pós-run**
   - Verificar integridade do artifact/chunks/digest e aprovação RAW.
   - Auditar todos os rounds, sequência, intervalos, overlaps e associação de todos os eventos.
   - Auditar participantes, round_players, convergência do match/source, ausência de duplicação e coerência do lifecycle.
   - Confirmar que attempts 7/8 continuam auditáveis e que attempt 9 não existe.
4. **Fechamento**
   - Reexecutar os testes finais sem mascarar falhas/skips.
   - Atualizar o relatório da fase e o roadmap com evidências reais e decisão PASS/FAIL/BLOCKED.
   - Não iniciar novo retry após eventual falha e não avançar Metrics/Features/AI Coach.

## Critério de decisão
PASS somente se o attempt 8 terminar `processed`, RAW e Canonical estiverem íntegros, a finalização concluir, nenhum dado histórico for apagado e nenhum attempt 9 for criado. Qualquer gate crítico não comprovado resulta em FAIL/BLOCKED.
