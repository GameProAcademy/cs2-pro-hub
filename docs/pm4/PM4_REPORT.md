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

| PR   | Conteúdo                                                                                                         | Situação          |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| #319 | Parser R5.8.31: `money_spent` e `disconnected` no `round_end`; `raw_evidence.py`; catálogo de campos; normalizer | merged `0c646583` |
| #323 | Docs PM4 intermediário (checkpoint, C0–C5 parcial)                                                               | merged `f1cb9e8e` |
| #321 | Re-pin R5.8.31 (migration `20261117235000`, spec, rollback, testes, probes, paridade, rastreabilidade)           | merged `00977821` |
| #320 | Módulos E/F: motores, leitura `getMatchRounds`, página `/rounds`, i18n ×5, matriz 4.2.7                          | merged `1b4bd82f` |
| #322 | Módulo G: motor, leitura `getEvolution`, página `/evolution`, card DNA (leitura pura), i18n ×5, matriz 4.2.8     | merged `44a128d4` |
| #324 | Coach (regras 27/28, `latestMatchRounds`, `evolution`) + E2E `/rounds` e `/evolution`                            | merged `0ed38db7` |

## C4 — Validação

- **Testes:** motores E/F 38, UI rounds 16, motor G 25, UI evolução 12, Coach 7, matriz 16; suíte web 2698 passaram (a única falha local exige `initdb` e roda no CI); scripts 406; worker 992.
- **Demos reais (local, parser R5.8.31):**
  - HLTV FURIA × Vitality (Dust2): K/D do motor 20/12 = verdade; 23/23 rounds válidos; pistols 1 e 13; gasto em 230/230 player-rounds.
  - FACEIT Nuke: 26/15 contra 31/16 — diferença explicada pelas exclusões exibidas (round 1 `KILL_DATA`, round 9 sem lado, 3 rounds com desconexão → vantagem `NOT_MEASURED`); gasto em 240/240; RAW audit PASS, 0 campos não mapeados, HOT 5,46 MB.
- **Segurança:** leituras com a sessão do jogador (RLS); IDOR → `NOT_FOUND` (testado na UI e no E2E A↔B); schema de entrada estrito; nenhuma identidade de outro jogador no payload/DOM; DNA na evolução lido pela leitura pura (regra arquitetural do Fase 2.1 preservada).
- **Performance (local, Node 22):** `buildRoundReports + summarizeRounds` 0,98 ms (Nuke, 181 abates) e 0,70 ms (FURIA); payload `/rounds` ≈ 55 KB; `buildEvolution` 100 partidas/janela 50 = 0,31 ms, payload ≈ 53 KB. Leitura `/rounds`: 6 consultas paralelas, paginadas (1000), teto de 20 000 linhas.
- **i18n:** 78 chaves de rounds e 67 de evolução nos 5 idiomas (mesmas chaves, tipadas).

## C5 — Release e produção

### Worker R5.8.31 — VALIDADO EM PRODUÇÃO

1. Fila ociosa antes da release (`demo_jobs`: só `processed`, `failed`, `cancelled`, `blocked_raw_audit`).
2. Merge do #319 (`0c646583`) com o Source fixado em `768646ea` e o freeze de watch patterns: nada implantou.
3. `PARSER_REVISION` / `PARSER_BUILD_REVISION` = `git:0c646583…` com deploys pulados.
4. `connect-service-source` para `0c646583`: o deployment `90e6a5d5` criado pela troca ficou **SKIPPED** (freeze).
5. Exatamente um deployment disparado pelo agente Railway: `584ea563`, **SUCCESS** (23:48:09Z). Único build da release.
6. `/version` nos dois hosts (23:58Z): demoparser2 0.42.2; revision = semantic = build = `git:0c646583…`; `build.commit` `0c646583…`; `embedded` true; `source` railway; `declared_revision_matches` true.

### Banco — VALIDADO EM PRODUÇÃO

- Dry run da migration `20261117235000`: `R5_8_31_DRY_RUN_OK_ROLLED_BACK`.
- Aplicada após o merge do #321 (`00977821`): recorder `b46f6701…` → `515f433f…`; assertion `95dc9e5f…` → `e35c5ff8…`; workflow boundary `f74d8af9…` inalterado (md5 conferidos por SELECT).
- Registrada em `supabase_migrations.schema_migrations` (`20261117235000`, `direct-main-00977821-20261117235000`, md5 do arquivo `43f237b0…`).
- Nenhuma migration de schema no PM4.

### Secrets do app — VALIDADO EM PRODUÇÃO

- O dono alterou `DEMO_PARSER_EXPECTED_REVISION`, `DEMO_PARSER_EXPECTED_BUILD_REVISION` e `H3E91_EXPECTED_WORKER_BUILD_COMMIT` para `0c646583…` (21:26 BRT). Nenhum valor de secret foi lido, copiado ou registrado.

### App — VALIDADO EM PRODUÇÃO

| Publicação (deploy Lovable) | Commit     | Conteúdo                         |
| --------------------------- | ---------- | -------------------------------- |
| `f4296545`                  | `1b4bd82f` | E/F (`/rounds`) + pins R5.8.31   |
| `e5d595c2`                  | `1b4bd82f` | republicação após os secrets     |
| `63f65f71`                  | `f1cb9e8e` | + G (`/evolution`) + Coach + E2E |

- `/rounds` e `/evolution` servidos em https://gamepro.network (navegador embutido; a sessão usada não tem partidas, estado `EMPTY` renderizado).

### Gates

| Gate                                     | Commit     | Run                                     | Resultado                                                                                      |
| ---------------------------------------- | ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Parser runtime attestation               | `1b4bd82f` | 44207480424 → 44207611056               | falhou antes da publicação (servidor ainda com pins R5.8.30); **success** após a publicação    |
| H.3-E                                    | `1b4bd82f` | 44210630121                             | **PASS** (todas as etapas; tentativas anteriores falharam enquanto os gates da `main` rodavam) |
| Quality Gates / Queue Semantics / R5.8.3 | `f1cb9e8e` | 44214683915 / 44214683954 / 44214684067 | success                                                                                        |
| H.3-E                                    | `f1cb9e8e` | 44218097807                             | **PASS** (44214769998 e 44216786821 falharam enquanto F553/Quality Gates estavam em curso)     |
| E2E de produção                          | `f1cb9e8e` | 44215050582                             | **12/12** (contas A e B com `/rounds` e `/evolution`; isolamento A→B e B→A; formulários)       |

O resumo por etapa do E2E fica no artefato do run (download bloqueado neste ambiente); o run só passa se todas as asserções passarem, incluindo `NOT_FOUND` para partida aleatória e para a partida da outra conta em `/rounds`, ausência da partida da outra conta na listagem e nos drill-downs de `/evolution`, e ausência de SteamID no DOM. O teste aceita `/rounds` em `OK` ou `NO_PARTICIPANT`; qual dos dois ocorreu não está no log público.

### Demo nova (conta A) — VALIDADO EM PRODUÇÃO

- Job `ffb11205`, parser `git:0c646583…`, partida `daef42da`: FACEIT de Nuke, 24 rounds válidos, 181 abates, `MATCH_COMPLETED`.
- `round_end`: 24/24 com `money_spent`, 240 entradas jogador-round, total 676 050; `disconnected` nos rounds 5, 8 e 17.
- **Paridade exata com o parse local** do mesmo arquivo (mesmo SHA-256): total, gasto por round nos 24 rounds, rounds com desconexão e número de abates. Diferença registrada: `round_players` 240 em produção × 238 no despejo local de validação (o despejo descarta linhas sem lado; não é diferença do banco — hipótese, não verificada linha a linha).
- Pelo motor `cs2.rounds.v1` sobre os mesmos dados (local): round 1 `KILL_DATA`, round 9 sem lado do jogador, 3 rounds com vantagem `NOT_MEASURED` — a página mostra essas exclusões.

## C6 — Fechamento

### 1. Resumo executivo

Fases 4.2.7 e 4.2.8 entregues em produção: economia classificada só com gasto registrado (parser R5.8.31), impacto por round com regras versionadas, separação equipe × jogador, timeline com replay; evolução em janelas com N real, taxas por numerador/denominador, consistência descritiva, comparação só entre métodos compatíveis, card do DNA pelo snapshot; Coach com o mesmo contexto e regras contra causalidade e falsa evolução. Worker, banco, app, attestation, H.3-E e E2E verdes no SHA exato.

### 2. Baseline e prompts anteriores

Ver C0. PM1, PM6, PM2 e PM3 preservados; regressão coberta pela suíte web (2698), worker (992), scripts (406) e E2E 12/12.

### 3. Fase 4.2.7 — liberadas e bloqueadas

| Métrica                                          | Estado                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Compra da equipe / do jogador (`cs2.economy.v1`) | VALIDADO EM PRODUÇÃO para partidas R5.8.31+; partidas antigas: compra NOT_MEASURED (sem backfill)             |
| Equipamento antes da compra                      | VALIDADO EM PRODUÇÃO (oculto no pistol)                                                                       |
| Abertura (equipe e jogador)                      | VALIDADO EM TESTE / publicado                                                                                 |
| Trocas (feitas e sofridas)                       | VALIDADO EM TESTE / publicado (janela 5 s reutilizada)                                                        |
| Vantagem numérica / desvantagem                  | VALIDADO EM TESTE / publicado; NOT_MEASURED em round com desconexão; partidas antigas não detectam desconexão |
| Clutch 1vN                                       | VALIDADO EM TESTE / publicado                                                                                 |
| Pós-plant / retake                               | VALIDADO EM TESTE / publicado                                                                                 |
| Plant / defuse com autoria                       | VALIDADO EM TESTE / publicado                                                                                 |
| Sobrevivência                                    | VALIDADO EM TESTE / publicado                                                                                 |
| Armadura, capacete, kit, granadas compradas      | NOT_MEASURED (não necessários para a regra; props existem no parser)                                          |
| Score composto de impacto                        | NÃO APLICÁVEL (não criado de propósito; métricas base transparentes)                                          |

### 4. Fase 4.2.8 — liberadas e bloqueadas

| Item                                | Estado                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Janelas 5/10/20/50 com N real       | VALIDADO EM TESTE / publicado; PARTIAL em produção (≤ 5 partidas por jogador)                                        |
| Agregação por numerador/denominador | VALIDADO EM TESTE / publicado                                                                                        |
| Consistência (mediana, IQR, DP, CV) | VALIDADO EM TESTE / publicado; exige 5 partidas                                                                      |
| Comparação recente × anterior       | VALIDADO EM TESTE / publicado; exige 3 + 3 partidas e mesmo método                                                   |
| Filtro de mapa                      | VALIDADO EM TESTE / publicado                                                                                        |
| Filtro de lado                      | PARTIAL: só o rating                                                                                                 |
| Filtro de arma                      | NOT_MEASURED (sem split por arma no histórico)                                                                       |
| Snapshots                           | reuso: `match_metrics` imutável por partida + `player_dna_snapshots` (idempotente, versionado); nenhum pipeline novo |
| Player DNA integrado                | VALIDADO EM TESTE / publicado (estado READY/INSUFFICIENT_SAMPLE pela leitura pura)                                   |

### 5. Módulos

- **E (economia):** inventário (C1), classificação, timeline econômica por round, jogador × equipe.
- **F (impacto):** abertura, trocas, vantagem, clutch, retake, plant/defuse, sobrevivência, timeline com replay.
- **G (evolução):** janelas, comparação, compatibilidade, consistência, DNA.
- **J (parte histórico/DNA):** integrada a G; comparativos Pro ficam no PM5.

### 6. Oito funcionalidades competitivas (parte deste pacote)

1. **Onde estou perdendo rounds?** — taxas da equipe por compra e por situação com N, separadas da contribuição individual; sem causa. Entregue.
2. **Posicionamento × profissionais** — só preparação: filtros por mapa/lado; nenhum benchmark importado. PM5.
3. **Pior hábito** — dados de recorrência (abertura, trocas, clutch, sobrevivência por partida e janela); nenhum "hábito" afirmado com uma ocorrência. Parcial (base pronta).
4. **Como eu deveria ter jogado?** — contexto econômico e de round por round; nenhuma recomendação de compra. Parcial.
5. **Comparação entre versões de mim** — janelas e comparação com método compatível. Entregue.
6. **Mapa de oportunidades perdidas** — drill-down round → replay 2D e evolução → rounds. Parcial.
7. **AI Coach com evidências** — `latestMatchRounds` + `evolution` com versão, N e cobertura; regras 27/28. Entregue (sem conversa real validada).
8. **Revisão mensal** — base: relatório puro de evolução recalculável por janela; nenhum scheduler. Preparado.

### 7. Regras, fórmulas e versões

`cs2.economy.v1`, `cs2.rounds.v1`, `cs2.evolution.v1`, `coach-rounds-evolution-v1` (C2). Matriz de release atualizada (`src/lib/metrics/metricContract.ts`).

### 8. Campos reais utilizados

`match_rounds` (limites, vencedor, motivo); `round_players` (lado, `money_start`, `equipment_value`); `round_events` (`kill`, `damage`, `bomb_plant`, `bomb_defuse`, `bomb_explode`, `round_end.data.money_spent`, `round_end.data.disconnected`); `match_metrics`; `match_flash_assist_provenance`; `player_dna_snapshots`.

### 9. Não suportadas e motivo

Armadura/kit/granadas compradas (não persistidos; desnecessários à regra); split por arma e por lado no histórico (não persistido por partida); desconexão em partidas pré-R5.8.31 (não registrada); compra em partidas pré-R5.8.31 (sem gasto; sem backfill autorizado); crosshair/counter-strafe/recoil (PM3, NOT_MEASURED).

### 10–12. PRs, banco, workflows

PRs #319, #321, #320, #322, #323, #324 (C3). Migration `20261117235000` (C5). Gates e E2E com run ids em C5.

### 13. RLS e ownership

Todas as leituras novas usam a sessão do jogador (`requireSupabaseAuth`) e as policies existentes (`round_events_select_own`, `match_metrics_select_own`, `round_players`, `match_rounds`); nenhuma service role; IDOR → `NOT_FOUND`; schemas de entrada estritos; E2E A↔B verde; nenhuma identidade de terceiro no payload, DOM ou Coach.

### 14. Performance e custo

Motor de rounds < 1 ms por partida; evolução 0,31 ms para 100 partidas; payloads ≈ 55 KB e ≈ 53 KB; `/rounds` faz 6 leituras paralelas paginadas (teto 20 000 linhas); evolução sem leitura nova (reusa o overview). Armazenamento: `round_end` ganhou ≈ 10 números por round. Sem backfill, sem custo de reprocessamento.

### 15–16. Deploy e identidade

Ver C5: worker `584ea563` / `0c646583`; app publicado em `f1cb9e8e`; attestation e H.3-E PASS.

### 17. Problemas e causas raiz

- Attestation 44207480424 falhou: o servidor publicado ainda carregava os pins R5.8.30 → publicação antes da attestation (procedimento correto: publicar, depois atestar).
- H.3-E falha na primeira avaliação de cada commit enquanto Quality Gates/F553 ainda rodam (padrão conhecido) → reavaliação automática PASS.
- O card de DNA da evolução usava a leitura que pode atualizar snapshot; a regra arquitetural do Fase 2.1 bloqueou no teste → trocado pela leitura pura `getDnaSummary`.

### 18. Ações manuais

Concluídas: troca dos 3 secrets; demo nova da conta A. Opcional: fazer uma pergunta ao Coach sobre economia e evolução na conta A para observar as regras 27/28 em uma conversa real (não validado por mim, pois não faço login com senha).

### 19. Riscos residuais e rollback

- Amostra pequena em produção: evolução quase sempre PARTIAL até haver ≥ 10 partidas por jogador.
- Partidas anteriores ao R5.8.31 sem compra classificada (explicado na UI); reprocessar exigiria autorização específica.
- Faixas de compra calibradas em CS:GO profissional (Xenopoulos et al.); valores de CS2 iguais em preço-base, mas a calibração não foi revalidada em CS2 — declarado como fonte.
- Rollback: reverter #324/#322/#320 (leituras puras); worker → `3335c88d` + `docs/reference/r5_8_31/rollback.sql` + secrets R5.8.30.

### 20. Lovable

Nenhum prompt, mensagem ou instrução foi enviado ao agente Lovable. O Lovable foi usado apenas para consulta (`get_project`, `list_edits`, `query_database`) e publicação (`deploy_project`).

### 21. Recomendação para o PM5

- Comparativos Pro (4.2.10) só com dataset licenciado e coorte declarada; reaproveitar `cs2.evolution.v1` (mesmas fórmulas e chaves de método) para garantir comparabilidade.
- Treino adaptativo (4.2.9): usar as janelas e as comparações com status OK como baseline/meta; nunca afirmar causalidade do treino.
- Biblioteca de momentos: partir da timeline `cs2.rounds.v1` (round/tick) e dos deep links de replay já existentes.
- Persistir snapshots mensais de evolução só se a revisão mensal for implementada, com `input_digest` no mesmo padrão do DNA.
