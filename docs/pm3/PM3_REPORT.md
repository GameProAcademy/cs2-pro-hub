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

**MANUAL_REQUIRED (dono):**

- 3 secrets do app: `DEMO_PARSER_EXPECTED_REVISION`, `DEMO_PARSER_EXPECTED_BUILD_REVISION`, `H3E91_EXPECTED_WORKER_BUILD_COMMIT`;
- valores `git:768646ea…` / `768646ea…`;
- situação: PENDENTE (pedido ao dono em 2026-11-17).

**App:**

- publicação: PENDENTE (uma publicação depois dos secrets e do #315);
- attestation / H.3-E: PENDENTE.

**Produção dos módulos C/D:** PENDENTE: E2E com `/duels` e `/utility`, medição `Server-Timing` e uma demo nova (FACEIT/GC) pela conta A.

## C6 — Fechamento

PENDENTE.
