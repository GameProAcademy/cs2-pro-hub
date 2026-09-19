# FASE 2.7.2G.5-R-F.2 — Cache Run 1 controlado

## Preflight sem mutação
- Registrar commit e comprovar migrations, testes e harness G.5-R-F.1.
- Auditar no banco as RPCs, ACLs, constraints, índices, histórico do attempt 7, ausência de attempt 8/Canonical conflitante e estado da fila.
- Verificar por leitura o objeto histórico no Storage e saúde/identidade do parser Railway.
- Parar como `CACHE RUN 1 = BLOCKED — PREFLIGHT FAILURE` se qualquer gate obrigatório falhar.

## Execução oficial condicionada
- Reservar o attempt 8 exclusivamente por `reserve_demo_upload`, confirmando novo upload, tentativa 8, supersessão e motivo `raw_audit_blocked`.
- Copiar os bytes históricos sem transformação para o novo path pelo mecanismo seguro, verificar tamanho e SHA, e só então chamar `enqueue_demo_job`.
- Acompanhar fila durável, claim, lease, Railway, RAW chunks/auditoria, HOT, Canonical, métricas/features e estado terminal sem intervenção manual ou retry.

## Auditorias posteriores
- Comparar o attempt 7 antes/depois, permitindo apenas a ligação legítima de supersessão.
- Provar enqueue idempotente e unicidade por SHA sem criar attempt 9; não executar Run 2.
- Revalidar banco, Storage e Railway por leitura, além das suítes automatizadas e smoke do frontend atual.

## Fechamento
- Criar o relatório com a matriz exata G5-R-F.2-01..40, evidências e decisão não ambígua.
- Atualizar o roadmap com a fonte atual de verdade, preservando o histórico.
- Não alterar Railway, secrets, artifact 7, attempt 7 ou dados para fabricar sucesso.
