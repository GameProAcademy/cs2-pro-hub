# FASE 2.7.2G.5-R-F.2.1–2.5 — SHA hardening e Cache Run 1 controlado

## A. Decisão executiva

O hardening e a reconciliação passaram, e o único Cache Run 1 autorizado foi executado pelo lifecycle oficial. O attempt 8 real chegou a RAW READY/audit APPROVED e ao handoff canônico, mas terminou `failed` por `PERSISTENCE_ERROR`: a RPC instalada `finish_demo_job_processed` tenta atribuir `text[]` à coluna `demo_jobs.quality_flags`, cujo tipo real é `jsonb`.

**Decisão:** `G5-R-F.2.1 = PASS`; `G5-R-F.2.2 = PASS`; `CACHE RUN 1 = FAIL`; `G5-R-F.2.3–2.5 = FAIL/PARTIAL`; `RUN 2 = NOT READY`.

Não houve Run 2, attempt 9, retry manual adicional, aprovação manual, inserção manual de job/Canonical, chamada direta a `processJob()`, deploy Railway ou alteração/rotação de secrets.

## B. Hardening de SHA e órfãos

- Migration `20260919011719`: validação lowercase hex de 64 caracteres antes de mutação em reserve/enqueue; constraints equivalentes em `uploads` e `demo_jobs`; RPC `reconcile_orphan_demo_uploads` service-role-only, com advisory lock, janela mínima de 15 minutos e rechecagem de job/Storage.
- A reserva inválida `5c514921-d32d-4058-9d34-bbb57c361b53` foi preservada como `failed/INVALID_DEMO_SHA256`, com SHA nulo e evidência do valor original de 67 caracteres no erro.
- Dois órfãos antigos sem job/objeto foram reconciliados como `failed/UPLOAD_RESERVATION_ABANDONED`; registros e SHA válidos foram preservados.
- Migration `20260919011805`: reservas job-less terminais podem ser substituídas; reservas ativas permanecem idempotentes.
- A manutenção periódica passou a chamar a reconciliação de órfãos. O cliente também rejeita hash calculado malformado antes da reserva.

As três RPCs envolvidas são `SECURITY DEFINER`, `search_path=''` e executáveis por `service_role`, não por `anon/authenticated`.

## C. Provas pré-run

- PostgreSQL descartável 17.9: 50/50 ciclos, duas conexões independentes, cenários A–J/N/O, zero falha, deadlock, timeout ou duplicação.
- Pipeline APP: 487/487 testes focados PASS antes do run.
- Parser/RAW/HOT: 162 PASS, 10 skips declarados.
- Typecheck, compileall, marcadores de conflito, formatação escopada e build: PASS.
- Railway: `/health` 200, `durable-worker`; demoparser2 `0.42.0`; contract `1`; semantic revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`; build revision `git:e0856de0879454219a9f33c70372a394b3c8b78b`.
- Objeto histórico lido por streaming: 473.748.061 bytes; SHA físico e de banco `0caa7c9744deec106095895d2dacd19cbfdae689f99e29e29b0dd4d446b4ec8ae3d`.

## D. Lifecycle real

- Upload 8: `d89b697f-c40d-42f4-ae51-040e4e8cabba`.
- Job 8: `d1851c49-820a-426b-86c6-0ea4623b4f41`.
- `attempt_number=8`, `supersedes_job_id=a31f5c25-b0d8-41ac-8225-27814cd1732a`, `replacement_reason=raw_audit_blocked`.
- O objeto foi copiado pelo Storage privado para o path do novo upload e revalidado: mesmo SHA e 473.748.061 bytes.
- Enqueue oficial criou mensagem 16. O retry automático configurado do mesmo attempt criou mensagens 17 e 18; as três foram lidas e arquivadas uma vez. Isso alterou somente `dispatch_attempt/retry_count`, nunca `attempt_number`.
- Estado terminal: `failed/failed`, `PERSISTENCE_ERROR`, retry_count `3`, dispatch_attempt `2`, sem mensagem ativa.

## E. RAW/HOT

Artifact 8 `62637627-3cfa-4e67-8734-75d5cc90966d`: READY/RAW ready/audit approved, 25/25 chunks verificados, 373.778 linhas, 2.799.506 bytes, root `341eb88e1c5b1c4f6af8fd74e7a7af39333ff0c4a2108a8d9e05a5e9a8297b1c`.

O manifest físico tem 38.036 bytes, zero `raw_block_reasons` e oito gates PASS: RAW evidence, mapping RAW→Canonical, eventos, rounds, ticks, players, granadas e economia. Inventário: 22 MAPPED, 2 DERIVED e 341 RAW_ONLY_INTENTIONAL. O metadata HOT persistido no source mede 1.201.342 bytes, abaixo do alvo de 4 MiB e do hard limit de 8 MiB. O RAW integral permaneceu no bucket privado e não foi carregado no callback.

## F. Falha e integridade pós-run

Root cause comprovada: `finish_demo_job_processed(uuid,jsonb)` executa `quality_flags = ARRAY(...)::text[]`, enquanto `demo_jobs.quality_flags` é `jsonb`. A mesma incompatibilidade aparece no caminho de finalização de projeção. Não foi corrigida neste ciclo porque a regra exigia parar e não reexecutar após falha crítica.

O handoff anterior à finalização não foi atômico: existe `match_sources` do upload 8 para o match `a7b27f16-4c85-428b-a855-0f683bda48a2`, com 10 participantes, 25 rounds e 4.397 eventos; `round_players=0`, métricas=0 e features=0. Portanto não há Canonical completo nem projeção válida, e o gate é FAIL, não PASS.

O attempt 7 permaneceu terminal e seu artifact ficou intacto: 24/24 chunks, 373.754 linhas, 2.799.488 bytes, root `ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2`. A única mudança esperada foi `superseded_by_job_id` apontar para o job 8. Não existe attempt 9.

## G. Validação final

- APP completa: 928/928 testes PASS.
- Parser: 162 PASS, 10 skips.
- Build automático: PASS.
- Working tree: limpa após as mudanças gerenciadas.
- Os 15 findings do linter Supabase permanecem baseline anterior e não foram ampliados pelas RPCs novas.

## H. Matriz G5-R-F.2-01..40

| Gate | Status | Evidência |
|---|---|---|
| 01 projeto/revisão | PASS | revisão registrada, árvore limpa |
| 02 migrations | PASS | duas migrations incrementais instaladas |
| 03 SHA programático | PASS | stream físico, 64 hex |
| 04 constraints SHA | PASS | checks em uploads/jobs |
| 05 validação pré-mutation | PASS | reserve/enqueue/client |
| 06 reserva inválida | PASS | evidência terminal preservada |
| 07 reconciliação órfã | PASS | dois órfãos reconciliados |
| 08 janela segura | PASS | mínimo 15 minutos |
| 09 Storage recheck | PASS | job e objeto rechecados sob lock |
| 10 advisory lock | PASS | owner+SHA |
| 11 ACL | PASS | service-role-only |
| 12 concorrência | PASS | 50/50, zero anomalia |
| 13 Railway health | PASS | HTTP 200 |
| 14 parser identity | PASS | 0.42.0/contract 1/revisions |
| 15 objeto histórico | PASS | SHA/tamanho coincidem |
| 16 attempt 7 preservado | PASS | terminal; artifact intacto |
| 17 reserve attempt 8 | PASS | novo upload lógico |
| 18 supersession | PASS | job 7 + reason correta |
| 19 cópia privada | PASS | objeto 8 criado |
| 20 integridade pós-cópia | PASS | SHA/tamanho coincidem |
| 21 enqueue oficial | PASS | mensagem 16 |
| 22 durable claim | PASS | processing observado |
| 23 attempt vs dispatch | PASS | attempt 8; dispatch 0–2 |
| 24 retry automático bounded | PASS | mensagens 16–18; sem nova tentativa lógica |
| 25 parser real | PASS | parse/normalização observados |
| 26 RAW artifact | PASS | READY |
| 27 chunks | PASS | 25/25 verificados |
| 28 root digest | PASS | digest registrado |
| 29 RAW audit | PASS | APPROVED, zero blockers |
| 30 cobertura semântica | PASS | oito gates RAW PASS |
| 31 HOT bound | PASS | 1.201.342 bytes |
| 32 Canonical handoff | FAIL | escrita parcial |
| 33 round players | FAIL | zero |
| 34 metrics | FAIL | zero |
| 35 features | FAIL | zero |
| 36 finalização | FAIL | jsonb versus text[] |
| 37 terminal job | FAIL | PERSISTENCE_ERROR |
| 38 no attempt 9 | PASS | zero |
| 39 Run 2 | NOT RUN | proibido após Run 1 FAIL |
| 40 decisão | FAIL | pipeline não concluiu end-to-end |

## I. Próximo gate permitido

Corrigir incrementalmente a incompatibilidade `quality_flags` e tornar Canonical/finalização atomicamente convergentes antes de autorizar qualquer nova execução. Run 2 e Fase 2.8 permanecem bloqueados.