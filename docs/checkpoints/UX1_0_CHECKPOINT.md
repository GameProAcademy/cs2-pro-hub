# UX-1.0 — Estabilização técnica (checkpoint da fase)

Atualizado em: 2026-11-24 (America/Sao_Paulo) · por: sessão Claude `session_012i4uaf82YyjhPZuSt2ZHhn`

Fonte da missão: artefato UX-1 (https://claude.ai/artifact/YTeUHV1mKu37LoxbpN6WGS) e o "Prompt Mestre
de Execução UX-1.0" do dono (2026-11-23/24). Estados: CONFIRMADO · IMPLEMENTADO · VALIDADO EM TESTE ·
CI APROVADO · INTEGRADO NO MAIN · SINCRONIZADO NO LOVABLE · PUBLICADO · VALIDADO EM PRODUÇÃO · BLOQUEADO.

## 1. Entregas

| Grupo                                                                                                                                                                                            | PR / commit                        | Estado                                                                                                                              | Evidência                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 — `metrics-catalog-v2` (ADR/KAST/HS/K/D/Rating somados pelo próprio denominador), rótulo "Dano em inimigos por round válido" (Rounds), "Índice de dano" (Score/DNA)                           | #350 · `77d3ef6`                   | VALIDADO EM PRODUÇÃO                                                                                                                | checks 5/5 (incl. "Main required gates"); merge `bbecff1`; Lovable `latest_commit_sha` = `bbecff1`; deploy `9b1803d6…`; Dashboard, Raio-X e Evolução mostram 106,7 / 76,6 / 58,1 (2026-11-24) |
| G1 — Replay com rótulos estáveis "Aliado N / Adversário N"; mobile (duelos em cartões, alvo ≥ 44 px, tabelas com rolagem, radar, campo do Coach)                                                 | #350 · `ba8765a`                   | VALIDADO EM PRODUÇÃO                                                                                                                | 360 e 375 px: 82/82 controles de duelo inteiros, botão Replay 98×44 px, campo do Coach 40 px acima da barra, 9/9 rótulos do radar dentro da tela; Replay sem rótulo T1–CT5 nem SteamID        |
| G2 — ADR `enemy-hp-v1` (vida de inimigo removida, golpe limitado à vida restante; sem dano em aliados, próprio, do mundo ou de lado desconhecido); kills sem suicídio e sem team kill comprovado | #351 · `4ce8edf` → merge `85e5929` | INTEGRADO NO MAIN · migration e backfill APLICADOS EM PRODUÇÃO · SINCRONIZADO NO LOVABLE · deploy `629916bc…` pendente de validação | 7/7 checks em `4ce8edf`; §2.1 (hashes), §2.2 (simulação), §2.3 (pós-escrita)                                                                                                                  |
| G2b — telas e Coach leem o ADR canônico (`playerAdr`); Rounds/Raio-X por round com `enemyHpByRound` (`cs2.rounds.v2`, `round-context-v2`)                                                        | branch `ux1.0/enemy-hp-display`    | VALIDADO EM TESTE                                                                                                                   | suíte: 2.869 aprovados; 35 falhas só em `*.integration` (exigem PostgreSQL do CI, idênticas à base)                                                                                           |

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

## 3. Bloqueios

| ID  | O que                        | Por quê                                                                          | Ação      |
| --- | ---------------------------- | -------------------------------------------------------------------------------- | --------- |
| B-1 | ~~Aplicar `20261124060000`~~ | RESOLVIDO em 2026-11-24, com autorização explícita do dono depois dos pontos 1–4 | §2.1–§2.3 |

## 4. Próximas tarefas

1. G2b: PR de `ux1.0/enemy-hp-display` → checks → merge → publicar → validar Dashboard, Partidas, Raio-X, Evolução, Rounds e Coach em produção (ADR 75,0 na de_mirage; PARCIAL na daef42da/42650ddd).
2. Validar em produção o deploy `629916bc…` (`85e5929`) e uma nova ingestão gravando `damage_enemy_hp`.
3. DNA v3; motor único de Treino; vencedor por round; Mortes; 5 áreas; Sala da Partida; revisão mobile completa; i18n.
