# FASE 2.7.2G.5-R — Lifecycle após bloqueio RAW

## Resultado

O estado terminal `blocked_raw_audit` agora pode originar uma nova tentativa lógica. A tentativa anterior permanece imutável e a nova tentativa segue o fluxo normal de upload, enqueue, fila durável, parser, RAW, auditoria e somente então Canonical.

Esta fase não executou a demo Cache, não criou nova tentativa real, não alterou Railway, Storage, secrets ou Canonical.

## Problema e causa

`reserve_demo_upload` classificava `failed`, `cancelled`, `stale` e `processed` sem RAW aprovado, mas não classificava `blocked_raw_audit`. O estado caía no retorno conservador de duplicata ativa (`pending`), impedindo um novo ciclo lógico.

## Comportamento novo

Quando o upload ou job mais recente está em `blocked_raw_audit`:

- `replacement_reason = raw_audit_blocked`;
- um novo UUID de upload e um novo caminho privado são reservados;
- `attempt_number` é incrementado;
- `supersedes_job_id` aponta para o job terminal anterior;
- o retorno informa `new_attempt = true` e mantém `duplicate_status = failed` no contrato público existente;
- `enqueue_demo_job` cria um novo job e preenche `superseded_by_job_id` no job anterior;
- mensagem, lease, worker e `dispatch_attempt` não são reutilizados.

## Histórico preservado

A migration não atualiza a tentativa bloqueada. A leitura posterior confirmou:

- job `a31f5c25-b0d8-41ac-8225-27814cd1732a` em `blocked_raw_audit` / `raw_audit`;
- upload `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043` em `blocked_raw_audit`;
- tentativa lógica 7, dispatch 2 e retry count 2;
- artifact `3a1e5225-f0f2-427a-97b8-c21dac936e7d` em READY/RAW READY/audit BLOCKED;
- 24 chunks, 373.754 linhas, 2.799.488 bytes e root digest preservado;
- nenhum `superseded_by_job_id` foi criado nesta fase.

## Schema e migration

Migration: `20260918235817_30712b60-cf57-4adc-89e5-3fbd7bdee5a4.sql`.

Os checks de `uploads.replacement_reason` e `demo_jobs.replacement_reason` passaram a aceitar `raw_audit_blocked`. Nenhuma tabela ou coluna foi criada.

## Locking, concorrência e idempotência

Reserva e enqueue preservam o mesmo advisory lock transacional por `user_id + demo_sha256`. A unicidade parcial continua limitando uma tentativa ativa por usuário/SHA. A unicidade de `demo_jobs.supersedes_job_id` e `ATTEMPT_ALREADY_SUPERSEDED` impedem dois jobs substituírem a mesma tentativa.

As regressões locais verificam a presença desses fences. Um race test real com duas conexões não foi executado porque exigiria criar dados no banco de produção; essa limitação não foi substituída por uma alegação de prova dinâmica.

## Segurança

`reserve_demo_upload` e `enqueue_demo_job` continuam `SECURITY DEFINER`, com `search_path` vazio, sem execução para `PUBLIC`, `anon` ou `authenticated`, e com execução apenas por `service_role`. A leitura do catálogo confirmou essas permissões após a migration.

Os 15 achados do linter são o mesmo baseline legado (4 tabelas server-only sem policy, 1 extensão pública e 10 funções existentes executáveis por usuário autenticado). A migration não introduziu novo achado e as duas RPCs deste escopo permanecem restritas.

## Canonical fail-closed

O caminho idempotente `processed` continua exigindo RAW aprovado. A nova tentativa não recebe aprovação por herança e não compartilha artifact. A persistência Canonical continua exigindo artifact READY, RAW READY, audit approved, digest e aprovação server-owned.

## Testes e limites

Cobertura adicionada para o novo estado, motivo, incremento de tentativa, relação de supersessão, preservação do histórico e propagação do contrato TypeScript. As suítes e seus resultados finais são registrados no fechamento desta fase.

O Cache Run 1 permanece não executado por desenho: esta fase apenas prepara e valida o lifecycle. A próxima fase poderá iniciar um novo ciclo somente após a decisão final dos gates G5-R.

## Gates

Os estados finais G5-R-01 a G5-R-20 são registrados após todas as suítes e verificações de banco. Nenhum gate depende de aprovação retroativa do artifact histórico.