# PM6 — Baseline, pesquisa externa e matriz de compatibilidade (PR A)

Sessão de 2026-11-13. Depende de `docs/pm6/PM6_POST_PM1_RECONCILIATION.md`. Benchmark externo em
`docs/reference/CS_DEMO_MANAGER_BENCHMARK.md`. Corpus em `docs/reference/compatibility/corpus_manifest.json`.

Rótulos:

- **CONFIRMADO EM CÓDIGO**: lido no código ou na configuração;
- **VALIDADO EM TESTE**: execução local em sandbox, com o código do worker em `main` (`e2d2bdd6`, worker `c3593d48`)
  e demoparser2 0.42.2;
- **VALIDADO EM PRODUÇÃO**;
- **HIPÓTESE**;
- **LIMITAÇÃO**;
- **NÃO TESTADO**.

Nenhuma demo deste documento foi enviada para produção nem para serviço externo. As análises são de formato e
capacidades: não há estatística individual de jogador.

## 1. Baseline

| Item                     | Valor                                                                                                                                                                                                                                                                   | Rótulo                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `main`                   | `e2d2bdd6`                                                                                                                                                                                                                                                              | CONFIRMADO                         |
| Worker em produção       | Railway `d57b9089`, commit `c3593d48`, `/version` 0.42.2 (reconciliação §B)                                                                                                                                                                                             | VALIDADO EM PRODUÇÃO               |
| Imagem                   | `python:3.12-slim`, x86_64; `requirements.txt`: fastapi 0.115.6, uvicorn 0.34.0, httpx 0.28.1, **demoparser2 0.42.2**                                                                                                                                                   | CONFIRMADO EM CÓDIGO               |
| Dependências transitivas | **Sem versão fixa**. O build de 2026-11-13 resolveu pandas 3.1.1, numpy 2.5.4, polars 2.1.0, pyarrow 26.0.1 (build log)                                                                                                                                                 | LIMITAÇÃO (risco 13 do checkpoint) |
| Sandbox desta sessão     | Python 3.13, venv com demoparser2 0.42.2 (mesmas transitivas do build)                                                                                                                                                                                                  | —                                  |
| Fluxo                    | upload → `reserve_demo_upload` (SHA-256) → fila durável → worker `/v1/parse` → `validate_demo_structure` → `parse_demo_file` (demoparser2) → `prepare_evidence` / gates RAW → contrato bruto → adapter/normalizer (app) → `persist_canonical_observation` → read models | CONFIRMADO EM CÓDIGO               |
| Governança de campos     | Todo campo/evento devolvido precisa de classe (CANONICAL, RAW_ONLY, IGNORED_APPROVED). Um campo UNMAPPED bloqueia `RAW-EVIDENCE-01` (`docs/PARSER_FIELD_GOVERNANCE.md`)                                                                                                 | CONFIRMADO EM CÓDIGO               |
| Limitações vigentes      | L01 (superfície não enumerável), L02 (domínio de ticks), L03 (usercmd), L04 (resultado) — `docs/ADMISSION_CONTRACT_V3.md`                                                                                                                                               | CONFIRMADO                         |
| Corpus antes do PM6      | 1 fixture pública (Valve 2024) no CI + 2 demos BLAST autorizadas (benchmarks R5.8.24/25)                                                                                                                                                                                | CONFIRMADO                         |

## 2. Pesquisa externa — demoparser2

Repositório `LaihoE/demoparser`, clonado em 2026-11-13. A tag `v0.42.2` é o `HEAD` (`dd71c09`, 2026-11-12).

### 2.1 Correções entre 0.42.0 e 0.42.2

| Commit           | Data       | Mudança                                                                                                       | Relevância                                                             | Presente em 0.42.2 |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| `4ba136a` (#375) | 2026-11-12 | **Decode the fixed8 encoder (CS2 build 14197)**: campos de 8 bits são 1 byte cru, não varint                  | **Causa raiz real** da quebra das demos atuais. Ver a correção da §2.3 | sim                |
| `451321a` (#363) | 2026-10-06 | Decodifica handles de entidade de 14 bits                                                                     | Identidade de entidades                                                | sim                |
| `5ab2ab4` (#364) | 2026-10-06 | UTF-8 inválido em strings de game event: decodificação com perda só quando o protobuf falha, limitada a 1 MiB | PM6 §6.3                                                               | sim                |
| `57f24c7` (#351) | 2026-08-25 | Evita panic quando o número de chaves de um game event não bate                                               | Robustez                                                               | sim                |
| `266a831` (#346) | 2026-08-10 | Expõe `usercmd_subtick_moves`                                                                                 | PM6 §6.2                                                               | sim                |
| `fb12f06` (#352) | 2026-09-01 | Corrige deltas repetidos esparsos de UserCmd                                                                  | `delta_data`                                                           | sim                |
| `2d0f3b3` (#354) | 2026-09-04 | Decodifica estados de botões do UserCmd                                                                       | buttons                                                                | sim                |
| `67c4cca` (#353) | 2026-09-03 | Mantém o filtro de ticks quando props de velocidade são combinadas com eventos                                | Amostragem                                                             | sim                |
| `ea9a82b` (#370) | 2026-11-06 | `parse_weapons` (armas no chão)                                                                               | Revisada como RAW only (R5.8.25)                                       | sim                |
| `b8278b9` (#372) | 2026-11-08 | Corrige o lookup de `stamina` e a grafia de `duck_override`                                                   | O campo `stamina` apareceu nas amostras de tick                        | sim                |

### 2.2 Issues abertas relevantes (2026-11-13)

| Issue      | Tema                                                                                                 | Família     | Reproduzido no CS2 PRO?                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #330       | `UnknownDemoCmd(34)` em demos FACEIT depois de um patch                                              | FACEIT      | **Não**: a demo FACEIT de 2026 (patch 14196) abre e lê até o fim em 0.42.2                                                                                                                                                                        |
| #367       | `MalformedMessage` por string não UTF-8 em game event (FACEIT CS2)                                   | FACEIT      | **Não** nesta fixture. #364 trata o caso (lossy fallback); sem fixture que reproduza                                                                                                                                                              |
| #365       | Atualizações de string table depois do primeiro FullPacket descartadas; entradas sem chave mal lidas | todas       | **Provável** na GC Cache: `parse_player_info` devolve 0 linhas com 10 jogadores presentes nos ticks (HIPÓTESE ligando à #365; o cruzamento com demoinfocs-golang v4.5.1 foi tentado, mas esse parser não lê as demos de 2026, ver benchmark §2.1) |
| #345       | `usercmd_subtick_moves` ausente em `parse_ticks` (0.42.0)                                            | —           | Não se aplica em 0.42.2: a coluna existe e traz listas de 0 a 4 entradas (FACEIT/GC/BLAST)                                                                                                                                                        |
| #358       | Bots não resolvidos em eventos/ticks                                                                 | —           | Sem fixture com bots: NÃO TESTADO                                                                                                                                                                                                                 |
| #329, #302 | POV: `IllegalPathOp` / parte do parser `None`                                                        | POV         | Sem fixture POV: NÃO TESTADO                                                                                                                                                                                                                      |
| #321, #339 | `EntityNotFound` (patches 14152 e 14165)                                                             | Valve/PRACC | Sintoma igual ao das demos de 2026 em 0.42.0. Corrigido para o build 14197 pela #375; outros builds: NÃO TESTADO                                                                                                                                  |
| #359       | `IllegalPathOp` em GOTV de deathmatch                                                                | DM          | NÃO TESTADO                                                                                                                                                                                                                                       |

### 2.3 Correção de registro (R5.8.25)

O documento `docs/reference/R5_8_25_DEMOPARSER2_0422.md` citou as issues #321/#339 como referência do `EntityNotFound`. O
changelog upstream mostra que a correção efetiva na 0.42.2 é o decodificador **fixed8 do build 14197**
(`4ba136a`, #375). As patches observadas no corpus são coerentes com isso: 14196 e 14197 nas demos de 2026 que a
0.42.0 não lia. O documento da R5.8.25 recebe uma nota de correção no mesmo PR.

## 3. Corpus e resultados

Seis fixtures, todas `PBDEMS2` / `valve_demo_2` / `fullpackets_version 2` / GUID `8e9d71ab-…`. O offset do
`CDemoFileInfo` no cabeçalho aponta para o fim de cada arquivo, e o parser lê até o fim: integridade
`COMPLETE_PROBABLE`.

| Fixture                       | Origem (base)                  | Patch | Eventos registrados | Pipeline CS2 PRO                                                  | Bloqueio                                                                                                    |
| ----------------------------- | ------------------------------ | ----- | ------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| valve-public-2024-mirage      | VALVE_PROBABLE (token "valve") | 13984 | 46                  | **APPROVED**; 10 rounds; 62/62 mortes com as duas posições        | —                                                                                                           |
| tournament-blast-2026-dust2-a | torneio (sem token)            | 14180 | 41                  | **APPROVED** (R5.8.25); 16 rounds; 100/100                        | —                                                                                                           |
| tournament-blast-2026-dust2-b | BLAST provável (token "blast") | 14197 | 43                  | **APPROVED**; produção job `aa968c9e`; 23 rounds; 142/142         | —                                                                                                           |
| faceit-2026-mirage            | FACEIT (declarada pelo dono)   | 14196 | 50                  | Parse OK; 28 rounds; 204/206 mortes com posição; **BLOCKED**      | `unmapped: show_survival_respawn_status.*`                                                                  |
| gamersclub-2026-mirage        | GamersClub (declarada)         | 14197 | 53                  | Parse OK; 34 rounds; 237/237; **BLOCKED**                         | `unmapped: player_chat.*`                                                                                   |
| gamersclub-2026-cache         | GamersClub (declarada)         | 14197 | 45                  | Parse OK; 11 rounds sem vencedor; 0 jogadores; 81/83; **BLOCKED** | `player_chat.*`, `PLAYER-COVERAGE`; warnings `round_end_unavailable`, `round_state_transitions_unavailable` |

Todos os resultados são VALIDADO EM TESTE (sandbox), exceto o da `-b`, que também é VALIDADO EM PRODUÇÃO.

### 3.1 Diferenças observadas por família (VALIDADO EM TESTE)

- **Eventos registrados**, a partir de `list_game_events`:
  - GOTV de torneio (BLAST) **não** registra `player_blind`, `weapon_reload`, `weapon_zoom`, `bomb_beginplant`,
    `bomb_begindefuse`, `player_footstep`, `item_equip`, `round_poststart`/`prestart`, `buytime_ended` nem
    `other_death`. A `-a` também não registra `round_officially_ended`.
  - FACEIT e GamersClub registram todos esses eventos.
  - **Consequência:** métricas que dependem de `player_blind` (flash/cegueira) são `NOT_PRESENT_IN_DEMO` nessas
    demos de torneio, e não zero.
- **Eventos só de uma família:**
  - FACEIT: `show_survival_respawn_status`, um overlay de HUD. As 4.611 linhas trazem o mesmo `loc_token`, um
    `<img>` de `distribution.faceit-cdn.net`, duração 5 e `user_*` sempre nulo. É um sinal técnico de origem
    FACEIT, independente do hostname.
  - GamersClub: `player_chat`, que espelha `chat_message` um para um e acrescenta `teamonly`, mais `addons`
    `3522005620` no header das duas fixtures.
  - BLAST: `vote_cast`, `server_message`, `player_ping`, `entity_killed` e `grenade_thrown`.
- **`round_start`/`round_end`** quase nunca aparecem em `list_game_events`, mas `parse_event` devolve linhas para
  eles: o parser os reconstrói. A pipeline já trata rounds a partir do estado do jogo
  (`round_boundaries_observed_from_game_state`).
- **Lifecycle:**
  - FACEIT e GamersClub emitem `round_officially_ended` 2× por tick (FACEIT 54 linhas / 27 ticks duplicados;
    GC Mirage 69/34; GC Cache 23/11). BLAST e Valve não duplicam.
  - GamersClub: 4 `begin_new_match` e um round 1 completo seguido de reset (`total_rounds_played` 1 → 0). A
    pipeline anula esse round (`rounds_voided_by_match_reset`); a FACEIT também tem 1 round anulado.
  - GamersClub: nenhum `cs_win_panel_match`, com Cache e Mirage terminadas sem o painel de fim de partida.
- **Formato:** no `round_end` da Valve de 2024, `winner` e `reason` vêm **como inteiros** (2/3; 9, 7…). Nas
  demos de 2026 vêm como texto (`"CT"`/`"T"`, `"t_killed"`…). O normalizer precisa aceitar as duas gerações;
  hoje a Valve de 2024 é APPROVED.
- **Usercmd** (nos ticks de morte; listas vazias não contam como conteúdo):

  | Fixture    | Ticks com conteúdo   | `subtick_moves` (entradas por linha) | `input_history` (entradas por linha) |
  | ---------- | -------------------- | ------------------------------------ | ------------------------------------ |
  | FACEIT     | 366/400              | 0–4                                  | 0–4                                  |
  | GC Mirage  | 326/379              | 0–3                                  | 0–4                                  |
  | GC Cache   | 362/394              | 0–2                                  | 0–4                                  |
  | BLAST-b    | 382/400              | 0–3                                  | 0–4                                  |
  | Valve 2024 | colunas **ausentes** | —                                    | —                                    |

  O usercmd está **presente** nessas gerações. Continua sem auditoria e sem métrica (L03). Desbloquear exige
  decisão formal com provas (PM6 §15).

- **Header:** nenhuma fixture expõe tickrate, `playback_ticks` ou `network_protocol` pelo `parse_header`
  (LIMITAÇÃO; a pipeline avisa `tickrate_unavailable` e não deriva durações).

### 3.2 Performance (sandbox, parse completo da pipeline)

| Fixture           | Tamanho  | Tempo   | RSS de pico |
| ----------------- | -------- | ------- | ----------- |
| valve-public-2024 | 60,6 MB  | 19,9 s  | 1,0 GB      |
| gamersclub-cache  | 112,2 MB | 35,3 s  | 1,3 GB      |
| blast-a (R5.8.25) | 311,0 MB | 106,9 s | 3,35 GB     |
| faceit            | 362,2 MB | 184,6 s | 3,5 GB      |
| gamersclub-mirage | 390,8 MB | 178,8 s | **4,8 GB**  |

Produção: limite de 8 GB por container, e o job `aa968c9e` (358 MB) levou cerca de 16 minutos de ponta a ponta,
incluindo 107 chunks de RAW. **Risco:** demos maiores de GC com overtime longo se aproximam do limite de memória. É
preciso medir no PR G antes de mudar limites.

## 4. Matriz de compatibilidade (estado em 2026-11-13)

| Origem             |             Fixtures | Parsing | Eventos                                                             | Usercmd/subtick       | Capabilities                                                                  | Estado                                                                |
| ------------------ | -------------------: | ------- | ------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Valve/Premier      |        1 real (2024) | OK      | conjunto completo; `round_end` com inteiros                         | ausente nessa geração | APPROVED                                                                      | `SUPPORTED_AND_VALIDATED` (geração 2024); Premier 2026: `NOT_TESTED`  |
| FACEIT             |        1 real (2026) | OK      | completo + `show_survival_respawn_status`                           | presente              | auditoria RAW bloqueia (campo não revisado)                                   | `SUPPORTED_WITH_PARTIAL_COVERAGE` (bloqueio corrigível; 1 geração só) |
| GamersClub         |       2 reais (2026) | OK      | completo + `player_chat`; lifecycle com reinícios; sem painel final | presente              | Mirage: bloqueio por campo; Cache: também sem `player_info` e sem `round_end` | `SUPPORTED_WITH_PARTIAL_COVERAGE`                                     |
| Comunidade/privado |                    0 | —       | —                                                                   | —                     | —                                                                             | `NOT_TESTED`                                                          |
| Torneio/GOTV       | 2 reais (BLAST 2026) | OK      | sem `player_blind`/`reload`/`zoom`/`beginplant`                     | presente              | APPROVED; validada em produção                                                | `SUPPORTED_AND_VALIDATED` (BLAST 2026)                                |
| POV                |                    0 | —       | —                                                                   | —                     | —                                                                             | `NOT_TESTED`                                                          |

As metas de corpus do PM6 §4.2 (5 Valve, 10 FACEIT, 5 GC, 3 privados, 3 torneios, 2 POV, overtime, bots) **não
foram atingidas**. Lacunas declaradas: Valve/Premier 2026, FACEIT de outras gerações, servidores privados, POV,
bots. A FACEIT tem overtime (fases em 12/24/27) e a GC Mirage também (fases em 12/24/27/30/33).

## 4.1 Processo: o gate H.3-E compara a árvore do worker

O H.3-E falha com `WORKER_TREE_DIFFERS` quando a árvore `services/cs2-demo-parser` em `main` difere da do build
publicado (`scripts/ci/h3e_activation_gate.py`, `evaluate_runtime`). Consequências:

- documentação e corpus ficam **fora** dessa árvore, e por isso o manifesto está em `docs/reference/compatibility/`;
- PRs que mudam o worker (como o PR F) só entram em `main` logo antes de um release completo, como nas R5.8.24/25.

## 5. Plano dos próximos PRs (ordem justificada pela evidência)

1. **PR F — campos (prioridade máxima).** Classificar `show_survival_respawn_status.*` e `player_chat.*` como
   `IGNORED_APPROVED`, com revisão em `parser_field_reviews.json`, regressão por campo e catálogo regenerado,
   seguindo o runbook de `PARSER_FIELD_GOVERNANCE.md`.
   - Sem isso, FACEIT e GamersClub reais são bloqueadas em produção.
   - Exige release controlado do worker (`raw_evidence.py` é blob atestado), re-pin e publicação do app **pelo
     dono**.
2. **PR F (cont.) — GC Cache.** Investigar o `PLAYER-COVERAGE` (0 linhas de `player_info`, hipótese da #365) e o
   `round_end_unavailable`. Não aprovar a demo afrouxando gates.
3. **PR B — harness.** Transformar `probe.py`, `probe2.py` e `pipeline.py` (scratch desta sessão) em ferramenta
   versionada em `services/cs2-demo-parser/compatibility/`, com validação de hash e saída sem identidades.
4. **PR D — tempo.** Tickrate de fonte real e `playback_ticks`. Sem fonte, continua `UNAVAILABLE`.
5. **PR E — capabilities.** Envelope por capacidade (`NOT_PRESENT_IN_DEMO` × `NOT_SUPPORTED_BY_PARSER`) dentro do
   contrato de métricas existente, e fingerprint de origem com sinais técnicos.
6. **PR G — performance.** Medir memória em demos maiores.
7. **PR H — release.** Gates, atestação, checkpoint e relatório final.
