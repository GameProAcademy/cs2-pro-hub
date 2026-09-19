# FASE 2.7.2G.5-R-F.2.1–2.5 — Hardening e Cache Run 1 controlado

## Objetivo
Fechar a vulnerabilidade de SHA, reconciliar reservas órfãs sem apagar evidência e executar uma única tentativa 8 real pelo lifecycle oficial. O Run 2 e qualquer attempt 9 permanecem proibidos.

## Sequência de execução
1. **Preflight somente leitura**
   - Fotografar attempt/job/artifact/chunks/RAW/Canonical/métricas/fila/Storage históricos.
   - Auditar todos os SHA de uploads e jobs, os três órfãos conhecidos, constraints, índices, RPCs, privilégios e saúde/versão do Railway.
   - Confirmar que G5-R-F.1 segue aprovado e que não existe attempt 8/9 válido.

2. **Hardening estrutural**
   - Criar migration incremental com constraints de SHA-256 lowercase hexadecimal de 64 caracteres.
   - Validar SHA no início de `reserve_demo_upload` e `enqueue_demo_job`, antes de qualquer mutação.
   - Reconciliar reservas antigas `pending` sem job/objeto após uma janela segura, usando estados/campos existentes, locks compatíveis e trilha auditável.
   - Marcar explicitamente a reserva inválida anterior sem apagar ou reutilizar seu registro.

3. **Regressões antes do Run 1**
   - Ampliar testes executáveis para SHA válido/inválido, órfãos, janela reserve→upload→enqueue, ausência de falso sucesso e ACLs.
   - Executar o harness PostgreSQL descartável com duas conexões e ao menos 50 ciclos, preservando locks, fencing e unicidade.
   - Parar sem executar o Cache se qualquer gate crítico falhar.

4. **Único Cache Run 1 autorizado**
   - Obter o SHA programaticamente por streaming do objeto histórico, validar formato/tamanho e comparar com o banco.
   - Criar exatamente o attempt 8 via `reserve_demo_upload`, copiar o mesmo objeto pelo fluxo oficial e validar novamente bytes/SHA.
   - Enfileirar uma única vez via `enqueue_demo_job` e acompanhar fila durável, Railway, RAW, chunks, auditoria, HOT, Canonical, métricas/features e estado terminal.
   - Se falhar ou bloquear, preservar a evidência e encerrar sem retry, attempt 9 ou Run 2.

5. **Auditoria final**
   - Comparar snapshots antes/depois, permitindo no histórico 7 somente a supersessão legítima.
   - Provar ausência de duplicidades e, apenas se processado com RAW aprovado, verificar idempotência sem iniciar outra pipeline.
   - Executar smoke atual, suítes, typecheck, parser, lint/build e auditoria read-only pós-run.
   - Atualizar os relatórios das fases, roadmap e matriz completa com resultados reais PASS/FAIL/PARTIAL/SKIP.

## Pontos de parada obrigatórios
- SHA físico ou tamanho divergente; migration/testes/concorrência falhando; Railway incompatível; mutação histórica indevida; attempt 9/duplicidade; RAW bloqueado ou digest divergente; Canonical sem aprovação RAW.
- Nenhum deploy Railway, mudança de secrets, aprovação manual, inserção manual de jobs/Canonical ou correção artificial de histórico.

## Detalhes técnicos
- Reutilizar o hash incremental e os helpers de Storage existentes.
- Manter `SECURITY DEFINER`, `search_path=''`, ACL service-role-only e advisory locks por usuário+SHA.
- A reconciliação não toca reservas recentes e não compete com a janela normal reserve→upload→enqueue.
- A migration será aplicada ao backend real antes do único Run 1; mudanças dependentes serão feitas somente após a geração automática dos tipos.
