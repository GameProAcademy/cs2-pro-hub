# PM2 v2 — Relatório final (C3–C6): diagnóstico de mortes (4.2.3, Módulo B) e replay 2D (4.2.4, Módulo I)

Sessão `session_012aG79D5h8yCsYxNjWpDaHG` · 2026-11-14 (America/Sao_Paulo).

Estados usados: VALIDADO EM PRODUÇÃO · VALIDADO EM TESTE · IMPLEMENTADO, NÃO VALIDADO · PENDENTE · NÃO SUPORTADO.

**Veredito: PARCIAL.** As duas fases estão implementadas, integradas, testadas, publicadas e funcionando em produção. Ficam pendentes critérios de aceite que dependem de uma demo nova e de ações do dono (§16–§17). Nada aqui está declarado 100% concluído.

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
| Links para heatmap e replay                | VALIDADO EM PRODUÇÃO (links presentes); o destino do replay ainda mostra `NOT_RECORDED` (§16)                                                                                                        |
| Ownership/RLS                              | VALIDADO EM TESTE com 2 usuários (PostgreSQL descartável, 39/39); em produção, o id de partida real de outro usuário dá NOT_FOUND                                                                    |
| UI e i18n completos                        | VALIDADO EM TESTE (5 idiomas); produção vista em pt-BR                                                                                                                                               |
| Integridade da partida preservada          | VALIDADO EM PRODUÇÃO (pré-contrato declarado como "fim não verificado")                                                                                                                              |
| Provenance e coverage explícitos           | VALIDADO EM PRODUÇÃO                                                                                                                                                                                 |
| E2E e regressão                            | Regressão VALIDADA (CI verde). Não há E2E automatizado de browser: PENDENTE                                                                                                                          |
| Feedback do jogador                        | VALIDADO EM PRODUÇÃO (autorizado pelo dono, 2026-11-14 17:05): "Útil" numa regra e numa ficha gravaram 2 linhas; a troca para "Não útil" atualizou a mesma linha (`updated_at` mudou, sem duplicata) |

## 4. Fase 4.2.4 — PARCIAL

| Critério (§21.2)                                                                             | Estado                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay abre o round correto, timeline e eventos sincronizados, controles, seleção de jogador | VALIDADO EM TESTE, incluindo a renderização da UI real com trajetórias de uma demo autorizada (GamersClub Mirage, round 5: 3720/3720 amostras, 64 ticks/s comprovados, 7 kills sincronizadas no tempo, nenhum SteamID no segmento). Em produção só há o estado `NOT_RECORDED`, porque nenhuma partida nova foi processada após a release |
| Heatmap e death review abrem no tick correto                                                 | Deep link `/replay?matchId&round&tick` VALIDADO EM TESTE                                                                                                                                                                                                                                                                                 |
| Lacunas e dados ausentes comunicados                                                         | VALIDADO EM TESTE; `NOT_RECORDED` e `NOT_FOUND` VALIDADOS EM PRODUÇÃO                                                                                                                                                                                                                                                                    |
| Segmentos com limites                                                                        | VALIDADO EM TESTE (1 round por requisição, 500 eventos, 12 jogadores, 1600 amostras)                                                                                                                                                                                                                                                     |
| Performance e memória medidas                                                                | Worker medido com 5 demos locais (§12, §24; pico 4,0 GB contra limite de 8 GB; HOT máximo 6,1 MB contra 8 MB). Tempo da API em produção PENDENTE (sem trajetória gravada)                                                                                                                                                                |
| Ownership/RLS                                                                                | VALIDADO EM TESTE (dono lê; não-dono, anon e escrita de jogador recusados); NOT_FOUND em produção                                                                                                                                                                                                                                        |
| Transformação espacial por mapa suportado                                                    | `de_dust2` e `de_mirage` VALIDATED (Mirage validado neste PM com 2 demos independentes, §22); os demais não desenham (MAP_NOT_VALIDATED)                                                                                                                                                                                                 |
| E2E e regressão                                                                              | Regressão VALIDADA; E2E de browser PENDENTE                                                                                                                                                                                                                                                                                              |

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

| Migration                                      | Conteúdo                                                                                    | Produção                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `20261114130000_pm2_death_feedback`            | `death_feedback`, `owns_death_event`, RLS só do dono                                        | aplicada e registrada (`9d5b2e95`, md5 `7064b74d…`)                                                                        |
| `20261114140000_pm2_round_trajectories`        | `match_trajectories`, `round_trajectories`, leitura pelo dono, escrita só pela service role | aplicada e registrada (`b440a06f`, md5 `3bd1922c…`)                                                                        |
| `20261114190000_r5_8_28_repin_runtime_release` | re-pin R5.8.28                                                                              | aplicada e registrada (`80ee284c`, md5 `20d31485…`); md5 das funções lidas depois: `99776ca5…` / `1918875c…` / `f74d8af9…` |

Contratos: `cs2.death-context.v1`, `cs2.death-rules.v1`, `cs2.round-trajectory.v1`, `cs2.replay-segment.v1`, `CoachFacts.deathPatterns`.

## 9. PRs e merges

| PR   | Conteúdo                    | Merge      |
| ---- | --------------------------- | ---------- |
| #291 | C0–C2                       | `ed124279` |
| #292 | contratos puros             | `4b635721` |
| #293 | API `/deaths`, UI, feedback | `9d5b2e95` |
| #294 | trajetórias e replay        | `b440a06f` |
| #295 | Coach (regra 25)            | `51b88fea` |
| #296 | re-pin R5.8.28              | `80ee284c` |

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

- Worker: Railway `bb92ed95` (commit `b440a06f`). Os dois hosts `/version`: `git:b440a06f…`, `declared_revision_matches` true.
- App: publicado pelo conector a partir de `main` `51b88fea` (publicação `34eeeac7`).

## 14. Identidade do parser e H.3-E

- Re-pin R5.8.28: deployment, commit e blob `parser.py`.
- Atestação VERIFIED: provenance `e5793f1a-ca5d-47f1-9b8c-02bea413d6e9`, digest `6432b232…`.
- H.3-E PASS 18/18 (run 43635475197).
- O Source persistente da Railway agora é `b440a06f` (o metadado `4716f894` foi resolvido): a troca de Source gerou `ef2caa23`, SKIPPED pelo freeze e sem build; o único build é `bb92ed95`.

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

- Replay em produção sem dados até uma demo nova; partidas antigas não são reprocessadas (decisão do prompt).
- Só Dust2 e Mirage são VALIDATED; Cache, Inferno, Nuke e os demais continuam sem desenho.
- Exposição, isolamento, re-peek e rotação: NOT_SUPPORTED.
- Event refs não vão ao Coach.
- Sem E2E automatizado de browser.
- Linha do tempo em segundos só quando a relação tick/tempo do round é comprovada; caso contrário, em ticks com velocidade nominal declarada.

## 17. Ações manuais

1. **Upload de uma demo nova pelo próprio dono no app** ("Analisar meu jogo"), para validar o replay de ponta a ponta em produção. A autorização existe (2026-11-14 17:05), mas o upload não pôde ser feito por esta sessão: o navegador automatizado só envia até 10 MB, as demos têm de 196 a 473 MB e não há shell no computador do dono. Use uma demo em que você jogou (por exemplo `demo2.dem` ou `demo3.dem`, que parseiam COMPLETE). Depois confira:
   - `select status, count(*) from match_trajectories group by 1`;
   - abrir `/replay`: o round deve abrir, os controles funcionar e o rótulo "Você" aparecer.
2. **Validar o teste IDOR com um segundo usuário real.**
3. **Alerta de segurança do Lovable:** revisar manualmente no painel (§21).

## 18. Riscos residuais e rollback

- **Risco:** trajetória maior que o esperado num mapa novo. O round é pulado por inteiro (limites) e o job nunca falha (best effort).
- **Rollback do worker:** Railway `7690b171`, Source de volta para `3837a810`, `docs/reference/r5_8_28/rollback.sql` e os secrets de R5.8.27.
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

- `de_cache`: NÃO VALIDADO. A única demo de Cache legível pelo staging tem 112 MB, mas o demoparser2 dá `EntityNotFound` nela. A demo FURIA de Cache tem 473 MB, acima do limite de 400 MB de staging.
- Demais mapas: NOT_VALIDATED ou UNKNOWN_MAP. Nada é desenhado nesses mapas, nem na ficha, nem no heatmap, nem no replay.

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

Nenhuma demo foi enviada a serviço externo ou ao GitHub.

## 25. Etapa E

`DEFERRED — TECHNICALLY FEASIBLE, NOT REQUIRED FOR PM2`.
