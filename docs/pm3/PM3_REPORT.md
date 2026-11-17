# PM3 — Relatório vivo (Fases 4.2.5 e 4.2.6; módulos C e D)

Estados usados: VALIDADO EM PRODUÇÃO · VALIDADO EM STAGING · TESTADO LOCALMENTE · IMPLEMENTADO · PARCIALMENTE VALIDADO ·
NÃO MEDIDO · NÃO SUPORTADO · PENDENTE · BLOQUEADO.

Fonte do estado atual: `docs/pm3/PM3_CHECKPOINT.md`. Repositório público: este documento não contém e-mails, credenciais,
SteamIDs nem dados pessoais.

## C0 — Entrada (2026-11-17)

- **Estado de entrada:**
  - `main` `ab2d83c6`;
  - app publicado `0719c851` (de `d68a82db`);
  - worker R5.8.29 (Railway `3375b68b`, `47ba6ffe`, demoparser2 0.42.2);
  - H.3-E PASS em `b0452747`.
- Checkpoint central reconciliado no #309 (`6031b334`):
  - PM6 CONCLUÍDA, PM2 COMPLETE, PM3 ATIVA;
  - tabela de PRs #283–#308 com SHAs reais;
  - seções antigas marcadas HISTÓRICO.
- Secrets de E2E (`PM2_E2E_A_*`, `PM2_E2E_B_*`):
  - existência verificada pelos runs do PM2; valores nunca lidos nem impressos;
  - a troca de senha da conta A não foi repetida, conforme o adendo.

## C1 — Inventário de telemetria e viabilidade

Método:

- leitura somente leitura de `round_events` em produção (contagens por tipo e por campo);
- probes locais com demoparser2 0.42.2 sobre demos de Downloads (HLTV FURIA×Vitality Dust2, FACEIT Mirage, GC Cache), processadas em `scratchpad`, sem envio a terceiros.

**Produção antes do R5.8.30 (PROVADO):**

| Telemetria                           | Situação                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `weapon_fire` atirador / arma        | 0% (0/29 508): disparos não atribuídos                                                |
| `damage.hitgroup`                    | ausente                                                                               |
| Posição da detonação de granadas     | ausente                                                                               |
| molotov / incendiária                | 0 linhas (`molotov_detonate` não existe no CS2; o fogo começa em `inferno_startburn`) |
| `flash`                              | mistura `player_blind` (vítima + duração) e `flashbang_detonate` (sem vítima)         |
| `player_blind` por partida           | só em 3 de 13 partidas (demos antigas / HLTV não trazem o evento)                     |
| detonação sem lançador               | 1 partida (157/157 detonações sem `actor`)                                            |
| dano / abates com arma de utilitário | presentes (`hegrenade` 406, `inferno` 757, `molotov` 12 linhas de dano)               |

**Disponível no demoparser2 0.42.2 (PROVADO localmente):**

- `weapon_fire.user_steamid`, `weapon` e `silenced`;
- `player_hurt.hitgroup` e `health`;
- `player_death`: `hitgroup`, `thrusmoke`, `attackerinair`, `assistedflash`;
- x/y/z de detonação;
- `inferno_startburn`.

Correspondências provadas no corpus:

- acerto ↔ disparo por atirador + mesmo tick: 100%;
- cegueira ↔ `flashbang_detonate` pelo mesmo lançador no mesmo tick: 108/108 (e 100% nas 2 demos com `player_blind` do C4).
- `player_death.distance` está em **metros** (mediana de 39,37 unidades/m).

Divergências de nome a tratar:

- `player_hurt` usa o item base (`m4a1`, `hkp2000`);
- `weapon_fire` e `player_death` usam a variante (`m4a1_silencer`, `usp_silencer`).

Por isso a associação de acertos é feita por tick, nunca pelo nome da arma.

**Não disponível (NÃO MEDIDO):**

| Métrica             | O que falta                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| crosshair placement | ângulos antes do contato, posição do oponente e linha de visão, nos mesmos ticks |
| counter-strafe      | velocidade no tick do disparo (`velocity_*` não é retornado)                     |
| controle de recoil  | aim punch por bala                                                               |
| eficácia de smoke   | cobertura e linha de visão                                                       |

## C2 — Plano (métricas aprovadas e não medidas)

**Módulo C — `cs2.duels.v1`** (`src/lib/combat/duels.ts`):

| Métrica                                         | Status quando há amostra | Requisito / mínimo                                   |
| ----------------------------------------------- | ------------------------ | ---------------------------------------------------- |
| duelos vencidos (`duel_win_rate`)               | DERIVED                  | todas as partidas; ≥ 10 duelos decididos             |
| duelos de abertura vencidos                     | DERIVED                  | todas as partidas; ≥ 5                               |
| abates com headshot                             | OBSERVED                 | todas as partidas; ≥ 5 abates                        |
| por classe de arma / por faixa de distância     | DERIVED                  | todas as partidas; ≥ 5 por linha                     |
| disparos que acertaram (`shot_hit_rate`)        | DERIVED                  | R5.8.30+; ≥ 50 disparos                              |
| primeira bala da rajada (`first_shot_hit_rate`) | DERIVED                  | R5.8.30+; ≥ 20 rajadas                               |
| acertos na cabeça (`head_hit_share`)            | DERIVED                  | R5.8.30+; ≥ 20 acertos                               |
| acerto por posição na rajada                    | DERIVED                  | R5.8.30+; rotulado como **não** sendo nota de recoil |
| crosshair placement, counter-strafe, recoil     | NOT_MEASURED             | —                                                    |

Definição de duelo:

- é o par de eventos dano/abate entre o jogador e um oponente na mesma ronda, com no máximo 3 s entre eventos;
- é fechado por um abate entre os dois;
- WON / LOST / UNRESOLVED;
- abertura = duelo fechado pelo primeiro abate da ronda.

**Módulo D — `cs2.utility.v1`** (`src/lib/utility/utility.ts`):

| Métrica                                                        | Status              | Requisito                                            |
| -------------------------------------------------------------- | ------------------- | ---------------------------------------------------- |
| detonações por tipo e fase da ronda                            | OBSERVED            | detonações com lançador                              |
| arremessos por tipo                                            | OBSERVED            | R5.8.30+ (senão NOT_OBSERVED)                        |
| fogo (molotov/incendiária) iniciado                            | OBSERVED            | R5.8.30+                                             |
| flashes que cegaram inimigo / inimigos por flash / s por flash | DERIVED             | `player_blind` presente; ≥ 5 flashes                 |
| aliados cegados / flashes que cegaram o próprio jogador        | OBSERVED            | `player_blind` presente                              |
| dano por HE / por fogo (inimigos)                              | DERIVED             | ≥ 5 granadas                                         |
| dano de granada em aliados; abates com HE/fogo                 | OBSERVED            | todas as partidas                                    |
| assistências de flash                                          | OBSERVED / INFERRED | método gravado por partida (flag do jogo / temporal) |

Uma flash sem inimigo cegado aparece como "sem efeito medido". O texto explica que ela pode ter forçado um recuo que a demo não mostra.

A matriz de liberação (`metricContract.ts`) foi atualizada para 4.2.5 e 4.2.6. Blockers novos:

- `LEGACY_MATCHES_WITHOUT_TELEMETRY`;
- `DEMO_SOURCE_DEPENDENT`.

## C3 — Implementação

| PR   | Conteúdo                                                                                                                                                                                   | Estado            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| #310 | Telemetria do parser R5.8.30: `weapon_fire` atribuído, hitgroup, `health_after`, `thru_smoke`, `attacker_in_air`, posição de detonação, `inferno_startburn`; catálogo de campos regenerado | MERGED `768646ea` |
| #311 | Módulo C: `cs2.duels.v1`, `/duels`, server fn com RLS/IDOR, i18n ×5                                                                                                                        | MERGED `7f1d8852` |
| #312 | Re-pin R5.8.30 (migration, spec, rollback, testes, probes, paridade, H3E)                                                                                                                  | MERGED `4cacaf5c` |
| #313 | Módulo D: `cs2.utility.v1`, `/utility`, server fn com RLS/IDOR, i18n ×5, matriz de liberação                                                                                               | MERGED `afa58592` |
| #314 | Observabilidade: `Server-Timing` por etapa do segmento do replay (medir antes de corrigir)                                                                                                 | MERGED `5ad16f13` |
| #315 | Coach: `latestMatchPlay` (C e D da partida mais recente) + regra 26; texto antigo "enemies flashed" corrigido; E2E de `/duels` e `/utility`                                                | ABERTO (CI)       |

Segurança, igual à do PM2:

- sessão do próprio jogador, nunca service role;
- matchId fora do overview → NOT_FOUND;
- o jogador só lê os próprios eventos, mais os abates e plants da partida;
- nenhuma identidade de outro jogador sai na resposta.

## C4 — Validação

Testes locais por PR (todos verdes; a única falha local, em todas as rodadas, é o harness de PostgreSQL descartável sem `initdb`, que roda no CI):

| PR             | Testes          | Contagem                          |
| -------------- | --------------- | --------------------------------- |
| #310           | worker          | 588                               |
|                | scripts         | 461                               |
|                | pipeline vitest | 1123                              |
| #311           | duels           | 17                                |
|                | UI × 5 locales  | 14                                |
| #313           | engine          | 12                                |
|                | UI × 5 locales  | 20                                |
|                | metricContract  | 16                                |
| #312           | scripts         | 399                               |
|                | paridade        | 91                                |
| Coach          | latestMatchPlay | 4                                 |
|                | coach-related   | 310                               |
| suíte completa | vitest          | 2593 aprovados, 1 falha (harness) |

Demos reais processadas localmente (parser `768646ea`), TESTADO LOCALMENTE:

**HLTV FURIA×Vitality Dust2 (módulo C):**

- tickrate 64 (MATCH);
- duelos ganhos 20 = abates 20; perdidos 12 = mortes 12;
- `duel_win_rate` 0,625 (n=32);
- `shot_hit_rate` 0,2953 (n=254); `first_shot_hit_rate` 0,3636 (n=44); `head_hit_share` 0,1688 (n=77).

**Módulo D:**

| Demo          | Flashes | Com inimigo  | Inimigos/flash | s/flash      | Outros                                              |
| ------------- | ------- | ------------ | -------------- | ------------ | --------------------------------------------------- |
| FACEIT Mirage | 24      | 0,5833       | 1,1667         | 3,02         | 17 aliados cegados; fogo 7,92 HP/granada (n=12)     |
| GC Cache      | 11      | 0,5455       | 0,6364         | 2,02         | —                                                   |
| HLTV Dust2    | —       | NOT_OBSERVED | NOT_OBSERVED   | NOT_OBSERVED | demo sem `player_blind`; HE 13,33 HP/granada (n=12) |

Nas três demos:

- arremessos = detonações, por tipo;
- 0 cegueiras sem flash associada.

Achado corrigido antes do merge: a primeira rodada do probe de utilitários usou o adapter do branch do módulo C, anterior ao #310, e mostrou 0 arremessos e 0 fogo. Repetida com `768646ea`, a contagem bateu.

## C5 — Release e produção

**R5.8.30 — worker (VALIDADO EM PRODUÇÃO):**

- fila ociosa;
- merge do #310 com o Source pinado: nada foi publicado;
- variáveis definidas com skipDeploys;
- `connect-service-source` em `768646ea`; o deploy da troca, `12cb2d07`, foi SKIPPED pelo freeze;
- **um** build via agente Railway: `3335c88d` SUCCESS;
- `3375b68b` REMOVED.

`/version` nos dois hosts (12:20Z): `git:768646ea…`, demoparser2 0.42.2, `declared_revision_matches` true.

**Migration R5.8.30:**

- targets calculados por SELECT somente leitura: recorder `b46f6701…`, asserção `95dc9e5f…`;
- dry run em produção terminou em `R5_8_30_DRY_RUN_OK_ROLLED_BACK`;
- aplicação: aplicada em 2026-11-17 a partir de `4cacaf5c`; pós-condição verificada por SELECT (recorder `b46f6701…`, asserção `95dc9e5f…`, workflow `f74d8af9…` intacto); registrada em `supabase_migrations.schema_migrations` como `20261117120000` (`direct-main-4cacaf5c-20261117120000`, md5 do arquivo `35eaadc8…`).

**MANUAL_REQUIRED (dono): FEITO.** O dono trocou os 3 secrets em 2026-11-17 13:07 (horário local); os valores não foram lidos.

**App (VALIDADO EM PRODUÇÃO):**

- publicações: `cf1c58ac` (C, D, Coach, `Server-Timing`) e `ad7b73b2` (#317);
- attestation: run 44122215373, success;
- H.3-E: **PASS 18/18** em `cf1c58ac` (run 44098640101, attempt 2), com `runtime`, `bridge_identity`, `parser_lock` e `managed_snapshot` em PASS. As execuções anteriores falharam com `EXPECTED_BUILD_MISMATCH` (secrets antigos), o que era esperado;
- H.3-E em `ad7b73b2`: PASS (44135596325; Quality Gates 44130271326, F553 44135539281).

**E2E em produção, 12/12:**

| Run         | Commit     | O que cobriu                                           |
| ----------- | ---------- | ------------------------------------------------------ |
| 44122519497 | `cf1c58ac` | `/duels` e `/utility` OK nas contas A e B              |
| 44134721473 | `ad7b73b2` | o fluxo A já na partida nova (2 partidas, `deaths=17`) |

Em ambas as execuções, isolamento A↔B nos dois sentidos:

- a partida da outra conta não aparece na lista de `/duels`;
- `/duels` e `/utility` por id dão NOT_FOUND, sem métricas desenhadas;
- nenhum SteamID no DOM e nenhuma credencial na URL.

**Demo nova pela conta A (VALIDADO EM PRODUÇÃO):** a demo FACEIT Mirage foi enviada pelo dono e processada pelo worker `git:768646ea…` em 2 min 19 s, com status `processed`.

Telemetria gravada na partida:

- `weapon_fire` com atirador: 3560/3560 (antes 0%);
- `damage` com hitgroup e `health_after`: 639/639;
- `kill` com hitgroup: 158/159;
- `kill` com through-smoke: 159/159;
- posição de detonação: flash 123, HE 80, smoke 109;
- fogo `incendiary`: 92;
- `player_blind`: 257, todas com duração.

**Paridade produção × processamento local da mesma demo**, para o jogador da conta A: os 10 agregados são **idênticos**.

| Agregado                 | Valor                                             |
| ------------------------ | ------------------------------------------------- |
| disparos                 | 222                                               |
| arremessos               | flash 6, HE 11, smoke 9, molotov 4, incendiária 5 |
| detonações               | flash 6, HE 11, smoke 9, fogo 9                   |
| cegueiras causadas       | 14                                                |
| abates / mortes          | 15 / 17                                           |
| dano de HE em inimigos   | 134                                               |
| dano de fogo em inimigos | 69                                                |

Relatórios calculados com os mesmos motores, sobre essas entradas:

| Métrica                           | Valor    | Amostra / status                      |
| --------------------------------- | -------- | ------------------------------------- |
| duelos vencidos                   | 46,88%   | n=32                                  |
| aberturas                         | 50%      | n=6                                   |
| abates com HS                     | 40%      | n=15                                  |
| disparos que acertaram            | 24,84%   | n=157                                 |
| 1ª bala                           | 29,63%   | n=54                                  |
| acertos na cabeça                 | 17,5%    | n=40                                  |
| flashes com inimigo cegado        | 66,67%   | n=6                                   |
| inimigos por flash                | 1,67     | n=6                                   |
| cegueira inimiga por flash        | 4,77 s   | n=6                                   |
| aliados cegados                   | 3        | —                                     |
| autocegueira                      | 1        | —                                     |
| dano por HE                       | 12,18 HP | n=11                                  |
| dano por fogo                     | 7,67 HP  | n=9                                   |
| assistências de flash             | 0        | OBSERVED (método `GAME_FLAG` gravado) |
| crosshair, counter-strafe, recoil | —        | NOT_MEASURED                          |

Coerência:

- duelos ganhos 15 = abates; perdidos 17 = mortes; 9 duelos sem abate entre os dois;
- arremessos = detonações por tipo;
- 0 cegueiras sem flash associada.

**Latência do replay (medida em produção, `Server-Timing`, sessão do dono, mesma partida):**

|                             | Antes (#314, 9 segmentos)    | Depois (#317, 8 segmentos)             |
| --------------------------- | ---------------------------- | -------------------------------------- |
| espera no browser           | 2017–2435 ms (mediana ~2145) | 1172–1875 ms (mediana ~1416), **−34%** |
| handler                     | 1930–2266 ms (mediana ~2045) | 1043–1515 ms (mediana ~1190), **−42%** |
| `overview`                  | 1082–1452 ms                 | 681–1163 ms                            |
| ownership + status + rounds | ~650 ms (4 idas)             | 174–188 ms (`match_reads`, 1 ida)      |

- Causa provada: idas sequenciais ao banco, de ~155–185 ms cada.
- Ainda não medido: a diferença entre a espera e o handler subiu de ~80–170 ms para ~200–360 ms (autenticação/rede).

## C6 — Fechamento

**Decisão: PM3 Etapa B (Fases 4.2.5 e 4.2.6) CONCLUÍDA**, com as ressalvas abaixo classificadas.

**Métricas medidas** (VALIDADO EM PRODUÇÃO na partida nova da conta A):

- duelos: geral, abertura, por classe de arma e por faixa de distância;
- abates com headshot;
- disparos que acertaram, 1ª bala da rajada, acertos na cabeça e acerto por posição na rajada (rotulado como não sendo nota de recoil);
- detonações por tipo e fase da ronda; arremessos por tipo; fogo iniciado;
- flashes com inimigo cegado, inimigos e segundos de cegueira por flash, aliados cegados, autocegueira;
- dano por HE e por fogo; dano de granada em aliados; abates com utilitário; assistências de flash (com método).

**Métricas não medidas:**

| Métrica                                                          | Status       | Motivo                                                                         |
| ---------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| crosshair placement                                              | NOT_MEASURED | ângulo antes do contato, posição do oponente e linha de visão nos mesmos ticks |
| counter-strafe                                                   | NOT_MEASURED | velocidade no tick do disparo                                                  |
| controle de recoil                                               | NOT_MEASURED | aim punch por bala                                                             |
| eficácia de smoke                                                | NOT_MEASURED | cobertura e linha de visão                                                     |
| efeito de flash em demos HLTV                                    | NOT_OBSERVED | sem `player_blind`                                                             |
| disparos, região do corpo, arremessos e fogo em partidas antigas | NOT_OBSERVED | partidas processadas antes do R5.8.30                                          |

**PRs e SHAs:**

- #309 `6031b334`;
- #310 `768646ea`;
- #311 `7f1d8852`;
- #312 `4cacaf5c`;
- #313 `afa58592`;
- #314 `5ad16f13`;
- #315 `0344b3fe`;
- #316 `cf1c58ac`;
- #317 `ad7b73b2`.

Todos passaram em Main required gates, F553, parser, contract-sensitive e web. O #312 passou também nas probes de banco descartável.

**Migrations:** `20261117120000_r5_8_30_repin_runtime_release`. Aplicada e registrada; rollback em `docs/reference/r5_8_30/rollback.sql`.

**Riscos residuais:**

1. Partidas anteriores ao R5.8.30 não têm a telemetria nova. Não houve reprocessamento em massa (proibido sem autorização); o usuário vê NOT_OBSERVED e o aviso para enviar demo nova.
2. Demos HLTV não registram cegueira.
3. Um duelo é uma simplificação por par: lutas de 2×1 são divididas em pares.
4. A fase da ronda depende do 1º abate e do plant registrados.
5. O Coach só cobre a partida mais recente e não descreve tendências de C e D.
6. O `overview` ainda custa 0,7–1,1 s por requisição; reduzir mais exige revisar como a posse da partida é verificada.
7. O alerta de segurança do Lovable continua NOT_VERIFIED, herdado do PM2.

**Ações manuais:** nenhuma pendente. Feitas pelo dono: os 3 secrets e a demo nova da conta A.

**Fora de escopo, não iniciado:** PM4 e PM5.
