# Fase 4.2 — Mapeamento técnico-funcional (Marco 0)

Versão 1 · 2026-11-12 · Base analisada: `main` `b2c8219c55c37e4f90d6e7251312f8de9597d0d0`

Fonte: `docs/specifications/CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre.md` — cópia
byte a byte do arquivo enviado pelo dono do projeto (1.886 linhas, 85.023 bytes, SHA-256
`989ec11f04d8b31b0566e4ba6c084179b5400f00b266ced8ccdab9d01862e01a`; versão 1.0 de 05/11/2026,
status "Proposta para revisão"). Lido integralmente: Parte I (§1–§22) e Parte II (§23–§40).
Referências abaixo usam a numeração de seções do original (`§n`).

Classificação usada (pedida no prompt de evolução, §5.2):
**VAL** implementado e validado · **PARC** implementado parcialmente · **COD** existe no código,
não validado · **DOC** documentado, não implementado · **AUS** ausente · **BLOQ** bloqueado por
dependência · **AMB** ambíguo ou sem critério suficiente.

---

## 1. Os cinco Prompts Mestres — achado principal

**Fato:** a especificação **não define cinco Prompts Mestres**. A busca por "prompt" no original
retorna só 2 ocorrências, nenhuma sobre divisão de execução (linhas 1072 e 1134, sobre o Lovable
e o prompt do Coach). A palavra "Mestre" aparece apenas no título. O documento organiza a fase em
**10 entregas** (§8), **10 módulos A–J** (§9) e **8 diferenciais** (§7), com a ordem de execução
dada pelas entregas (linha 34: "as dez entregas representam a ordem de execução e validação").

**O que existe fora da especificação** (prompts do dono, não verificáveis contra o original):

| Prompt Mestre | Referência histórica               | Verificável no original? |
| ------------- | ---------------------------------- | ------------------------ |
| PM1           | desconhecido                       | Não                      |
| PM2           | desconhecido                       | Não                      |
| PM3           | desconhecido                       | Não                      |
| PM4           | entregas 4.2.7–4.2.8, módulos E–G  | Não                      |
| PM5           | entregas 4.2.9–4.2.10, módulos H–J | Não                      |

**Hipótese (não confirmada):** se cada Prompt Mestre cobre duas entregas consecutivas, PM1 =
4.2.1–4.2.2, PM2 = 4.2.3–4.2.4, PM3 = 4.2.5–4.2.6. É compatível com PM4 e PM5, mas **não está
escrito em lugar nenhum**.

**Inconsistência já visível:** a entrega 4.2.8 declara módulos **G/J** (§8, linha 576) e a 4.2.10
declara **I/J** (linha 596). A referência histórica do PM4 ("E–G") omite o J que a 4.2.8 inclui; o
módulo J aparece em dois PMs.

**Consequência:** este mapeamento é feito **por entrega**, que é a unidade oficial do original. A
matriz por Prompt Mestre (§10) usa a hipótese acima apenas para agrupar, marcada como tal. Para
confirmá-la, o dono do projeto precisa enviar os cinco Prompts Mestres ou confirmar o agrupamento.

---

## 2. Condições de entrada (§1.1 e §23) — estado real

| Condição                                                        | Estado                            | Evidência                                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 4.1 concluída ou isolada                                   | **Concluída**                     | PR #255 merged (`e4a329ef`); migrations `20261106100000/110000/120000` aplicadas; `/admin/notifications` validado no navegador (2026-11-10)             |
| Auditoria read-only de main, PRs, migrations, deploy, CI, gates | Feita                             | Relatório de fundação; checkpoint central; `main` = `b2c8219c` com gates verdes                                                                         |
| Parser/worker, contratos, tabelas e campos                      | Feita para os domínios desta fase | §5 abaixo                                                                                                                                               |
| Inventário de métricas                                          | Parcial                           | `features.catalog.ts` + `docs/reference/METRICS_CATALOG.md` (181 linhas); falta o catálogo único da 4.2.1                                               |
| Baseline de performance, tamanho de demos, custos               | Parcial                           | Storage `demos`: 30 objetos, 11,25 GB (≈ 375 MB/demo); `round_events` 3.041–4.397 eventos por partida. Sem medição de tempo de parsing nem de consultas |
| Branches/PRs sem sobreposição com a 4.1                         | OK                                | Nenhum PR aberto da 4.1                                                                                                                                 |
| Rollback e responsável por entrega                              | A definir por PR                  | —                                                                                                                                                       |

---

## 3. Requisitos transversais

| Requisito (original)                                                                                                               | Estado                   | Evidência / lacuna                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Null ≠ zero (§2.3)                                                                                                                 | **PARC**                 | Score e DNA tratam ausência (`proScore.ts`, `playerDna.ts`); dashboards têm estados "não disponível". Não há teste transversal "API, frontend, exportação e prompt do Coach" exigido em §24                                                                     |
| Proveniência: status, método, unidade, versão por métrica (§2.3, §4)                                                               | **PARC**                 | Catálogo tem unidade/fórmula/direção; Score e DNA têm versão; métricas do Dashboard não têm envelope com `status`/`coverage`/`evidence_refs`                                                                                                                    |
| Taxonomia de estados (§4): `OBSERVED`, `DERIVED`, `INFERRED`, `NOT_OBSERVED`, `NOT_MEASURED`, `INSUFFICIENT_SAMPLE`, `UNAVAILABLE` | **AUS** como enum único  | Estados existem espalhados (§4 deste doc). **Conflito** com o vocabulário proposto em `CS2_PRO_PRODUCT_METHODOLOGY.md` §14 (`MEASURED`/`PROVISIONAL`/…): **prevalece a taxonomia da especificação**; a metodologia foi corrigida neste PR para mapear sobre ela |
| Compatibilidade com `coach-context-v1` e `xray-v1` (§4)                                                                            | **VAL**                  | Ambas as versões existem no código (`coach-context-v1` ×3, `xray-v1` ×5)                                                                                                                                                                                        |
| RLS/ownership; teste A contra B (§5)                                                                                               | **PARC**                 | RLS nas tabelas atuais; testes cross-tenant existem para notificações/campanhas (harness PostgreSQL); não existem para os read models da 4.2 (ainda inexistentes)                                                                                               |
| Feature flags "reutilizar mecanismo existente" (§15, §19)                                                                          | **AUS**                  | Nenhum mecanismo de feature flag no código nem nas migrations. **Ambiguidade**: a especificação presume um que não existe                                                                                                                                       |
| i18n pt-BR/pt-PT/en/es/fr (§6, §37)                                                                                                | **VAL** para o existente | Mecanismo de dicionários em 5 idiomas, com testes de chaves                                                                                                                                                                                                     |
| Observabilidade (§14)                                                                                                              | **PARC**                 | Versão do parser/schema em artefatos RAW e admissão; sem métricas de duração de agregação nem alertas de queda de coverage                                                                                                                                      |
| Release gates (§13.1)                                                                                                              | **VAL**                  | Gates obrigatórios de PR e de `main` ativos e verdes em `b2c8219c`                                                                                                                                                                                              |
| Coach: OpenRouter `openai/gpt-oss-20b`, sem fallback, sem chamadas automáticas (§12)                                               | **VAL**                  | PRs #257/#258; guard de resposta; validado em produção em 2026-11-11                                                                                                                                                                                            |

---

## 4. Restrições do contrato de admissão que afetam a 4.2 (não citadas na especificação)

`docs/ADMISSION_CONTRACT_V3.md` (registro de limitações, ruleset 1) declara restrições vigentes
que **limitam requisitos da especificação**:

| Limitação                               | Restrição declarada                                                                                 | Requisitos da 4.2 afetados                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE` | "Sem métricas de movimento, posicionamento ou tempo de exposição"                                   | 4.2.2 camada "presença"/densidade (§10 "Densidade: amostras temporais"); 4.2.4 replay contínuo; 4.2.5 movimento; 7.6 oportunidades espaciais |
| `L03-USERCMD-UNAVAILABLE`               | "Sem análises de mira, counter-strafe, spray ou reação"                                             | 4.2.5 first bullet, spray, crosshair placement, counter-strafe                                                                               |
| `L04-MATCH-RESULT-UNRESOLVED`           | Sem times, vencedor por slot e placar; colunas `matches.result/score_*/team_*` gravadas como `null` | Resultado da partida, placar, identidade de time (4.2.7 contexto; 7.1)                                                                       |

**Correção de um registro anterior (fato verificado nesta missão):** a metodologia de 2026-11-11
dizia que o **vencedor do round** estava indisponível por L04. Isso estava **errado**. Em produção
(consulta somente leitura, 2026-11-12):

- `match_rounds.winner_side` preenchido em **121 de 122** rounds (6 partidas); `win_reason` é
  `unknown` em quase todos.
- `round_players.side` preenchido por jogador e round (5 partidas, 97 rounds, 10 participantes,
  ≈ 5 por lado); `round_players.deaths` vazio.
- **Validação independente:** em 63 rounds em que um lado inteiro foi eliminado (abates em
  `round_events` × lado em `round_players`), o vencedor gravado é o outro lado em 62; o único caso
  restante é T eliminado **após** plantar a bomba, vitória T legítima (explosão). **0
  contradições.**
- O parser só registra o vencedor quando duas observações independentes concordam
  (`services/cs2-demo-parser/parser.py:488-555`, `round_win_status` e `team_rounds_total`).

Portanto, **lado do jogador por round e lado vencedor do round existem e são consistentes**; o
que L04 bloqueia é **identidade do time entre metades, placar e resultado da partida**. Isso muda a
prontidão de 4.2.7 e da validação do Score (prompt de evolução §7 e §10.4).

---

## 5. As dez entregas — rastreabilidade e comparação com `main`

Para cada entrega: nome oficial e módulos (§8), critério de saída (§8), passos obrigatórios
(§24–§33) e estado real.

### 4.2.1 Contratos e cobertura das métricas — Módulo A e fundação transversal (§8, §24)

Critério de saída: toda métrica exposta tem status/unidade/denominador; ausência nunca vira zero;
contratos antigos e H.3-E passam.

| Requisito (§24)                                                                                                | Estado                                               | Evidência                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inventário de métricas de Dashboard, X-Ray, DNA, Coach, notificações, relatórios                               | **PARC**                                             | Catálogo de features + `METRICS_CATALOG.md`; métricas de `match_metrics` e notificações fora do catálogo único                                                                                               |
| Classificação dos campos do parser (mapped/derived/ignored/unknown)                                            | **VAL**                                              | `docs/PARSER_FIELD_GOVERNANCE.md` + "CS2 parser tests (field governance, mapping gate…)" no CI                                                                                                               |
| Catálogo central de métricas (chave, unidade, fórmula, origem, status, amostra, coverage, segmentação, versão) | **PARC**                                             | `src/lib/metrics/canonicalMetrics.ts` (`metrics-catalog-v1`, 17 métricas da UI, com teste de cobertura da UI) — **omitido na versão 1 deste mapeamento**; faltam status da taxonomia, coverage e segmentação |
| Envelope tipado compatível                                                                                     | **COD** (2026-11-12)                                 | `metric-contract-v1` (`src/lib/metrics/metricContract.ts`, `docs/reference/METRIC_CONTRACT.md`); adaptador do `xray-v1`; ainda não adotado pelos read models                                                 |
| Regra de coverage                                                                                              | **AUS** como regra única (existe cobertura do Score) |                                                                                                                                                                                                              |
| Testes de contrato (null, zero, ausência, desconhecido, denominador zero, duplicidade, versão)                 | **PARC**                                             | Existem para Score/DNA/admissão; não para um envelope comum                                                                                                                                                  |
| Matriz de liberação (SUPPORTED/PARTIAL/NOT_MEASURED/…)                                                         | **COD** (2026-11-12)                                 | `RELEASE_MATRIX` cobre as métricas atuais e todas as linhas do §4 do original, com bloqueios e evidência                                                                                                     |

Prontidão: **pronta para iniciar** — sem bloqueio externo. É pré-requisito declarado das demais.

### 4.2.2 Heatmaps por mapa, lado e evento — Módulo A (§8, §25)

Critério de saída: posições válidas, T/CT correto, dados sem posição excluídos/rotulados, RLS
testado, sem carregar todos os ticks.

| Requisito                                                | Estado   | Evidência                                                                                                                                                                    |
| -------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordenadas confirmadas no parser                        | **COD**  | `X/Y/Z`, `last_place_name` extraídos (`hot_payload.py:121-147`), mas desbastados até 4.096 linhas e **não persistidos** (`persistence.server.ts:262-268` grava só contagens) |
| Transformação de coordenadas versionada por mapa         | **AUS**  | Nenhum metadado de radar no repositório                                                                                                                                      |
| Semântica por camada (vítima no tick da morte etc.)      | **AUS**  |                                                                                                                                                                              |
| Bins, normalização, read model idempotente, API filtrada | **AUS**  |                                                                                                                                                                              |
| T/CT correto                                             | **COD**  | Lado por round persistido e validado (§4)                                                                                                                                    |
| Camada "presença"/densidade                              | **BLOQ** | L02                                                                                                                                                                          |

Prontidão: **bloqueada por persistência de posição no evento** (Marco 2 do prompt de evolução).
Camadas por evento (morte, kill, dano, granada) não dependem de L02; densidade/presença depende.

### 4.2.3 Diagnóstico de mortes e posicionamento — Módulo B (§8, §26)

| Requisito                                                     | Estado   | Evidência                                                                                                          |
| ------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| Contexto temporal da morte (janela, vivos, bomba, lado, arma) | **PARC** | Eventos com tick, arma, distância; lado por round; bomba (`bomb_plant/defuse/explode`); falta read model por morte |
| Classificadores versionados                                   | **AUS**  | Existem agregados (morte precoce, sem trade, primeira morte) — não por morte                                       |
| Posição na ficha                                              | **BLOQ** | Persistência de posição                                                                                            |
| Feedback separado dos fatos                                   | **AUS**  |                                                                                                                    |

Prontidão: **parcial** — versão temporal (sem posição) viável; versão espacial depende da 4.2.2.

### 4.2.4 Replay 2D e navegação por eventos — Módulos B/I (§8, §27)

| Requisito                                         | Estado       | Evidência                                                                                       |
| ------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| Dados de posição por jogador/tick                 | **AUS/BLOQ** | Não persistidos; contínuo restrito por L02                                                      |
| Contrato de replay por round, timeline, controles | **AUS**      | Não existe rota de detalhe de partida (`src/routes/_authenticated/` não tem `matches.$matchId`) |

Prontidão: **bloqueada** (posições amostradas + decisão sobre L02).

### 4.2.5 Mira, confrontos e movimentação — Módulo C (§8, §28)

| Requisito                                      | Estado             | Evidência                                                                       |
| ---------------------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| Duelos e opening                               | **VAL** (agregado) | `dueling.opening_success`, `kd_balance` no catálogo; Score/DNA                  |
| Painel por arma/distância/mapa/lado            | **PARC**           | `distance` em 759/759 abates; arma em todos; lado por round; painel inexistente |
| First bullet, spray, crosshair, counter-strafe | **BLOQ**           | L03 (`usercmd`); `weapon_fire` sem autor (0/16.892)                             |

Prontidão: **parcial** — duelos por arma/distância/lado viáveis; resto permanece `NOT_MEASURED`.

### 4.2.6 Inteligência de utilitários — Módulo D (§8, §29)

| Requisito                   | Estado              | Evidência                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autoria de granadas         | **VAL**             | Detonações com autor promovidas a CANONICAL (governança de campos, 2026-11-04)                                                                                                                                                                                        |
| Dano de utilitário          | **COD**             | `utility.utility_damage_per_round`                                                                                                                                                                                                                                    |
| Inimigos cegados            | **AUS** em produção | "Não observado" na página do DNA                                                                                                                                                                                                                                      |
| Flash assist                | **PARC — conflito** | `metrics.ts:270-300`: atribuição **temporal** (flash na mesma vítima até `FLASH_ASSIST_WINDOW_SECONDS = 3` s antes) quando a marcação nativa falta; partidas antigas "método não registrado". O critério de saída exige que heurística não seja apresentada como fato |
| Trajetória/destino de smoke | **AUS**             |                                                                                                                                                                                                                                                                       |

Prontidão: **parcial**; primeiro passo é rotular/separar flash assist nativo × temporal.

### 4.2.7 Economia e impacto por round — Módulos E/F (§8, §30)

| Requisito                            | Estado             | Evidência                                                                      |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------ |
| Dinheiro/equipamento por round       | **COD**            | `round_players.money_start`/`equipment_value` (969/970)                        |
| Categoria de compra (eco/force/full) | **AUS**            | `buy_context` vazio                                                            |
| Trade com janela                     | **VAL**            | `TRADE_WINDOW_SECONDS = 5` (`src/config/pipeline.ts:84`); exibido no glossário |
| Opening, clutch                      | **VAL** (agregado) | catálogo; Score/DNA                                                            |
| Vantagem numérica                    | **AUS**            | derivável de abates × lado                                                     |
| Retake                               | **AUS**            | eventos de bomba existem                                                       |
| Resultado do round por jogador       | **COD**            | `winner_side` × `round_players.side`, validado (§4) — ainda não exposto        |
| Identidade de time / placar          | **BLOQ**           | L04                                                                            |

Prontidão: **alta** — quase tudo derivável de dados já persistidos.

### 4.2.8 Evolução e consistência — Módulos G/J (§8, §31)

| Requisito                            | Estado        | Evidência                                        |
| ------------------------------------ | ------------- | ------------------------------------------------ |
| Snapshots versionados e idempotentes | **VAL** (DNA) | `player_dna_snapshots` (digest, versão; PR #256) |
| Série por partida                    | **VAL**       | Gráficos de Performance por partida              |
| Janelas 5/10/20/50                   | **AUS**       |                                                  |
| Chave de compatibilidade por métrica | **PARC**      | versão em DNA/Score; não por métrica             |
| DNA só READY                         | **VAL**       | estados do perfil                                |
| Histórico do Score                   | **AUS**       | v1 recalculado na leitura                        |

Prontidão: **parcial**; volume atual (≤ 3 partidas por jogador) não sustenta janelas.

### 4.2.9 Treinamento adaptativo — Módulo H (§8, §32)

| Requisito                                              | Estado   | Evidência                                                                   |
| ------------------------------------------------------ | -------- | --------------------------------------------------------------------------- |
| Catálogo de exercícios                                 | **PARC** | Catálogo de aulas (links Tutor LMS); `catalogSelect.ts`                     |
| Plano ligado a diagnóstico                             | **PARC** | `trainingPlan.ts` usa dimensões do DNA (`PLAN_CEILING = 60`, não calibrado) |
| Aceitar/editar/dispensar, reavaliação com nova amostra | **AUS**  | `training_plans` com 0 linhas em produção                                   |
| Metas existentes                                       | **COD**  | `player_goals` (Fase 4.1)                                                   |

Prontidão: **parcial**; depende de diagnósticos da 4.2.3/4.2.7.

### 4.2.10 Biblioteca de momentos e comparativos Pro — Módulos I/J (§8, §33)

| Requisito                     | Estado   | Evidência                                             |
| ----------------------------- | -------- | ----------------------------------------------------- |
| Bookmarks round/tick privados | **AUS**  |                                                       |
| Abrir no replay               | **BLOQ** | 4.2.4                                                 |
| Benchmark Pro                 | **BLOQ** | Nenhum dataset licenciado (§11.7: fica `UNAVAILABLE`) |

Prontidão: biblioteca **pronta para iniciar** sem replay (abrir na ficha); comparativo **bloqueado**.

---

## 6. Módulos A–J (§9) e matriz original (§34)

Matriz original preservada:

| Módulo                               | Etapas principais    | Diferenciais atendidos                                                   |
| ------------------------------------ | -------------------- | ------------------------------------------------------------------------ |
| A — Inteligência visual do mapa      | 4.2.1, 4.2.2, 4.2.10 | Posicionamento versus Pro; Mapa de oportunidades perdidas                |
| B — Diagnóstico de mortes e decisões | 4.2.3, 4.2.4, 4.2.7  | Onde estou perdendo rounds; Meu pior hábito; Como eu deveria ter jogado? |
| C — Mira, confrontos e movimentação  | 4.2.1, 4.2.5, 4.2.8  | Meu pior hábito; Comparação entre versões de mim mesmo                   |
| D — Inteligência de utilitários      | 4.2.1, 4.2.6, 4.2.7  | Onde estou perdendo rounds; Mapa de oportunidades perdidas               |
| E — Economia e compra                | 4.2.1, 4.2.7, 4.2.8  | Onde estou perdendo rounds; Comparação entre versões de mim mesmo        |
| F — Impacto e situações de round     | 4.2.3, 4.2.7, 4.2.8  | Onde estou perdendo rounds; Meu pior hábito                              |
| G — Evolução e consistência          | 4.2.8                | Comparação entre versões de mim mesmo; Revisão mensal automática         |
| H — Treinamento adaptativo           | 4.2.9                | Meu pior hábito; Como eu deveria ter jogado?; Comparação entre versões   |
| I — Biblioteca de momentos           | 4.2.4, 4.2.10        | AI Coach com evidências; Como eu deveria ter jogado?                     |
| J — Player DNA e comparativos Pro    | 4.2.8, 4.2.10        | Posicionamento versus Pro; Revisão mensal automática                     |

**Inconsistências internas do original** (registradas, não corrigidas — o original não é editado):

1. §8 lista 4.2.1 só com "Módulo A e fundação transversal", mas §34 associa 4.2.1 também a C, D e E.
2. §8 associa 4.2.10 a I/J; §34 associa 4.2.10 também ao Módulo A.
3. §34 não lista o diferencial 7.7 ("AI Coach com evidências") em nenhum módulo além de I.
4. O PM4 histórico ("E–G") não inclui J, que a 4.2.8 inclui.

## 7. Oito diferenciais (§7) — dependências

| Diferencial                         | Depende de                                                                       | Prontidão                                 |
| ----------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| 7.1 Onde estou perdendo rounds?     | resultado do round por jogador (disponível, §4), primeira morte, trade, economia | **Parcial — viável sem posição**          |
| 7.2 Posicionamento vs profissionais | posições + dataset Pro licenciado                                                | **Bloqueado**                             |
| 7.3 Meu pior hábito                 | classificadores da 4.2.3, recorrência; vários padrões exigem posição             | Parcial                                   |
| 7.4 Como eu deveria ter jogado?     | reconstrução de posições, vivos, bomba, utilitários                              | **Bloqueado** (posição, L02)              |
| 7.5 Comparação entre versões de mim | snapshots versionados, janelas                                                   | Parcial                                   |
| 7.6 Mapa de oportunidades perdidas  | posições contínuas                                                               | **Bloqueado** (L02)                       |
| 7.7 AI Coach com evidências         | evidence pack com refs partida/round/tick                                        | Parcial (fatos + guard existem; refs não) |
| 7.8 Revisão mensal automática       | agregados por período; sem e-mail/push                                           | Ausente; viável após 4.2.8                |

## 8. Mapa de dependências

```
4.2.1 contratos/coverage ─┬─► 4.2.2 heatmaps ─┬─► 4.2.3 (espacial) ─► 4.2.4 replay ─► 4.2.10 (abrir no replay)
                          │   ▲ posição no     │
                          │   │ evento (M2)    └─► 7.2 (+ dataset Pro)
                          ├─► 4.2.3 (temporal)
                          ├─► 4.2.5 duelos ── (L03 bloqueia aim/movimento)
                          ├─► 4.2.6 utilitários (flash assist rotulado)
                          ├─► 4.2.7 economia/round ◄── lado + vencedor por round (existe; M1 expõe)
                          └─► 4.2.8 evolução ─► 4.2.9 treino ─► 7.8 revisão mensal
L02 (domínio de ticks) bloqueia: densidade, replay contínuo, movimento, 7.4, 7.6
L03 (usercmd) bloqueia: first bullet, spray, crosshair, counter-strafe
L04 (times/placar) bloqueia: resultado da partida, placar, identidade de time
```

## 9. Relação com o prompt de evolução (2026-11-12)

| Marco do prompt                      | Entregas da especificação que ele habilita  | Observação                                                                                |
| ------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| M1 — Contexto CT/TR, times, vencedor | 4.2.2 (critério "T/CT correto"), 4.2.7, 7.1 | Lado e vencedor por round **já existem**; falta expor e resolver identidade de time (L04) |
| M2 — Inteligência espacial           | 4.2.2, 4.2.3, 4.2.4, 7.2–7.6                | Camada por evento não depende de L02; trajetórias dependem                                |
| M3 — DNA v3                          | 4.2.8 (Módulo J)                            | Especificação exige "DNA só READY" e versão; não define fórmula                           |
| M4 — Score v2                        | **Não está na especificação**               | O original não menciona o CS2 PRO Score; é escopo do prompt de evolução                   |
| M5 — Coach contextual                | 7.7, §12                                    | Evidence pack com refs                                                                    |

**Conflito de autorização:** a especificação manda "solicitar autorização antes de código, banco,
deploy ou reprocessamento" (§17 item 6; §23 item 8; §23.1). O prompt de evolução de 2026-11-12,
posterior e explícito, autoriza migrations aditivas, merges após gates e deploys controlados para
os Marcos 1–6. **Decisão registrada:** prevalece a autorização posterior e explícita do dono **para
o que ela cobre**; continuam exigindo autorização específica (ambos os documentos concordam):
reprocessamento/backfill de demos reais, mudanças destrutivas, segurança, billing e custos
relevantes.

## 10. Matriz de prontidão

### Por entrega (unidade oficial)

| Entrega | Prontidão    | Bloqueio principal            | Primeiro passo                                                |
| ------- | ------------ | ----------------------------- | ------------------------------------------------------------- |
| 4.2.1   | Pronta       | —                             | Catálogo único + envelope de métrica + matriz de liberação    |
| 4.2.2   | Bloqueada    | Posição persistida no evento  | M2 camada A                                                   |
| 4.2.3   | Parcial      | Posição (só a parte espacial) | Ficha de morte temporal                                       |
| 4.2.4   | Bloqueada    | Posições amostradas; L02      | Decisão sobre L02 + M2 camada B                               |
| 4.2.5   | Parcial      | L03                           | Painel de duelos por arma/distância/lado                      |
| 4.2.6   | Parcial      | Flash assist heurístico       | Separar nativo × temporal                                     |
| 4.2.7   | Quase pronta | L04 só para placar/time       | Expor resultado do round por jogador; classificador de compra |
| 4.2.8   | Parcial      | Volume de partidas            | Chave de compatibilidade por métrica                          |
| 4.2.9   | Parcial      | Diagnósticos (4.2.3/4.2.7)    | Controle do usuário sobre o plano                             |
| 4.2.10  | Parcial      | Replay; dataset Pro           | Bookmarks privados                                            |

### Por Prompt Mestre (agrupamento **hipotético**, §1)

| PM (hipótese)   | Entregas     | Prontidão agregada                   |
| --------------- | ------------ | ------------------------------------ |
| PM1             | 4.2.1–4.2.2  | 4.2.1 pronta; 4.2.2 bloqueada por M2 |
| PM2             | 4.2.3–4.2.4  | Parcial / bloqueada                  |
| PM3             | 4.2.5–4.2.6  | Parcial                              |
| PM4 (histórico) | 4.2.7–4.2.8  | Quase pronta / parcial               |
| PM5 (histórico) | 4.2.9–4.2.10 | Parcial                              |

## 11. Sequência recomendada

1. **M1 (base de 4.2.7 e 4.2.2):** expor lado por round e resultado do round por jogador com
   estados explícitos (dados já persistidos e validados); investigar identidade de time para L04.
2. **4.2.1:** catálogo único, envelope `status/unit/sample/coverage/method_version/evidence_refs`
   com a taxonomia do §4 do original; matriz de liberação.
3. **M2 camada A:** posição do ator/vítima no tick do evento (contrato versionado, benchmark com
   fixture/demo autorizada, migration aditiva, RLS) → desbloqueia 4.2.2 por evento e 4.2.3.
4. **M3/M4:** DNA v3 e Score v2 sobre contexto CT/TR e resultado do round, ativação progressiva.
5. **4.2.7 → 4.2.3 → 4.2.5/4.2.6 → 4.2.8 → 4.2.9 → 4.2.10**, cada uma com PR próprio.
6. **L02** precisa de decisão técnica própria antes de densidade, replay contínuo e 7.4/7.6.

## 12. Pendências para o dono do projeto

1. Enviar os cinco Prompts Mestres (ou confirmar o agrupamento hipotético do §1).
2. Confirmar se o módulo J pertence ao PM4, ao PM5 ou a ambos.
