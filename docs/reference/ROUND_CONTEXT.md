# Contexto competitivo por round — `round-context-v1`

Marco 1 da missão de evolução (2026-11-12). Código: `src/lib/roundContext.ts` (puro), leitura em
`loadRoundContext` (`src/lib/xray.functions.ts`), exibido no Raio-X e nos fatos do AI Coach
(`sides.ct/t.roundContext`, regra 23 do prompt). Testes: `src/lib/__tests__/roundContext.test.tsx`.

## O que responde

Para cada round **do próprio jogador**: lado (`CT` | `T` | `UNKNOWN`), resultado (`WON` | `LOST` |
`UNKNOWN`), abates, mortes e dano próprios. Por lado: rounds, vencidos, perdidos, sem vencedor
registrado, abates, mortes, dano (contagens **observadas**) e taxa de rounds vencidos, abates por
round e dano por round (**derivadas**, só com ≥ `SIDE_MIN_ROUNDS = 10` rounds no lado; abaixo,
`INSUFFICIENT_SAMPLE` e `null`).

## Fontes (já persistidas; nenhuma migration, nenhuma mudança de parser)

| Dado                     | Fonte                                                                    | Garantia                                                                             |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Lado do jogador no round | `round_players.side`                                                     | Por round; duas linhas contraditórias → `UNKNOWN`                                    |
| Lado vencedor do round   | `match_rounds.winner_side`                                               | O parser só grava com duas observações concordantes (`parser.py`, vencedor do round) |
| Abates, mortes, dano     | `round_events` (`kill`, `damage`) por `actor_steam_id`/`victim_steam_id` | Mesma atribuição de `metrics.ts`: CT + T = total da partida                          |

## Validação com dados reais (consultas somente leitura, 2026-11-12)

- **Vencedor × eliminações:** em 63 rounds com um lado inteiro eliminado, o vencedor gravado é o
  outro lado em 62; o restante é T eliminado após plantar (vitória por explosão). 0 contradições.
- **Reconciliação CT + T = total:** nas 5 partidas com `round_players`, abates e mortes por lado
  somam exatamente o total de `match_metrics`; o dano soma o ADR × rounds com diferença ≤ 1
  (arredondamento do ADR).
- **Valor esperado para a conta de teste (3 partidas, 63 rounds):** CT 27 rounds, 11 vencidos / 16
  perdidos; T 36 rounds, 26 / 10; abates/mortes CT 13/12, T 25/22; dano CT 1.828, T 3.408.

## O que não faz

- Não deriva vencedor de abates ou mortes; sem vencedor gravado → `UNKNOWN`.
- Não nomeia times nem calcula placar ou resultado da partida (`L04` continua valendo). Apenas
  **verifica** se os participantes formam dois grupos que se enfrentam em todos os rounds
  (`teamCheck`: `CONSISTENT` | `INCONSISTENT` | `UNAVAILABLE`).
- Não usa posição.

## Leitura e segurança

Somente a sessão do jogador (RLS `owns_canonical_match`); sem service role, sem escrita. Eventos
lidos por partida e só os do próprio jogador (ator ou vítima). A chave do participante só entra no
filtro se for um SteamID64 numérico.

## Rollback

Reverter o PR. O campo `roundContext` do Raio-X é opcional (aditivo); sem ele, o Raio-X volta a
listar "abates e dano por lado" como não suportado.
