# FASE 2.7.2G.6 — DEM Data Retention, Physical Deletion & Lifecycle Safety Gate

## Decisão

`DEM_RETENTION_POLICY = PASS_FOR_CODE_AND_SCHEMA`

O `.dem` original do bucket privado `demos` é temporário. Jobs processados usam
retenção de 24 horas; falhas terminais e `blocked_raw_audit`, 72 horas;
cancelamentos tornam-se elegíveis imediatamente. Jobs, uploads, SHA-256,
provenance, RAW evidence, Canonical e derivados permanecem intactos.

Nenhum cleanup produtivo foi executado nesta fase. A prova de remoção é de
contrato, migration, testes e auditoria read-only; não houve DEM real, Cache Run,
attempt 9, Railway, Canonical ou segredo.

## Estado auditado antes da migration

| Sinal | Contagem |
|---|---:|
| jobs totais | 12 |
| objetos no bucket `demos` | 9 |
| bytes físicos | 3.789.985.512 |
| `blocked_raw_audit` sem retenção | 1 |
| `failed` sem retenção | 6 |
| metadados `storage_deleted_at` com objeto ainda presente | 3 |
| objeto órfão | 1 |
| bytes órfãos | 1.024 |

O backfill definiu apenas retenção ausente em `failed`/`blocked_raw_audit`, a
partir do timestamp terminal histórico. Não apagou nem reabriu tentativas.

## Contrato

1. O trigger `guard_demo_retention_lifecycle` deriva a janela da transição
   terminal e remove retenção/claim quando um retry válido reativa o job.
2. `evaluate_demo_deletion_gate` falha fechado para estado ativo, retenção,
   lease/worker, ownership do caminho, RAW e persistência Canonical de sucesso.
3. `claim_demo_cleanup_jobs` e `claim_demo_cleanup_job` usam lock de linha,
   `SKIP LOCKED`, token e lease de 300 segundos.
4. O servidor valida exatamente `{user_id}/{upload_id}.dem`, consulta presença,
   remove via API de Storage e consulta novamente.
5. Só `DELETE_VERIFIED` ou `ALREADY_ABSENT` permitem
   `storage_delete_verified_at`; falhas deixam ambos os marcadores nulos.
6. Mismatch legado é reprocessado como `metadata_mismatch`, nunca aceito como
   prova de deleção.
7. Objetos órfãos são classificados com janela mínima de 72 horas, mas não são
   apagados automaticamente sem vínculo histórico suficiente.

## Matriz A–Q

| Gate | Prova | Estado |
|---|---|---|
| A–C | policy version + 24h/72h + backfill terminal | PASS |
| D–E | estado terminal + retenção vencida | PASS |
| F–G | worker/lease + claim transacional concorrente | PASS |
| H | retry bloqueado durante cleanup e após deleção | PASS |
| I–J | ownership estrito + cancelamento imediato seguro | PASS |
| K–L | verificação pós-delete + ausência idempotente | PASS |
| M | falha registrada sem falso positivo | PASS |
| N | mismatch de metadado detectado | PASS |
| O | órfão classificado, sem auto-delete | PASS |
| P | histórico/RAW/Canonical/SHA preservados | PASS |
| Q | RPCs service-role-only e `search_path=''` | PASS |

## Métricas

`get_demo_retention_metrics()` fornece totais ativos, terminais, retidos,
expirados, elegíveis, tentativas, deleções verificadas, falhas, mismatches e
bytes. `get_demo_orphan_report()` fornece contagem/bytes elegíveis e ignorados,
sem retornar paths ou PII.

## Limites

- Não há claim de deleção física produtiva neste fechamento porque o cleanup foi
  deliberadamente proibido durante a auditoria.
- `REAL_DEM_EXECUTION`, paridade Python×WASM e determinismo: `NOT_RUN`.
- Canonical admission e AI Data Readiness permanecem bloqueados pelos gates
  próprios; esta política de retenção não os libera.