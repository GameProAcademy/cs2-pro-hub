# Fase 2.7.2G.5-R-F.2.6 — Remediação Canonical e verificação pré-run

## Objetivo
Aplicar a migration existente de integridade Canonical na base de produção e comprovar, sem executar novo ciclo Cache, que os contratos de terminalização, idempotência, rounds e convergência estão ativos.

## Execução
1. Confirmar que os arquivos já mergeados e a migration `20260919110000_g5_rf2_canonical_integrity.sql` estão presentes, sem reimplementar correções.
2. Aplicar essa migration pelo mecanismo normal e, em seguida, ler as definições live de `finish_demo_job_processed` e `reserve_demo_upload`.
3. Verificar a constraint `match_rounds_tick_order_check`, suas propriedades `NOT VALID`, locks, validação SHA e semântica de substituição/idempotência.
4. Auditar somente por leitura os attempts 7 e 8, ausência do attempt 9, artifacts RAW e Canonical histórico.
5. Confirmar as defesas no validator, persistência Canonical, convergência de identidade e parser corrigido.
6. Executar testes focados de parser, pipeline, Canonical, RAW e lifecycle, além de typecheck, compilação Python e verificação do build.
7. Verificar saúde e versão do parser publicado, sem deploy ou alteração de configuração.
8. Atualizar o relatório da fase e o roadmap com evidências e classificar o gate como `READY_FOR_CONTROLLED_RUN_1_RETRY` ou `BLOCKED`.

## Limites
- Nenhum upload, enqueue, claim, retry, parse, novo attempt ou Run 1/Run 2.
- Nenhuma alteração dos attempts 7/8, Canonical histórico, rounds, eventos ou artifacts RAW.
- Nenhuma alteração de secrets ou Railway; nenhum patch staged antigo será aceito.
- Nenhuma migration paralela ou correção duplicada.

## Detalhes técnicos
A verificação live exigirá `SECURITY DEFINER`, `search_path` seguro, lock de job, pré-condição de `match_sources`, `quality_flags` JSONB, limpeza terminal correta, os dois caminhos RAW aprovados em reserva idempotente e a constraint temporal de rounds aplicada apenas a novas escritas.
