# R-07 — Evidência de produção (2026-11-25)

Escopo: evidência de vencedor por round (O8/O8-A), release do worker R5.8.32, troca dos três valores de identidade do
worker no app e validação com uma demo nova. Nenhuma demo de produção foi reprocessada. Este documento não contém
SteamIDs, segredos nem os valores dos três segredos do app.

## 1. Linha do tempo

| Etapa | O quê                                                      | Evidência                                                                                    |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A     | #379 (com #381, #384, #385, #386) integrado; app publicado | merge `4f7466ec`; deploy Lovable `72a88ba6`                                                  |
| B     | Release do worker R5.8.32                                  | Railway `c372485e` SUCCESS (único build); `19343205` SKIPPED pelo freeze; `584ea563` REMOVED |
| B     | Re-pin no banco                                            | #387, merge `9e6d6e5f`; migração `20261125193500` aplicada pelo arquivo commitado            |
| C     | Três valores de identidade do worker no app                | atualizados no painel Secrets (sobrescrita no lugar) e publicados (deploy `c0d4290c`)        |
| C     | Attestation nova                                           | workflow `parser-runtime-attestation` run `45697566880`; proveniência `3ee7f9e8` VERIFIED    |
| D     | Demo nova na conta de teste                                | job `12903805`, Nuke, jogador `xeedo` escolhido pelo dono                                    |

## 2. Worker (etapa B)

- `/version` nos dois hosts: demoparser2 0.42.2; revision = semantic = build = `git:4f7466ec…`; `build.commit`
  `4f7466ec…`; `embedded` true; `source` railway; `declared_revision_matches` true.
- Fonte persistente do serviço alinhada a `4f7466ec` na mesma operação; o merge do #387 não disparou deploy.

## 3. Banco (etapa B)

| Função                                  | Antes (R5.8.31) | Depois (R5.8.32)         |
| --------------------------------------- | --------------- | ------------------------ |
| `record_parser_runtime_attestation`     | `515f433f…`     | `e477fc60…`              |
| `assert_verified_parser_provenance`     | `e35c5ff8…`     | `dd1f25cc…`              |
| `enforce_approved_attestation_workflow` | `f74d8af9…`     | `f74d8af9…` (inalterada) |

- Dry run em produção antes do merge: `R5_8_32_DRY_RUN_OK_ROLLED_BACK`, md5 inalterados depois.
- PostgreSQL 16 descartável com o texto exato das funções de produção (md5 conferido): migração, re-execução
  idempotente, `docs/reference/r5_8_32/rollback.sql` de volta ao R5.8.31 e reaplicação.
- Propriedades preservadas: owner postgres, SECURITY DEFINER, `search_path` vazio, EXECUTE só para postgres e
  service_role.
- O Lovable sincronizou o merge mas **não aplicou** a migração; ela foi aplicada a partir do arquivo commitado, sem
  alteração (ver o runbook).

## 4. App (etapa C)

`/api/public/parser-attestation-runtime`, verificado sem imprimir valores:

- `bridge.expectedWorkerBuildCommit`, `parserLock.revision` e `parserLock.buildRevision` nomeiam o commit liberado;
  nenhum campo nomeia `0c646583`;
- `parserLock.revisionSource` e `buildRevisionSource` = `env`; `bridge.enforced` e os dois `…Required` = true;
- `parserLock`: demoparser2 0.42.2, contrato 1.

A attestation anterior tinha 7 dias e nomeava o deployment anterior; a assertion só aceita linhas com menos de 24 h.
Sem a attestation nova, qualquer demo falharia fechado.

## 5. Demo de validação (etapa D)

Job `12903805-3aea-43de-bdcb-9768b2d03fb1`: `processed`/`done`, `parser_revision` `git:4f7466ec…`, `partial_parse`
false, `attached`/`manual_selected` no nick observado `xeedo`, admissão `LIMITED` (mesmas limitações L01–L04 das
demos anteriores). Integridade: `MATCH_COMPLETED`, fim oficial, 20 rounds válidos.

**Evidência por round.** 20/20 rounds `round-winner-evidence-v1`, `status` `confirmed`, `method` `game_state`;
`winner_side` igual ao lado confirmado em todos. Nenhuma chave `canonical_v3_withheld`.

**Conferência independente do vencedor** (eliminação total pelos eventos `kill` ou explosão da bomba): 20 rounds
decidíveis, 20 concordam, 0 divergem; 134 kills, 0 vítimas sem participante.

**Placar.** Lados por round (troca após o 12): o time do `xeedo` (CT no 1º tempo, T no 2º) vence 7 + 6 = **13–7**.
O placar no nível da partida (`matches.score_player`, `result`) continua nulo: a admissão o exclui com
`L04-MATCH-RESULT-UNRESOLVED`, como em todas as demos desde novembro. Comportamento anterior a esta release, fora do
escopo do R-07.

**Métricas novas.** 1 linha em `match_metrics`, 1 em `match_features`, 200 em `round_players`; K/D 28/11 igual aos
eventos; 20 rounds jogados. Os agregados por jogador de `round_players` ficam nulos, como antes, e não são lidos como
zero.

**Histórico inalterado.** Contagem e md5 de cada tabela, excluída a partida nova, antes (20:45Z) e depois:

| Tabela               | Linhas | md5 antes = depois |
| -------------------- | ------ | ------------------ |
| `match_metrics`      | 14     | `964c7edd…`        |
| `match_rounds`       | 321    | `74f484b8…`        |
| `match_participants` | 150    | `b106b3c8…`        |
| `matches`            | 15     | `dd85294c…`        |
| `match_features`     | 14     | `8c4bdc55…`        |
| `round_players`      | 2960   | `fc31a38f…`        |

## 6. Rollback

Railway `584ea563` (fonte do serviço de volta a `0c646583`), `docs/reference/r5_8_32/rollback.sql` e os três valores
do app de volta à identidade R5.8.31.
