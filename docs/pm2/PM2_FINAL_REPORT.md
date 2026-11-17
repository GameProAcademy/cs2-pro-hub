# PM2 v2 — Relatório final (C3–C6): diagnóstico de mortes (4.2.3, Módulo B) e replay 2D (4.2.4, Módulo I)

Sessão `session_012aG79D5h8yCsYxNjWpDaHG` · 2026-11-14 (America/Sao_Paulo).

Estados usados: VALIDADO EM PRODUÇÃO · VALIDADO EM TESTE · IMPLEMENTADO, NÃO VALIDADO · PENDENTE · NÃO SUPORTADO.

**Veredito: PARCIAL.** As duas fases estão implementadas, integradas, testadas, publicadas e funcionando em produção. Desde 2026-11-17, o replay também está validado em produção com uma demo nova enviada pelo dono (§26). Ficam pendentes: o teste IDOR com um segundo usuário real, um E2E automatizado de browser, 3 mapas sem validação, o alerta de segurança NOT_VERIFIED e a etapa E DEFERRED (§16–§17). Nada aqui está declarado 100% concluído.

## 1. Resumo executivo

- **Diagnóstico de mortes:**
  - contrato `cs2.death-context.v1`, com proveniência por campo;
  - catálogo `cs2.death-rules.v1` (4 regras derivadas e 4 NOT_SUPPORTED, cada uma com os dados que exigiria);
  - padrões recorrentes com amostra mínima;
  - feedback do jogador guardado à parte;
  - página `/deaths`;
  - links para o heatmap e o replay.
- **Replay 2D:**
  - trajetórias amostradas no worker (`cs2.round-trajectory.v1`);
  - persistência após o commit canônico;
  - API de segmento por round (`cs2.replay-segment.v1`);
  - página `/replay`;
  - amostras observadas separadas das interpoladas, sem ponte sobre lacunas.
- **Coach:** recebe as mesmas contagens de padrões (regra 25). Modelo inalterado.
- **Release do worker R5.8.28:**
  - o Source persistente da Railway foi alinhado ao commit aprovado na mesma operação;
  - um único build;
  - atestação VERIFIED e H.3-E PASS 18/18.
- **Release do worker R5.8.29** (correção da morte de BOT substituído em demos FACEIT, #300):
  - mesmo procedimento controlado, com um único build `3375b68b`;
  - re-pin #301;
  - atestação (run 44013092142) e H.3-E PASS 18/18 em `76fa4887`.

## 2. Baseline

`docs/pm2/PM2_C0_C2_ENTRY_DISCOVERY_PLAN.md` (#291):

- 901 kills, das quais 142 com posição;
- utilitários sem posição;
- nenhuma trajetória persistida;
- Δtick/Δtempo = 64,000 em 641 pares;
- apenas `de_dust2` VALIDATED.

## 3. Fase 4.2.3 — PARCIAL

| Critério (§21.1)                           | Estado                                                                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ficha de morte contextual funcional        | VALIDADO EM PRODUÇÃO (`/deaths`, dados reais do dono, 4 seções)                                                                                                                                      |
| Regras explicáveis, versionadas e testadas | VALIDADO EM TESTE (22 casos puros e 17 de UI/helpers)                                                                                                                                                |
| Fatos e inferências separados              | VALIDADO EM PRODUÇÃO (rótulo de proveniência em cada valor)                                                                                                                                          |
| Padrões exigem amostra                     | VALIDADO EM PRODUÇÃO (51 mortes / 4 partidas; política mostrada na tela)                                                                                                                             |
| Eventos especiais tratados                 | VALIDADO EM TESTE (team/self/world/unknown/unclassified, round inválido)                                                                                                                             |
| Links para heatmap e replay                | VALIDADO EM PRODUÇÃO: em 2026-11-17, "Ver no replay 2D" da morte do round 1 abriu `/replay` no round 1, tick 14552 (13,3 s), com o radar desenhado (§26)                                             |
| Ownership/RLS                              | VALIDADO EM TESTE com 2 usuários (PostgreSQL descartável, 39/39); em produção, o id de partida real de outro usuário dá NOT_FOUND                                                                    |
| UI e i18n completos                        | VALIDADO EM TESTE (5 idiomas); produção vista em pt-BR                                                                                                                                               |
| Integridade da partida preservada          | VALIDADO EM PRODUÇÃO (pré-contrato declarado como "fim não verificado")                                                                                                                              |
| Provenance e coverage explícitos           | VALIDADO EM PRODUÇÃO                                                                                                                                                                                 |
| E2E e regressão                            | Regressão VALIDADA (CI verde). Não há E2E automatizado de browser: PENDENTE                                                                                                                          |
| Feedback do jogador                        | VALIDADO EM PRODUÇÃO (autorizado pelo dono, 2026-11-14 17:05): "Útil" numa regra e numa ficha gravaram 2 linhas; a troca para "Não útil" atualizou a mesma linha (`updated_at` mudou, sem duplicata) |

## 4. Fase 4.2.4 — PARCIAL

| Critério (§21.2)                                                                             | Estado                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay abre o round correto, timeline e eventos sincronizados, controles, seleção de jogador | VALIDADO EM PRODUÇÃO (2026-11-17, demo FACEIT Nuke enviada pelo dono). Round 3: 2500/2500 amostras, 10 jogadores, rótulo "Você", 8 eventos em segundos; o play avançou até 4,1 s e o pause parou; nenhum SteamID no DOM (§26). Também VALIDADO EM TESTE (GamersClub Mirage) |
| Heatmap e death review abrem no tick correto                                                 | A ficha de morte abrindo no tick correto foi VALIDADA EM PRODUÇÃO (round 1, tick 14552, aberto em 13,3 s). Heatmap → replay: VALIDADO EM TESTE                                                                                                                              |
| Lacunas e dados ausentes comunicados                                                         | VALIDADO EM TESTE. Em produção foram VALIDADOS `NOT_RECORDED` (partida Dust2 de 13/11, processada antes do replay existir), `NOT_FOUND` (partida ainda sem jogador associado) e a legenda de amostras observadas e interpoladas                                             |
| Segmentos com limites                                                                        | VALIDADO EM TESTE (1 round por requisição, 500 eventos, 12 jogadores, 1600 amostras)                                                                                                                                                                                        |
| Performance e memória medidas                                                                | Worker medido com o corpus local de demos (§12, §24; pico 4,0 GB contra limite de 8 GB; HOT máximo 6,1 MB contra 8 MB). Em produção, o segmento de um round levou de 2,7 a 3,0 s (5 rounds; 16–32 KB comprimidos, 292–616 KB decodificados; §26)                            |
| Ownership/RLS                                                                                | VALIDADO EM TESTE (dono lê; não-dono, anon e escrita de jogador recusados); NOT_FOUND em produção                                                                                                                                                                           |
| Transformação espacial por mapa suportado                                                    | 7 mapas VALIDATED (Dust2, Mirage, Inferno, Nuke, Ancient, Anubis e Cache; §22). Overpass, Train e Vertigo não desenham (MAP_NOT_VALIDATED). Nuke desenhado em produção (§26)                                                                                                |
| E2E e regressão                                                                              | Regressão VALIDADA; E2E de browser PENDENTE                                                                                                                                                                                                                                 |

## 5. Módulos B e I

- **B (diagnóstico):**
  - contrato, regras, agregação, API, UI, feedback e Coach;
  - exposição, isolamento, re-peek e rotação ficam **NOT_SUPPORTED**: exigem posições de companheiros e adversários ao longo do tempo, que a ficha ainda não lê. As trajetórias novas passam a guardar esse dado só para partidas novas.
- **I (replay):** worker, persistência, API e UI completos; validação em produção do caminho com dados depende de uma demo nova.

## 6. Oito funcionalidades diferenciais (parcela PM2)

| #   | Funcionalidade                 | Estado nesta etapa                                                                                                                                           |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Onde estou perdendo rounds     | Mortes × contexto do round, trade na janela, evidências e limites: entregue                                                                                  |
| 2   | Posicionamento × profissionais | Transformações consistentes (ficha, heatmap e replay usam `worldToRadar`); dataset profissional NÃO implementado                                             |
| 3   | Meu pior hábito                | Recorrência com amostra mínima e exemplos (até 5 refs). Exposição, isolamento e re-peek NOT_SUPPORTED                                                        |
| 4   | Como eu deveria ter jogado     | Revisão temporal (replay) e fatos separados de hipóteses; nenhum coaching prescritivo                                                                        |
| 5   | Versões de mim mesmo           | Referências estáveis: chave da morte (partida, round, tick) e versão da regra; nenhuma comparação histórica criada                                           |
| 6   | Mapa de oportunidades perdidas | Heatmap, ficha e replay ligados por deep links; nenhuma "oportunidade" inferida                                                                              |
| 7   | AI Coach com evidências        | Contagens, status, período, versão e política (regra 25). **Event refs não são enviados ao Coach**: decisão de privacidade e tamanho; as refs existem na API |
| 8   | Revisão mensal                 | Classificações versionadas prontas para agregação; nenhum scheduler criado                                                                                   |

## 7. Regras de diagnóstico e versões

`cs2.death-rules.v1`:

- TRADE_NOT_OBSERVED, OPENING_DEATH, NUMERIC_DISADVANTAGE, POST_PLANT_DEATH (DERIVED);
- POSSIBLE_EXPOSURE, POSSIBLE_ISOLATION, RE_PEEK, ROTATION_TIMING (NOT_SUPPORTED).

Política de padrão: pelo menos 10 mortes avaliadas, 3 partidas avaliadas e 4 ocorrências, em pelo menos 2 partidas.

## 8. Contratos e migrations

| Migration                                      | Conteúdo                                                                                    | Produção                                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261114130000_pm2_death_feedback`            | `death_feedback`, `owns_death_event`, RLS só do dono                                        | aplicada e registrada (`9d5b2e95`, md5 `7064b74d…`)                                                                                                                          |
| `20261114140000_pm2_round_trajectories`        | `match_trajectories`, `round_trajectories`, leitura pelo dono, escrita só pela service role | aplicada e registrada (`b440a06f`, md5 `3bd1922c…`)                                                                                                                          |
| `20261114190000_r5_8_28_repin_runtime_release` | re-pin R5.8.28                                                                              | aplicada e registrada (`80ee284c`, md5 `20d31485…`); md5 das funções lidas depois: `99776ca5…` / `1918875c…` / `f74d8af9…`                                                   |
| `20261114230000_r5_8_29_repin_runtime_release` | re-pin R5.8.29                                                                              | dry-run em produção com exceção proposital (estado inalterado depois); aplicada e registrada (`76fa4887`, md5 `d41c9512…`); funções: `3e2125a2…` / `bfd8a96d…` / `f74d8af9…` |

Contratos: `cs2.death-context.v1`, `cs2.death-rules.v1`, `cs2.round-trajectory.v1`, `cs2.replay-segment.v1`, `CoachFacts.deathPatterns`.

## 9. PRs e merges

| PR   | Conteúdo                                             | Merge      |
| ---- | ---------------------------------------------------- | ---------- |
| #291 | C0–C2                                                | `ed124279` |
| #292 | contratos puros                                      | `4b635721` |
| #293 | API `/deaths`, UI, feedback                          | `9d5b2e95` |
| #294 | trajetórias e replay                                 | `b440a06f` |
| #295 | Coach (regra 25)                                     | `51b88fea` |
| #296 | re-pin R5.8.28                                       | `80ee284c` |
| #297 | relatório C3–C6, Mirage VALIDATED, seletor do replay | `883f68e2` |
| #298 | `/maps` com parâmetros extras                        | `3eee0480` |
| #299 | Inferno, Nuke, Ancient, Anubis e Cache VALIDATED     | `e04893ab` |
| #300 | morte de BOT substituído (FACEIT)                    | `47ba6ffe` |
| #301 | re-pin R5.8.29                                       | `76fa4887` |

## 10. Workflows e testes

- CI verde no SHA exato de cada PR antes do merge.
- Em `main` `51b88fea`: Quality Gates, Queue Semantics, F553 pós-execução, R5.8.3, R5.8.4, atestação (run 43634866320) e H.3-E (run 43635475197).
- Local:
  - vitest: 2520 aprovados, mais 1 falha só ambiental (`initdb` ausente no sandbox; o CI passa);
  - worker: 572, mais 7 novos;
  - scripts: 454;
  - harness RLS: 39/39, mais 1 mutação detectada.

## 11. RLS e ownership

- Feedback: só o dono lê e grava; escrita exige a própria morte (evento, partida, round e tick).
- Trajetórias: leitura via `owns_canonical_match`; escrita só pela service role.
- APIs: partida fora do overview do usuário nunca é consultada (NOT_FOUND); nenhum SteamID ou nickname é devolvido; logs sem identidade nem coordenadas.

## 12. Performance e custos

Demo local autorizada (Dust2 profissional pública):

| Medida      | Sem trajetória | Com trajetória      |
| ----------- | -------------- | ------------------- |
| Parse       | 95,0 s         | 95,7 s              |
| Pico de RSS | 3232 MB        | 3286 MB (+54 MB)    |
| HOT         | 4,31 MB        | +578 KB (teto 8 MB) |

- Limite do container: 8 GB / 8 vCPU (inalterado).
- Leitura da ficha: todas as kills da partida (cerca de 130 em produção), 1 consulta por tabela.
- Coach: mais uma leitura (até 20 partidas).

## 13. Deploy e SHA servido

- Worker: Railway `3375b68b` (commit `47ba6ffe`, R5.8.29). Os dois hosts `/version`: `git:47ba6ffe…`, demoparser2 0.42.2, `declared_revision_matches` true.
- App: publicado pelo conector a partir de `main` `76fa4887` (publicação `99590af9`, 2026-11-17).
- Histórico: R5.8.28, com Railway `bb92ed95` e app em `51b88fea`.

## 14. Identidade do parser e H.3-E

- Re-pin R5.8.28: deployment, commit e blob `parser.py`.
- Atestação VERIFIED: provenance `e5793f1a-ca5d-47f1-9b8c-02bea413d6e9`, digest `6432b232…`.
- H.3-E PASS 18/18 (run 43635475197).
- O Source persistente da Railway agora é `b440a06f` (o metadado `4716f894` foi resolvido): a troca de Source gerou `ef2caa23`, SKIPPED pelo freeze e sem build; o único build é `bb92ed95`.
- **Re-pin R5.8.29:**
  - muda deployment, commit e o blob `adapter.py` (`020f847a…` → `3e4f4a04…`).
  - A troca de Source para `47ba6ffe` gerou `4ef83d14`, SKIPPED pelo freeze; o único build é `3375b68b`.
  - Os 3 secrets foram trocados pelo dono.
  - Atestação run 44013092142: success.
  - H.3-E PASS 18/18 em `76fa4887` (run 44005644742, reexecutada depois dos secrets e da publicação).
  - Correção de método: o primeiro rascunho do spec tinha md5 de destino errados. O teste de artefatos e um SELECT somente leitura em produção recusaram esses valores antes do commit; a migration teria falhado fechada.

## 15. Falhas encontradas e corrigidas

1. **FK de `death_feedback` para `round_events`.** O probe de semântica de fila pegou (TRUNCATE bloqueado). A causa real é que a persistência canônica reescreve os eventos (DELETE + INSERT), o que apagaria o feedback em silêncio. A chave passou a ser (partida, round, tick), sem FK.
2. **Allowlist da imagem.** `trajectory.py` faltava nas asserções de arquivos dos workflows; foi incluído.
3. **`kindOf`.** Lado ausente era tratado como inimigo; agora é UNCLASSIFIED.
4. **Kill sem tick.** Distorcia vivos e opening; agora dá NOT_MEASURED.
5. **`planted_c4`** (as 2 kills sem atacante em produção) passou a WORLD_KILL.
6. **Defeito visual do replay.** Partida desconhecida mostrava a primeira partida no seletor; corrigido neste PR.
7. **Gate de mapa.** `de_mirage` passou de NOT_VALIDATED para VALIDATED, com evidência (§22). Os testes que usavam Mirage como exemplo de mapa não validado passaram a usar Inferno.
8. **`/maps` com parâmetro extra na URL** (achado na validação em produção, defeito do PM1): `?v=3`, `utm_*` e similares eram repassados ao input estrito do servidor e a página caía em erro. Agora só os filtros documentados são enviados.

## 16. Limitações e dados não medidos

- Partidas processadas antes do R5.8.28 não têm replay (`NOT_RECORDED`) e não são reprocessadas (decisão do prompt). Só a partida Nuke de 17/11 tem trajetória.
- Overpass, Train e Vertigo continuam NOT_VALIDATED, sem desenho.
- Segmento do replay em produção: 2,7–3,0 s por round. A causa não foi medida. Hipótese: o handler recarrega o overview completo do jogador a cada round.
- Exposição, isolamento, re-peek e rotação: NOT_SUPPORTED.
- Event refs não vão ao Coach.
- Sem E2E automatizado de browser.
- Linha do tempo em segundos só quando a relação tick/tempo do round é comprovada; caso contrário, em ticks com velocidade nominal declarada.

## 17. Ações manuais

1. ~~Upload de uma demo nova pelo dono~~: feito em 2026-11-17 (`demo-faceit-nuke.dem`; §26).
2. **Validar o teste IDOR com um segundo usuário real.**
3. **Alerta de segurança do Lovable:** revisar manualmente no painel (§21).

## 18. Riscos residuais e rollback

- **Risco:** trajetória maior que o esperado num mapa novo. O round é pulado por inteiro (limites) e o job nunca falha (best effort).
- **Rollback do worker (R5.8.29):** Railway `bb92ed95`, Source de volta para `b440a06f`, `docs/reference/r5_8_29/rollback.sql` e os secrets de R5.8.28.
- **Rollback do app:** reverter os merges. As tabelas aditivas podem ficar.

## 19. Lovable

Nenhum prompt foi enviado ao agente Lovable. A publicação foi feita só pelo conector técnico (`deploy_project`). Não houve "Try to fix" nem correção automática.

## 20. Recomendação para o Prompt 3 de 5

Começar o PM3 (4.2.5–4.2.6, módulos C e D) **depois** do item 1 da §17. O PM3 deve consumir trajetórias, e o caminho com dados ainda não foi visto em produção.

Prioridades:

1. Validar a transformação de radar de Inferno, Nuke e Cache com demos autorizadas que o parser leia de ponta a ponta. Dust2 e Mirage já estão validados.
2. Usar `round_trajectories` (companheiros e adversários ao longo do tempo) para tirar exposição e isolamento de NOT_SUPPORTED, com uma nova versão de regras `cs2.death-rules.v2`.
3. Adicionar E2E de browser para `/deaths` e `/replay`.

## 21. Alerta de segurança do Lovable

Continua **NOT_VERIFIED**. Nenhuma policy de storage foi alterada no PM2. Hipótese: o trio `demos_*` usa ownership por caminho. Detalhe em `docs/security/PM6_LOVABLE_SECURITY_AUDIT.md`.

## 22. Proveniência espacial por mapa

- `de_dust2`: VALIDATED (`radar-transform-v1`, PM1).
- `de_mirage`: **VALIDATED neste PM**, com o mesmo critério do Dust2, em duas demos independentes autorizadas (`furia-vs-gamerlegion-m2-mirage` e uma partida GamersClub):

| Demo                | Mortes dentro do radar | Mortes sobre a área desenhada | Spawn T (média, px radar) | Spawn CT (média, px radar) | Plants                                                             |
| ------------------- | ---------------------- | ----------------------------- | ------------------------- | -------------------------- | ------------------------------------------------------------------ |
| FURIA × GamerLegion | 158/158                | 157                           | (886, 371)                | (303, 721)                 | 14, em dois clusters: A ~(520–595, 739–784), B ~(249–267, 253–294) |
| GamersClub          | 159/159                | 159                           | (888, 370)                | (303, 720)                 | 13, nos mesmos dois sites                                          |

Orientação e escala consistentes, sem espelhamento. A sobreposição foi inspecionada visualmente.

- **Inferno, Nuke, Ancient, Anubis e Cache: VALIDATED neste PM** (2026-11-14). Cada mapa foi validado com uma demo FACEIT autorizada, enviada pelo dono para Downloads e parseada com demoparser2 0.42.2, a versão de produção. A sobreposição foi inspecionada visualmente.

| Mapa         | Mortes dentro / sobre o desenho                                   | Spawn T (média) | Spawn CT (média) | Plants                                                  |
| ------------ | ----------------------------------------------------------------- | --------------- | ---------------- | ------------------------------------------------------- |
| `de_inferno` | 169/169 / 169                                                     | (95, 711)       | (919, 370)       | 6, em dois sites: B ~(540, 205) e A ~(801–852, 714–753) |
| `de_nuke`    | 199/199 / 197 (170 no nível superior, 29 no inferior, `z < -495`) | (225, 563)      | (857, 473)       | 3 no A (nível superior) e 3 no B (nível inferior)       |
| `de_ancient` | 127/127 / 127                                                     | (499, 885)      | (520, 90)        | 7, num site só (a partida não teve plant no outro)      |
| `de_anubis`  | 167/167 / 167                                                     | (484, 941)      | (444, 222)       | 11, em dois sites                                       |
| `de_cache`   | 144/144 / 143                                                     | (917, 593)      | (98, 447)        | 3, num site só                                          |

Ancient e Cache têm plants em um único site: a orientação é confirmada pelos spawns em lados opostos e por todas as mortes sobre a área desenhada.

- `de_overpass`, `de_train`, `de_vertigo`: NOT_VALIDATED, sem demo autorizada. Nada é desenhado nesses mapas.

## 23. Integridade das partidas

- `cs2.match-integrity.v1` é propagado à ficha.
- Partida recusada pelo gate fica fora dos padrões.
- Partida pré-contrato é declarada como tal.
- Rounds anulados ou desconhecidos não recebem contexto nem replay (VOIDED_OR_UNKNOWN).

## 24. Corpus de demos autorizado

| Demo                                      | Resultado                                             | Observação                                     |
| ----------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Dust2 profissional (pública)              | trajetórias COMPLETE, 16 rounds, 10 jogadores         | sem lacunas no round 1                         |
| Mirage profissional (FURIA × GamerLegion) | COMPLETE, 23 rounds                                   | HOT 5,22 MB + 799 KB; RSS 4003 MB; parse 149 s |
| GamersClub Mirage (2026-11-11)            | COMPLETE, 19 rounds                                   | HOT 4,71 MB + 470 KB; RSS 2398 MB; parse 96 s  |
| `demo2.dem` (Mirage)                      | COMPLETE, 28 rounds                                   | HOT 5,33 MB + 772 KB; RSS 3533 MB; parse 161 s |
| `demo3.dem` (Dust2)                       | COMPLETE, 22 rounds                                   | HOT 4,87 MB + 564 KB; RSS 2987 MB; parse 120 s |
| `demo1.dem` (Mirage)                      | demoparser2 `EntityNotFound` já na leitura de eventos | não é efeito do PM2                            |
| GamersClub Mirage                         | sem janelas: `UNAVAILABLE` / `NO_ROUND_WINDOW`        | já documentado no PM6                          |
| GamersClub Cache                          | sem janelas: `UNAVAILABLE` / `NO_ROUND_WINDOW`        | já documentado no PM6                          |

**Correção de método.** As linhas acima, exceto as FACEIT, foram medidas com demoparser2 **0.42.0** instalado no sandbox. A produção usa **0.42.2**: `demo1.dem` e a GamersClub Cache, que falhavam em 0.42.0, não foram reavaliadas. As medições FACEIT abaixo usam 0.42.2.

| Demo FACEIT (0.42.2) | Rounds | Kills | Vítima ou atacante desconhecido | Trajetórias | HOT     | RSS     | Parse | Bot substituto omitido |
| -------------------- | ------ | ----- | ------------------------------- | ----------- | ------- | ------- | ----- | ---------------------- |
| Nuke                 | 24     | 181   | 0                               | COMPLETE 24 | 5,11 MB | 3299 MB | 98 s  | 3                      |
| Ancient              | 17     | 120   | 0                               | COMPLETE 17 | 4,58 MB | 1930 MB | 63 s  | 0                      |
| Dust2                | 16     | 111   | 0                               | COMPLETE 16 | 4,54 MB | 2116 MB | 62 s  | 0                      |
| Cache                | 19     | 137   | 0                               | COMPLETE 19 | 4,75 MB | 2472 MB | 71 s  | 0                      |
| Mirage               | 23     | 159   | 0                               | COMPLETE 23 | 4,92 MB | 3421 MB | 95 s  | 1                      |
| Anubis               | 22     | 154   | 0                               | COMPLETE 22 | 4,90 MB | 3118 MB | 107 s | 0                      |
| Inferno              | 22     | 159   | 0                               | COMPLETE 22 | 4,95 MB | 3314 MB | 105 s | 2                      |

Todas terminam com `game_phase = 5` (fim oficial).

**Defeito encontrado pelo upload real do dono (job `10c88d1b`, FACEIT Nuke, 2026-11-14 22:18Z).**

- A admissão v3 bloqueou a partida: `RAW-V2-14-combat: kill_victim_unknown`.
- Causa provada: quando o jogador desconectado reconecta, o BOT que o substituía é expulso, e o jogo emite um `player_death` sem vítima, sem atacante e com arma `world`, no tick exato do `player_disconnect` desse BOT (`networkid BOT`, `xuid 0`). O roster continua com 10 jogadores. 3 das 7 demos FACEIT seriam bloqueadas por isso.
- Correção no worker (`adapter.drop_bot_replacement_world_deaths`): omite só a linha com todas essas evidências, mantém a linha na evidência RAW e informa a contagem. O gate de admissão não muda. Publicada na R5.8.29.
- Em produção (2026-11-17), a mesma demo foi aceita: 181 kills, nenhuma sem vítima, igual ao parse local.

Nenhuma demo foi enviada a serviço externo ou ao GitHub.

## 25. Etapa E

`DEFERRED — TECHNICALLY FEASIBLE, NOT REQUIRED FOR PM2`.

## 26. Validação do replay em produção (2026-11-17)

Demo enviada pelo dono no app: `demo-faceit-nuke.dem`, job `93450453`, partida `daef42da`, `de_nuke`. Parser `git:47ba6ffe…` (R5.8.29).

| Verificação                             | Evidência                                                                                                                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admissão                                | `processed`. A tentativa anterior (`10c88d1b`) foi bloqueada antes da correção; esta passou                                                                                                                                                    |
| Eventos                                 | 181 kills (igual ao parse local), 0 kills sem vítima, 5 plants e 2 defuses                                                                                                                                                                     |
| Trajetória                              | `match_trajectories.status = COMPLETE`, 24/24 rounds, 7274 amostras, `step_ticks` 16, nada pulado, `parser_revision` `git:47ba6ffe…`                                                                                                           |
| Ownership                               | Antes de o jogador ser escolhido, `/replay` respondeu `NOT_FOUND` (a partida ainda não era do usuário). Depois da escolha manual pelo dono (`self_declared_player`), o job reprocessou: `identity_status resolved`, 1 linha em `match_metrics` |
| `/replay` round 3                       | SVG com o radar de Nuke, 10 jogadores (CT1–CT5, "Você", T1–T4), "2500 de 2500 amostras observadas · a cada 16 ticks", 8 eventos em segundos, legenda de observado, interpolado, morto e sem amostra. Play avançou até 4,1 s e pause parou      |
| Privacidade                             | Nenhum padrão de SteamID64 no DOM                                                                                                                                                                                                              |
| Partida antiga                          | Dust2 de 13/11: "Replay não gravado para esta partida" (`NOT_RECORDED`), sem desenho                                                                                                                                                           |
| Integração B+I                          | `/deaths` da partida: 19 fichas e 19 radares. "Ver no replay 2D" (round 1) abriu `round=1&tick=14552` em 13,3 s                                                                                                                                |
| Latência (Resource Timing do navegador) | Segmento por round: 2752, 2743, 2948, 2776 e 3019 ms (rounds 6, 7, 8, 12, 20); 16–32 KB comprimidos, 292–616 KB decodificados                                                                                                                  |

Capturas: tiradas no navegador do dono durante a sessão; não foram versionadas, porque mostram dados da conta.
