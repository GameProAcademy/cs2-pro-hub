# UX-1.0 — Estabilização técnica (checkpoint da fase)

Atualizado em: 2026-11-24 (America/Sao_Paulo) · por: sessão Claude `session_012i4uaf82YyjhPZuSt2ZHhn`

Fonte da missão: artefato UX-1 (https://claude.ai/artifact/YTeUHV1mKu37LoxbpN6WGS) e o "Prompt Mestre
de Execução UX-1.0" do dono (2026-11-23/24). Estados: CONFIRMADO · IMPLEMENTADO · VALIDADO EM TESTE ·
CI APROVADO · INTEGRADO NO MAIN · SINCRONIZADO NO LOVABLE · PUBLICADO · VALIDADO EM PRODUÇÃO · BLOQUEADO.

## 1. Entregas

| Grupo                                                                                                                                                                                                               | PR / commit                                                    | Estado                                                                                                                              | Evidência                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 — `metrics-catalog-v2` (ADR/KAST/HS/K/D/Rating somados pelo próprio denominador), rótulo "Dano em inimigos por round válido" (Rounds), "Índice de dano" (Score/DNA)                                              | #350 · `77d3ef6`                                               | VALIDADO EM PRODUÇÃO                                                                                                                | checks 5/5 (incl. "Main required gates"); merge `bbecff1`; Lovable `latest_commit_sha` = `bbecff1`; deploy `9b1803d6…`; Dashboard, Raio-X e Evolução mostram 106,7 / 76,6 / 58,1 (2026-11-24) |
| G1 — Replay com rótulos estáveis "Aliado N / Adversário N"; mobile (duelos em cartões, alvo ≥ 44 px, tabelas com rolagem, radar, campo do Coach)                                                                    | #350 · `ba8765a`                                               | VALIDADO EM PRODUÇÃO                                                                                                                | 360 e 375 px: 82/82 controles de duelo inteiros, botão Replay 98×44 px, campo do Coach 40 px acima da barra, 9/9 rótulos do radar dentro da tela; Replay sem rótulo T1–CT5 nem SteamID        |
| G2 — ADR `enemy-hp-v1` (vida de inimigo removida, golpe limitado à vida restante; sem dano em aliados, próprio, do mundo ou de lado desconhecido); kills sem suicídio e sem team kill comprovado                    | #351 · `4ce8edf` → merge `85e5929`                             | INTEGRADO NO MAIN · migration e backfill APLICADOS EM PRODUÇÃO · SINCRONIZADO NO LOVABLE · deploy `629916bc…` pendente de validação | 7/7 checks em `4ce8edf`; §2.1 (hashes), §2.2 (simulação), §2.3 (pós-escrita)                                                                                                                  |
| G2b — telas e Coach leem o ADR canônico (`playerAdr`); Rounds/Raio-X por round com `enemyHpByRound` (`cs2.rounds.v2`, `round-context-v2`)                                                                           | #352 · merge `6ecce59`                                         | VALIDADO EM PRODUÇÃO (conta `42650ddd`; limites em §2.5)                                                                            | §2.5                                                                                                                                                                                          |
| G2c — marcador ADR parcial (5 idiomas), glossário do ADR, numerador sem ruído, Rounds com 1 casa, rótulo do índice de dano                                                                                          | #353 · merge `6c431c6`                                         | VALIDADO EM PRODUÇÃO                                                                                                                | Nuke com "PARCIAL", dica "Parcial em 1 partida(s)", HS (25/43), KAST (49/64), rótulo do índice sem "ADR"                                                                                      |
| UX-1.3 — Mortes agrupadas e paginadas (M-2/R-22), menu com Esc e foco (M-4/R-20), Coach em qualquer largura (M-10/R-12), R-17, R-19, R-21, R-23                                                                     | #354 · merge `fcc042c`                                         | VALIDADO EM PRODUÇÃO                                                                                                                | §2.6                                                                                                                                                                                          |
| UX-1.5 — 5 áreas (R-08, M-3) e Sala da Partida `/matches/$matchId` (R-06)                                                                                                                                           | #354 · merge `fcc042c`                                         | VALIDADO EM PRODUÇÃO (aria-current da aba Resumo corrigido no #356)                                                                 | §2.6                                                                                                                                                                                          |
| UX-1.6 — Player DNA v3 (`dna-weighted-v3`) e radar A (R-04, R-05, R-14, R-35, R-36)                                                                                                                                 | #355 · merge `f41b3b4`                                         | VALIDADO EM PRODUÇÃO (deploy `35f9761c`)                                                                                            | §2.8                                                                                                                                                                                          |
| UX-1.7 — lista única de Treino (`cs2.training-priority.v2`, R-13, R-38); 1.7b plano gravado como histórico; 1.7c Raio-X segue o Treino; 1.7d foco do plano do catálogo vem da lista; 1.7e texto de "sem prioridade" | #356 `268d2c8` · #359 · #360 `cfa3751` · #363 · #364 `d01d9a3` | VALIDADO EM PRODUÇÃO                                                                                                                | §2.8, §2.11                                                                                                                                                                                   |
| UX-1.4 — um texto por status do `metric-contract-v1.1` nos 5 idiomas (R-10), em Duelos e Utilitários                                                                                                                | #357 · merge `f12d35b`                                         | VALIDADO EM PRODUÇÃO                                                                                                                | §2.11                                                                                                                                                                                         |
| UX-1.8 — Coach recebe a tela aberta (R-11); `matchId` só se for do próprio jogador                                                                                                                                  | #358 · merge `ada6388`                                         | PUBLICADO · TESTADO; NÃO validado em produção (exige conversa real, vedada)                                                         | `coachScreenUx18.test.ts`                                                                                                                                                                     |
| UX-1.9a — alvos de toque da revisão em produção (Replay 24 px; todas as células do mapa de calor na lista)                                                                                                          | #361 · merge `56e2403`                                         | VALIDADO EM PRODUÇÃO (deploy `828b37f8`)                                                                                            | §2.9                                                                                                                                                                                          |
| R-07 — vencedor do round contra placar real                                                                                                                                                                         | —                                                              | 2 de 3 demos conferem; 3ª bloqueada                                                                                                 | §2.10                                                                                                                                                                                         |

## 2. Auditoria de proveniência do ADR (produção, somente leitura, 2026-11-24)

- `match_metrics.adr × rounds_played` = Σ `round_events.damage` (todas as vítimas) do jogador, com diferença ≤ 0,8 nas 11 linhas: a única divergência entre eventos e valor gravado é o arredondamento do ADR (1 casa). CONFIRMADO.
- `damage` = `player_hurt.dmg_health`, **sem limite** à vida da vítima (máx. 456; 667 de 6.069 eventos > 100). `data.health_after` = vida real após o golpe (registrado desde R5.8.30). CONFIRMADO.
- Dano em aliados em 5 partidas (3–37), dano próprio em 4 (1–5); 1 golpe de lado desconhecido (101). CONFIRMADO.
- Efeito do limite à vida: de_mirage 123,5 → 75,0 (health_after) / 75,3 (reconstruído); de_dust2 91,4 → 74,6 (reconstruído). CONFIRMADO.
- Convenção externa (placar do jogo, FACEIT, Leetify, HLTV, awpy): ADR = vida de inimigos removida, golpe limitado, sem dano em aliados/próprio/mundo. Fontes: awpy docs (reference), esports.net, steamanalyst, prosettings.
- `match_metrics` com 2 linhas na mesma partida (`daef42da`): 2 donos distintos que enviaram a mesma demo. Legítimo, não é duplicidade. CONFIRMADO.
- HS%: nenhuma kill em aliado ou suicídio nas 11 linhas; 1 kill em vítima de lado desconhecido (mantida como kill). CONFIRMADO.

### 2.1 Função `persist_demo_projection` (ponto 1)

| Origem                                            | md5                                           |
| ------------------------------------------------- | --------------------------------------------- |
| Produção antes, `pg_get_functiondef`              | `81fa7d85f106803edfa3bd7f71f0b26d`            |
| Produção antes, `prosrc`                          | `f9ebd3648fd5e87c2ca5e948a891e6a3`            |
| Base no repositório (`20260921073324_eb26ca2b-…`) | `f9ebd3648fd5e87c2ca5e948a891e6a3` (idêntico) |
| Proposta = produção depois, `prosrc`              | `9ccc0b53852abfd75429497727a48e93`            |
| Produção depois, `pg_get_functiondef`             | `0fcdcaa9438ad1c2aad49bcc681abde6`            |

Diff do corpo: somente as 3 colunas novas no INSERT e no ON CONFLICT. Depois da aplicação (2026-11-24): SECURITY DEFINER, `search_path=""`, owner `postgres`, ACL `{postgres=X/postgres,service_role=X/postgres}`, plpgsql volátil, mesma assinatura e mesmos defaults; RLS ativo, políticas `match_metrics_admin_manage:*`, `match_metrics_select_own:r`, triggers `canonical_quarantine_guard`, `canonical_quarantine_no_truncate` inalterados. Migration registrada em `supabase_migrations.schema_migrations` (`20261124060000`, `ux10_enemy_hp_damage`; o texto guardado é a referência ao commit `4ce8edf…` e ao arquivo).

### 2.2 Simulação somente leitura (ponto 3)

Mesmo código da ingestão: `scripts/backfill/enemyHpBackfill.test.ts` importa `enemyHealthDamage` (`src/lib/metrics/enemyDamage.ts`) e `sameTeamInRound` (`src/lib/pipeline/metrics.ts`). Entrada: 982 eventos de dano em 276 grupos vítima-round, chaves de terceiros trocadas por `left(md5(key),6)` (0 colisões nas 10 partidas); 564 golpes do jogador, igual à contagem no banco.

| match_id | player_id | rounds | ADR antigo | dano inimigo | ADR novo | método        | excluídos                       |
| -------- | --------- | ------ | ---------- | ------------ | -------- | ------------- | ------------------------------- |
| 3e9df3ed | eef31b6d  | 19     | 117,6      | 1706         | 89,8     | RECONSTRUCTED | 0                               |
| 41a04ba3 | 9f2b20ff  | 23     | 91,4       | 1678         | 73,0     | RECONSTRUCTED | 0                               |
| 48e517e4 | 9f2b20ff  | 24     | 66,1       | 1215         | 50,6     | RECONSTRUCTED | 0                               |
| 604cab2d | eef31b6d  | 22     | 71,6       | 1305         | 59,3     | RECONSTRUCTED | 0                               |
| 747c7a6b | 9f2b20ff  | 16     | 102,4      | 1141         | 71,3     | RECONSTRUCTED | 0                               |
| 761a2ac5 | eef31b6d  | 15     | 34,4       | 498          | 33,2     | RECONSTRUCTED | 0                               |
| 7d23fb53 | 42650ddd  | 23     | 123,5      | 1726         | 75,0     | HEALTH_AFTER  | 0                               |
| 95186f3f | 9f2b20ff  | 23     | 87,4       | 1662         | 72,3     | RECONSTRUCTED | 0                               |
| a1e4390d | 42650ddd  | 17     | 77,4       | 1126         | 66,2     | RECONSTRUCTED | 0                               |
| daef42da | 42650ddd  | 24     | 111,4      | 1998         | 83,3     | HEALTH_AFTER  | 1 (lado desconhecido) → PARCIAL |
| daef42da | 9f2b20ff  | 24     | 101,2      | 1947         | 81,1     | HEALTH_AFTER  | 0                               |

Nenhuma linha com parse parcial. O golpe de lado desconhecido não foi somado nem estimado; a linha aparece como PARCIAL. Na auditoria preliminar (§2), de_dust2 dava 74,6 por uma reconstrução em SQL; o código final dá 73,0 porque percorre por tick os golpes de todos os atacantes.

### 2.3 Escrita e verificação pós-escrita

UPDATE único com guardas (`match_id`, `player_id`, `rounds_played`, `adr` igual ao antigo, `damage_enemy_hp IS NULL`); escreveu só as 3 colunas novas: 11/11 linhas. Depois: `filled = 11`, `partial = 1`, Σ`adr`×1000 = 984400 (inalterado), `damage_enemy_hp ≤ adr × rounds` em todas. Rollback: `UPDATE public.match_metrics SET damage_enemy_hp = NULL, damage_enemy_hp_method = NULL, damage_enemy_hp_excluded_hits = NULL;` (as telas mostram então "não medido"); rollback completo = remover as 3 colunas e recriar a função da `20260921073324`.

### 2.4 Auditoria da execução (2026-11-24, consultas somente leitura)

IDs abaixo = 8 primeiros caracteres dos UUIDs internos (`match_id`, `player_id`); nenhum SteamID ou nome.

- **Mecanismo:** conector Lovable `query_database` (projeto `91478977…`), uma chamada com `BEGIN … COMMIT` contendo o texto da migration `supabase/migrations/20261124060000_ux10_enemy_hp_damage.sql` e o INSERT em `supabase_migrations.schema_migrations`. Nenhum prompt no chat do Lovable.
- **Horário:** o banco não guarda horário de commit (`track_commit_timestamp = off`; `schema_migrations` não tem coluna de data). Limites comprovados pelo GitHub: DDL depois de 10:26:13Z (último check concluído em `4ce8edf`) e antes de 10:27:31Z (merge do #351), ou seja, 07:26–07:27 em São Paulo. UPDATE depois de 10:27:31Z e antes de 10:45:44Z (abertura do #352).
- **Atomicidade:** colunas novas, CHECK, comentários, função e linha em `schema_migrations` têm o mesmo `xmin` = 827284 (uma transação). As 11 linhas de `match_metrics` têm `xmin` = 827285 (uma transação de UPDATE).
- **Registro:** `schema_migrations.version = 20261124060000`, `name = ux10_enemy_hp_damage`; `statements` = referência `GameProAcademy/cs2-pro-hub@4ce8edf2e288895bddd207cf349aa6142a90904f (PR #351)` e caminho do arquivo (não o texto integral); `created_by`, `idempotency_key`, `rollback` nulos.
- **Commit:** `4ce8edf2e288895bddd207cf349aa6142a90904f` (PR #351, merge `85e5929`). md5 do arquivo da migration = `1091f7e4b881d24b76d0f965e9fe30de` em `4ce8edf`, `85e5929` e no `main` atual.
- **Função antes → depois:** corpo `f9ebd3648fd5e87c2ca5e948a891e6a3` → `9ccc0b53852abfd75429497727a48e93`; definição completa `81fa7d85f106803edfa3bd7f71f0b26d` → `0fcdcaa9438ad1c2aad49bcc681abde6`. Privilégios depois: só `postgres` e `service_role` com EXECUTE.
- **O que a transação 827284 alterou no catálogo:** `match_metrics` (3 colunas `damage_enemy_hp`, `damage_enemy_hp_method`, `damage_enemy_hp_excluded_hits`, nulas); constraint `match_metrics_damage_enemy_hp_check`; comentários das colunas 31–33 e do `adr` (coluna 7: só o texto do COMMENT, marcando-o como histórico); função `persist_demo_projection`; grants reafirmados (iguais aos anteriores).
- **Dados alterados:** apenas as 3 colunas novas em 11 linhas de `match_metrics` (todas com `xmin` 827285). Nenhuma linha com `xmin` 827284/827285 em `matches`, `match_features`, `round_events`, `match_participants`, `demo_jobs`, `uploads`. `adr`, `rounds_played` e as demais colunas não foram escritas (o UPDATE só fazia SET nas 3 colunas; Σ`adr` = 984,4 antes e depois).

| Mapa       | match_id | player_id | rounds | `adr` histórico (inalterado) | `damage_enemy_hp` antes → depois | ADR exibido novo | método        | excluídos   |
| ---------- | -------- | --------- | ------ | ---------------------------- | -------------------------------- | ---------------- | ------------- | ----------- |
| de_ancient | 761a2ac5 | eef31b6d  | 15     | 34,4                         | NULL → 498                       | 33,2             | RECONSTRUCTED | 0           |
| de_ancient | a1e4390d | 42650ddd  | 17     | 77,4                         | NULL → 1126                      | 66,2             | RECONSTRUCTED | 0           |
| de_anubis  | 604cab2d | eef31b6d  | 22     | 71,6                         | NULL → 1305                      | 59,3             | RECONSTRUCTED | 0           |
| de_cache   | 48e517e4 | 9f2b20ff  | 24     | 66,1                         | NULL → 1215                      | 50,6             | RECONSTRUCTED | 0           |
| de_dust2   | 41a04ba3 | 9f2b20ff  | 23     | 91,4                         | NULL → 1678                      | 73,0             | RECONSTRUCTED | 0           |
| de_dust2   | 747c7a6b | 9f2b20ff  | 16     | 102,4                        | NULL → 1141                      | 71,3             | RECONSTRUCTED | 0           |
| de_mirage  | 7d23fb53 | 42650ddd  | 23     | 123,5                        | NULL → 1726                      | 75,0             | HEALTH_AFTER  | 0           |
| de_mirage  | 95186f3f | 9f2b20ff  | 23     | 87,4                         | NULL → 1662                      | 72,3             | RECONSTRUCTED | 0           |
| de_nuke    | 3e9df3ed | eef31b6d  | 19     | 117,6                        | NULL → 1706                      | 89,8             | RECONSTRUCTED | 0           |
| de_nuke    | daef42da | 42650ddd  | 24     | 111,4                        | NULL → 1998                      | 83,3             | HEALTH_AFTER  | 1 → PARCIAL |
| de_nuke    | daef42da | 9f2b20ff  | 24     | 101,2                        | NULL → 1947                      | 81,1             | HEALTH_AFTER  | 0           |

Verificações posteriores: 11/11 preenchidas; 1 parcial; Σ`adr` inalterado; `damage_enemy_hp ≤ adr × rounds` em todas; CHECK, RLS, políticas e triggers presentes; corpo da função = proposta.

### 2.5 Validação do G2 em produção (2026-11-24 ~13:30, Chrome autenticado; conta de teste dona do jogador `42650ddd`)

- **Build servido:** o deploy `034ce4fb…` não expõe estado pelo conector (só "pending" no pedido). Prova indireta e suficiente: o servidor responde com `playerAdr` (código que só existe a partir de `6ecce59`, #352). ADR agregado = 75,8 = 4850 ÷ 64 (o código anterior daria 106,7) e Raio-X traz `round-context-v2`. `latest_commit_sha` do Lovable = `6ecce59…`.
- **Início e Minhas Partidas:** Mirage 75,0; Ancient 66,2; Nuke 83,3 (parcial); agregado 75,8. VALIDADO EM PRODUÇÃO.
- **Meu Raio-X:** ADR 75,8 (4850/64); CT 36 rounds × 68,4 + TR 28 × 85,3 ≈ 4850. VALIDADO EM PRODUÇÃO.
- **Evolução:** ADR 75,8 nas 3 partidas. VALIDADO EM PRODUÇÃO.
- **Rounds (Mirage):** 77,32 em 22 rounds válidos = 1701 (+ 25 do round 15, fora da análise por lados incompletos = 1726). Consistente; tela usava 2 casas (corrigido para 1 no G2c).
- **Notificações:** só "Análise pronta" (sem ADR). NÃO APLICÁVEL nesta conta.
- **Coach:** abre; o número usado vem de `overview.adr` (testes). Sem validação por conversa real: proibido criar conversas reais.
- **Mobile:** 360/375/390/430/768 px sem rolagem horizontal da página; ADR na tabela com rolagem própria.
- **Dust2 73,0 (`41a04ba3`):** pertence ao jogador `9f2b20ff`, outra conta. Conferido no banco e pelo mesmo caminho de código; NÃO conferido em tela (não há sessão dessa conta, e não uso outras credenciais).
- **Demo sem `damage_enemy_hp` → "não medido":** nenhuma linha assim existe em produção (11/11 preenchidas). Coberto por testes (`adrPartialUi.test.tsx`, `playerOverview.test.ts`); não observável em produção sem alterar dados.
- **Defeitos achados e corrigidos no G2c:** sem marcador de parcial; numerador da fórmula em float cru no Raio-X (`24.996000000000002/43`, `49.024/64`); Rounds com 2 casas; rótulo do Score "Índice de dano (ADR ÷ 100…)" contradizia o ADR exibido (o índice usa o dano total histórico do `pro-score-v1`, inalterado).

### 2.6 Validação em produção — UX-1.3 e UX-1.5 (2026-11-24 ~15:10, Chrome autenticado, conta de teste)

- Navegação: 5 áreas na barra lateral (Início, Partidas, Meu jogo, Treino, Coach); seções da área ativa ("Minhas Partidas", "Momentos").
- Partidas: linha inteira abre a Sala; links `/matches/<id>` com o nome do mapa.
- Sala (Mirage): título "MIRAGE · 17/11/2026", "data de processamento · 23 rounds · Resultado não determinado"; 7 abas; KPIs ADR 75,0 · KAST 69,6% · HS 40,0% · K/D 0,88; faixa 23 rounds = 10 vencidos + 13 perdidos + 0 "?" (bate com a aba Rounds).
- Link antigo `/deaths?matchId=…` → `/matches/…?tab=deaths`; Mortes recolhidas "10 de 17 mortes", sem seletor de partida.
- Defeito achado: a aba Resumo também recebia `aria-current="page"` (casamento de caminho do TanStack). Corrigido no #356 (`explicitUndefined`), com teste.
- 375 px: barra inferior com 5 itens de 72×56 px, rótulos inteiros a 11 px; 0 controles < 24 px no Início e em Mortes; Mortes da Sala = 1,9 tela (antes 33,4); botão do Coach 48×48 acima da barra.
- Menu mobile: `role="dialog"`, foco dentro, Esc fecha, foco volta ao botão. Coach abre em largura total (375 px) com o campo de texto.
- Upload sem "Não tenho uma demo" e sem o cartão de estados de engenharia; Raio-X sem "Classificação de compra" entre os não suportados; dimensão "Primeiras mortes e trocas"; Rounds 77,3 (1 casa).

### 2.7 Decisões provisórias registradas

- Q-23 (10 ou 11 eixos): v3 mantém 10 eixos (sem DDL) e lista multi-kill como sinal de Duelos, a opção de 10 eixos do Doc. 5. Reversível pelo proprietário.
- R-35: `opening_discipline` = `opening_success` em 11/11 linhas persistidas: no v3 não entra no índice.
- Treino v2: referência fixa = 0,60 do índice orientado (a mesma do v1 e do plano do catálogo). Persistência em duas atualizações (Doc. 4 §5.4) não implementada: depende de histórico de prioridades.
- O plano do catálogo continua com o foco das semanas vindo do DNA (motor `trainingPlan.ts`); só o quadro de prioridades dele saiu da tela. Pendente: alimentar o foco com a lista v2.

### 2.8 Validação em produção — DNA v3 e Treino v2 (2026-11-24 ~15:50–16:20 BRT, navegador do app, conta de teste)

- Deploy `35f9761c` de `268d2c8`. /player-dna: radar com 10 eixos (`role="button"`): Mira 68, Duelos 35, Sobrevivência 38, Primeiras mortes e trocas 56, Utilitários 27, Tomada de decisão 82, Trabalho em equipe 28, Economia "Não medido nesta versão", Clutch "Sem amostra · 1 de 10 tentativas de clutch", Consistência 71. Texto "Snapshot dna-weighted-v3 salvo em 24 de nov. de 2026, 15:51".
- Banco (somente leitura): 1 linha `dna-weighted-v3` às 18:51:13Z, 1 jogador. `dna-mean-v1` (9) e `dna-weighted-v2` (7, último em 18/11) inalterados.
- /training: "Ainda sem recomendação…", "Em observação (24)", método `cs2.training-priority.v2`.
- Sala: com `?tab=rounds`, só "Rounds" tem `aria-current="page"` (fix do #356).
- Defeitos achados e corrigidos:
  1. O plano ativo (criado em 18/11 com v1) ainda mostrava "Prioridades e evidências" (Clutch #1) abaixo da lista v2, ou seja, duas listas. O #359 exibe essas prioridades como histórico fechado, rotulado com o método. VALIDADO EM PRODUÇÃO no deploy `828b37f8`: `<details>` fechado com o resumo "Como este plano foi montado (método cs2.training-priority.v1)"; o quadro antigo não aparece mais.
  2. O Raio-X dizia "Priorizar Utilitários / Trabalho em equipe / Duelos" (regra antiga: índice < 60) contra o "sem recomendação" do Treino, e mostrava "Não observado" para Clutch e Economia. Correção no #360: as recomendações vêm do `computePrioritiesV2` sobre as mesmas linhas (também para o Coach), e os status v3 são repassados. Em CI.

### 2.9 Revisão de responsividade em produção (2026-11-24 ~16:30 BRT)

Iframe de largura exata em 360/390/430/768/1024/1440 px: Início, Player DNA, Partidas, Treino, Raio-X e as 7 abas da Sala. Conteúdo carregado conferido (texto e radar presentes).

- Transbordo horizontal: nenhum.
- Alvos < 24 px: só a linha do tempo do Replay (16 px de altura) e as células do mapa de calor (9–20 px). Corrigidos no #361.
- Validação no deploy `828b37f8`, a 360 px:
  - slider 287×24;
  - "Mostrar todas" com 32 px de altura e `aria-expanded`;
  - lista com 10 células antes e 14 depois, igual às 14 células do mapa.

### 2.10 R-07 — vencedor do round contra o placar real

O parser de produção (`services/cs2-demo-parser/parser.py`, `demoparser2==0.42.2`) rodou sobre demos de Downloads. Lados por round foram identificados pelo nome do jogador (profissionais públicos); nenhum SteamID foi registrado.

| Demo                           | Rounds | Sem vencedor | Parser (FURIA × GL, por tempo) | Placar público                                         |
| ------------------------------ | ------ | ------------ | ------------------------------ | ------------------------------------------------------ |
| furia-vs-gamerlegion-m3-dust2  | 16     | 0            | 13:3 (11:1; 2:2)               | 13:3 (11:1; 2:2) — confere                             |
| furia-vs-gamerlegion-m2-mirage | 23     | 0            | 13:10 (5:7; 8:3)               | 13:10 (5:7; 8:3) — confere                             |
| furia-vs-gamerlegion-m1-cache  | —      | —            | não executado                  | 474 MB, acima do limite de 400 MB por arquivo da cópia |

- As demos de FACEIT e de GC não têm placar público achável.
- As colunas de placar de `matches` estão vazias nas 11 partidas, por isso não servem de referência.
- Falta uma 3ª demo com placar conhecido. Saídas possíveis:
  - uma demo profissional menor que 400 MB;
  - uma captura do placar de uma partida FACEIT do próprio dono.
- Até lá, o texto "Seu lado venceu X de Y" continua fora.

### 2.11 Validação em produção — rodada final de 2026-11-24 (~19:40–20:40 BRT)

- Deploy `bcb750fd` (`cfa3751`, #360) no Raio-X:
  - Clutch aparece como "Sem amostra" e Economia como "Não medido nesta versão" (`data-dna-index-status` = `NO_SAMPLE` e `NOT_MEASURED`);
  - nenhum "Priorizar …" na tela;
  - a recomendação diz que o Treino ainda não recomenda nada e leva ao plano.
- Deploy `41a5427c` (`3cef2e4`: #357, #358, #363, #362):
  - Duelos (Sala) mostra "Observado na demo", "Calculado pelo CS2 PRO" e "Amostra insuficiente" (`data-state`).
  - O plano do catálogo não monta mais semanas de foco por DNA.
  - Defeito achado: o texto dizia "Nenhuma dimensão do seu Player DNA está abaixo de 60 / 100", o que é falso. Corrigido no #364 e validado no deploy `67539627` (`d01d9a3`).
- i18n em produção:
  - Em inglês, nenhuma linha em português em 15 telas: Início, DNA, Treino, Raio-X, Partidas, Evolução, Upload, Coach, Objetivos e 7 abas da Sala.
  - Em francês, nenhuma sobra em inglês ou português em DNA, Treino, Raio-X, Início, Rounds e Duelos.
  - O render no idioma pedido foi conferido, e o idioma da conta foi restaurado (pt-BR) ao final.
- Suíte unitária completa em `main` `3cef2e4`: 2973 testes verdes. Os testes de integração rodam só no CI, com PostgreSQL.

### 2.12 Rodada de 2026-11-24/25 (autorização do proprietário para R-07, ingestão, UX-1.8 e R-18)

Deploy `7ad1b011` de `e970e64` (#366–#370), validado em produção.

**Ingestão `damage_enemy_hp` (#366): VALIDADO EM PRODUÇÃO e VALIDADO EM TESTE.**

- Demo de Cache do dono (`NOVA-demofaceit-cache.dem`) na conta de teste: job `49e1267b`, 24/24 rounds, parser 0.42.2.
- Após a escolha manual do participante, foram gravados 1691 / `HEALTH_AFTER` / 0 excluídos; ADR 70,5.
- A função de produção, aplicada à saída do parser de produção, reproduz exatamente esses valores: 71 golpes em inimigos, 0 em aliado, 0 próprios, 0 de lado desconhecido.
- Telas: Início, Partidas, Raio-X e Evolução mostram 74,3 (6.541/88).
- Teste de integração em PostgreSQL descartável:
  - cobre os casos inimigo, letal com excesso, vários atacantes, aliado, próprio, mundo, lado desconhecido e golpe sem `health_after`;
  - usa a migração de produção sem alterações;
  - prova idempotência, NULL→NULL, `adr` intacto, outras linhas intactas e acesso negado a anon/authenticated.
- As 11 linhas do backfill não foram tocadas.

**UX-1.8 (Coach com a tela): VALIDADO EM PRODUÇÃO** (conta de teste, 2 perguntas).

- O payload levou só `{area, matchId, tab}`.
- Com a Mirage aberta (não é a mais recente), a resposta veio dessa partida: ADR 75, 15 abates, 17 mortes, K/D 0,88.
- Nenhum SteamID, nenhum dado de terceiro.

**Defeitos achados e corrigidos nesta rodada (todos em produção):**

- #367: HS em Duelos mostrava 53,9% para 7/13, por arredondamento duplo; agora 53,8%, igual ao Coach e a `hs_percent`.
- #368: o seletor "Quem é você nesta demo?" levava o SteamID no `value` do rádio e o mostrava quando faltava apelido. Publicado e testado; não validado em produção, porque não há demo pendente de identificação.
- #370 (R-25): e-mail pessoal real removido dos testes; endereços fictícios movidos para domínios reservados, com teste de guarda. O histórico do Git não foi reescrito (AGENTS.md).

**R-18 / L02 (#369): decisão documentada em `docs/ux1/L02_DECISAO.md` e VALIDADO EM PRODUÇÃO.**

- O Replay já cumpria a política.
- Os quatro textos de regra que diziam "não é guardada" foram corrigidos e conferidos na ficha de morte.
- `l02Policy.test.ts` impede que trajetórias virem medida.

**R-07: BLOQUEADO (texto "Seu lado venceu X de Y" continua desligado).**

| Demo              | Fonte do resultado          | Resultado             | Placar público              |
| ----------------- | --------------------------- | --------------------- | --------------------------- |
| FURIA × GL Dust2  | parser de produção          | 13:3 (11:1; 2:2)      | 13:3 (11:1; 2:2)            |
| FURIA × GL Mirage | parser de produção          | 13:10 (5:7; 8:3)      | 13:10 (5:7; 8:3)            |
| FURIA × GL Cache  | dados gravados (`48e517e4`) | GL 13:11 (11:1; 2:10) | GL 13:11 (FURIA 1:11; 10:2) |

- As três seguiram o caminho do estado do jogo (`round_boundaries_observed_from_game_state`).
- Nenhuma demo disponível anuncia `round_end` (FACEIT, profissional, GamersClub). O caminho do evento não foi exercido.
- A demo GamersClub de Cache caiu no 3º caminho (11 rounds sem vencedor, deve mostrar "?").
- Condições do Doc. 2 §12.2 não cumpridas:
  - "os dois caminhos representados";
  - "painel de método diz a origem": a origem não é persistida em `match_rounds`, e passar a persistir exige mudar o contrato.
- Para liberar:
  - persistir a origem por round (nova versão do contrato);
  - validar uma demo com `round_end` real, ou o dono aceitar formalmente só o caminho do estado do jogo.
- A demo profissional NOVA (100 Thieves × Imperial, 415,8 MB) excede o limite de cópia de 400 MB.

**UX-1.9**

- R-25: feito (#370).
- R-16 (alternativa C): pré-requisito confirmado. A conta de teste tem 2 snapshots `dna-weighted-v3`, separados dos v2. Experimento C não aprovado conceitualmente pelo dono (Doc. 6): NÃO IMPLEMENTADO.
- R-15 (alternativa B): exige teste com jogadores reais; o protocolo está na proposta visual. NÃO IMPLEMENTADO, coleta pendente.
- Higiene: nenhum componente de app órfão. Os não importados são primitivas `ui/*` do scaffold, `index.ts` de reexportação, workers por `new URL` e a POC do parser no navegador, isolada por regra do AGENTS.md. Nada removido.
- Proposta da fase visual: documento https://claude.ai/artifact/QU1HGQ5xpk51EtNocVp3a8 (inventário, problemas, referências, direção, prioridades, critérios, plano V-1 a V-6). Nenhum código visual alterado.

### 2.13 Matriz final de aceitação UX-1.0 (2026-11-25)

| Estado                                    | Itens                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VALIDADO EM PRODUÇÃO                      | R-01/R-30/R-31 (ADR único, enemy-hp-v1), R-02, R-09 e R-32 (#350–#353, rodada anterior), R-03, R-04/R-05 (DNA v3), R-06 (Sala), R-08 (5 áreas), R-10 (estados), R-11 (Coach com tela), R-12, R-13/R-38 (lista única), R-14 (radar A), R-17, R-18 (L02, textos), R-19, R-20, R-21, R-22, R-23, R-24, R-33, R-34, R-35, R-36; ingestão de `damage_enemy_hp`; Raio-X e plano do catálogo seguindo o Treino; i18n (en e fr sem sobras); responsividade 360–1440 sem transbordo |
| VALIDADO EM TESTE                         | R-25 (teste de guarda no repositório); integração da ingestão em PostgreSQL descartável; simulação de falso positivo do Treino v2 (0,50–1,57%); seletor sem SteamID (#368)                                                                                                                                                                                                                                                                                                 |
| PUBLICADO, MAS NÃO VALIDADO EM PRODUÇÃO   | seleção no seletor "Quem é você" (#368): não há demo pendente de identificação (ausência de SteamID validada em produção, §2.14)                                                                                                                                                                                                                                                                                                                                           |
| BLOQUEADO POR EVIDÊNCIA EXTERNA           | R-07 (#372: inventário de mapeamento revisado + release do worker com segredos do dono)                                                                                                                                                                                                                                                                                                                                                                                    |
| BLOQUEADO POR DEPENDÊNCIA DO PROPRIETÁRIO | R-15 (experimento B: jogadores reais)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| NÃO APLICÁVEL                             | R-26, R-27, R-28, R-29 (rejeitadas)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| NÃO IMPLEMENTADO                          | R-15, R-16 (ver acima)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Limites declarados:

- mobile medido por emulação de viewport, sem aparelho físico;
- leitor de tela verificado pela árvore de acessibilidade, sem sessão com NVDA ou VoiceOver.

### 2.14 Rodada de 2026-11-25: decisões do dono, fase visual e privacidade do seletor

**Q-21 (R-37):**

- A fórmula de rating é aplicada às somas, via a nota sem piso de cada partida e o piso aplicado no fim.
- Isso equivale à média ponderada por rounds fora do piso (`docs/ux1/Q21_RATING_AGREGADO.md`).
- #373 (`metrics-catalog-v2.1`). Em produção, o Raio-X mostra 0,91 (107,2/118), igual ao recálculo no banco.

**Experimento C (R-16):** comparação técnica de snapshots (#374, `docs/ux1/EXPERIMENTOS_B_C.md`).

- Os 3 snapshots v3 são cumulativos.
- Deltas apenas direcionais.
- Snapshots inalterados (md5).
- Sem tela.

**Experimento B (R-15):** não executado; depende de jogadores reais. A alternativa A segue oficial.

**#368 (privacidade do seletor):** ao preparar o teste, a resposta de `getDemoIdentity` em produção trazia SteamID64 em `participants`, `suggestion` e `attachmentParticipantKey`.

- #375: referências opacas `p1…pN`, resolvidas no servidor.
- #377:
  - `latestDecisionEventKey` (`manual:<SteamID>`) virou `manual:<ref>`;
  - a lista de jobs deixou de enviar `attachmentParticipantKey`.
- **Varredura em produção (bundle `index-D7xu1cH-`):**
  - 63 respostas de servidor em todas as áreas e nas 7 abas da Sala: 0 SteamIDs depois do #377;
  - 97 chunks JS (2,46 MB) e o HTML: 0;
  - antes do #377, a única ocorrência era a lista de jobs.
- **Teste controlado de seleção:** ainda sem demo pendente. A demo nova da conta de teste (job `819a7338`, 415,8 MB) parou em `RAW_AUDIT_BLOCKED`, sem identificação a fazer.

**R-07:** #372 aberto e bloqueado por governança.

- Os campos novos de evidência mudam a matriz reconciliada e, com ela, o inventário de mapeamento revisado (`canonical-demo-v2`, `cf0549c2…`).
- Três testes de autoridade falham como esperado.
- Atualizar as âncoras no próprio PR seria autoaprovação. O caminho é uma versão revisada do inventário junto com a release do worker (R5.8.31), que depende dos segredos do dono.

**Fase visual:** autorizada pelo dono, com migração em produção e sem protótipos das 5 telas. Entregue em #376 e publicada no bundle `index-D7xu1cH-`.

- Paleta semântica com contraste medido.
- Duas sombras e dois raios.
- Piso de 12 px.
- `GameIcon`, `ToneBadge`, `SideBadge`, `MapBadge` e `DataStateBadge`.
- `docs/ux1/VISUAL_SYSTEM.md`.

**Produção:**

- 10 rotas sem transbordo horizontal no painel estreito;
- 0 textos abaixo de 12 px, salvo os chips de código do Coach, corrigidos no PR seguinte;
- Rating 0,91 inalterado.

### 2.15 R-07 / O8 concluído (2026-11-25)

Substitui o rascunho do #382, que descrevia o estado antes da aprovação do O8-A.

- **Contrato e evidência:** #379 (O8), #381 (harness com 2 demos reais), #383 (decisão O8-A), `incendiary` só esse
  tipo na allowlist e serialização exata de números no jsonb (sem arredondar nem tolerância). Gate v3 server e browser
  **PASS**; inventário v2, digests e âncoras intactos; os três testes de autoridade v2 passam. Merge `4f7466ec`.
- **Worker R5.8.32:** Railway `c372485e` (único build; `19343205` SKIPPED), `/version` nos dois hosts com
  `git:4f7466ec`, `declared_revision_matches` true.
- **Banco:** #387 (merge `9e6d6e5f`), recorder `e477fc60`, assertion `dd1f25cc`, workflow `f74d8af9` inalterado. O
  Lovable não aplicou a migração sozinho; foi aplicada a partir do arquivo commitado depois de dry run em produção.
- **App:** três valores de identidade do worker trocados no painel Secrets e publicados (deploy `c0d4290c`);
  endpoint de attestation com origem `env` e enforcement ligado. Attestation nova `3ee7f9e8` VERIFIED.
- **Demo de validação** (Nuke, job `12903805`, jogador `xeedo` escolhido pelo dono): 20/20 rounds `confirmed` por
  `game_state`, iguais à conferência independente por eliminação/bomba; 13–7; sem `canonical_v3_withheld`;
  K/D 28/11 igual aos eventos; as 6 tabelas analíticas históricas idênticas (md5) ao baseline.
- **Limite conhecido, anterior ao R-07:** o placar no nível da partida continua excluído pela admissão (L04) em
  todas as demos.

Evidência completa: `docs/r07/R07_PRODUCTION_EVIDENCE.md`. **Estado:** validado em produção.

### 2.16 Fase UI/UX Visual concluída (2026-11-25)

- **PRs:** #389 Início, #390 Treino, #391 Raio-X e #392 Coach, todos com "Main required gates" verde.
- **Publicação:** bundle `index-Cx-6o5qv` (deploy `6e21ab6d`).
- **Inspeção em produção:** encontrou dois ajustes, corrigidos no #393:
  - a barra do índice DNA do Raio-X sobrepunha o número;
  - o cabeçalho do Coach ficou mais denso no mobile.
- **Regressão:** 13 telas × 6 larguras:
  - sem transbordo e sem texto < 12 px;
  - selos antigos: Início 5 → 0, Partidas 7 → 0;
  - as 7 abas da Sala iguais ao "antes".
- **Mobile:** estrutura e navegação inalteradas.

Métricas, metodologia do Treino, critérios do Raio-X e funcionamento do Coach não mudaram.

Evidência: `docs/ux1/VISUAL_PHASE_VALIDATION.md`. **Estado:** validado em produção.

## 3. Bloqueios

| ID  | O que                        | Por quê                                                                          | Ação      |
| --- | ---------------------------- | -------------------------------------------------------------------------------- | --------- |
| B-1 | ~~Aplicar `20261124060000`~~ | RESOLVIDO em 2026-11-24, com autorização explícita do dono depois dos pontos 1–4 | §2.1–§2.3 |

## 4. Próximas tarefas

Dependem do dono:

1. Experimento B (R-15) com 3 a 5 jogadores reais.
2. Uma demo de teste que fique pendente de identificação, para o teste controlado de seleção do #368.

Executáveis: nenhum item visual pendente; a fase visual está concluída (§2.16).
