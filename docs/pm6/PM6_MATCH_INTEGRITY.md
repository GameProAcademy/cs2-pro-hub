# PM6 C — Integridade da demo e encerramento da partida (`cs2.match-integrity.v1`)

Estado: **IMPLEMENTADO, NÃO INTEGRADO**. O avaliador puro e os testes estão no repositório. A ligação com a admissão depende de o worker entregar evidência que hoje não entrega (ver "Integração").

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

## Integração (pendente, exige release do worker)

1. **Worker (`parser.py`):** ler `round_end` também com `other=["game_phase"]` e expor `round_end_game_phase` (tick → fase) separado das linhas RAW governadas. Rever o campo em `parser_field_reviews.json` e incluir os ticks de `cs_win_panel_match` como evidência.
2. **Adapter:** levar `gamePhaseAtEnd`, `reason` e `voided` para a evidência por round e montar `MatchEndEvidenceV1`.
3. **App:** avaliar na fase B da admissão v3. Se não for elegível, bloquear o job com o código estável e registrar a decisão com `contract`, sinais e `validRounds` no documento de admissão.
4. **UX e Coach (etapa F):** mensagem por código; contexto de surrender e amostra parcial para o AI Coach.
5. **Release controlada:** merge, 1 deploy, `/version`, re-pin, atestação e H.3-E.
