# FASE 2.7.2G.6 — DEM Data Retention, Physical Deletion & Lifecycle Safety Gate

## Decisão

`G.6-R = BLOCKED`

O blocker de cleanup concorrente foi contido no candidato: a única autoridade
permitida é `G6_VERIFIED_DELETE_ONLY`, mas sua execução física está desligada.
Cron, cancelamento, conclusão de processamento e ação administrativa não iniciam
remoção. A fase continua bloqueada exclusivamente porque o source/runtime Railway
não está acessível para sincronização e prova de paridade.

O `.dem` original do bucket privado `demos` é temporário. Jobs processados usam
retenção de 24 horas; falhas terminais e `blocked_raw_audit`, 72 horas;
cancelamentos tornam-se elegíveis imediatamente. Jobs, uploads, SHA-256,
provenance, RAW evidence, Canonical e derivados permanecem intactos.

Nenhum cleanup produtivo foi invocado pelo agente. Porém, após o backfill tornar
retenções históricas vencidas explícitas, uma rotina legada já publicada e
externa a esta execução removeu seis dos nove objetos antes da publicação do novo
safety gate. O agente interrompeu o fechamento, aplicou quarentena de 24 horas
aos objetos remanescentes e preservou a evidência do incidente. Não houve DEM
real, Cache Run, attempt 9, Railway, Canonical ou segredo.

## Estado auditado antes da migration

| Sinal                                                    |      Contagem |
| -------------------------------------------------------- | ------------: |
| jobs totais                                              |            12 |
| objetos no bucket `demos`                                |             9 |
| bytes físicos                                            | 3.789.985.512 |
| `blocked_raw_audit` sem retenção                         |             1 |
| `failed` sem retenção                                    |             6 |
| metadados `storage_deleted_at` com objeto ainda presente |             3 |
| objeto órfão                                             |             1 |
| bytes órfãos                                             |         1.024 |

O backfill definiu apenas retenção ausente em `failed`/`blocked_raw_audit`, a
partir do timestamp terminal histórico. Não apagou nem reabriu tentativas.

## Incidente de rollout detectado

Entre duas leituras read-only consecutivas, o bucket passou de 9 objetos e
3.789.985.512 bytes para 3 objetos e 947.497.146 bytes. Não houve chamada de
cleanup/Storage feita pelo agente. O comportamento é compatível com a versão
publicada anterior de `cleanupExpiredDemos`, que observou as retenções históricas
vencidas criadas pelo backfill antes que o novo código de claim e verificação
fosse publicado.

A migration de contenção moveu somente os objetos ainda fisicamente presentes
para `retain_until >= now()+24h`. Nenhum arquivo foi restaurado, fabricado ou
substituído. O gate G.6 permanece bloqueado até revisão operacional independente
do incidente e publicação coordenada do servidor endurecido.

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

| Gate | Prova                                            | Estado                                                |
| ---- | ------------------------------------------------ | ----------------------------------------------------- |
| A–C  | policy version + 24h/72h + backfill terminal     | PASS                                                  |
| D–E  | estado terminal + retenção vencida               | PASS                                                  |
| F–G  | worker/lease + claim transacional concorrente    | PASS                                                  |
| H    | retry bloqueado durante cleanup e após deleção   | PASS                                                  |
| I–J  | ownership estrito + cancelamento imediato seguro | PASS                                                  |
| K–L  | verificação pós-delete + ausência idempotente    | PASS                                                  |
| M    | falha registrada sem falso positivo              | PASS                                                  |
| N    | mismatch de metadado detectado                   | PASS                                                  |
| O    | órfão classificado, sem auto-delete              | PASS                                                  |
| P    | histórico/RAW/Canonical/SHA preservados          | BLOCKED: remoção concorrente de seis DEMs temporários |
| Q    | RPCs service-role-only e `search_path=''`        | PASS                                                  |

## Métricas

`get_demo_retention_metrics()` fornece totais ativos, terminais, retidos,
expirados, elegíveis, tentativas, deleções verificadas, falhas, mismatches e
bytes. `get_demo_orphan_report()` fornece contagem/bytes elegíveis e ignorados,
sem retornar paths ou PII.

## Limites

- Nenhum claim do fluxo G.6 foi executado. Houve remoção externa concorrente pela
  rotina legada publicada; portanto, a fase não recebe PASS operacional.
- `REAL_DEM_EXECUTION`, paridade Python×WASM e determinismo: `NOT_RUN`.
- Canonical admission e AI Data Readiness permanecem bloqueados pelos gates
  próprios; esta política de retenção não os libera.

## Fechamento G.6-R

### Autoridades auditadas

| Caminho                      | Classe            | Estado G.6-R                                       |
| ---------------------------- | ----------------- | -------------------------------------------------- |
| `deleteDemoVerified`         | `NEW_G6_CLEANUP`  | implementação única preservada, execução desligada |
| `cleanupExpiredDemos`        | `NEW_G6_CLEANUP`  | no-op explícito com autoridade e status            |
| cron de pipeline             | automático        | chamada destrutiva removida                        |
| cancelamento/conclusão       | automático        | chamada destrutiva removida                        |
| ação master                  | manual            | somente recovery e status fail-closed              |
| RPCs de claim/finalização    | service-role-only | preservadas para gate operacional futuro           |
| relatório de órfãos/métricas | read-only         | preservado, sem delete                             |
| cleanup legado publicado     | `LEGACY_CLEANUP`  | nenhum caminho executável permanece no candidato   |

### Matriz A–T

A–Q permanecem cobertos pelo contrato G.6. R comprova que nenhum acionador
automático chama cleanup; S comprova autoridade única e execução desligada no
banco; T comprova quarentena/backfill preservadores e um único ponto de remoção
física no código. A evidência de concorrência produtiva não foi fabricada: nenhum
claim ou delete foi executado nesta fase.

### Migration G.6-R

`20260921065045_3e6e67cc-9bef-4405-9ed1-a4d334874526.sql` adiciona a leitura
service-role-only da autoridade, mantém execução desligada, corrige a guarda de
retry para depender de ausência fisicamente verificada e preserva o rastro de
`DELETION_METADATA_MISMATCH` após falha. O linter permaneceu no baseline de 15
findings preexistentes, sem finding novo da fase.

### Railway

O candidato MAIN é `2f8a76645c6030659f2ed0480469b1452e75f72e`. O branch
`infra/cs2-parser-worker-v8`, os arquivos de isolamento, a imagem e uma conexão
Railway não estão disponíveis. Logo, `RAILWAY_RUNTIME_PARITY = BLOCKED`; hashes e
surface do candidato constam em `docs/G6_R_RUNTIME_MANIFEST.md`.

### Classificação final

- `LEGACY_CLEANUP_DISABLED = PASS`
- `RETENTION_CONTRACT = PASS`
- `CLEANUP_AUTHORITY_SINGLE = PASS`
- `NO_DESTRUCTIVE_EXECUTION = PASS`
- `RAILWAY_RUNTIME_PARITY = BLOCKED`
- `REAL_DEM = NOT_RUN`
- `PYTHON_WASM_PARITY = NOT_RUN`
- `DETERMINISM_REAL = NOT_RUN`
- `CANONICAL = BLOCKED`
- `AI = BLOCKED`
