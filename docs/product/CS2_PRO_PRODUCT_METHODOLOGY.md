# CS2 PRO — Metodologia oficial do produto

Versão do documento: **1** · Data: 2026-11-11 · Referência de código: `main` `106f20c6`

Este é o documento de referência para decisões metodológicas. A fundamentação (fontes,
concorrentes, críticas) está em `docs/product/CS2_PRO_PRODUCT_RESEARCH_AND_BENCHMARKS.md`. O
histórico da auditoria que originou estas decisões está em `docs/foundation/FOUNDATION_REPORT.md`.

## Como ler este documento

Toda afirmação carrega um rótulo:

| Rótulo             | Significado                                                              |
| ------------------ | ------------------------------------------------------------------------ |
| **[EXISTE]**       | Implementado em `main`; arquivo e linha citados.                         |
| **[VALIDADO]**     | Existe e tem evidência de teste e/ou produção (indicada).                |
| **[DECISÃO]**      | Decisão de produto aprovada pelo dono do projeto (missão de 2026-11-11). |
| **[RECOMENDAÇÃO]** | Proposta técnica deste documento; exige autorização para virar código.   |
| **[HIPÓTESE]**     | Plausível, não demonstrado.                                              |
| **[EM ABERTO]**    | Questão sem resposta; o que falta está dito.                             |
| **[ESTIMATIVA]**   | Número calculado a partir de premissas declaradas, não medido.           |

Nada nesta versão alterou código, fórmulas, pesos, banco, parser ou produção.

---

## 1. Objetivo do CS2 PRO

Ajudar um jogador a entender e melhorar o próprio desempenho a partir das **suas** demos, com
números que ele possa conferir, explicações que digam de onde cada número veio e um Coach que
nunca afirme mais do que os dados sustentam. O diferencial pretendido não é ter mais números que
os concorrentes, e sim **números honestos sobre a própria incerteza**: estados explícitos de
indisponibilidade, amostra e cobertura sempre visíveis, versão do método rastreável.

## 2. Princípios de qualidade e verdade dos dados

1. **Ausência nunca é zero.** `null`, não observado, amostra insuficiente e indisponível mantêm o
   significado em todas as camadas (cálculo, banco, interface, Coach). Zero só quando o zero foi
   observado. **[DECISÃO]**
2. **Nada é inventado**: eventos, posições, autoria, trajetórias, benchmarks, percentis.
3. **Estimativa nunca aparece como medição.** Interpolação, imputação ou modelo são rotulados.
4. **Precisão exibida ≤ precisão sustentada**: casas decimais e intervalos acompanham a amostra.
5. **Correlação não é causa.** O Coach descreve associação; nunca "você perde porque…" sem
   evidência causal.
6. **Isolamento**: nenhum cálculo mistura jogadores; partidas parciais ou em quarentena não
   entram como válidas. **[EXISTE]** (`partial_parse` excluído do Score em `src/lib/proScore.ts`;
   quarentena excluída na leitura em `src/lib/quarantineRead.server.ts`).
7. **Extração ≠ interpretação.** Um evento extraído corretamente pode não bastar para uma
   conclusão sobre o jogador. Cada métrica declara as duas qualidades separadamente (§14).

---

## 3. Player DNA

**[EXISTE] [VALIDADO]** Método `dna-weighted-v2` (`src/lib/playerDna.ts`, PR #256), validado em
produção em 2026-11-10 (página do DNA mostra a versão e o histórico de snapshots).

**[DECISÃO] (2026-11-11):** o DNA é um conjunto de **indicadores internos de desempenho e estilo,
em escala 0–100, sem alegação de calibração profissional ou comparação populacional**. Usos
permitidos: tendências individuais, pontos fortes e oportunidades, comparação **entre dimensões
do mesmo jogador com ressalva**, contexto do Coach, evolução individual entre snapshots do mesmo
método. Proibido: anunciar como percentil, nível profissional, "% de eficiência" ou posição
relativa à comunidade.

### 3.1 Cálculo atual (comum às dez dimensões) [EXISTE]

```
para cada sinal s da dimensão d, sobre as partidas válidas do jogador (dedup por match_id):
  valor(s) = Σ_m valor_m(s) · amostra_m(s) / Σ_m amostra_m(s)      # média agregada pela amostra
             (média simples se alguma partida não tiver amostra positiva)
  amostra(s) = rounds | duelos de abertura | situações de clutch    (SIGNAL_SAMPLE)

sinal entra no índice da dimensão ("folded") somente se:
  direção ≠ neutral                     (senão notFolded = NEUTRAL: estilo, não qualidade)
  intervalo do catálogo = [0,1]         (senão NOT_UNIT_INTERVAL)
  não é complemento de outro sinal       (senão COMPLEMENT)
  sinal por evento com Σ eventos ≥ 10    (senão THIN_SAMPLE)   DNA_MIN_EVENT_SAMPLE = 10
  valor ≠ null

contribuição = valor          se direção = up
             = 1 − valor      se direção = down
índice(d) = 100 × média simples das contribuições   (null se nenhuma contribuição)
estado do perfil: EMPTY (0 partidas) | INSUFFICIENT_SAMPLE (< 3) | READY  DNA_MIN_MATCHES = 3
```

Pesos dos sinais dentro da dimensão: **iguais** (média simples). Não há peso por sinal.

### 3.2 Constantes de referência embutidas (achado desta missão) [EXISTE]

Vários sinais são normalizados por uma constante e cortados em 1 no **catálogo de features**
(`src/lib/pipeline/features.catalog.ts`). Essas constantes funcionam como **escalas de referência
implícitas**: escolhem o que vale "100". Nenhuma tem fonte documentada nem calibração.

| Sinal                                  | Fórmula do catálogo                                                            | Constante           |
| -------------------------------------- | ------------------------------------------------------------------------------ | ------------------- |
| `aim.damage_per_round`                 | `min(1, ADR / 100)`                                                            | 100 de ADR          |
| `aim.damage_efficiency`                | `min(1, (dano causado / sofrido) / 2)`                                         | razão 2             |
| `survivability.damage_taken_per_round` | `min(1, (dano sofrido / rounds) / 120)`                                        | 120                 |
| `utility.utility_damage_per_round`     | `min(1, (dano de utilitário / rounds) / 12)`                                   | 12                  |
| `utility.flash_assists_per_round`      | `min(1, (flash assists / rounds) / 0.4)`                                       | 0,4                 |
| `utility.enemies_flashed_per_round`    | `min(1, (inimigos cegados / rounds) / 1.2)`                                    | 1,2                 |
| `utility.grenades_per_round`           | `min(1, (granadas / rounds) / 2.5)`                                            | 2,5                 |
| `teamplay.assists_per_round`           | `min(1, (assistências / rounds) / 0.35)`                                       | 0,35                |
| `consistency.rating`                   | `min(1, r / 1.6)`, `r = 0.45·(KPR/0.70) + 0.25·(1 − DPR/0.75) + 0.30·(ADR/80)` | 1,6; 0,70; 0,75; 80 |

Consequências:

- **Efeito teto**: o corte em 1 é aplicado **por partida, antes da agregação** — uma partida
  excepcional é subcontada (já listado no relatório de fundação para dano e abates).
- **Comparação entre dimensões**: "Utilitários 45" e "Trabalho em equipe 34" dependem dessas
  constantes, não de uma régua comum. A regra "dimensão mais fraca abaixo de 60"
  (`PLAN_CEILING = 60`, `src/lib/training/trainingPlan.ts:22`; usada pelo Raio-X em
  `src/lib/diagnostics/xray.ts:291` e pelo treino em `src/lib/catalog/catalogSelect.ts:119`)
  compara escalas não calibradas.
- **[DECISÃO]** essas constantes permanecem (mudá-las é nova versão do DNA).
- **[RECOMENDAÇÃO R-DNA-1]** documentar cada constante no próprio catálogo como "escala de
  referência heurística, sem calibração", e exibir no Raio-X/treino a frase "comparação entre
  dimensões do seu perfil, não com outros jogadores" junto da regra do 60. Mudança só de texto.
- **[RECOMENDAÇÃO R-DNA-2]** tratar a regra do 60 como **observação priorizada**, não
  diagnóstico, até a etapa 2 da calibração (§7). Mudança de interface/texto, sem mudar fórmula.

### 3.3 Dimensões, sinais e cobertura [EXISTE]

Não existe hoje **cobertura por dimensão**: uma dimensão com 1 de 4 sinais observados aparece com
a mesma aparência que uma com 4 de 4 (exemplo real: Utilitários com `enemies_flashed_per_round`
não observado). **[RECOMENDAÇÃO R-DNA-3]** exibir "n de m sinais" por dimensão e, numa versão
futura do método, exigir cobertura mínima para mostrar o índice.

---

## 4. Definição das dez dimensões

Para todas: amostra mínima do perfil = 3 partidas; sinais por evento = 10 eventos somados;
ausente = sinal fora do índice (nunca zero); confiança = nenhuma métrica explícita por dimensão
hoje (**[EM ABERTO]**, ver §6). "Dependência do parser" lista os eventos/campos necessários.
"Calibração futura" refere-se às etapas do §7.

### 4.1 Mira (`aim`)

| Item                 | Conteúdo                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição de produto | Eficácia ao converter encontros em dano e abates.                                                                                                                                                           |
| Mede                 | Produção ofensiva por round e qualidade do tiro.                                                                                                                                                            |
| Sinais no índice     | `hs_rate` (HS/abates), `kills_per_round`, `damage_per_round` (ADR/100), `damage_efficiency` (dano causado/sofrido ÷ 2).                                                                                     |
| Não usar             | Precisão por tiro (`weapon_fire` sem autor em produção); spray/recoil (amostra de mira desbastada).                                                                                                         |
| Limitações e vieses  | HS% depende de arma e função (AWP faz poucos HS); `kills_per_round` e `damage_per_round` também estão no Score e em `consistency.rating` → **correlação forte entre Mira, Duelos, Consistência e o Score**. |
| Parser               | `player_death` (arma, headshot), `player_hurt`.                                                                                                                                                             |
| Calibração futura    | Etapa 2 estratificada por arma principal (proxy de função); HS% separado por classe de arma.                                                                                                                |

### 4.2 Duelos (`dueling`)

| Item              | Conteúdo                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição         | Resultado dos confrontos diretos.                                                                                                                                                                                                                          |
| Sinais no índice  | `opening_success` (por evento, ≥ 10 duelos), `kd_balance` = abates/(abates+mortes).                                                                                                                                                                        |
| Fora do índice    | `opening_participation`, `trade_kill_share` (neutros: estilo).                                                                                                                                                                                             |
| Vieses            | Entry fraggers têm mais duelos de abertura e menor sucesso esperado; lurkers o inverso. `opening_success` também aparece em Tomada de decisão (`opening_discipline` = first_kills/opening_attempts — mesma grandeza) → **dupla presença entre dimensões**. |
| Parser            | ordem dos abates no round, `player_death`.                                                                                                                                                                                                                 |
| Calibração futura | Condicional à participação em aberturas (proxy de função).                                                                                                                                                                                                 |

### 4.3 Sobrevivência (`survivability`)

| Item              | Conteúdo                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição         | Capacidade de permanecer vivo e de não morrer de forma isolada.                                                                                                                                                                                                                                                 |
| Sinais no índice  | `survival_rate`, `early_death_rate` (↓), `untraded_death_rate` (↓), `damage_taken_per_round` (↓, ÷120).                                                                                                                                                                                                         |
| Fora do índice    | `early_death_avoidance` (COMPLEMENT de `early_death_rate`).                                                                                                                                                                                                                                                     |
| Vieses            | Saves em rounds perdidos elevam sobrevivência (crítica que levou o HLTV 2.1 a reduzir esse prêmio). Funções de suporte/âncora sobrevivem mais por desenho. `untraded_death_rate` depende do time (um jogador bem posicionado pode não ser trocado por falha dos colegas) → **penaliza por contexto de equipe**. |
| Parser            | mortes com tempo, janela de trade (`TRADE_WINDOW_SECONDS`), fim de round comprovado.                                                                                                                                                                                                                            |
| Calibração futura | Separar sobrevivência em rounds vencidos e perdidos exige vencedor do round (bloqueado por L04).                                                                                                                                                                                                                |

### 4.4 Posicionamento (`positioning`)

| Item              | Conteúdo                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Definição         | Escolha de onde e quando se expor. **Hoje medida só de forma temporal**, sem coordenadas.                                                                                                                    |
| Sinais no índice  | `traded_death_rate` (↑), `first_death_rate` (↓).                                                                                                                                                             |
| Fora do índice    | `first_death_avoidance` (COMPLEMENT), `map_spread` (não derivável do contrato atual).                                                                                                                        |
| Vieses            | O nome "Posicionamento" promete mais do que mede. `traded_death_rate` é complemento quase exato de `untraded_death_rate` (Sobrevivência): a mesma grandeza aparece em **duas dimensões com sinais opostos**. |
| Parser            | mortes, trades. Sem posições (§11).                                                                                                                                                                          |
| Calibração futura | Só faz sentido após inteligência espacial (§11–13). **[RECOMENDAÇÃO R-DNA-4]** até lá, exibir "medido por tempo e trocas, sem posição no mapa".                                                              |

### 4.5 Utilitários (`utility`)

| Item              | Conteúdo                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição         | Uso e efeito das granadas.                                                                                                                                                  |
| Sinais no índice  | `utility_damage_per_round` (÷12), `flash_assists_per_round` (÷0,4), `enemies_flashed_per_round` (÷1,2; **não observado** nas partidas atuais), `grenades_per_round` (÷2,5). |
| Vieses            | `grenades_per_round` mede **volume**, não efeito: jogar granadas sem efeito sobe o índice. Funções de suporte usam mais utilitários por desenho.                            |
| Parser            | detonações com autor (`*_detonate.user_steamid`, CANONICAL desde 2026-11-04), `player_blind`, `assistedflash`.                                                              |
| Calibração futura | Efeito por granada (cegueira de inimigos vs. aliados, dano) antes de volume.                                                                                                |

### 4.6 Tomada de decisão (`decision_making`)

| Item              | Conteúdo                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição         | Contribuição consistente por round e disciplina no início do round.                                                                                                                                                                                                                                             |
| Sinais no índice  | `kast`, `early_death_free_rate` (1 − mortes precoces/rounds), `opening_discipline` (≥ 10 eventos).                                                                                                                                                                                                              |
| Fora do índice    | `early_window_seconds` (configuração, neutro).                                                                                                                                                                                                                                                                  |
| Vieses            | `early_death_free_rate` e `survivability.early_death_rate` vêm do mesmo contador (`EARLY_DEATH_SECONDS`); `opening_discipline` = `opening_success`; KAST também é o maior peso do Score → a dimensão é em boa parte **reembalagem de outras**. "Decisão" sugere causalidade cognitiva que os dados não mostram. |
| Calibração futura | Revisar a composição numa nova versão (ver R-DNA-5).                                                                                                                                                                                                                                                            |

### 4.7 Trabalho em equipe (`teamplay`)

| Item              | Conteúdo                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Definição         | Contribuição para abates e trocas dos colegas.                                                                                                         |
| Sinais no índice  | `assists_per_round` (÷0,35), `trade_participation` (trade kills/rounds).                                                                               |
| Fora do índice    | `flash_assist_share` (neutro).                                                                                                                         |
| Vieses            | `trade_participation` e `dueling.trade_kill_share` vêm do mesmo contador. Comunicação, posicionamento coletivo e cessão de espaço **não são medidos**. |
| Calibração futura | Crédito compartilhado por abate (dano + flash + trade), como Leetify/HLTV 3.0 — exige especificação própria.                                           |

### 4.8 Economia (`economy`)

| Item              | Conteúdo                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição         | Uso do dinheiro e eficiência do equipamento.                                                                                                                        |
| Sinais            | `buy_discipline` e `damage_per_dollar` (**não deriváveis hoje**: exigem contexto de compra), `economy_data_available` (bandeira neutra).                            |
| Estado            | Índice sempre **não observado** em produção (página do DNA, 2026-11-10).                                                                                            |
| Dados             | `round_players.money_start` e `equipment_value` existem em 969 de 970 linhas; `buy_context` vazio em todas (consulta somente leitura, 2026-11-10).                  |
| Calibração futura | Primeiro um classificador de compra (eco/force/full) documentado e testado; só então sinais. É o caminho de menor custo para a Fase 4.2 (relatório de fundação §E). |

### 4.9 Clutch (`clutch`)

| Item              | Conteúdo                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição         | Desempenho quando é o último vivo do time.                                                                                                                                                                                                                                                                                                  |
| Sinais no índice  | `clutch_win_rate` (≥ 10 situações), `multi_kill_rate`.                                                                                                                                                                                                                                                                                      |
| Fora do índice    | `clutch_frequency` (neutro).                                                                                                                                                                                                                                                                                                                |
| Vieses            | Com menos de 10 clutches, o índice fica só com `multi_kill_rate` — que não é clutch. Exemplo real: Clutch 14 com 4 situações (fora) — o número exibido mede multi-kills. Multi-kills também se sobrepõem a abates (motivo do HLTV reduzir o peso em 10/2025). Leetify reduziu o prêmio de clutch por crítica de supervalorização (02/2026). |
| Calibração futura | **[RECOMENDAÇÃO R-DNA-5]** numa nova versão, retirar `multi_kill_rate` de Clutch (ou exigir `clutch_win_rate` para exibir o índice).                                                                                                                                                                                                        |

### 4.10 Consistência (`consistency`)

| Item              | Conteúdo                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição         | Estabilidade do desempenho entre lados e partidas.                                                                                                                                                        |
| Sinais no índice  | `side_balance` (1 −                                                                                                                                                                                       | rating CT − rating T | ), `rating` (rating do CS2 PRO por partida ÷ 1,6). |
| Fora do índice    | `sample_rounds` (neutro; contagem).                                                                                                                                                                       |
| Vieses            | `rating` é nível de desempenho, não consistência; é composto de abates, mortes e dano (de novo). Nenhum sinal mede variância **entre partidas**.                                                          |
| Calibração futura | Consistência real = dispersão do jogador contra ele mesmo (desvio-padrão entre partidas, ajustado pela amostra) — exige ≥ 5 partidas comparáveis **[HIPÓTESE sobre o mínimo; validar na etapa 1 do §7]**. |

### 4.11 Correlação e dupla contagem (resumo)

| Grandeza                    | Aparece em                                                |
| --------------------------- | --------------------------------------------------------- |
| Abates/round, dano/round    | Mira, Consistência (`rating`), Score                      |
| Abates vs. mortes           | Duelos (`kd_balance`), Consistência (`rating`), Score     |
| Sucesso em aberturas        | Duelos, Tomada de decisão, Score                          |
| Mortes precoces             | Sobrevivência, Tomada de decisão                          |
| Morte trocada / não trocada | Sobrevivência (↓ não trocada), Posicionamento (↑ trocada) |
| Trade kills                 | Duelos (neutro), Trabalho em equipe                       |
| KAST                        | Tomada de decisão, Score                                  |

Consequência: as dez dimensões **não são dez medidas independentes**. Um jogador que mata muito
sobe em várias ao mesmo tempo. Isso não é erro de cálculo; é de composição. **[DECISÃO]** não muda
na v2. **[RECOMENDAÇÃO]** a próxima versão do DNA deve atribuir cada grandeza a **uma** dimensão.

---

## 5. Fórmulas e normalização (regras gerais)

1. Toda razão é agregada pelo seu denominador real (rounds, eventos), nunca pela média de razões
   por partida. **[EXISTE]** (DNA v2, Score v1).
2. Normalização para [0,1] só com constante **documentada** e rotulada como heurística ou
   calibrada. **[DECISÃO]** para versões futuras; as constantes atuais estão no §3.2.
3. O corte em 1 deve ocorrer **depois** da agregação. **[RECOMENDAÇÃO]** para a próxima versão
   do pipeline de features (muda `match_features` e digests: exige versão nova das features).
4. Direção `down` entra como complemento (`1 − x`); complemento explícito do mesmo sinal nunca
   entra duas vezes. **[EXISTE]**

## 6. Amostras e confiança

**[EXISTE]** DNA: 3 partidas; 10 eventos por sinal amostrado por evento. Score: 3 partidas
completas, 10 eventos, 75% de cobertura; confiança por rounds (150 / 300). Os limiares foram
escolhidos por critério declarado (erro-padrão de proporção no pior caso para os rounds), não por
ajuste populacional.

**[RECOMENDAÇÃO R-AMOSTRA]** substituir limiares fixos, quando houver dados, por **curvas de
confiabilidade por componente** (método de Pemstein & Dolinar, pesquisa §3):

```
para cada componente c e cada n de rounds:
  amostrar jogadores com ≥ 2n rounds; dividir rounds em metades aleatórias (repetir B vezes)
  r_half = correlação entre as metades (entre jogadores)
  alfa(n) = Spearman-Brown: 2·r_half / (1 + r_half)
amostra mínima(c) = menor n com alfa(n) ≥ alvo declarado (ex.: 0,7 — convenção, não verdade)
estimativa regredida: x̂ = média_pop + alfa(n) · (x − média_pop)
```

Pré-requisito: população com variância real de habilidade (§7). Com 3 perfis, **não aplicável**.

## 7. Calibração futura do DNA

**[DECISÃO]** calibração populacional é futura e condicionada a dados representativos. Mudança de
fórmula = nova versão (`dna-weighted-v3` ou outro nome), preservando v2 e seus snapshots.

**[RECOMENDAÇÃO] Etapas** (cada uma com critério de entrada verificável, sem números arbitrários
de população):

| Etapa                         | O que                                                                                                                                                                       | Critério de entrada                                                                                                                       | Saída                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 0 — agora                     | Índices internos; constantes rotuladas (R-DNA-1); cobertura por dimensão (R-DNA-3)                                                                                          | —                                                                                                                                         | Texto e exibição honestos                                             |
| 1 — intra-jogador             | Comparar o jogador **com ele mesmo**: tendência entre snapshots do mesmo método; desvio contra a própria média com faixa de incerteza (bootstrap por rounds)                | Jogador com ≥ 2 snapshots do mesmo método                                                                                                 | "Melhorou / piorou / sem diferença detectável"                        |
| 2 — distribuição populacional | Distribuição empírica por sinal (ECDF) → percentis **com intervalo**; encolhimento empírico-bayesiano das médias de jogadores com pouca amostra (Beta-binomial para razões) | Para cada estrato: IC bootstrap de 95% da mediana com largura ≤ 10 pontos de índice **e** alfa(n) ≥ 0,7 na amostra típica do jogador (§6) | Percentil rotulado "entre jogadores do CS2 PRO", nunca "profissional" |
| 3 — estratificação            | Por mapa e lado, depois por função (proxy validado)                                                                                                                         | Mesmo critério da etapa 2 **dentro de cada estrato**; estrato sem critério → não exibido                                                  | Comparação condicional                                                |
| 4 — referência externa        | Profissionais/competitivos com origem verificável e licença                                                                                                                 | Fonte licenciada, mesmo parser, mesma versão de features                                                                                  | Escala "competitiva" separada da interna                              |

Por que não z-score: as distribuições são limitadas em [0,1] e assimétricas (taxas); percentis
empíricos e modelos Beta são mais defensáveis. Por que não modelo hierárquico completo de início:
custo e opacidade sem ganho demonstrável com a população atual — reservar para a etapa 3 se o
encolhimento simples não bastar. **Viés de seleção**: jogadores do CS2 PRO não representam a
comunidade (quem envia demos tende a ser mais engajado) — todo percentil diz "entre usuários do
CS2 PRO". **Mudança de meta/atualização do jogo**: distribuições versionadas por janela de tempo e
por versão de features; recalibração não reescreve snapshots antigos.

---

## 8. CS2 PRO Score

**[EXISTE] [VALIDADO]** `pro-score-v1` (`src/lib/proScore.ts`, PR #257; especificação em
`docs/reference/PRO_SCORE.md`), validado em produção em 2026-11-10 e no Coach (PR #258).

**[DECISÃO] (2026-11-11):** preservar o v1, seus pesos e suas regras. Documentar que os pesos são
heurísticos; que a nota não é ranking populacional nem equivalente ao HLTV Rating ou ao Leetify
Rating; que depende de cobertura e qualidade dos dados; que os componentes permanecem visíveis.
Mudança metodológica = nova versão (`pro-score-v2`) com justificativa, validação e regressão.

## 9. Componentes e pesos do v1 [EXISTE]

| Componente             | Sinal                         | Peso | Amostra        |
| ---------------------- | ----------------------------- | ---: | -------------- |
| Contribuição por round | `decision_making.kast`        | 0,25 | rounds         |
| Dano                   | `aim.damage_per_round`        | 0,20 | rounds         |
| Abates                 | `aim.kills_per_round`         | 0,15 | rounds         |
| Saldo de duelos        | `dueling.kd_balance`          | 0,15 | rounds         |
| Sobrevivência          | `survivability.survival_rate` | 0,10 | rounds         |
| Duelos de abertura     | `dueling.opening_success`     | 0,10 | ≥ 10 duelos    |
| Clutches               | `clutch.clutch_win_rate`      | 0,05 | ≥ 10 situações |

`score = 100 × Σ wᵢvᵢ / Σ wᵢ` sobre componentes disponíveis; ≥ 3 partidas completas; cobertura
≥ 75%; `percentile` e `tier` sempre `null`.

**Diferenças essenciais em relação a HLTV/Leetify** (pesquisa §2): o v1 é **absoluto** (não
centrado numa população nem soma zero), **não ajusta economia, função, mapa ou lado**, **não
divide crédito** entre colegas e não usa probabilidade de vitória.

**Riscos já identificáveis sem novos dados** (para a etapa A do §10):

1. Abates, dano e saldo de duelos somam 0,50 do peso e são fortemente correlacionados entre si
   (todos crescem com abates) — mesma crítica que levou o HLTV a reduzir pesos em 10/2025.
2. Sobrevivência (0,10) premia saves em rounds perdidos (crítica que levou o HLTV 2.1 a reduzir o
   prêmio).
3. Nenhum componente premia contribuição sem abate (flash assist, dano em abate do colega, trade
   sofrido) — penaliza funções de suporte.

## 10. Metodologia de validação dos pesos [RECOMENDAÇÃO]

| Etapa                           | Pergunta                          | Método                                                                                                                                                | Dados necessários                       | Disponível hoje?                                                                     |
| ------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| A — auditoria dos componentes   | Medem coisas diferentes?          | Matriz de correlação de Spearman jogador-partida; VIF; análise de componentes principais para ver quantas dimensões independentes existem             | ≥ dezenas de jogadores × partidas       | Não (5 linhas de features). Executável com o código atual quando houver dados        |
| B — consistência                | A nota estabiliza com a amostra?  | Curva de confiabilidade do Score e de cada componente (§6); IC por bootstrap de rounds                                                                | Rounds por jogador                      | Parcial: precisa da projeção por round                                               |
| C — sensibilidade               | Quanto a nota depende dos pesos?  | Perturbar pesos (Dirichlet centrado nos atuais, concentração declarada); medir variação absoluta da nota e estabilidade de ordenação (tau de Kendall) | População                               | Não                                                                                  |
| D — contexto                    | Favorece funções, mapas ou lados? | Resíduo da nota por estrato (mapa, lado, proxy de função: participação em aberturas, fração de abates com AWP)                                        | Função proxy, lado por round            | Lado sim; função não                                                                 |
| E — validação externa           | Relaciona-se a algo independente? | Associação com participação em rounds vencidos; comparação com avaliações independentes, se licenciadas                                               | **Vencedor do round e time do jogador** | **Bloqueado por `L04-MATCH-RESULT-UNRESOLVED`** (`docs/ADMISSION_CONTRACT_V3.md:51`) |
| F — aprovação de `pro-score-v2` | Vale mudar?                       | Documento de mudança (§18.4) com resultados de A–E, regressão contra v1 nas mesmas partidas, rollback                                                 | Tudo acima                              | Não                                                                                  |

Regras: correlação com vitória **não prova**, sozinha, qualidade individual (time forte infla
todos); validação sempre **fora da amostra** e **temporal** (treinar em partidas antigas, testar
nas novas); partidas extremas tratadas por robustez (mediana/Huber na análise), nunca por remoção
silenciosa.

---

## 11. Inteligência espacial

**[DECISÃO] (2026-11-11):** objetivo estratégico aprovado. Arquitetura, granularidade,
persistência e retenção definidas por especificação antes de qualquer implementação. Nada foi
implementado nesta missão.

### 11.1 Estado real (verificado nesta missão)

| Fato                                                                                                                                                                                                               | Evidência                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| O parser é demoparser2 0.42.0 e **extrai** `X`, `Y`, `Z`, velocidade, `last_place_name`, `move_state`, vivo/agachado                                                                                               | `services/cs2-demo-parser/adapter.py:5`; `raw_evidence.py:35,209`; `hot_payload.py:121-147` |
| As posições são lidas em `parse_ticks` **nos ticks de eventos**, para todos os jogadores, e depois **desbastadas por passo uniforme** até `TICK_SAMPLE_LIMIT = 4096` linhas                                        | `parser.py:1117-1126`, `parser.py:165-182`, `raw_evidence.py:14`                            |
| Consequência: a amostra **não é alinhada ao jogador do evento** nem regular no tempo; com milhares de eventos por partida (ex.: 3.041–4.397 eventos em `round_events`), a maioria dos ticks de evento é descartada | contagens de `round_events` por partida (consulta somente leitura)                          |
| O payload HOT também limita `position_snapshots` a 4.096 linhas                                                                                                                                                    | `hot_payload.py:16`                                                                         |
| O app recebe as posições (`hot_semantic_data.position_snapshots`) mas **persiste só contagens** por jogador                                                                                                        | `rawArtifact.server.ts:778-798`; `persistence.server.ts:262-268`                            |
| Em produção, nenhuma das 6 partidas tem `semantic_player_data` em `match_sources.metadata`; `round_events` não tem posição                                                                                         | consulta somente leitura, 2026-11-11                                                        |
| Volume atual em Storage: bucket `demos` 30 objetos, 11,25 GB (≈ 375 MB por demo); `cs2-raw-evidence` 2.935 objetos, 364 MB                                                                                         | `storage.objects`, consulta somente leitura, 2026-11-11                                     |

Conclusão: **não falta capacidade ao parser**; falta (a) amostragem com contrato espacial e (b)
persistência.

### 11.2 Alternativas avaliadas

| Abordagem                                            | Vantagem                                                                  | Limitação                                                                             | Custo [ESTIMATIVA]                                                                                | Auditoria                       | Veredito                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- |
| 1. Todos os ticks                                    | Máxima fidelidade                                                         | 64 ticks/s × 10 jogadores ≈ 640 linhas/s ≈ 1,5 M linhas por partida de 40 min de jogo | Inviável no banco                                                                                 | Boa                             | **Não**                           |
| 2. Amostrado regular (1–2 Hz, vivos)                 | Trajetórias, presença por zona, controle de mapa; ESTA usou 2 Hz          | Perde peeks rápidos; não serve para o instante exato de um abate                      | ≈ 24 rounds × 90 s × 2 Hz × 10 = 43.200 linhas/partida ≈ 0,9 MB binário compactado (20 B/linha)   | Boa se o arquivo for versionado | **Sim, em Storage, não no banco** |
| 3. Só no evento (abate, morte, dano, granada, plant) | Exato onde importa; pequeno; resolve heatmaps de morte/abate e distâncias | Não mostra rotas                                                                      | Ordem de 10³ linhas/partida (≈ 126 abates, 530 danos, 340 granadas por partida na produção atual) | Excelente (ligado ao evento)    | **Sim, no banco**                 |
| 4. Só agregados (zona × lado × jogador)              | Consulta rápida; RLS simples                                              | Irreversível sem o dado de base                                                       | Desprezível                                                                                       | Depende de 2/3                  | **Sim, derivado**                 |
| 5. Bruto temporário + estruturado permanente         | Reprocessável sem a demo                                                  | Exige política de retenção                                                            | Médio                                                                                             | Boa                             | **Sim** (é a combinação 2+3+4)    |
| 6. Reconstruir sob demanda da demo                   | Sem armazenamento extra                                                   | Reprocessar demo real a cada pedido; custo e tempo; regra de não reprocessar          | Alto por consulta                                                                                 | Boa                             | **Não** como padrão               |

### 11.3 Recomendação [RECOMENDAÇÃO R-ESP]

Arquitetura em três camadas, entregue em incrementos:

1. **Posição no evento** (primeiro incremento): ao extrair `player_death`, `player_hurt`,
   detonações e `bomb_planted`, anexar `X, Y, Z, last_place_name` do **ator** e da **vítima** no
   tick do evento (via `parse_event(..., player=[...])` do demoparser2, ou leitura dirigida de
   `parse_ticks` nos ticks e jogadores do evento — **sem** desbaste uniforme). Persistir em tabela
   própria ligada ao evento.
2. **Trajetória amostrada** (segundo incremento): 2 Hz por jogador vivo, por round, gravada como
   arquivo binário compactado e versionado no Storage (uma por partida), ligado à partida e ao
   contrato espacial.
3. **Agregados** (derivados de 1 e 2): ocupação e eventos por zona × lado × jogador × partida.

---

## 12. Arquitetura conceitual de posições [RECOMENDAÇÃO]

```
Worker Railway (demoparser2, atestado)          App (TanStack Start)           Lovable Cloud
───────────────────────────────────────          ────────────────────           ─────────────
eventos + posição do ator/vítima no tick  ──►  admissão / auditoria RAW  ──►  event_positions (tabela)
amostra 2 Hz por round (binário)          ──►  verifica digest/versão   ──►  Storage: spatial/<match>/<v>.bin
                                               agrega por zona            ──►  spatial_zone_summary (tabela)
Dashboard / detalhe da partida  ◄── consultas por jogador (RLS)
AI Coach                        ◄── só agregados com amostra e cobertura declaradas
```

**Contrato `event_positions` (proposta, `spatial-v1`):** `match_id`, `round`, `tick`,
`event_ref` (chave do evento em `round_events`), `role` (`actor`|`victim`), `steam_id`, `side`,
`x`, `y`, `z` (float, unidades Hammer), `place` (texto do jogo), `map_name`, `map_build`
(ou versão dos assets), `position_state` (§12.1), `contract_version`.

### 12.1 Estados de posição [DECISÃO para o contrato futuro]

| Estado         | Significado                                                                             | Pode alimentar heatmap?                  |
| -------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| `MEASURED`     | Lido do tick do evento para o jogador do evento                                         | Sim                                      |
| `SAMPLED`      | Lido de um tick da amostra regular (não do instante do evento)                          | Sim, rotulado como amostra               |
| `INTERPOLATED` | Calculado entre duas amostras                                                           | **Só para animação**, nunca para métrica |
| `MISSING`      | Não havia leitura                                                                       | Não                                      |
| `INVALID`      | Fora dos limites do mapa, NaN, jogador morto, `steam_id` divergente, tick fora do round | Não; contado na cobertura                |

### 12.2 Respostas às perguntas da especificação

1. **Dados extraídos**: `X, Y, Z`, `last_place_name`, `move_state`, vivo, agachado, velocidade (já
   extraídos); `yaw/pitch` para direção (já extraídos na amostra de mira).
2. **Entidades**: `event_positions`, arquivo de trajetória, `spatial_zone_summary`.
3. **Granularidade**: instante do evento (camada 1); 2 Hz (camada 2) — justificada pelo ESTA;
   revisável com dados.
   4/19. **Jogador correto**: chave `steam_id` do evento (ator/vítima) contra a linha do tick com o
   mesmo `steamid`; divergência → `INVALID`. O vínculo jogador↔conta segue
   `resolveAnalyticalParticipant` (já usado em `semanticData.ts:38`).
4. **Mapa, round, tick, lado, contexto**: colunas próprias; lado do `team_num` no mesmo tick.
5. **Coordenadas inválidas**: estado `INVALID`; nunca corrigidas ou deslocadas.
6. **Normalização de mapas**: transformação mundo→radar por arquivo de metadados versionado com
   checksum (modelo Awpy `map_data.json`/`manifest.json`); nível por `Z` em mapas de vários
   andares (Nuke, Vertigo, Train).
7. **Precisão**: armazenar o valor do parser (float), sem arredondar; arredondar só na exibição.
8. **Dupla contagem**: uma linha por `(event_ref, role)`, chave única.
   10/11. **Volume e custo**: camada 1 ≈ 10³ linhas/partida no banco; camada 2 no Storage
   (≈ 1 MB/partida [ESTIMATIVA]) — ordem de grandeza abaixo da própria demo (≈ 375 MB).
9. **Ownership e RLS**: mesmas regras de `round_events`/`match_features` (leitura só pelo dono
   do perfil vinculado; escrita só pelo pipeline com service role); Storage com caminho por
   partida e acesso via função de servidor.
10. **Consulta**: índices por `(steam_id, map_name, side)` e `(match_id, round)`; Dashboard lê
    agregados, não linhas.
11. **Retenção**: camada 1 e 3 enquanto a partida existir; camada 2 com política explícita (a
    decidir: tempo, quota por usuário) — **[EM ABERTO]**.
12. **Pré-cálculo**: eventos por zona × lado (mortes, abates, dano dado/recebido), ocupação por
    zona (camada 2), distância média de duelo por arma.
13. **Auditoria**: camada 1 sempre; digest do arquivo da camada 2; versão do contrato e do parser.
14. **Versão do contrato**: `spatial-v1`; mudança de campo = nova versão; linhas antigas não são
    reescritas.
15. **Mudanças de mapa**: `map_build`/versão dos assets por partida; agregação nunca mistura
    versões de geometria incompatíveis.
16. **Tick do evento ≠ tick da posição**: a posição só é `MEASURED` quando lida **no mesmo tick**
    do evento; qualquer outro tick é `SAMPLED` com a distância em ticks registrada.

## 13. Persistência e retenção

Ver §12.2 itens 10–17. **[EM ABERTO]** retenção da camada 2 e quota por usuário; custo real só
depois de medir uma demo real com o contrato implementado (não reprocessar demos reais sem
autorização específica).

**Requisitos de qualidade espacial [DECISÃO]**: heatmap só com amostra e cobertura declaradas na
própria tela; nunca inferir rota a partir de poucos eventos; nenhum juízo de "posicionamento ruim"
a partir de uma morte ou de uma partida; heatmap amostrado diz que é amostrado.

---

## 14. Dados ausentes e inválidos — contrato de estados

**[DECISÃO]** Vocabulário único, **mapeado sobre os estados já existentes** (sem criar duplicatas):

| Estado canônico       | Significado                               | Estados existentes que ele cobre                                                                                   |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `MEASURED`            | Medido, amostra e cobertura suficientes   | Score `READY` com confiança `MODERATE`/`HIGH`; sinal do DNA dobrado no índice                                      |
| `PROVISIONAL`         | Medido com limitação de amostra/confiança | Score `READY` + `PROVISIONAL`; DNA `READY` (sem métrica de confiança ainda)                                        |
| `NOT_MEASURED`        | Não coletado ou não derivável             | `NOT_OBSERVED` (Score), "Não observado" (DNA), `unavailable` (dados semânticos), limitações de admissão (L04 etc.) |
| `INSUFFICIENT_SAMPLE` | Coletado, mas pouco                       | `INSUFFICIENT_SAMPLE`, `THIN_SAMPLE`, `INSUFFICIENT_COVERAGE`, `EMPTY`                                             |
| `INVALID`             | Inconsistente ou reprovado                | `partial_parse`, quarentena H.3-E, `blocked_raw_audit`, `INVALID` (posição)                                        |

Regra de composição: um indicador composto herda o **pior** estado dos componentes que usa e
declara a cobertura (parcela do peso medida). Componentes `NOT_MEASURED`/`INSUFFICIENT_SAMPLE`
saem do cálculo; nunca entram como zero.

### 14.1 Contrato de cada métrica

Fonte única hoje: `src/lib/pipeline/features.catalog.ts` (unidade, direção, intervalo, fórmula,
`nullBehavior`, denominador) e `docs/reference/METRICS_CATALOG.md`. **[RECOMENDAÇÃO R-CONTRATO]**
completar o catálogo com os campos que faltam, por métrica:

```
id estável · definição de produto · unidade · fonte (evento/campo) · fórmula · agregação ·
granularidade · amostra mínima · cobertura mínima · estados possíveis · ausente · inválido ·
limitações · versão do método · dependências do parser · testes · interpretações permitidas ·
interpretações proibidas · qualidade de extração (campo CANONICAL? cobertura observada) ·
qualidade de interpretação (confiabilidade, quando medida)
```

Exemplo preenchido (`aim.kills_per_round`): fonte `player_death.attacker_steamid` (CANONICAL);
fórmula `kills / rounds_played`; agregação por soma de numerador e denominador; mínimo 3 partidas;
permitido "você fez em média X abates por round nessas partidas"; proibido "você mira melhor que
a média", "você é um entry".

## 15. Tratamento de vieses

| Viés                                              | Onde                                       | Tratamento atual | Recomendação                                                                           |
| ------------------------------------------------- | ------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------- |
| Função (entry, AWP, suporte, âncora, lurker, IGL) | Score, Duelos, Utilitários, Sobrevivência  | Nenhum           | Proxy de função validado antes de qualquer ajuste; até lá, o Coach não compara funções |
| Lado CT/T                                         | Todos                                      | `side_balance`   | Exibir por lado quando a amostra por lado permitir                                     |
| Mapa                                              | Todos                                      | Nenhum           | Estratificar na etapa 3                                                                |
| Contexto de equipe (trocas dependem de colegas)   | `untraded_death_rate`, `traded_death_rate` | Nenhum           | Rotular como "inclui efeito do time"                                                   |
| Economia (eco frags)                              | Score, Mira                                | Nenhum           | Faixas de equipamento por evento (pesquisa §7)                                         |
| Volume vs. efeito                                 | `grenades_per_round`                       | Nenhum           | Efeito antes de volume (§4.5)                                                          |
| Seleção da população                              | Calibração futura                          | —                | Percentis sempre "entre usuários do CS2 PRO"                                           |

## 16. Comparabilidade entre jogadores

**[DECISÃO]** Hoje **não** há comparação entre jogadores: o Score e o DNA são absolutos e
internos. Qualquer comparação futura exige a etapa 2 do §7 e é rotulada pela população usada.
O Coach nunca compara (regra 22 do prompt e guard de resposta, **[EXISTE]**).

## 17. Comparabilidade histórica

- Snapshots do DNA só se comparam **dentro do mesmo método** (`method_version`). **[EXISTE]**
  (histórico mostra a versão; a interface avisa que métodos diferentes não são comparáveis).
- O Score não tem histórico (v1 recalculado na leitura). **[EM ABERTO]** para a Fase 4.2
  (evolução); exige tabela nova versionada — `player_score_snapshots` atual pressupõe percentil e
  tier e não deve ser usada como está.
- Mudança de `FEATURES_VERSION` altera os insumos: comparações entre partidas de versões de
  features diferentes devem ser sinalizadas.

## 18. Versionamento

### 18.1 Player DNA [DECISÃO]

Preservar `dna-weighted-v2`. Mudança material de fórmula = nova versão. Snapshots nunca
sobrescritos; cada um guarda a versão. Mudança só de apresentação não muda versão. Reclassificação
retroativa só com estratégia explícita e auditável (novo snapshot, nunca edição).

### 18.2 CS2 PRO Score [DECISÃO]

Preservar `pro-score-v1` e seus pesos. Nova metodologia = nova versão, com diferenças documentadas
e regressão contra v1 nas mesmas partidas. Nunca comparar versões sem informar a mudança.

### 18.3 Dados espaciais [DECISÃO]

Contrato `spatial-v1` definido antes da implementação; versionado; compatível com evolução.

### 18.4 Documento de mudança metodológica (obrigatório) [DECISÃO]

```
Motivação · Evidências · Fórmula anterior · Fórmula nova · Impacto esperado (sobre dados reais) ·
Testes (unitários, mutantes, regressão) · Limitações · Migração (dados e snapshots) · Rollback ·
Critérios de aprovação · Identificador da versão
```

## 19. Critérios de qualidade

Uma métrica só é exibida como valor quando: contrato completo (§14.1); estado ≠ `NOT_MEASURED`/
`INVALID`; amostra e cobertura declaradas na tela; versão do método rastreável; teste
determinístico e de "ausente ≠ zero"; para o Coach, valor presente como número nos fatos e
coberto pelo guard de resposta.

## 20. Limitações conhecidas

1. Índices do DNA e constantes de normalização não calibrados (§3.2).
2. Pesos do Score heurísticos (§9).
3. Dimensões correlacionadas e grandezas repetidas (§4.11).
4. Sem posições persistidas (§11.1).
5. Vencedor do round e time do jogador indisponíveis (L04) → sem validação por vitória, sem
   probabilidade de vitória.
6. `buy_context` e `survived` vazios em `round_players`; `weapon_fire` sem autor.
7. Amostra de produção mínima (3 perfis; 6 partidas).
8. Pesquisa: HLTV e Reddit não lidos diretamente; CStrike e CS2d.app não localizados (pesquisa §1).

## 21. Roadmap metodológico [RECOMENDAÇÃO]

Ordem proposta, do menor risco ao maior; cada item exige autorização própria quando tocar código.

1. Texto e exibição (sem mudar fórmula): R-DNA-1, R-DNA-2, R-DNA-3, R-DNA-4.
2. Completar o contrato das métricas no catálogo (R-CONTRATO).
3. Resolver L04 (time e vencedor por round) — destrava validação do Score e qualquer modelo de
   probabilidade.
4. Classificador de compra (Economia) — usa dados já persistidos.
5. `spatial-v1` camada 1 (posição no evento) + detalhe de partida.
6. Projeção por round por jogador — destrava curvas de confiabilidade (§6) e etapas A–C (§10).
7. `spatial-v1` camadas 2 e 3.
8. DNA v3 (uma grandeza por dimensão, corte após agregação, cobertura mínima) e, com dados,
   `pro-score-v2`.
9. Calibração populacional (etapas 2–4 do §7).

## 22. Fontes e referências

Lista completa, com o que aprender e o que não copiar de cada uma:
`docs/product/CS2_PRO_PRODUCT_RESEARCH_AND_BENCHMARKS.md`. Principais: Leetify Rating explained
(2024/2025) e atualização de 25/02/2026; HLTV Rating 2.1 e 3.0 (via Dust2, 2024–2025);
Pemstein & Dolinar (FanGraphs, 2015); Xenopoulos et al. (arXiv 2011.01324; ESTA, arXiv
2209.09861); demoparser2; Awpy; SCOPE.GG; Nomiun (2025).
