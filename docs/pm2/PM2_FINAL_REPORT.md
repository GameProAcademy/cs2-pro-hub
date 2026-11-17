# PM2 v2 — Relatório final (C3–C6): diagnóstico de mortes (4.2.3, Módulo B) e replay 2D (4.2.4, Módulo I)

Sessão `session_012aG79D5h8yCsYxNjWpDaHG` · 2026-11-14 (America/Sao_Paulo).

Estados usados: VALIDADO EM PRODUÇÃO · VALIDADO EM TESTE · IMPLEMENTADO, NÃO VALIDADO · PENDENTE · NÃO SUPORTADO.

**Veredito: PM2 COMPLETE (2026-11-17).** Os critérios de aceite da Etapa A do Prompt Mestre 3 têm evidência verificável (§30): replay validado em produção (§26), E2E automatizado de browser e teste IDOR em dois sentidos com duas contas reais, 12/12 em produção (run 44062163308, §28), PR #302 merged, relatório e checkpoint coerentes. Limitações declaradas e não bloqueantes: Overpass, Train e Vertigo NOT_VALIDATED; alerta de segurança do Lovable NOT_VERIFIED; etapa E DEFERRED; latência do replay como item do PM3 (§27). O PM3 não foi iniciado.

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

## 3. Fase 4.2.3 — VALIDADA EM PRODUÇÃO (limitações declaradas)

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
| E2E e regressão                            | Regressão VALIDADA (CI verde). E2E de browser VALIDADO EM PRODUÇÃO: run 44062163308, contas A e B (§28)                                                                                              |
| Feedback do jogador                        | VALIDADO EM PRODUÇÃO (autorizado pelo dono, 2026-11-14 17:05): "Útil" numa regra e numa ficha gravaram 2 linhas; a troca para "Não útil" atualizou a mesma linha (`updated_at` mudou, sem duplicata) |

## 4. Fase 4.2.4 — VALIDADA EM PRODUÇÃO (limitações declaradas)

| Critério (§21.2)                                                                             | Estado                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay abre o round correto, timeline e eventos sincronizados, controles, seleção de jogador | VALIDADO EM PRODUÇÃO (2026-11-17, demo FACEIT Nuke enviada pelo dono). Round 3: 2500/2500 amostras, 10 jogadores, rótulo "Você", 8 eventos em segundos; o play avançou até 4,1 s e o pause parou; nenhum SteamID no DOM (§26). Também VALIDADO EM TESTE (GamersClub Mirage) |
| Heatmap e death review abrem no tick correto                                                 | A ficha de morte abrindo no tick correto foi VALIDADA EM PRODUÇÃO (round 1, tick 14552, aberto em 13,3 s). Heatmap → replay: VALIDADO EM TESTE                                                                                                                              |
| Lacunas e dados ausentes comunicados                                                         | VALIDADO EM TESTE. Em produção foram VALIDADOS `NOT_RECORDED` (partida Dust2 de 13/11, processada antes do replay existir), `NOT_FOUND` (partida ainda sem jogador associado) e a legenda de amostras observadas e interpoladas                                             |
| Segmentos com limites                                                                        | VALIDADO EM TESTE (1 round por requisição, 500 eventos, 12 jogadores, 1600 amostras)                                                                                                                                                                                        |
| Performance e memória medidas                                                                | Worker medido com o corpus local de demos (§12, §24; pico 4,0 GB contra limite de 8 GB; HOT máximo 6,1 MB contra 8 MB). Em produção, o segmento de um round levou de 2,7 a 3,0 s (5 rounds; 16–32 KB comprimidos, 292–616 KB decodificados; §26)                            |
| Ownership/RLS                                                                                | VALIDADO EM TESTE (dono lê; não-dono, anon e escrita de jogador recusados); NOT_FOUND em produção                                                                                                                                                                           |
| Transformação espacial por mapa suportado                                                    | 7 mapas VALIDATED (Dust2, Mirage, Inferno, Nuke, Ancient, Anubis e Cache; §22). Overpass, Train e Vertigo não desenham (MAP_NOT_VALIDATED). Nuke desenhado em produção (§26)                                                                                                |
| E2E e regressão                                                                              | Regressão VALIDADA; E2E de browser VALIDADO EM PRODUÇÃO (run 44062163308, §28)                                                                                                                                                                                              |

## 5. Módulos B e I

- **B (diagnóstico):**
  - contrato, regras, agregação, API, UI, feedback e Coach;
  - exposição, isolamento, re-peek e rotação ficam **NOT_SUPPORTED**: exigem posições de companheiros e adversários ao longo do tempo, que a ficha ainda não lê. As trajetórias novas passam a guardar esse dado só para partidas novas.
- **I (replay):** worker, persistência, API e UI completos e **VALIDADOS EM PRODUÇÃO** em 2026-11-17 (detalhe em §26):
  - partida `daef42da`, job `93450453`, `de_nuke`, demo FACEIT enviada pelo dono;
  - parser `git:47ba6ffef76feae95dc98075cf3fb8089e02ce8f` (R5.8.29), Railway `3375b68b`;
  - 24/24 rounds com trajetória (`COMPLETE`), 7274 amostras, `step_ticks` 16, nenhum round pulado;
  - navegação: round 3 com 2500/2500 amostras e 10 jogadores; play avançou até 4,1 s e pause parou; troca de round (6, 7, 8, 12, 20) carregou o segmento de cada um;
  - deep link `/deaths` → `/replay?round=1&tick=14552` abriu em 13,3 s;
  - limitações observadas: o segmento leva 2,7–3,0 s por round (§16, §27); partidas processadas antes do R5.8.28 mostram `NOT_RECORDED` e não são reprocessadas.

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
- Segmento do replay em produção: 2,7–3,0 s de espera no servidor por round, mais 0,4–0,9 s no cliente antes da requisição. Investigação e hipóteses em §27; nenhuma otimização no PM2.
- Exposição, isolamento, re-peek e rotação: NOT_SUPPORTED.
- Event refs não vão ao Coach.
- O E2E de browser roda só por disparo manual (`workflow_dispatch`), porque entra na produção com contas reais. Não roda em cada PR.
- Linha do tempo em segundos só quando a relação tick/tempo do round é comprovada; caso contrário, em ticks com velocidade nominal declarada.

## 17. Ações manuais

1. ~~Upload de uma demo nova pelo dono~~: feito em 2026-11-17 (`demo-faceit-nuke.dem`; §26).
2. ~~Teste IDOR com um segundo usuário real~~: feito em 2026-11-17, em dois sentidos (§28).
3. **Trocar a senha da conta de teste A** e atualizar o secret `PM2_E2E_A_PASSWORD`. Na run 44035115612, antes da correção de §29, a senha foi para a URL de `/login` e pode estar nos logs do servidor ou da CDN. A conta B não chegou a logar nessa run.
4. **Alerta de segurança do Lovable:** revisar manualmente no painel (§21).

## 18. Riscos residuais e rollback

- **Risco:** trajetória maior que o esperado num mapa novo. O round é pulado por inteiro (limites) e o job nunca falha (best effort).
- **Rollback do worker (R5.8.29):** Railway `bb92ed95`, Source de volta para `b440a06f`, `docs/reference/r5_8_29/rollback.sql` e os secrets de R5.8.28.
- **Rollback do app:** reverter os merges. As tabelas aditivas podem ficar.

## 19. Lovable

Nenhum prompt foi enviado ao agente Lovable. A publicação foi feita só pelo conector técnico (`deploy_project`). Não houve "Try to fix" nem correção automática.

## 20. Recomendação para o Prompt 3 de 5

- A validação real do replay em produção **já ocorreu** (§5, §26). Não é preciso outra demo para esse critério.
- Os critérios formais do PM2 estão fechados: IDOR em dois sentidos com duas contas reais e E2E automatizado de browser, 12/12 em produção (§28, §30).
- O início do PM3 (4.2.5–4.2.6, módulos C e D) depende de autorização explícita do dono.

Prioridades para o PM3, depois dessa autorização:

1. Investigar a latência do segmento do replay (2,7–3,0 s por round; §27) como item de observabilidade e performance. Não amplia o escopo do PM2: a correção, se houver, vai em PR separado, com benchmark antes e depois.
2. Usar `round_trajectories` (companheiros e adversários ao longo do tempo) para tirar exposição e isolamento de NOT_SUPPORTED, com uma nova versão de regras `cs2.death-rules.v2`.
3. Validar Overpass, Train e Vertigo só quando houver demos autorizadas desses mapas. Até lá, continuam NOT_VALIDATED, sem desenho.

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

## 27. Latência do replay (investigação, sem otimização)

Ambiente: produção, app `76fa4887`, partida `daef42da`, 2026-11-17 ~05:30Z. Navegador do dono, conta do dono. Nada foi alterado.

**Método.**

- Navegador: Resource Timing de cada chamada `_serverFn`. A espera é `responseStart − requestStart` (servidor + rede); o download é `responseEnd − responseStart`.
- Clique → render: `performance.now()` no clique até o round novo aparecer com o SVG.
- Banco: `EXPLAIN ANALYZE` das consultas do segmento. Com service role (sem RLS) e como `authenticated` com os claims do dono (com RLS), dentro de transação desfeita com `ROLLBACK`.
- Leitura do código: `getReplaySegment`, `loadPlayerOverview`, `requireSupabaseAuth` e `beforeLoad` de `_authenticated`.

**Medições.**

| Etapa                                                                | Valor                                                                      | Fonte                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| Espera no servidor por segmento (troca de round, requisição isolada) | 2683, 2691, 2705, 2727 e 2951 ms                                           | Resource Timing, rounds 9, 10, 11, 13 e 14 |
| Download do segmento                                                 | 2–3 ms (15–20 KB comprimidos)                                              | Resource Timing                            |
| Clique → saída da requisição                                         | 411 e 875 ms                                                               | `performance.now()`                        |
| Resposta → render                                                    | 30 e 873 ms                                                                | `performance.now()`                        |
| Clique → render, round novo                                          | 3394, 3652 e 4456 ms                                                       | `performance.now()`                        |
| Clique → render, round já visitado (cache do React Query)            | 479 ms, nenhuma chamada `_serverFn`                                        | `performance.now()` + Resource Timing      |
| Chamadas ao Supabase em toda troca de round, inclusive em cache      | `auth/v1/user` 464 ms e `rest/v1/profiles` 173 ms                          | Resource Timing                            |
| Função de servidor leve isolada                                      | 273–470 ms                                                                 | Resource Timing                            |
| Carga inicial da página (5 chamadas concorrentes)                    | o segmento esperou 3808 ms; as outras, 1427–2569 ms                        | Resource Timing                            |
| SQL do segmento sem RLS                                              | 0,13–0,42 ms de execução, ≤ 2,7 ms de planejamento                         | `EXPLAIN ANALYZE`                          |
| SQL do segmento com RLS (`authenticated`)                            | `round_trajectories` 3,3 ms; `round_events` 9,1 ms; `match_metrics` 2,2 ms | `EXPLAIN ANALYZE`                          |
| Ida e volta navegador → API REST do Supabase                         | 173–188 ms                                                                 | Resource Timing                            |

**Contagem de idas ao banco no servidor (leitura do código).** `getReplaySegment` executa em sequência:

- `loadPlayerOverview`, com cerca de 7 chamadas: jobs, uploads, ids de jogador, métricas, quarentena, partidas e método de flash;
- `ownPlayerIds` de novo;
- `ownParticipantKeys`;
- `match_trajectories`;
- `match_rounds` e `round_trajectories` (em paralelo);
- a trajetória do round e os eventos.

São cerca de 12 idas sequenciais à API REST, além da verificação do token em `requireSupabaseAuth` (`getClaims`).

**Hipótese mais provável (não comprovada; falta instrumentação no servidor):** a espera de 2,7–3,0 s vem da soma de cerca de 12 idas sequenciais da função de servidor à API REST do Supabase, cada uma com custo fixo de rede e gateway. A maior parte delas é a reconstrução do overview completo só para confirmar que a partida pertence ao usuário. O SQL soma menos de 100 ms, mesmo com RLS.

Coerência dos números: 12 idas × ~200 ms ≈ 2,4 s, mais a autenticação, e uma função leve de 1–2 idas leva 273–470 ms. A latência servidor → Supabase não foi medida diretamente, porque o servidor do app não tem instrumentação.

**Hipótese secundária, com mecanismo confirmado no código e na medição:** cada troca de round muda a URL e roda o `beforeLoad` de `_authenticated`, que chama `supabase.auth.getUser()` (464 ms) e depois lê `profiles` (173 ms) antes da requisição sair. Isso explica os 0,4–0,9 s antes da requisição e os 479 ms de um round que já está em cache.

**Hipóteses descartadas, com a medição que as descarta:**

- tempo de execução SQL e planos: ≤ 9 ms com RLS;
- tamanho e transferência do payload: download de 2–3 ms;
- worker e parser: o segmento não chama o worker;
- descompressão: o corpo é JSON pequeno;
- render: 30 ms no caso típico. O valor de 873 ms foi um caso isolado, não investigado.

**Primeiro acesso × seguintes.** Sem cold start visível: a espera fica estável em 2,7–3,0 s nas trocas de round. Na carga inicial, as 5 funções concorrentes pioram (até 3,8 s), o que sugere que as chamadas competem entre si no servidor.

**Impacto observado:** um round novo leva 3,4–4,5 s até aparecer; um round já visitado, cerca de 0,5 s. O replay funciona; não é defeito de correção nem de segurança.

**Recomendação para o PM3 (item de observabilidade e performance, PR separado com benchmark antes e depois):**

1. Instrumentar o servidor com `Server-Timing` por etapa (autenticação, overview, ownership, trajetória e eventos) para comprovar ou descartar a hipótese principal.
2. Verificar a ownership da partida com uma consulta direta protegida por RLS, sem reconstruir o overview inteiro, e paralelizar as leituras independentes. Exige teste IDOR antes e depois.
3. Avaliar se o `beforeLoad` precisa de `getUser()` em rede a cada mudança de busca na mesma rota, sem enfraquecer o fail-closed da autenticação.

## 28. Teste IDOR em dois sentidos e E2E de browser (VALIDADOS EM PRODUÇÃO)

**Run:** [44062163308](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/44062163308), workflow `PM2 browser E2E` (`workflow_dispatch`), `main` @ `b0452747888f001762cb62aa31f4eda63c3f3bdd`, alvo `https://gamepro.network`, 2026-11-17 10:10–10:12Z. Resultado: **success, 12/12**.

- **Ferramenta:** Playwright `1.63.0`, fixado em `e2e/package-lock.json`, Chromium, 1 worker, execução serial.
- **Ambiente:** produção. App publicado de `d68a82db` (publicação `0719c851`); worker Railway `3375b68b` (`47ba6ffe`).
- **Contas:** duas contas reais de teste (A e B), separadas da conta do dono. Cada uma tem uma partida processada pelo pipeline real, com trajetória `COMPLETE` (jobs `878335b6` e `64a33e25`).
- **Credenciais:** só nos secrets `PM2_E2E_*`. O guard confirmou os 4 secrets antes dos testes. O log mostra `***`. Os e-mails das contas não aparecem em nenhum documento.
- **Privacidade:** o repositório é público, então não há trace, vídeo nem screenshot. A evidência é o resumo JSON da run (artefato `pm2-e2e-summary`, 705 B, `sha256:0370f0a3…`), só com status e contagens.

**Histórico de execuções:**

| Run         | SHA        | Resultado            | Causa                                                                                               |
| ----------- | ---------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| 44031506261 | `226e37ce` | parou no guard       | secrets vazios (criados fora de Repository secrets)                                                 |
| 44035115612 | `226e37ce` | falhou no login de A | submit antes da hidratação virou GET com credenciais na URL: defeito de segurança, corrigido em §29 |
| 44062163308 | `b0452747` | **12/12 success**    | —                                                                                                   |

**Fluxo próprio (A e B):**

| #   | Cenário                                                      | A                                        | B                |
| --- | ------------------------------------------------------------ | ---------------------------------------- | ---------------- |
| 1   | Login (espera `form[data-hydrated="true"]`)                  | PASS                                     | PASS             |
| 2   | Partidas próprias                                            | PASS (1 linha)                           | PASS (3 linhas)  |
| 3   | `/deaths` abre                                               | PASS (11 mortes)                         | PASS (16 mortes) |
| 4   | Ficha de morte com proveniência                              | PASS                                     | PASS             |
| 10  | Feedback gravado e persistido após reload                    | PASS (sem valor anterior para restaurar) | PASS (idem)      |
| 8   | Deep link `/deaths` → `/replay` no tick                      | PASS (round 1)                           | PASS (round 1)   |
| 5   | Replay abre                                                  | PASS                                     | PASS             |
| 6   | Navegação entre rounds                                       | PASS                                     | PASS             |
| 7   | Navegação temporal (timeline)                                | PASS                                     | PASS             |
| 9   | Play e pause                                                 | PASS                                     | PASS             |
| 11  | Estados indisponíveis (`NOT_FOUND` em `/replay` e `/deaths`) | PASS                                     | PASS             |
| —   | Nenhum SteamID64 no DOM                                      | PASS                                     | PASS             |
| —   | Guard de credenciais (0 requisições com credencial na URL)   | PASS                                     | PASS             |

**Isolamento em dois sentidos:**

| #       | Tentativa                                                                                                           | A → B                                        | B → A                     |
| ------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------- |
| 1       | Partida da vítima na listagem do atacante                                                                           | PASS (ausente)                               | PASS (ausente)            |
| 2, 4    | `/replay?matchId=<vítima>`                                                                                          | PASS `NOT_FOUND`                             | PASS `NOT_FOUND`          |
| 5       | Deep link `/replay?matchId&round&tick` da vítima                                                                    | PASS `NOT_FOUND`                             | PASS `NOT_FOUND`          |
| 3       | `/deaths?matchId=<vítima>`                                                                                          | PASS `NOT_FOUND`, sem SVG                    | PASS `NOT_FOUND`, sem SVG |
| 6, 8, 9 | Requisição de feedback da vítima (ids e event ref dela) reenviada com a sessão do atacante                          | PASS `REFUSED` (http 200, status de negócio) | PASS `REFUSED`            |
| 7       | Leitura REST sob RLS: `round_trajectories`, `match_trajectories`, `round_events`, `death_feedback`, `match_metrics` | PASS: 0 linhas nas 5                         | PASS: 0 linhas nas 5      |
| 8       | INSERT REST de feedback na partida da vítima                                                                        | PASS (http 403)                              | PASS (http 403)           |
| 8       | PATCH REST do feedback da vítima                                                                                    | PASS: 0 linhas                               | PASS: 0 linhas            |
| 10      | Cache do cliente: logout pelo botão do app e login do atacante **sem reload**                                       | PASS (partida da vítima ausente)             | PASS                      |
| —       | Guard de credenciais                                                                                                | PASS                                         | PASS                      |

**Verificação independente no banco** (somente leitura, depois da run):

- `death_feedback` com o usuário B na partida de A: **0**; com o usuário A na partida de B: **0**;
- linhas das contas A e B em qualquer outra partida: **0**;
- cada conta tem só a própria linha (1 e 1), gravada pelo passo de feedback.

**Critérios atendidos:**

- O owner vem da sessão no servidor: o feedback com os ids da vítima é `REFUSED`, e o RLS barra INSERT e PATCH.
- Nenhum `owner_id` vem do cliente: a injeção de campo é rejeitada pelo schema estrito (`deathReviewUi.test.tsx`). Não foi reenviada pelo E2E, porque o corpo da server function é uma serialização do framework.
- Policies e RLS não foram alterados.

**Limitações:**

- O feedback das contas de teste ficou gravado: não havia valor anterior para restaurar.
- O resumo registra o round do deep link, mas não os ids das partidas (repositório público).

## 29. Defeito de segurança: credenciais na URL antes da hidratação (corrigido)

**Achado (run 44035115612):** o E2E clicou "Entrar" antes de o React hidratar. O formulário do `/login`, renderizado no servidor e sem `method`, fez um GET nativo para `/login?email=…&password=…`.

- Qualquer usuário real que enviasse antes da hidratação (rede lenta, JS falhando ou desligado) mandaria e-mail e senha para a URL, o histórico, o Referer e os logs do servidor e da CDN.
- Só o `/login` vazava: era o único formulário de autenticação renderizado no servidor com `name` nos campos.
  - `/register` não tinha `name` nos campos.
  - O formulário do `/reset-password` não sai no SSR.
  - O modo "esqueci a senha" só existe depois de um clique no cliente.
  - Os formulários de `/_authenticated` são client-only (`ssr: false`) e chamam `preventDefault()` na primeira linha.

**Correção (PR #306, `d68a82db`):** o componente `SafeForm` é usado em login, registro e reset de senha.

1. Um `<fieldset disabled>` desabilita campos e submit até a hidratação, então nem clique nem Enter enviam de forma nativa.
2. `method="post"` é defesa em profundidade.
3. Depois da hidratação, `preventDefault()` roda antes do handler.
4. O atributo `data-hydrated` serve de sinal para os testes.

As chamadas ao Supabase, as mensagens genéricas, os rate limits, o RLS e os fluxos não mudaram.

**Evidências:**

| Etapa                                                                         | Evidência                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reprodução local (código antigo, `vite dev`)                                  | `e2e/auth-forms.e2e.ts`, com valores falsos: login sem JS e login antes da hidratação navegaram para `…/login?email=probe…&password=Probe…`; os 2 cenários falharam                                   |
| Local com a correção                                                          | os mesmos cenários passaram; registro já passava no código antigo                                                                                                                                     |
| Testes unitários                                                              | `SafeForm.test.tsx` (markup do servidor: `method="post"`, nenhum `method="get"`, nenhum `action`, tudo dentro de `fieldset disabled`, `data-hydrated="false"`); `vitest` 685/685; tsc e eslint limpos |
| Gates do PR #306                                                              | 5/5 verdes no head `122ee56a`                                                                                                                                                                         |
| Gates em `main` (`d68a82db`)                                                  | Quality Gates 44056954897, F553 44061668885 e H.3-E 44061713392: todos verdes                                                                                                                         |
| Produção, markup (depois da publicação `0719c851`)                            | `<form noValidate data-hydrated="false" method="post">` + `<fieldset disabled>` em `/login`                                                                                                           |
| Produção sem JS (iframe sandbox sem scripts, página real)                     | `/login` e `/register`: fieldset, e-mail, senha e submit desabilitados; clique e Enter não navegam; query vazia                                                                                       |
| Produção depois da hidratação (conta falsa `probe.e2e.noaccount@example.com`) | um `fetch` para `/auth/v1/token?grant_type=password`, sem valor de prova na URL; a página fica em `/login` com query vazia; mensagem genérica "E-mail ou senha inválidos." preservada                 |
| Produção, regressão automatizada (run 44062163308)                            | `auth-forms.e2e.ts`, 8/8: login e registro sem JS e antes da hidratação; login, esqueci a senha, registro e reset depois da hidratação; todo Supabase Auth abortado (nenhuma conta, nenhum e-mail)    |

**E2E (PR #307, `b0452747`):**

- O login espera `form[data-hydrated="true"]` e um submit habilitado, sem sleep fixo.
- Um guard intercepta toda requisição: se a URL tiver `email=`/`password=` ou um valor de credencial configurado, a requisição é abortada no navegador e o teste falha com `CREDENTIALS_IN_URL`. O registro guarda só método e caminho.
- Autoteste local contra o formulário antigo: o guard bloqueou exatamente `GET /login`.

**Ação manual pendente (higiene, não bloqueia o PM2):** trocar a senha da conta de teste A e atualizar o secret (§17, item 4).

## 30. Decisão: PM2 COMPLETE

| Critério (PM3 §1.7) | Estado                                                                | Evidência                                                                    |
| ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PR #302             | merged                                                                | `e20a7459`, CI 5/5 no head `62542708`                                        |
| Relatório final     | coerente com a produção                                               | este documento                                                               |
| Checkpoint          | coerente com o relatório e os SHAs                                    | `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`                                      |
| IDOR                | dois sentidos, duas contas reais                                      | §28 (run 44062163308) + verificação no banco                                 |
| `/deaths`           | isolamento comprovado                                                 | §28: `NOT_FOUND` em A→B e B→A                                                |
| `/replay`           | isolamento comprovado                                                 | §28: `NOT_FOUND`, sem SVG, cache SPA isolado                                 |
| Feedback            | isolamento comprovado                                                 | §28: `REFUSED`, INSERT 403, PATCH 0 linhas, banco 0/0                        |
| E2E de browser      | executado, 12/12                                                      | run 44062163308                                                              |
| Replay em produção  | validação da demo FACEIT Nuke preservada                              | §5, §26                                                                      |
| Railway             | `3375b68b` SUCCESS, commit `47ba6ffe`                                 | `list-deployments` 2026-11-17                                                |
| Runtime             | `/version`: `git:47ba6ffe…`, 0.42.2, `declared_revision_matches` true | reconferido 2026-11-17 ~10:15Z                                               |
| H.3-E               | PASS                                                                  | 44005644742 (`76fa4887`), 44031203616 (`6d3b91d7`), 44061713392 (`d68a82db`) |
| Segurança Lovable   | NOT_VERIFIED (sem prova independente)                                 | §21                                                                          |
| Etapa E             | DEFERRED                                                              | §25                                                                          |
| Mapas               | Overpass, Train e Vertigo NOT_VALIDATED                               | §22                                                                          |
| Latência            | investigada; hipótese documentada                                     | §27                                                                          |
| Próxima etapa       | PM3 preparado, não iniciado                                           | §20                                                                          |

PRs do fechamento: #302 (docs), #303 (E2E + hook de estado), #304 (correção do workflow), #306 (segurança dos formulários) e #307 (sincronização do E2E). Nenhum prompt foi enviado ao agente Lovable. O PM3 (Etapa B) depende de autorização explícita.
