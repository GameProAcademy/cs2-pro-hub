# PM6 C — Integridade da demo e encerramento da partida (`cs2.match-integrity.v1`)

Estado: **INTEGRADO AO FLUXO, VALIDADO EM TESTE** (PR de integração da etapa C). Validação em produção depende da release R5.8.27 (ver checkpoint).

## Política de elegibilidade

Uma demo só é elegível se a partida terminou oficialmente — normalmente ou por surrender — e tem pelo menos **9 rounds válidos efetivamente jogados**.

- O mínimo de 9 é a regra inicial do CS2 PRO, inspirada na política pública do SCOPE.GG para partidas encerradas por surrender. Não é uma regra da Valve.
- O valor fica em `MATCH_INTEGRITY_CONTRACT.minValidRounds` (`src/lib/pipeline/matchIntegrity.ts`).

| Estado                                | Elegível | Quando                                                                                             |
| ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `MATCH_COMPLETED`                     | sim      | fim oficial, ≥ 9 rounds válidos, cobertura de jogadores não insuficiente                           |
| `MATCH_SURRENDER_COMPLETED`           | sim      | último `round_end` com motivo `t_surrender`/`ct_surrender`, ≥ 9 rounds válidos                     |
| `MATCH_END_UNVERIFIED`                | não      | nenhum sinal oficial de fim (fim de arquivo não conta)                                             |
| `MATCH_FINAL_ROUND_INCOMPLETE`        | não      | último round sem fim ou sem vencedor (EOF no meio do round)                                        |
| `MATCH_INSUFFICIENT_ROUNDS`           | não      | menos de 9 rounds válidos, inclusive após surrender oficial                                        |
| `MATCH_LIFECYCLE_INCONSISTENT`        | não      | surrender ou fase "partida encerrada" antes do último round; painel de vitória contra a fase final |
| `MATCH_DEMO_TRUNCATED` / `_CORRUPTED` | não      | stream truncado ou demo ilegível                                                                   |
| `MATCH_PLAYER_COVERAGE_INSUFFICIENT`  | não      | inventário de jogadores insuficiente                                                               |

**Contagem de rounds válidos:**

- Entram só rounds não anulados, com início, fim e vencedor, e com fim ≥ início.
- Rounds anulados por reset (`begin_new_match`) ficam fora.
- Duplicatas são removidas, pelo mesmo tick de fim ou pelo mesmo número.
- Rounds não jogados depois de um surrender nunca existem na evidência e não são criados.

**Saída da decisão:**

- `validRounds` e os excluídos por motivo;
- sinais com confiabilidade (HIGH/MEDIUM/NONE) e motivos;
- a versão do contrato.

A decisão não contém dados pessoais.

## Hierarquia de sinais (medida no corpus, demoparser2 0.42.2)

O estado do jogo é lido **no tick do `round_end`**, com `parse_event(..., other=["game_phase"])`. Ler com `parse_ticks` depois do fim devolve valores defasados (fase 3 ou 2 com `total_rounds_played` anterior), por isso essa leitura não é usada.

| Demo (sha256)                | Rounds válidos           | `game_phase` no último `round_end` | `cs_win_panel_match` | Decisão                |
| ---------------------------- | ------------------------ | ---------------------------------- | -------------------- | ---------------------- |
| FACEIT `8425f49c`            | 28 (1 anulado por reset) | **5**                              | sim (após o fim)     | `MATCH_COMPLETED`      |
| GamersClub Mirage `1ef9baeb` | 34                       | **5**                              | **não**              | `MATCH_COMPLETED`      |
| GamersClub Cache `985f5b78`  | 11                       | **2** (em jogo)                    | não                  | `MATCH_END_UNVERIFIED` |
| BLAST `b5af62a7`             | 23                       | **5**                              | sim                  | `MATCH_COMPLETED`      |

Confiabilidade de cada sinal:

- `game_phase = 5` (GAMEPHASE_MATCH_ENDED) no último `round_end`: **HIGH**. Aparece em todas as partidas concluídas do corpus, inclusive nas GamersClub sem painel.
- Motivo `t_surrender`/`ct_surrender` (códigos 17/18 do CS, mapa `ROUND_WIN_REASON` do demoparser2): **HIGH**. Nenhuma demo do corpus tem surrender, então esse caminho está validado só com testes sintéticos.
- `cs_win_panel_match` no tick final ou depois: **MEDIUM**. Corrobora, mas não é requisito.
- Fim de arquivo: **NONE**.

O demoparser2 também expõe `team_surrendered` (`CCSTeam.m_bSurrendered`), sempre `false` no corpus. É candidato a sinal adicional quando houver uma demo de surrender.

**GamersClub Cache:** além de não ter `EndOfMatchAllPlayersData` (PLAYER-COVERAGE), a gravação termina sem nenhum sinal oficial de fim. Pelo gate novo, ela fica bloqueada por `MATCH_END_UNVERIFIED`, independentemente do inventário de jogadores.

## Testes

`src/lib/pipeline/__tests__/matchIntegrity.test.ts` tem 23 casos:

- os 15 cenários de integridade do PM6 §11;
- EOF sem sinal, cobertura insuficiente e demo corrompida;
- 4 formas reais do corpus, em contagens e códigos.

## Integração (implementada)

1. **Worker (`parser.py`)**: `_parse_round_end_game_phase` lê `round_end` com `other=["game_phase"]` numa chamada própria. Por isso as linhas RAW governadas não mudam: `parser_field_catalog.py check` e `generate-parser-field-matrix.py --check` dão PASS, e o digest de mapeamento continua o mesmo.
   - A leitura é tentada mesmo quando o inventário não anuncia `round_end`. FACEIT e GamersClub de 2026 não anunciam o evento, mas ele é legível.
   - Ilegível vira `None`, nunca uma lista vazia.
2. **Adapter (`adapter.py` `build_match_end_evidence`)** monta `match_end_evidence` (schema 1) a partir dos rounds normalizados:
   - por round, motivo e fase unidos pelo tick de fim;
   - ticks de `cs_win_panel_match`: `None` quando o evento é anunciado mas não lê, `[]` quando não é anunciado;
   - número de rounds anulados por reset.
   - Rounds observados pelo estado do jogo trazem `round_win_reason` numérico, convertido para o token do demoparser2 (17/18 → `t_surrender`/`ct_surrender`).
3. **HOT (`hot_payload.py`)** transporta o bloco com limite igual ao de `rounds` e sem identidade.
4. **App:**
   - `sanitizeMatchEndEvidence` em `hotToRawParserOutput` aceita só o formato documentado;
   - `matchEndEvidenceFromOutput` monta a entrada do gate;
   - `processJob` avalia depois da decisão da admissão v3 e **antes de qualquer escrita canônica**, grava em `demo_jobs.match_integrity` (migration `20261114030000`, escrita única, formato verificado) e, se a demo não for elegível, bloqueia pelo RPC durável já existente com o motivo `MATCH_INTEGRITY:<status>`.
   - Um worker sem o bloco produz `MATCH_END_UNVERIFIED` (fail closed).
5. **UX:**
   - categorias `match_not_finished`, `match_insufficient_rounds` e `match_player_coverage`, nos 5 idiomas;
   - orientação de elegibilidade na área de upload.
6. **AI Coach:** `matches[].matchEnd` (`endedBy` NORMAL/SURRENDER e `validRounds`) mais a regra 24: não contar, estimar ou projetar rounds não jogados e não penalizar o jogador por eles. `null` significa que o fim não foi registrado.

## Validação no fluxo (worker real → HOT → gate do app)

Fixture `src/lib/pipeline/__tests__/fixtures/match_end_corpus.json`: worker deste branch sobre as demos do corpus, só com campos sem identidade.

| Demo                 | Rounds válidos         | Sinais              | Decisão                        |
| -------------------- | ---------------------- | ------------------- | ------------------------------ |
| FACEIT `8425f49c`    | 28 (1 anulado)         | fase 5 + painel     | `MATCH_COMPLETED`              |
| GC Mirage `1ef9baeb` | 34                     | fase 5 (sem painel) | `MATCH_COMPLETED`              |
| BLAST `b5af62a7`     | 23                     | fase 5 + painel     | `MATCH_COMPLETED`              |
| GC Cache `985f5b78`  | 0 com fim (11 inícios) | —                   | `MATCH_FINAL_ROUND_INCOMPLETE` |

**Correção sobre a GC Cache.** A demo não anuncia `round_start` nem `round_end`. O worker deriva os inícios dos rounds pelo estado do jogo, mas não os fins. A decisão real é, portanto, `MATCH_FINAL_ROUND_INCOMPLETE`, e não `MATCH_END_UNVERIFIED` como previsto acima pelo probe direto. Ela continua bloqueada, inclusive por não ter jogadores.

Ler `round_end` mesmo quando não está no inventário (o evento é legível: 12 linhas) é uma melhoria de fidelidade da etapa E.

### Surrender validado em demo real

- A fixture pública do CI (`test_demo.dem`, LaihoE/demoparser, MIT) é uma partida **encerrada por surrender oficial**: 10 rounds jogados, último `round_end` com motivo `ct_surrender` e `cs_win_panel_match` presente.
- No tick do último `round_end`, `game_phase` ainda vale **2** (em jogo), não 5. No surrender, o sinal oficial é o motivo, não a fase. O avaliador já trata os dois sinais como HIGH e independentes.
- Decisão no fluxo real: `MATCH_SURRENDER_COMPLETED`, com 10 rounds válidos. O caminho de surrender passa a **VALIDADO EM TESTE com demo real**, no fluxo do worker e na E2E da fila.

### Defeito encontrado pela E2E real

O `app.py` monta o payload de `/v1/parse` com uma lista explícita de chaves e descartava `match_end_evidence`. O app recebia `null` e, por desenho, bloqueava tudo como `MATCH_END_UNVERIFIED`.

O cenário `admission_v3_limited_demo_persists_real_metrics_readable_only_by_its_owner` pegou a falha. A chave agora é repassada e há um teste de contrato do endpoint.
