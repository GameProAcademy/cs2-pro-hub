# FASE 2.7.2G.5-R — Lifecycle pós-RAW bloqueado

## Objetivo
Permitir que uma tentativa terminal `blocked_raw_audit` origine exatamente uma nova tentativa lógica, preservando integralmente o job, upload e artifact históricos. Esta fase prepara e prova o mecanismo; não executa a demo Cache.

## Implementação
- Criar migration incremental que amplie o vocabulário de `replacement_reason` com `raw_audit_blocked` e atualize cirurgicamente `reserve_demo_upload`.
- Manter o advisory lock por usuário + SHA e as regras existentes para processed aprovado, pending, processing ativo, stale, failed, cancelled e legado não validado.
- Para `blocked_raw_audit`, reservar novo upload UUID/path, incrementar `attempt_number`, apontar `supersedes_job_id` para o job terminal e retornar `new_attempt=true` sem alterar o histórico.
- Preservar `enqueue_demo_job`: novo job/dispatch próprios, ligação bidirecional de supersessão e falha fechada `ATTEMPT_ALREADY_SUPERSEDED`.
- Propagar `raw_audit_blocked` pelos tipos e parsers do contrato cliente, sem alterar o formato público imutável de `submitDemo()`.

## Segurança e integridade
- Manter as RPCs somente para `service_role`, com `SECURITY DEFINER` e `search_path` fixo.
- Não alterar RAW, Storage, Railway, secrets, Canonical ou dados de produção além da definição transacional da migration.
- Confirmar por leitura que o job/upload/artifact Cache histórico permaneceu intacto antes e depois.
- Preservar a admissão Canonical fail-closed e o isolamento de mensagem, lease e dispatch entre tentativas.

## Verificação
- Adicionar regressões para `blocked_raw_audit`, incremento de tentativa, relações de supersessão, motivo canônico, UUIDs novos, concorrência/idempotência e permissões.
- Revalidar os caminhos existentes de processed aprovado, ativo, stale, failed e cancelled.
- Executar testes focados de lifecycle/durable/RAW/HOT/Canonical, suíte do app, suíte Python, typecheck, compileall, lint quando aplicável, diff check e build automático.
- Registrar qualquer prova que dependa de concorrência real do banco como tal; não substituir por afirmação inferida.

## Documentação e estado
- Criar `docs/PHASE-2.7.2G.5-R-BLOCKED-RAW-ATTEMPT-LIFECYCLE.md` com causa, contrato, locking, segurança, testes, gates e limitações.
- Atualizar o roadmap para refletir G4-R implantado e G.5-R real.
- Encerrar somente como `READY FOR CACHE RUN 1` se todos os gates essenciais forem comprovados; caso contrário, `BLOCKED` com bloqueadores exatos.

## Fora de escopo
- Não executar Cache Run 1, Run 2, retry/requeue real, parser real ou criação de Canonical.
- Não modificar Railway, artifacts/chunks/manifests históricos, Storage, secrets ou dados de produção.
- Não investigar nem alterar os arquivos frontend excluídos pelas restrições vigentes.
