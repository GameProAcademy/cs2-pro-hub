# Benchmark — CS Demo Manager e cs-demo-analyzer

PM6 §3-A. Consulta em 2026-11-13, entre 14:54 e 15:40 UTC. Fins: comparar conceitos, modelos, extração, cobertura e
testes. **Não** é prova de compatibilidade do CS2 PRO nem especificação da Valve.

| Item                           | Valor                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App                            | `akiver/cs-demo-manager`, `main` em `f517fb08642829228e67a0864ad1db7fc3acd8ef` (2026-11-13 01:33 +0100); última tag de release `v3.20.1` (release de 30/07/2026); `package.json` 3.20.1                                                                           |
| Dependências relevantes do app | `@akiver/cs-demo-analyzer` 1.14.1, `csgo-protobuf` 4.1.17 (`package.json`)                                                                                                                                                                                        |
| Analisador                     | `akiver/cs-demo-analyzer`, `main` em `f6f82f2c60895705d7106addc798aef9651ea643` (2026-11-12), última tag `v1.14.1`; Go 1.27                                                                                                                                       |
| Parser por baixo               | `github.com/markus-wa/demoinfocs-golang/v4` **v4.5.1** (`go.mod`) — não usa demoparser2                                                                                                                                                                           |
| Licenças                       | App: MIT, © 2014-present AkiVer (`LICENSE`). Analisador: MIT, © 2023-present AkiVer (`LICENSE.md`). demoinfocs-golang: MIT. As imagens de radar em `static/images/maps` derivam de assets da Valve; a licença MIT do repositório não cobre a propriedade da Valve |

Rótulos: `SOURCE_DOCUMENTED` · `SOURCE_CODE_CONFIRMED` · `SOURCE_TEST_CONFIRMED` · `CS2PRO_REPRODUCED` ·
`INFERRED` · `NOT_VERIFIED`. Os caminhos de arquivo são relativos ao commit acima.

## 1. Os 8 achados iniciais do PM6, revalidados

| #   | Afirmação do prompt                                                                                       | Resultado                                                                                                                                                                                | Evidência                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Há matriz de origens e alerta de origem errada                                                            | Confirmado                                                                                                                                                                               | `SOURCE_DOCUMENTED`: docs/guides/demos-analysis ("Stats can be wrong or missing if the source is incorrect")                                                     |
| 2   | Lista Valve, FACEIT, 5EPlay, Challengermode, eBot, ESL, Esportal, FASTCUP, Perfect World, MatchZy, Renown | Confirmado, e também Esplay, Esportligaen e Pracc                                                                                                                                        | `SOURCE_DOCUMENTED` (tabela, §2) e `SOURCE_CODE_CONFIRMED` (`pkg/api/constants/demo_source.go`, `SupportedDemoSources`)                                          |
| 3   | Gamers Club não suportado; privados limitados; PopFlash limitado                                          | Confirmado e **mais forte do que o prompt supunha**. Gamers Club é recusado explicitamente no código, com a nota "Looks like they use an eBot fork but rounds are not detected properly" | `SOURCE_CODE_CONFIRMED`: `pkg/api/analyzer.go:211-214` (`GamersClubNotSupported`); docs: Gamers Club ❌/❌; Private server ❌/❌; PopFlash ⚠️ (CS:GO) / ❌ (CS2) |
| 4   | Analisador separado                                                                                       | Confirmado: CLI Go `csda`, executado como processo filho pelo app                                                                                                                        | `SOURCE_CODE_CONFIRMED`: `src/node/demo-analyzer/run-demo-analyzer.ts`                                                                                           |
| 5   | App 3.20.1, analyzer 1.14.1, csgo-protobuf 4.1.17, release de 30/07/2026                                  | Confirmado                                                                                                                                                                               | `package.json`; página de releases                                                                                                                               |
| 6   | Módulos de positions, samples, grenades, infernos, heatmaps, timelines                                    | Confirmado no analisador (`pkg/api/*_position*.go`, `player_position_sample.go`, `tick_positions.go`) e no app (`src/node/database/heatmap/*`)                                           | `SOURCE_CODE_CONFIRMED`                                                                                                                                          |
| 7   | Mudanças de interpretação podem exigir reanálise                                                          | Confirmado de forma genérica ("Some application updates may require re-analyzing demos")                                                                                                 | `SOURCE_DOCUMENTED`. As notas por versão ficam em `cs-demo-manager.com/changelog`, que não foi lido nesta sessão: `NOT_VERIFIED` por versão                      |
| 8   | Licença MIT                                                                                               | Confirmado para os dois repositórios; os assets de radar são da Valve (ver acima)                                                                                                        | `SOURCE_CODE_CONFIRMED`                                                                                                                                          |

## 2. Matriz de origens: benchmark × CS2 PRO

Legenda do CS2 PRO: estados do PM6 §4.4. "Fixture" significa uma demo real analisada nesta sessão
(`docs/reference/compatibility/corpus_manifest.json`).

| Origem                        | CSDM docs (CS:GO / CS2)              | CSDM código                                                                                  | CSDM testes (CS2)                                                           | CS2 PRO — fixture real          | CS2 PRO — estado                                                                                                                                                                           |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Valve MM / Premier            | ✅ / ✅                              | detecção: `serverName` contém "valve"; analisador Valve                                      | **nenhum** caso CS2 (só 3 de CS:GO)                                         | 1 (pública, 2024, patch 13984)  | `SUPPORTED_AND_VALIDATED` para essa geração; Premier atual: `NOT_TESTED`                                                                                                                   |
| FACEIT                        | ✅ / ✅                              | detecção: `serverName` contém "faceit" **ou "blast"**, ou nome de arquivo; analisador FACEIT | **nenhum** caso FACEIT nativo em CS2 (1 Challengermode marcado como FACEIT) | 1 (2026, patch 14196)           | Parse OK; **auditoria RAW BLOCKED** (evento `show_survival_respawn_status` não catalogado) → `SUPPORTED_WITH_PARTIAL_COVERAGE` até a revisão do campo                                      |
| Gamers Club                   | ❌ / ❌                              | detecção: `serverName` contém "gamersclub"; **recusado**                                     | nenhum                                                                      | 2 (2026, patch 14197)           | Parse OK; **auditoria RAW BLOCKED** (`player_chat`; Cache também `PLAYER-COVERAGE` e `round_end` indisponível) → `SUPPORTED_WITH_PARTIAL_COVERAGE`; lifecycle de rounds com reinícios (§5) |
| 5EPlay                        | ✅ / ✅                              | analisador próprio                                                                           | 2 casos CS2                                                                 | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| Challengermode                | ✅ / ✅                              | analisador próprio; "pgl major cs2" → Challengermode                                         | 1 caso CS2                                                                  | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| eBot                          | ✅ / ✅                              | analisador próprio                                                                           | casos CS:GO                                                                 | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| ESL                           | ✅ / ✅ (docs: usar FACEIT)          | detecção por "esl"; analisador Valve                                                         | —                                                                           | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| Esportal                      | ✅ / ✅                              | analisador próprio                                                                           | 2 casos (marcados eBot)                                                     | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| FASTCUP                       | ✅ / ✅                              | analisador próprio                                                                           | 1 caso CS2                                                                  | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| Perfect World                 | ✅ / ✅                              | analisador Valve                                                                             | —                                                                           | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| MatchZy                       | — / ✅                               | analisador próprio                                                                           | 4 casos CS2 (backup restore, overtimes, gravação pós-knife)                 | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| Renown                        | — / ✅                               | analisador próprio                                                                           | 2 casos CS2 (pausa, servidor congelado)                                     | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| PopFlash                      | ⚠️ / ❌                              | CS2 recusado                                                                                 | —                                                                           | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| Privado/comunitário           | ❌ / ❌                              | sem analisador                                                                               | —                                                                           | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| BLAST/torneio (GOTV)          | via FACEIT ("blast" no `serverName`) | —                                                                                            | —                                                                           | 2 (2026, patches 14180 e 14197) | `SUPPORTED_AND_VALIDATED` (APPROVED; uma validada em produção, job `aa968c9e`)                                                                                                             |
| IEM/Major/Thunderpick/FISSURE | não listados por nome                | —                                                                                            | —                                                                           | 0                               | `NOT_TESTED`                                                                                                                                                                               |
| POV                           | não mencionado na doc                | **CS2 POV recusado** (`analyzer.go:152-154`, `CS2POVDemosNotSupported`)                      | —                                                                           | 0                               | `NOT_TESTED`                                                                                                                                                                               |

Implicações:

- **Gamers Club.** O suporte documentado pelo benchmark é ❌, e mesmo assim o CS2 PRO **lê** as duas demos reais. As
  duas param em gates de auditoria que existem justamente para não aceitar campos novos sem revisão. A semelhança
  com FACEIT não foi usada como base: as diferenças estão em §5 e no relatório PM6.
- **FACEIT.** O benchmark declara suporte, mas não tem nenhum teste de regressão FACEIT nativo em CS2. No
  CS2 PRO, a primeira demo FACEIT real deste corpus é bloqueada por um evento de HUD da FACEIT
  (`show_survival_respawn_status`, `loc_token` hospedado em `faceit-cdn.net`).

### 2.1 O parser do benchmark nas demos atuais (`CS2PRO_REPRODUCED`)

O `demoinfocs-golang` v4.5.1, que é a dependência do `cs-demo-analyzer` v1.14.1, foi compilado localmente: Go 1.24,
módulos baixados do GitHub. Ele foi executado só com contagens nas três demos do dono. Resultado:

| Demo                   | Patch | Resultado                                                                                         |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| FACEIT 2026            | 14196 | falha: `unable to find existing entity` (equivalente ao `EntityNotFound`), antes de qualquer kill |
| GamersClub Mirage 2026 | 14197 | falha: `nextByte: insufficient buffer` em `signedDecoder` (decodificação de campo)                |
| GamersClub Cache 2026  | 14197 | falha: idem                                                                                       |

Na mesma data, o demoparser2 0.42.2 lê as três até o fim. **Conclusão:** nesta data, o analisador do benchmark não
lê demos geradas pelos builds 14196/14197. É o mesmo tipo de quebra que a 0.42.0 tinha antes do decodificador
fixed8 (#375). O benchmark não serve de oráculo independente para essas gerações: o cruzamento da `player_info` da
GC Cache fica `NOT_VERIFIED`. O demoinfocs também relata tickrate 64 nessas demos, o valor padrão quando não há
fonte.

## 3. Arquitetura e responsabilidades

| Tema                     | CSDM / analyzer                                                                                                                                        | CS2 PRO atual                                                                                                                          | Diferença                                     | Recomendação                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Fronteira UI × análise   | Electron + processo filho `csda` (Go) que exporta `csdm` (CSV/binário) e o app importa no PostgreSQL local (`run-demo-analyzer.ts`, `insert-match.ts`) | App web (TanStack) + worker Railway (Python, demoparser2) via fila durável e ponte autenticada                                         | Desktop × SaaS multiusuário                   | `REJECT` replicar; o isolamento por processo já existe no worker (`parser_isolated.py`, `parser_child.py`)                                      |
| Identidade da demo       | **CRC64 de campos do header + tamanho do arquivo**, não do conteúdo (`src/node/demo/get-demo-checksum-from-file-stats.ts:5-17`)                        | SHA-256 do arquivo inteiro (`reserve_demo_upload`, `raw_evidence` manifest)                                                            | O nosso detecta qualquer byte diferente       | `REJECT` (manter SHA-256)                                                                                                                       |
| Seleção de origem        | Substring do `serverName`/nome de arquivo (`internal/demo/demo.go:262-330`); o usuário pode trocar a origem; origem errada degrada estatísticas        | Sem origem; a semântica vem das capacidades observadas e dos gates RAW                                                                 | O PM6 proíbe origem por hostname/nome isolado | `ADAPT`: fingerprint versionado com sinais técnicos (§5) e `UNKNOWN` por padrão; **nunca** ramificar a semântica por origem declarada sem prova |
| Regras por origem        | Um analisador por plataforma (`createFaceItAnalyzer`, `createEbotAnalyzer`…) que ajusta detecção de início de partida e rounds                         | Uma pipeline; os rounds vêm de evidência de estado do jogo (`derive_round_streams_from_tick_evidence`, `rounds_voided_by_match_reset`) | O CSDM codifica conhecimento por plataforma   | `ADAPT` só como **perfil de lifecycle versionado** derivado de fixtures (ex.: reinícios pré-partida), testado por fixture                       |
| Demo corrompida          | Continua se `ErrUnexpectedEndOfDemo` e aproveita o parcial (`analyzer.go:235-241`)                                                                     | `validate_demo_structure` antes do parser recusa frame que passa do EOF (`parser.py:1250-1253`)                                        | O CSDM aceita parcial silenciosamente         | `REJECT` aceitar sem declarar; ok declarar `PARTIAL` com cobertura (PR E)                                                                       |
| Tickrate desconhecido    | **Assume 64** (`ticksPerSecondFromTickRate`, `analyzer.go:93-101`)                                                                                     | Não assume: `tickrate_unavailable` e durações não derivadas (warning da pipeline)                                                      | PM6 §7 proíbe assumir                         | `REJECT`                                                                                                                                        |
| Header incompleto em CS2 | Usa `PlaybackTicks` do `CDemoFileInfo`; se faltar, usa o tick interno (`analyzer.go:243-250`)                                                          | `parse_header` do demoparser2 não expõe `playback_ticks` (L02)                                                                         | —                                             | `DEFER` (PR D: tempo e ticks)                                                                                                                   |
| Reanálise                | Manual pelo usuário ("re-analyze"); checksum duplicado bloqueia reinserção                                                                             | Nova tentativa (D24) com evidência RAW própria; tentativa antiga preservada                                                            | O nosso guarda a linhagem por tentativa       | `ADOPT` o conceito de "versão do analisador que produziu a linha" (§6); a mecânica já é nossa                                                   |
| Concorrência e memória   | Spool em disco para posições (`positions_spool.go`); limites de processo do desktop                                                                    | Worker com limites de memória e timeout (Railway 8 GB)                                                                                 | —                                             | `ADAPT` spool se o PM2/PM3 precisarem de posições contínuas                                                                                     |

## 4. Posições, amostragem, mapas e heatmaps

| Tema                       | CSDM / analyzer                                                                                                                                                                                                                                                                           | CS2 PRO                                                        | Classificação              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| Posições completas         | Opcional (`-positions`): por **frame**, a primeira posição de cada entidade por tick (`analyzer.go:795-860`, `tick_positions`); jogadores, granadas, infernos, galinhas, reféns                                                                                                           | Não persistidas (L02)                                          | `SOURCE_CODE_CONFIRMED`    |
| Amostras sempre exportadas | `PlayerPositionSample`: **1 por segundo**, só jogadores vivos, do fim do freeze ao fim do round; o primeiro frame de cada segundo; o segundo é calculado com ticks por segundo, que **assume 64** quando a taxa é desconhecida (`player_position_sample.go`, desde `b70a9de`, 2026-11-08) | Posição do atacante e da vítima **no tick da morte** (R5.8.24) | `SOURCE_CODE_CONFIRMED`    |
| Denominador                | Amostras não declaram perdas (rounds sem freeze-end usam o início do round; demos sem frame em todo tick usam o primeiro frame do segundo)                                                                                                                                                | `coverage` explícito por evento (`spatial-heatmap-v1`)         | Diferença de transparência |
| Níveis de mapa             | Um `threshold_z` por mapa (`maps.threshold_z`; filtro `>=` / `<`, `fetch-player-kills-points.ts`)                                                                                                                                                                                         | `AltitudeMax` da seção inferior (`radar-transform-v1`)         | Equivalente em conceito    |
| Heatmap de kills           | Posição do **matador** no tick do kill (`killer_x/y`)                                                                                                                                                                                                                                     | Igual (camada KILLS)                                           | Mesma semântica            |
| Filtros                    | origem, jogo, tipo de demo, modo, max rounds, lado, tags, datas                                                                                                                                                                                                                           | mapa, partida, camada, lado, arma, nível                       | —                          |

Regras para o CS2 PRO (PM6 §3-A.5):

- `ADAPT` amostras de 1/s **só** com contrato versionado, `ticks_per_second` vindo de fonte real (nunca 64 assumido)
  e denominador declarado (segundos esperados × observados por jogador vivo). Mesmo assim, isso **não** desbloqueia
  L02: amostras de 1 Hz não são trajetória e não medem exposição.
- `REJECT` chamar amostras de trajetória ou inferir rota/tempo a partir delas.

## 5. Semântica de estatísticas e correções históricas

- Os casos de teste do analisador documentam exatamente os padrões que quebram rounds:
  - knife round seguido de troca de lado;
  - backup restore no round 15;
  - round 1 restaurado 2×;
  - gravação iniciada depois do knife;
  - pausa no meio do round e servidor congelado;
  - surrender e overtimes;
  - desconexões, bots e suicídios.

  Fonte: `tests/demos_test.go`, comentários por caso (`SOURCE_TEST_CONFIRMED`).

- **Padrão observado nas demos Gamers Club reais** (`CS2PRO_REPRODUCED`, probe local):
  - 4 `begin_new_match`;
  - um round 1 completo seguido de reset (`total_rounds_played` volta de 1 para 0);
  - nenhum `cs_win_panel_match`;
  - `round_officially_ended` emitido 2× por tick.

  O mesmo padrão de duplicação aparece na FACEIT. A pipeline do CS2 PRO já anula o round pré-reset
  (`rounds_voided_by_match_reset`) e não conta a duplicação, porque os rounds vêm do estado do jogo. Faltam testes
  de regressão por fixture (PR F).

- Changelog do CSDM por versão: `NOT_VERIFIED` (página externa não lida). Os itens do prompt (boundaries,
  suicídios, team kills, trade kills, mensagens, memória, coordenadas) ficam como hipótese documental até a leitura.

### Política de linhagem (requisito adotado pelo CS2 PRO, PM6 §3-A.6)

Já existe no CS2 PRO:

- parser package, versão e build (`parser_runtime_provenance`);
- contract version;
- SHA-256 da demo;
- tentativa;
- auditoria RAW.

Falta, para o PR E/H:

- `adapter_version`;
- `rules_version` por métrica (o `metric-contract-v1.1` já carrega versão por métrica);
- `source_profile`;
- `output fingerprint`;
- motivo do reprocessamento;
- diff entre tentativas.

Distinguir reparse (parser), renormalização (adapter/normalizer) e recálculo (regras). Nada disso autoriza
reanálise em produção.

## 6. Licença e reutilização

- **Código:** não foi copiado nada. Os conceitos citados são reimplementáveis de forma independente.
  - Se algum dia o CS2 PRO portar um algoritmo, a MIT exige preservar o aviso de copyright e a licença no código
    derivado.
  - Ligar `csda` (binário Go) ao worker Python **não** é recomendado: seria outro parser (demoinfocs) com outra
    semântica, outro build e outra superfície de ataque.
  - Isso exigiria um spike diferencial, plano de migração e atestação próprios: `DEFER`.
- **Assets:** os radares do CSDM são derivados da Valve. O CS2 PRO já usa os da Valve sob autorização provisória do
  dono (`docs/reference/RADAR_ASSETS.md`). Não importar os do CSDM.
- **Dados:** o corpus de testes do CSDM está em `gitlab.com/akiver/cs-demos`, inacessível desta sessão (proxy).
  Antes de usar qualquer demo dali, conferir os termos de uso de cada uma.

## 7. Lista ADOPT / ADAPT / DEFER / REJECT

| Conceito                                                                                           | Classe | Por quê                                                               | Para       |
| -------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- | ---------- |
| Tabela pública de compatibilidade por origem, com nota de limitações                               | ADOPT  | Transparência para o jogador; baseada no nosso corpus, não na do CSDM | PM6 PR E/H |
| Casos de regressão por padrão de lifecycle (knife, restore, pausa, surrender, OT, gravação tardia) | ADOPT  | Lista de cenários validada por anos de uso; fixtures próprias         | PM6 PR B/F |
| Perfil de lifecycle versionado por família de servidor                                             | ADAPT  | Útil (GC, eBot), mas por fingerprint técnico, não por hostname        | PM6 PR F   |
| Amostras de posição de 1 Hz                                                                        | ADAPT  | Útil para PM2/PM3 com contrato e denominador; não desbloqueia L02     | PM2/PM3    |
| Spool de posições em disco                                                                         | DEFER  | Só se houver posições contínuas                                       | PM3        |
| Origem por substring de `serverName`/arquivo                                                       | REJECT | Proibido pelo PM6 §8; o "blast" → FACEIT do CSDM mostra o risco       | —          |
| Checksum CRC64 de header + tamanho                                                                 | REJECT | Mais fraco que SHA-256                                                | —          |
| Assumir 64 ticks/s                                                                                 | REJECT | PM6 §7                                                                | —          |
| Aceitar demo corrompida sem declarar                                                               | REJECT | O CS2 PRO deve declarar `PARTIAL`                                     | —          |
| Trocar demoparser2 por demoinfocs/csda                                                             | DEFER  | Sem diferencial reproduzível; exigiria release completo               | —          |

## 8. Recomendações rastreáveis

- **PM6:** catalogar os eventos novos das fixtures (PR F); fingerprint de origem com sinais técnicos (PR E);
  testes por padrão de lifecycle (PR B/F); linhagem de reanálise (PR E/H).
- **PM2:** replay 2D só com pontos discretos declarados; amostras de 1 Hz exigem contrato próprio.
- **PM3:** usercmd/subtick estão presentes nas famílias FACEIT, GC e BLAST de 2026 (probe), mas não na Valve de 2024. Mira e movimento continuam bloqueados por L03 até uma decisão formal com provas.
- **PM4/PM5:** recálculo histórico só com linhagem e autorização.

## Fontes

- https://cs-demo-manager.com/docs/guides/demos-analysis (consultado em 2026-11-13)
- https://github.com/akiver/cs-demo-manager (`f517fb08`), https://github.com/akiver/cs-demo-manager/releases
- https://github.com/akiver/cs-demo-analyzer (`f6f82f2c`, v1.14.1)
- https://github.com/markus-wa/demoinfocs-golang (v4.5.1, via `go.mod`)
