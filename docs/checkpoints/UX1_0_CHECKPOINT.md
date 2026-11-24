# UX-1.0 — Estabilização técnica (checkpoint da fase)

Atualizado em: 2026-11-24 (America/Sao_Paulo) · por: sessão Claude `session_012i4uaf82YyjhPZuSt2ZHhn`

Fonte da missão: artefato UX-1 (https://claude.ai/artifact/YTeUHV1mKu37LoxbpN6WGS) e o "Prompt Mestre
de Execução UX-1.0" do dono (2026-11-23/24). Estados: CONFIRMADO · IMPLEMENTADO · VALIDADO EM TESTE ·
CI APROVADO · INTEGRADO NO MAIN · SINCRONIZADO NO LOVABLE · PUBLICADO · VALIDADO EM PRODUÇÃO · BLOQUEADO.

## 1. Entregas

| Grupo                                                                                                                                                                                            | PR / commit                 | Estado                                                          | Evidência                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 — `metrics-catalog-v2` (ADR/KAST/HS/K/D/Rating somados pelo próprio denominador), rótulo "Dano em inimigos por round válido" (Rounds), "Índice de dano" (Score/DNA)                           | #350 · `77d3ef6`            | VALIDADO EM PRODUÇÃO                                            | checks 5/5 (incl. "Main required gates"); merge `bbecff1`; Lovable `latest_commit_sha` = `bbecff1`; deploy `9b1803d6…`; Dashboard, Raio-X e Evolução mostram 106,7 / 76,6 / 58,1 (2026-11-24) |
| G1 — Replay com rótulos estáveis "Aliado N / Adversário N"; mobile (duelos em cartões, alvo ≥ 44 px, tabelas com rolagem, radar, campo do Coach)                                                 | #350 · `ba8765a`            | VALIDADO EM PRODUÇÃO                                            | 360 e 375 px: 82/82 controles de duelo inteiros, botão Replay 98×44 px, campo do Coach 40 px acima da barra, 9/9 rótulos do radar dentro da tela; Replay sem rótulo T1–CT5 nem SteamID        |
| G2 — ADR `enemy-hp-v1` (vida de inimigo removida, golpe limitado à vida restante; sem dano em aliados, próprio, do mundo ou de lado desconhecido); kills sem suicídio e sem team kill comprovado | branch `ux1.0/enemy-hp-adr` | IMPLEMENTADO · VALIDADO EM TESTE · migration BLOQUEADA (ver §3) | testes `enemyDamage.test.ts`; auditoria de produção §2                                                                                                                                        |

## 2. Auditoria de proveniência do ADR (produção, somente leitura, 2026-11-24)

- `match_metrics.adr × rounds_played` = Σ `round_events.damage` (todas as vítimas) do jogador, com diferença ≤ 0,8 nas 11 linhas: a única divergência entre eventos e valor gravado é o arredondamento do ADR (1 casa). CONFIRMADO.
- `damage` = `player_hurt.dmg_health`, **sem limite** à vida da vítima (máx. 456; 667 de 6.069 eventos > 100). `data.health_after` = vida real após o golpe (registrado desde R5.8.30). CONFIRMADO.
- Dano em aliados em 5 partidas (3–37), dano próprio em 4 (1–5); 1 golpe de lado desconhecido (101). CONFIRMADO.
- Efeito do limite à vida: de_mirage 123,5 → 75,0 (health_after) / 75,3 (reconstruído); de_dust2 91,4 → 74,6 (reconstruído). CONFIRMADO.
- Convenção externa (placar do jogo, FACEIT, Leetify, HLTV, awpy): ADR = vida de inimigos removida, golpe limitado, sem dano em aliados/próprio/mundo. Fontes: awpy docs (reference), esports.net, steamanalyst, prosettings.
- `match_metrics` com 2 linhas na mesma partida (`daef42da`): 2 donos distintos que enviaram a mesma demo. Legítimo, não é duplicidade. CONFIRMADO.
- HS%: nenhuma kill em aliado ou suicídio nas 11 linhas; 1 kill em vítima de lado desconhecido (mantida como kill). CONFIRMADO.

## 3. Bloqueios

| ID  | O que                                                         | Por quê                                                                                                          | Ação                                                                                                                                 |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| B-1 | Aplicar `20261124060000_ux10_enemy_hp_damage.sql` em produção | O controle de permissões da sessão recusou o DDL em produção (2026-11-24), apesar da autorização do dono no chat | Dono confirma explicitamente, nesta sessão, a aplicação dessa migration (aditiva; md5 do corpo da função verificado contra produção) |

## 4. Próximas tarefas

1. Aplicar B-1; preencher as 11 linhas com `enemy-hp-v1` (mesmo código TypeScript); ler `damage_enemy_hp` em todas as telas e no Coach.
2. Rounds/`roundContext`/Duelos com o mesmo dano canônico.
3. DNA v3; motor único de Treino; vencedor por round; Mortes; 5 áreas; Sala da Partida; revisão mobile completa; i18n.
