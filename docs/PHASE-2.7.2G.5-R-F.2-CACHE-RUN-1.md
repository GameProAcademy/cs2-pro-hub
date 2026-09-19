# FASE 2.7.2G.5-R-F.2 — Cache Run 1

## A. Executive Summary

O preflight obrigatório passou. A primeira mutação, porém, enviou à RPC oficial um SHA digitado com 67 caracteres, diferente do SHA físico de 64 caracteres. A RPC tratou o conteúdo como novo e criou somente o upload pendente `5c514921-d32d-4058-9d34-bbb57c361b53`, attempt 1. A validação imediata detectou a quebra do contrato esperado e interrompeu a execução antes de copiar bytes, enfileirar, acionar Railway ou criar RAW/Canonical. A evidência foi preservada e não houve retry.

## B. Current Commit

- Branch: `edit/edt-36996b32-2b4c-45a7-99d0-50e01300d82f`
- Commit: `199f4e3c387d4ec4b4a23381ea6122ca47ea4bce`
- Working tree estava limpo antes da documentação.

## C. Database Migration State

Migration `20260918235817` instalada. `reserve_demo_upload` e `enqueue_demo_job` são `SECURITY DEFINER`, têm `search_path=''`, advisory lock por usuário+SHA e execução negada a `anon`/`authenticated`, permitida a `service_role`.

## D. Preflight

PASS: migration, RPCs, ACLs, constraints, índices, Railway, objeto físico, ausência de attempt 8, ausência de processed+RAW-approved e ausência de Canonical conflitante. O objeto histórico foi lido por stream: 473.748.061 bytes e SHA `0caa7c9744deec106095895d2dacd19cbfdae689f99e29e29b0dd4d446b4ec8ae3d`.

## E. Historical Attempt 7

- Job: `a31f5c25-b0d8-41ac-8225-27814cd1732a`
- Upload: `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043`
- Status/stage: `blocked_raw_audit` / `raw_audit`
- Attempt/dispatch/retry: 7 / 2 / 2
- `superseded_by_job_id`: NULL, inalterado
- Artifact: `3a1e5225-f0f2-427a-97b8-c21dac936e7d`, READY/RAW ready/audit blocked, 24 chunks, 373.754 rows, 2.799.488 bytes, root `ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2`

## F. New Attempt 8

Não foi criado. A resposta da reserva foi `new_attempt=false`, `attempt_number=1`, `duplicate=false`, sem supersessão. Isso violou imediatamente o contrato esperado e encerrou a execução.

## G. Upload

A reserva criou a linha isolada `5c514921-d32d-4058-9d34-bbb57c361b53`, pending, sem job, usando o SHA incorreto `0caa7c9744deec106095895d2dacd19cbfdae689f99e29e29b0dd4d446b4ec8ae3d` (67 caracteres). Nenhum objeto foi copiado para seu path; consulta ao Storage confirmou zero objetos.

## H. Queue

Nenhum enqueue foi chamado. Não existe job para o upload isolado nem mensagem de fila correspondente.

## I. Railway

Preflight read-only PASS: `/health` 200, papel `durable-worker`; `/version` 200, demoparser2 0.42.0, contract 1, semantic `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`, build `git:e0856de0879454219a9f33c70372a394b3c8b78b`. Nenhum deploy ou parse foi disparado.

## J. RAW Artifact

Nenhum artifact novo. O artifact 7 permaneceu intacto.

## K. RAW Audit

Não executado para nova tentativa. O relatório histórico não foi alterado e o bloqueio histórico permaneceu fail-closed.

## L. HOT

Não executado.

## M. Canonical

Não executado. O preflight e a verificação posterior confirmaram zero fonte canônica vinculada ao upload 7.

## N. Metrics

Não executado.

## O. Features

Não executado.

## P. Idempotency

Não foi executada nova reserva: qualquer repetição seria retry proibido após a falha. O harness descartável anterior continua PASS, mas não substitui esta execução real.

## Q. Concurrency

Revalidação local: 30 testes focados PASS e harness PostgreSQL 17.9 com 50/50 corridas PASS, sem deadlock ou timeout.

## R. Historical Immutability

Attempt 7, upload 7 e artifact 7 permaneceram inalterados. Em especial, `superseded_by_job_id` continua NULL. Nenhum status histórico foi reaberto ou ajustado.

## S. Test Matrix

Os 30 testes lifecycle/concurrency passaram antes da execução. Não foram executadas suítes posteriores como substituto do E2E interrompido.

## T. Frontend Smoke

Não executado após a interrupção, pois não há estado de Run 1 a validar na interface.

## U. Railway Health

Saudável no preflight e não acionado pelo Run 1.

## V. Roadmap

Atualizado com esta fonte atual de verdade: tentativa 8 não criada, Run 1 falhou na primeira mutação e Run 2 permanece proibido.

## W. Known Issues

**ROOT CAUSE:** erro operacional de transcrição: o SHA enviado tinha 67 caracteres e divergia do SHA físico no índice 46.  
**IMPACT:** criação de uma reserva pendente isolada para outro SHA; nenhuma tentativa 8, fila, parser ou dado derivado.  
**AFFECTED COMPONENT:** invocação operacional da RPC, não a implementação do lifecycle.  
**REPRODUCTION:** chamar a reserva com o mesmo usuário, nome e tamanho, mas SHA divergente.  
**FIX REQUIRED:** uma futura execução deve obter o SHA diretamente da leitura verificada, sem transcrição manual.  
**FIX APPLIED:** não; nenhum código ou dado foi alterado após a falha.  
**RERUN SAFE:** tecnicamente possível somente em marco separado e explicitamente autorizado; não executado aqui.

## X. Run 2 Readiness

`RUN 2 = NOT READY`. Run 2 não foi executado e attempt 9 não existe.

## Y. Final Decision

`CACHE RUN 1 = FAIL`  
`G5-R-F.2 = FAIL`  
`RUN 2 = NOT READY`

## Matriz G5-R-F.2-01..40

| Gate | STATUS | EVIDENCE | NOTES |
|---|---|---|---|
| G5-R-F.2-01 projeto/commit | PASS | branch e commit registrados | preflight |
| G5-R-F.2-02 migration | PASS | versão 20260918235817 instalada | read-only |
| G5-R-F.2-03 RPC reserve | PASS | função real inspecionada | SECURITY DEFINER |
| G5-R-F.2-04 RPC enqueue | PASS | função real inspecionada | SECURITY DEFINER |
| G5-R-F.2-05 advisory lock | PASS | user+SHA na função instalada | comprovado também no harness |
| G5-R-F.2-06 ACL | PASS | somente service_role executa | anon/auth negados |
| G5-R-F.2-07 constraints | PASS | checks de reason presentes | inclui raw_audit_blocked |
| G5-R-F.2-08 active SHA index | PASS | índice parcial presente | pending/processing/cancel_requested |
| G5-R-F.2-09 supersession index | PASS | índice único presente | uma supersessão por job |
| G5-R-F.2-10 historical state | PASS | job/upload/artifact 7 registrados | intactos |
| G5-R-F.2-11 physical demo | PASS | 473.748.061 bytes | stream read-only |
| G5-R-F.2-12 Railway preflight | PASS | health/version 200 | pins exatos |
| G5-R-F.2-13 reserve | FAIL | SHA enviado divergente | resposta não foi replacement |
| G5-R-F.2-14 attempt 8 | FAIL | não criado | reserva isolada attempt 1 |
| G5-R-F.2-15 replacement reason | FAIL | NULL | esperado raw_audit_blocked |
| G5-R-F.2-16 supersedes | FAIL | NULL | esperado job 7 |
| G5-R-F.2-17 physical upload | NOT RUN | zero objeto no novo path | interrupção imediata |
| G5-R-F.2-18 SHA verification | FAIL | parâmetro 67 chars versus físico 64 | detectado após RPC |
| G5-R-F.2-19 enqueue | NOT RUN | zero job | proibido após mismatch |
| G5-R-F.2-20 durable queue | NOT RUN | zero mensagem para upload isolado | sem bypass |
| G5-R-F.2-21 worker claim | NOT RUN | nenhum job | — |
| G5-R-F.2-22 Railway parser | NOT RUN | nenhum parse | serviço não alterado |
| G5-R-F.2-23 parser identity | PASS | preflight version 200 | não é prova de parse |
| G5-R-F.2-24 RAW artifact | NOT RUN | nenhum artifact novo | artifact 7 intacto |
| G5-R-F.2-25 chunk integrity | NOT RUN | nenhum chunk novo | histórico 24/24 intacto |
| G5-R-F.2-26 RAW audit | NOT RUN | nenhum report novo | histórico preservado |
| G5-R-F.2-27 RAW approval | NOT RUN | nenhuma aprovação | fail-closed |
| G5-R-F.2-28 HOT | NOT RUN | sem completion | — |
| G5-R-F.2-29 Canonical | NOT RUN | zero vínculo novo | — |
| G5-R-F.2-30 metrics | NOT RUN | nenhuma persistência | — |
| G5-R-F.2-31 features | NOT RUN | nenhuma persistência | — |
| G5-R-F.2-32 terminal state | FAIL | upload isolado pending sem job | evidência preservada |
| G5-R-F.2-33 attempt 7 immutability | PASS | status/stage/superseded_by intactos | artifact intacto |
| G5-R-F.2-34 no attempt 9 | PASS | zero para SHA correto | Run 2 não executado |
| G5-R-F.2-35 enqueue idempotency | NOT RUN | execução real interrompida | prova local permanece PASS |
| G5-R-F.2-36 SHA uniqueness | PASS | SHA correto não ganhou attempt novo | SHA incorreto criou outra chave |
| G5-R-F.2-37 automated tests | PASS | 30 focados + harness 50/50 | antes da mutação |
| G5-R-F.2-38 Railway post-run | NOT RUN | Railway não foi acionado | preflight saudável |
| G5-R-F.2-39 documentation | PASS | este relatório + roadmap | evidência honesta |
| G5-R-F.2-40 Run 2 readiness | FAIL | Run 1 não concluiu | NOT READY |