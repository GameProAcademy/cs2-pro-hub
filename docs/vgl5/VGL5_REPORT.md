# VGL 5.0 — Competitive Intelligence, Player Identity & Experience Evolution

Missão aberta em 2026-11-28 pelo Prompt Mestre VGL 5.0 (anexo do dono). Este arquivo é o relatório vivo da missão: baseline, decisões, fórmulas, PRs, deploys e limitações. Checkpoint operacional: `docs/checkpoints/VGL5_CHECKPOINT.md`.

## Fase 0 — Baseline (2026-11-28)

| Item               | Estado verificado                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `main`             | `6461ce65` (merge do #435, correções de UI de outra sessão)                                                 |
| PRs abertos        | Nenhum da linha VGL/UX; #403 (docs FACEIT) e PRs antigos de H.3-E fora de escopo                            |
| Checkpoint central | Desatualizado (aponta `d8ab7445`/UX-1.0); será reconciliado no fechamento desta missão                      |
| Parser             | Protegido: nenhuma frente toca `services/`, contratos, worker ou attestation                                |
| Score              | `pro-score-v1` (`src/lib/proScore.ts`): pesos, sinais, mínimos (3 partidas, 75 %) intocados                 |
| Coach              | OpenRouter `openai/gpt-oss-20b` sem fallback; só a interface muda (Frente 6)                                |
| i18n               | Dicionários por locale com namespaces (`src/i18n/locales/<ns>/<locale>.ts`); VGL 5.0 usa o namespace `vgl5` |

Mapa por frente (arquivos principais):

| Frente                 | Onde está hoje                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Melhor Mapa          | Overview (`src/lib/playerOverview.ts`), agregação canônica (`src/lib/metrics/canonicalAggregate.ts`), pool de mapas versionado (`src/lib/cs2/maps.ts`), Início (`dashboard.tsx`), Mapas (`RealHeatmap.tsx`, `cs2/MapIdentity.tsx`) |
| 2 Palavra do Treinador | Novo módulo determinístico (sem IA)                                                                                                                                                                                                |
| 3 Perfil público       | `profile.tsx`, `player_profiles` (RLS por dono)                                                                                                                                                                                    |
| 4 Score                | `real/RealProScore.tsx`, `performance.tsx`                                                                                                                                                                                         |
| 5 Menu                 | `layout/AppShell` / sidebar                                                                                                                                                                                                        |
| 6 Coach                | `coach.tsx`, `components/coach/*`                                                                                                                                                                                                  |
| 7 Treino               | `training.tsx`, `components/training/*`, catálogo (`catalog`)                                                                                                                                                                      |
| 8 FACEIT               | `src/lib/faceit/*`                                                                                                                                                                                                                 |
| 9 Player DNA           | `player-dna.tsx`, `real/RealDna.tsx`                                                                                                                                                                                               |
| 10 Dashboard           | `dashboard.tsx`                                                                                                                                                                                                                    |

## Frente 1 — Melhor Mapa (`map-rank-v1`)

Implementação: `src/lib/maps/mapRanking.ts` (pura, determinística), testes em `src/lib/maps/__tests__/mapRanking.test.ts`.

**Partida elegível:**

- o mapa pertence ao pool Active Duty atual (v6: Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke);
- o jogador jogou pelo menos 10 rounds (uma partida lida em parte ou abandonada cedo não conta como encerrada);
- a partida tem rating.

Partidas de demo e da FACEIT entram igualmente, com os valores comparáveis que o overview já expõe.

**Sinais e pesos.** Os sinais são agregados pela regra canônica (`metrics-catalog-v2.1`), com peso de recência de meia-vida de 120 dias, contada a partir da partida mais nova (o resultado não depende do relógio).

| Sinal                                   | Peso |
| --------------------------------------- | ---- |
| Rating                                  | 0,35 |
| ADR                                     | 0,20 |
| KAST                                    | 0,20 |
| K/D                                     | 0,15 |
| Taxa de vitória (suavizada por Laplace) | 0,10 |

- HS% é exibido, mas não classifica: descreve estilo, não produção.
- Um sinal ausente sai da conta e seu peso é redistribuído. Com menos de 60 % do peso medido, o mapa não é classificado.
- Nada ausente vira zero.

**Desempenho no mapa.** Cada sinal é comparado com a média do próprio jogador:

- `rₛ = mapaₛ ÷ médiaₛ − 1`, limitado a ±1;
- `D = Σ wₛ·rₛ ÷ Σ wₛ`.

É uma comparação do jogador consigo mesmo, nunca com outros jogadores.

**Amostra pequena** (desempenho ≠ confiança):

- `estimativa = D · n ÷ (n + 3)`: encolhimento em direção à própria média;
- `posição = estimativa − ½ · s ÷ √n`: limite inferior, que penaliza mapas inconsistentes (`s` é o desvio dos compostos por partida; prior 0,25 com n < 2);
- com menos de 3 partidas o mapa não é classificado (aparece como "Amostra insuficiente"), então uma partida excepcional nunca coloca um mapa de 2 partidas acima de um consistente;
- confiança pela amostra: 3–4 provisória, 5–9 moderada, 10 ou mais alta.

**Classes**, sobre os k mapas classificados:

| Posição               | Classe                   |
| --------------------- | ------------------------ |
| 1                     | Seu melhor mapa          |
| 2                     | Seu segundo melhor mapa  |
| 3                     | Seu terceiro melhor mapa |
| Última (só com k ≥ 4) | Mapa a desenvolver       |
| Demais                | Mapa mediano             |

Fora da classificação: "Amostra insuficiente" (1–2 partidas) ou "Aguardando partidas" (nenhuma).

**Onde aparece.** Uma única classificação, calculada uma vez por overview em memória (sem consulta extra), alimenta:

- o card do Início, que antes era "Última partida": mesma cena, emblema e botão, agora com o melhor mapa, o desempenho em relação à média, a confiança e os fatos;
- o painel "Mapa selecionado" de `/maps`, que passa a apresentar o melhor mapa;
- os rótulos de classificação nos cards da galeria de mapas.

Início e Mapas usam a mesma função, então mostram o mesmo melhor mapa. A classificação é recalculada sempre que o overview muda (nova demo ou nova partida da FACEIT).
