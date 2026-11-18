# PM4 — Relatório de execução (Fases 4.2.7 e 4.2.8; módulos E, F, G e a parte de histórico/DNA de J)

> Relatório vivo do PM4. Estados: VALIDADO EM PRODUÇÃO · VALIDADO EM TESTE · IMPLEMENTADO, NÃO VALIDADO ·
> NOT_MEASURED/NOT_OBSERVED · BLOCKED/MANUAL_REQUIRED · NÃO APLICÁVEL. Fatos provados, hipóteses e evidências
> ausentes ficam separados. Sem SteamIDs, e-mails, segredos ou demos privadas.

## C0 — Entrada (2026-11-17)

- **Estado remoto conferido (19:50 BRT):**
  - `origin/main` `10e90693` (#318, só docs; `git diff ad7b73b2 10e90693 -- src services supabase` vazio);
  - app publicado = código funcional de `ad7b73b2` (bundle com `/duels` e `/utility`);
  - worker Railway `3335c88d` SUCCESS, commit `768646ea` (R5.8.30); `/version` `git:768646ea…` em revision/semantic/build, demoparser2 0.42.2, `declared_revision_matches` true;
  - gates de `10e90693`: Quality Gates, F553, Queue Semantics, R5.8.3/R5.8.4 success; H.3-E 44145869691 success (a 1ª tentativa falha cedo, padrão conhecido).
- **Prompts anteriores:** PM1, PM6, PM2 e PM3 concluídos (checkpoints e C6 conferidos). Nada repetido.
- **Divergência do checkpoint central:** registrava PM3 ativo e `main` `ad7b73b2`; o real era PM3 concluído e `main` `10e90693`. Corrigido no fechamento deste PM.
- **Escopo J (decisão registrada):** o mapeamento lista PM4 = E, F, G, J. A especificação v1.1 §8 (4.2.8) e §9 (Módulo J) dizem que, nesta entrega, J cobre **DNA, snapshots e evolução**, e que comparativos profissionais/coortes são da 4.2.10 (PM5). Portanto: a parte histórica/DNA de J entra no PM4 (integrada ao módulo G); comparativos Pro ficam fora.
- **Ambiente:** Claude in Chrome não conectado; o navegador embutido funciona (usado para `/version` e bundle).
- **Demos (Downloads):** acessíveis. Corpus local: 7 FACEIT (ancient, anubis, cache, dust2, inferno, mirage, nuke), 3 GC (mirage ×2, cache), 3 HLTV (FURIA × Vitality dust2, FURIA × GamerLegion mirage/dust2) e 3 de origem não comprovada. Uso somente local e isolado; nada versionado.

## C1 — Descoberta (telemetria econômica, round state, histórico)

### Economia — o que existe (provado)

| Campo                                                                                                     | Origem                                 | Persistido                                 | Cobertura em produção  | Observação                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Dinheiro no início do round                                                                               | `start_balance` (demoparser2)          | `round_players.money_start`                | 2056/2060 player-round | —                                                                                                                                  |
| Dinheiro no fim do round                                                                                  | `balance` no tick de fim               | `round_players.money_end`                  | 2060/2060              | —                                                                                                                                  |
| Equipamento antes da compra                                                                               | `round_start_equip_value`              | `round_players.equipment_value`            | 2056/2060              | no round 1 de HLTV inclui equipamento do warmup (3400–3600)                                                                        |
| Gasto no round                                                                                            | `cash_spent_this_round` no tick de fim | **R5.8.31**: `round_end.data.money_spent`  | partidas novas         | igual ao valor em `buytime_ended` em 679/679 player-rounds; `buytime_ended` falta em 1–2 rounds por demo FACEIT e em 0/23 das HLTV |
| Desconexão                                                                                                | `player_disconnect` (humano, não BOT)  | **R5.8.31**: `round_end.data.disconnected` | partidas novas         | FACEIT Nuke: rounds 5, 8 e 17                                                                                                      |
| `buy_context`, `survived`, `opening_kill`, `trade_kill`, kills/deaths/damage por round em `round_players` | —                                      | colunas existem                            | vazias/nulas           | não usadas; tudo é derivado dos eventos                                                                                            |
| Armadura, capacete, kit, inventário                                                                       | props existem no demoparser2           | não                                        | —                      | NOT_MEASURED (não necessários para a regra adotada)                                                                                |

- **Regra de compra:** Xenopoulos et al. 2021 (arXiv 2109.12990), Tabela 1 — equipamento da equipe no início (E) + gasto no round (S): full ≥ 20 000; eco E < 3 000 e S < 2 000; low E < 3 000 e 2 000 ≤ S < 7 500; half E < 3 000 e S ≥ 7 500; hero_low E ≥ 3 000 e S < 7 500; hero_half E ≥ 3 000 e S ≥ 7 500. Leetify não publica limiares.
- **Pistol:** reset econômico (todos os jogadores das duas equipes com o mesmo `money_start` ≤ 1 000). Não usa número do round (a ordenação de `round_freeze_end` é deslocada em FACEIT) nem equipamento (warmup HLTV). Validado: FACEIT Mirage/Nuke rounds 1 e 13; FURIA round 1.
- **Contrato canônico:** `canonical-demo-v3` força `metadata` = `{}` em rounds e round_players; por isso os fatos novos viajam em `round_events.data` do evento `round_end` (sem mudança de contrato ou de digest).

### Round state — fonte única

`match_rounds` (limites, vencedor) + `round_players.side` (roster por round) + eventos `kill`, `damage`, `bomb_plant`, `bomb_defuse`, `bomb_explode`, `round_end`. Definições reutilizadas: `TRADE_WINDOW_SECONDS = 5` (`src/config/pipeline.ts`) e a regra de abertura (menor tick único) de `metrics.ts`.

### Histórico, snapshots e DNA

- `match_metrics` (uma linha por partida e jogador, escrita uma vez pelo pipeline): numeradores/denominadores para K/D, ADR×rounds, KAST×rounds, HS%×kills, aberturas, trocas, clutches, flash assists (+ método em `match_flash_assist_provenance`), rating e rating por lado.
- `player_dna_snapshots`: idempotente por `(player_id, input_digest)`, com `dna_version`, `state`, `source_match_ids`.
- Volume em produção (2026-11-17): 3 jogadores, ≤ 5 partidas por jogador → a maioria das janelas será PARTIAL/INSUFFICIENT_SAMPLE.
- Decisão: **não criar um segundo pipeline de snapshots**. A unidade imutável por partida já existe (`match_metrics`), o DNA mantém seus snapshots versionados, e a evolução é recalculada de forma pura e limitada (≤ 100 partidas, < 1 ms) com `cs2.evolution.v1` e a chave de método por métrica.

## C2 — Plano (definições, fórmulas, versões)

- **`cs2.economy.v1`** (`src/lib/rounds/economy.ts`): compra da equipe pela regra acima, faixas proporcionais com equipe < 5 (marcada `*`); pistol por reset; sem gasto registrado → `UNKNOWN(SPEND_NOT_RECORDED)`, nunca eco; um valor ausente → `UNKNOWN(VALUE_MISSING)` (sem soma parcial); compra do jogador (escala 1/5) separada da equipe; `mixed` quando o rótulo do jogador difere do da equipe.
- **`cs2.rounds.v1`** (`src/lib/rounds/roundImpact.ts`):
  - round inválido: sem limites (`ROUND_BOUNDARY`), roster incompleto (`ROSTER`), abate sem tick ou vítima fora do roster (`KILL_DATA`); lado do jogador desconhecido → fora da análise do jogador (`NO_SIDE`);
  - abertura: primeira morte por tick único; empate no tick → `AMBIGUOUS`; mundo/suicídio = morte de abertura sem abate;
  - trocas: janela de 5 s (reuso), só entre inimigos; teamkill nunca é trocado;
  - vivos: estado inicial pelo roster; mortes do mesmo tick aplicadas juntas; nunca negativo (vítima fora do roster invalida o round);
  - vantagem numérica: `held`/`disadvantage` (estado inicial incluído); round com desconexão → `NOT_MEASURED`;
  - clutch: último vivo contra N ≥ 1; vencido = round vencido **e** sobreviveu; separado por 1vN;
  - pós-plant/retake: só com evento de plant real; vivos no tick do plant; defuse/explosão;
  - plant/defuse: autoria pelo ator do evento;
  - sobrevivência: denominador = rounds válidos, lado conhecido e sem desconexão do jogador;
  - overtime: round ≥ 25 quando a partida passa de 24.
- **`cs2.evolution.v1`** (`src/lib/evolution/evolution.ts`): janelas 5/10/20/50 (COMPLETE / PARTIAL ≥ 3 / INSUFFICIENT_SAMPLE), Σnum/Σden, rating como média por partida declarada, consistência descritiva (mediana, IQR, DP, CV) com ≥ 5 partidas e sem rótulo, comparação janela recente × anterior com ≥ 3 partidas por lado e mesmo método, Δ% só com anterior ≠ 0, filtros mapa/lado (lado só para rating), arma NOT_MEASURED.
- **Migrations:** nenhuma de schema. Só o re-pin forward-only R5.8.31 (identidade do worker).
- **Rollback:** reverter os merges (leituras puras); worker → `3335c88d` + `docs/reference/r5_8_31/rollback.sql` + secrets R5.8.30.

## C3 — Implementação

| PR   | Conteúdo                                                                                                         | Situação                       |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| #319 | Parser R5.8.31: `money_spent` e `disconnected` no `round_end`; `raw_evidence.py`; catálogo de campos; normalizer | merged `0c646583`              |
| #321 | Re-pin R5.8.31 (migration `20261117235000`, spec, rollback, testes, probes, paridade, rastreabilidade)           | merged `00977821`              |
| #320 | Módulos E/F: motores, leitura `getMatchRounds`, página `/rounds`, i18n ×5, matriz 4.2.7                          | merged `1b4bd82f`              |
| #322 | Módulo G: motor, leitura `getEvolution`, página `/evolution`, card DNA (leitura pura), i18n ×5, matriz 4.2.8     | aberto (CI)                    |
| #323 | Coach (regras 27/28, `latestMatchRounds`, `evolution`) + E2E `/rounds` e `/evolution`                            | branch pronta (abre após #322) |

## C4 — Validação

- **Testes:** motores E/F 38, UI rounds 16, motor G 25, UI evolução 12, Coach 7, matriz 16; suíte web 2698 passaram (a única falha local exige `initdb` e roda no CI); scripts 406; worker 992.
- **Demos reais (local, parser R5.8.31):**
  - HLTV FURIA × Vitality (Dust2): K/D do motor 20/12 = verdade; 23/23 rounds válidos; pistols 1 e 13; gasto em 230/230 player-rounds.
  - FACEIT Nuke: 26/15 contra 31/16 — diferença explicada pelas exclusões exibidas (round 1 `KILL_DATA`, round 9 sem lado, 3 rounds com desconexão → vantagem `NOT_MEASURED`); gasto em 240/240; RAW audit PASS, 0 campos não mapeados, HOT 5,46 MB.
- **Segurança:** leituras com a sessão do jogador (RLS); IDOR → `NOT_FOUND` (testado na UI e no E2E A↔B); schema de entrada estrito; nenhuma identidade de outro jogador no payload/DOM; DNA na evolução lido pela leitura pura (regra arquitetural do Fase 2.1 preservada).
- **Performance (local, Node 22):** `buildRoundReports + summarizeRounds` 0,98 ms (Nuke, 181 abates) e 0,70 ms (FURIA); payload `/rounds` ≈ 55 KB; `buildEvolution` 100 partidas/janela 50 = 0,31 ms, payload ≈ 53 KB. Leitura `/rounds`: 6 consultas paralelas, paginadas (1000), teto de 20 000 linhas.
- **i18n:** 78 chaves de rounds e 67 de evolução nos 5 idiomas (mesmas chaves, tipadas).

## C5 — Release e produção (em andamento)

### Worker R5.8.31 — VALIDADO EM PRODUÇÃO

1. Fila ociosa antes da release (`demo_jobs`: só `processed`, `failed`, `cancelled`, `blocked_raw_audit`).
2. Merge do #319 (`0c646583`) com o Source fixado em `768646ea` e o freeze de watch patterns: nada implantou.
3. `PARSER_REVISION` / `PARSER_BUILD_REVISION` = `git:0c646583…` com deploys pulados.
4. `connect-service-source` para `0c646583`: o deployment `90e6a5d5` criado pela troca ficou **SKIPPED** (freeze).
5. Exatamente um deployment disparado pelo agente Railway: `584ea563`, **SUCCESS** (23:48:09Z). Único build da release.
6. `/version` nos dois hosts (`parser.gamepro.network` e `cs2-demo-parser-production.up.railway.app`, 23:58Z): demoparser2 0.42.2; revision = semantic = build = `git:0c646583…`; `build.commit` `0c646583…`; `embedded` true; `source` railway; `declared_revision_matches` true.

### Banco — VALIDADO EM PRODUÇÃO

- Dry run da migration `20261117235000` em produção: `R5_8_31_DRY_RUN_OK_ROLLED_BACK` (todas as checagens passaram, nada persistido).
- Aplicada após o merge do #321 (`00977821`): recorder `b46f6701…` → `515f433f…`; assertion `95dc9e5f…` → `e35c5ff8…`; workflow boundary `f74d8af9…` inalterado (md5 conferidos por SELECT).
- Registrada em `supabase_migrations.schema_migrations` (`20261117235000`, `direct-main-00977821-20261117235000`, md5 do arquivo `43f237b0…`).
- Nenhuma migration de schema no PM4.

### App

- Publicação de `1b4bd82f` (E/F + re-pin) pelo deploy do Lovable (`f4296545`); `/rounds` servido em https://gamepro.network (estado EMPTY renderizado para a sessão do navegador usado, que não tem partidas). VALIDADO EM PRODUÇÃO (rota e estado vazio).
- Attestation do runtime: run 44207480424 **falhou** antes da publicação (o servidor publicado ainda tinha os pins R5.8.30: `PINNED_IDENTITY_MISMATCH`, `CRITICAL_HASH_MISMATCH` em `parser.py` e `raw_evidence.py`) — esperado; após a publicação, run 44207611056 **success**.

### Pendente

- **MANUAL_REQUIRED (dono):** atualizar os 3 secrets do app para `0c646583…` (`DEMO_PARSER_EXPECTED_REVISION`, `DEMO_PARSER_EXPECTED_BUILD_REVISION`, `H3E91_EXPECTED_WORKER_BUILD_COMMIT`). Até lá, a verificação de identidade do parser falha fechada para uploads novos.
- H.3-E e E2E após os secrets; publicação de G e do Coach; demo nova da conta A para provar `money_spent`/`disconnected` em produção.
