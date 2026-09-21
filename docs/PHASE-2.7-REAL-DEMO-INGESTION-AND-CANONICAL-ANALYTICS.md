# FASE 2.7 — REAL DEMO INGESTION + CANONICAL ANALYTICS FOUNDATION

Status: **IN PROGRESS — NOT CLOSED.**
Blocker: GATE 02 (real parser) is **BLOCKED by infrastructure**, see §3.

## 1. Objetivo

Levar o caminho `.dem → upload → job → parser → normalização → identidade →
observação canônica → resolver → persistência transacional → métricas →
features → data quality` a um estado real, determinístico e auditável.
Pro Score, Player DNA, Diagnosis, AI Coach e Training permanecem fora de escopo.

## 2. Arquitetura final (inalterada em suas autoridades)

```
SOURCE (faceit | demo)
   ↓ adapter
CANONICAL OBSERVATION
   ↓ match identity resolver (EXACT only)
persist_canonical_observation_attached   ← única autoridade de escrita canônica
   ↓
matches / match_sources / match_participants / match_rounds / round_players / round_events
   ↓
per-player projection: matches (colunas de conveniência), match_metrics, match_features
```

## 3. Parser — decisão técnica e limitação honesta

Ler um `.dem` de CS2 exige um parser nativo (`demoparser2`, Rust/Python) e
minutos de CPU por arquivo. O servidor da aplicação roda em runtime serverless
edge (workerd), **sem addons nativos e sem orçamento de CPU longo**. Não existe
biblioteca JS/WASM madura capaz de extrair, com confiabilidade de produção, o
conjunto de eventos exigido (kills, damage, flashes, granadas, bomba, economia)
de demos CS2 atuais.

Decisão mantida: o parse ocorre em **worker HTTP externo dedicado**, contratado
por `src/lib/pipeline/parser/remoteParser.server.ts`
(`contract_version = PARSER_CONTRACT_VERSION`), que baixa o arquivo por URL
assinada de curta duração e responde no contrato `RawParserOutput`.

**Limitação real:** os segredos `DEMO_PARSER_URL` e `DEMO_PARSER_TOKEN` não
existem neste projeto. Sem eles o adaptador se declara indisponível e o job
falha com `PARSER_UNAVAILABLE` — nunca finge ter processado. Portanto:

- GATE 02 (parser real), GATE 03 (determinismo sobre arquivo real),
  GATE 01/05/17 sobre arquivo real, GATE 14/15 com demo real, GATE 18/19 com
  dados reais de demo, GATE 22/23/24 do caminho demo: **BLOCKED**.
- Nada disso foi marcado como PASS.

## 4. Entregue nesta rodada

### 4.1 Fim da dupla persistência (item 21 / GATE 28)

Antes: o job chamava `persistCanonicalMatch()` (inseria `matches` por
`upload_id`, mais `match_rounds` e `round_events`) **e depois**
`persistCanonicalObservation()` — duas escritas dos mesmos fatos e risco real de
segunda linha de partida quando o resolver anexasse o demo a uma partida FACEIT
existente.

Agora, em `src/lib/pipeline/jobs.server.ts`:

1. `persistCanonicalObservation()` roda **primeiro** e devolve `match_id`;
2. `persistDemoProjection()` (novo, em `src/lib/pipeline/persistence.server.ts`)
   grava **apenas** a projeção por jogador: colunas de conveniência em `matches`,
   `match_metrics` (upsert por `match_id,player_id`) e `match_features`
   (substituição por `match_id,player_id`).

`match_rounds`, `round_events`, `match_participants` e `round_players` passam a
ter **um único escritor**: a rotina transacional canônica.
`matches.player_id` é projeção — nunca é sobrescrito quando já pertence a outro
jogador, e nunca é sinal de identidade (GATE 11 preservado).

### 4.2 Auditoria semântica de features (itens 31/32 — GATE 20)

Novo catálogo: `src/lib/pipeline/features.catalog.ts`, com
`formula`, `unit`, `range`, `direction`, `meaning`, `nullBehavior`,
`sampleRequirement` e `confidenceImpact` para **todas** as features emitidas.
Teste `features.semantics.test.ts` garante que catálogo e implementação são
exatamente o mesmo conjunto e que cada feature declara direção.

Inversões semânticas corrigidas em `src/lib/pipeline/features.ts`:

| feature                                 | antes                                    | agora                                                        | direção |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ | ------- |
| `early_death_rate`                      | `1 - earlyDeaths/deaths` (era avoidance) | `earlyDeaths/deaths`                                         | ↓       |
| `early_death_avoidance`                 | inexistente aqui                         | `1 - earlyDeaths/deaths`                                     | ↑       |
| `untraded_death_rate`                   | `1 - untraded/deaths`                    | `untraded/deaths`                                            | ↓       |
| `damage_taken_per_round`                | `1 - dano/round/120`                     | `dano/round/120`                                             | ↓       |
| `decision_making.early_death_avoidance` | mesmo nome, outro denominador            | renomeado `early_death_free_rate` (`1 - earlyDeaths/rounds`) | ↑       |

Semântica NULL endurecida: todo `ratio()` com denominador zero agora retorna
`null`. Antes, `Math.max(x, 1)` transformava ausência de amostra em `0` —
exatamente o "NULL → 0" proibido. `economy.*` e `positioning.map_spread`
permanecem `null` por ausência de dado real, com `economy_data_available` como
sinalizador factual de cobertura.

### 4.3 Taxonomia de erros e limites (itens 39/40)

Novos códigos em `src/lib/pipeline/errors.ts`: `DEMO_EMPTY`,
`IDENTITY_RESOLUTION_ERROR`, `CANONICAL_RESOLUTION_CONFLICT`,
`CANONICAL_PERSISTENCE_ERROR`, `METRICS_ERROR`, `FEATURES_ERROR`,
`JOB_TIMEOUT`, `JOB_STALE`, `RESOURCE_LIMIT`, `STORAGE_ERROR`.
Permanentes (sem retry): `DEMO_EMPTY`, `CANONICAL_RESOLUTION_CONFLICT`,
`RESOURCE_LIMIT`, além dos anteriores.

As fases do job passam a mapear causa precisa: métricas → `METRICS_ERROR`,
features → `FEATURES_ERROR`, persistência canônica →
`CANONICAL_PERSISTENCE_ERROR` ou `CANONICAL_RESOLUTION_CONFLICT`.
Arquivo vazio deixa de ser "pequeno demais" e vira `DEMO_EMPTY`.
Todos os códigos têm mensagem nos cinco idiomas.

Limites documentados em `src/config/pipeline.ts`: `PARSER_MAX_DURATION_MS`,
`MAX_PARSER_PAYLOAD_BYTES`, além dos limites de tamanho já existentes.
CPU e memória do parse pertencem ao worker externo — limitação declarada, não
simulada.

### 4.4 Versionamento e linhagem (itens 36/37)

`METRICS_VERSION` e `FEATURES_VERSION` em `src/config/pipeline.ts`, gravados na
metadata da observação canônica (`demo.adapter.ts`) e em `matches.demo_metadata`.
Junto de `parser_name/parser_version/schema_version/analysis_version` já
persistidos, a cadeia
`feature → metric → match → source → upload → arquivo` é rastreável.

## 5. Não alterado (deliberadamente)

RLS, grants, SECURITY DEFINER, resolver canônico, Identity Graph, FACEIT, Steam,
Gamers Club, storage privado, job claim atômico, stale recovery, retry.
Nenhuma migration foi criada nesta rodada — nenhuma tabela nova foi necessária.

## 6. Gates

| Gate                           | Status                               | Nota                                                                                                                             |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 01 upload real                 | PARTIAL                              | upload/registro funcionam; sem parser não há ciclo completo                                                                      |
| 02 parser real                 | **BLOCKED**                          | worker externo não provisionado                                                                                                  |
| 03 determinismo                | BLOCKED                              | depende de 02                                                                                                                    |
| 04 arquivo inválido            | PASS                                 | validação de extensão/tamanho/vazio, códigos precisos                                                                            |
| 05 limite de recurso           | PARTIAL                              | tamanho e timeout de transporte sim; CPU/memória no worker                                                                       |
| 06/07 identidade real          | PASS                                 | só SteamID explícito; nada derivado de nickname                                                                                  |
| 08 identity graph              | PARTIAL                              | caminho preservado; prova real depende de 02                                                                                     |
| 09 adapter canônico            | PASS                                 | demo passa por `demoToCanonicalBundle`                                                                                           |
| 10 persistência canônica       | PASS                                 | escrita canônica só pela rotina transacional                                                                                     |
| 11 neutralidade de player      | PASS                                 | projeção nunca sobrescreve outro jogador                                                                                         |
| 12/13 idempotência/atomicidade | PASS (canônico)                      | provado na 2.6.11.5A; demo agora usa o mesmo caminho                                                                             |
| 14/15/16 convergência          | BLOCKED (demo real)                  | provas existentes usam fixture canônica                                                                                          |
| 17 parse parcial               | PARTIAL                              | tratamento implementado; prova real depende de 02                                                                                |
| 18/19 métricas/features        | PASS (fixture)                       | 500 testes; sobre demo real: BLOCKED                                                                                             |
| 20 semântica de features       | PASS                                 | catálogo + testes                                                                                                                |
| 21 data quality                | PASS                                 | quality/coverage/confidence derivados de cobertura real                                                                          |
| 22 linhagem                    | PASS                                 | versões e ids gravados                                                                                                           |
| 23/24 recuperação/concorrência | NOT_PROVEN                           | claim atômico e stale recovery existem; prova E2E depende de 02                                                                  |
| 25/26 RLS/storage              | PASS (herdado, sem alteração)        | suíte de segurança inalterada                                                                                                    |
| 27 cleanup                     | BLOCKED                              | G.6-R: autoridade única e acionadores contidos; execução desligada; Railway runtime parity indisponível |
| 28 fim da dupla persistência   | **PASS**                             | ver §4.1                                                                                                                         |
| 29/30 sem regressão            | PASS                                 | 500/500 testes, typecheck, lint, build                                                                                           |

## 7. Próximos passos

1. Provisionar o worker de parse e cadastrar `DEMO_PARSER_URL` e
   `DEMO_PARSER_TOKEN`; então executar GATE 01–03, 05, 08, 14–19, 22–24 com
   arquivo `.dem` real e fixtures A–G.
2. Expor o source e a imagem do runtime Railway em SHA auditável, preservar o
   isolamento de processo e provar `/health`/`/version` antes de qualquer gate
   operacional de cleanup ou DEM.
3. Somente depois: Pro Score.

## 8. Rodada de hardening P1–P2 (fase segue ABERTA)

Nenhuma funcionalidade nova. Correções de correção/segurança sobre o pipeline
demo; o parser real continua não provisionado.

1. **Resolver realmente ligado ao caminho demo.** `processJob()` agora descobre
   candidatos (`loadCanonicalCandidates`, descoberta neutra de fonte compartilhada
   com FACEIT), resolve com `resolveAgainstAll()` e só anexa quando
   `canConvergeCrossSource()` autoriza (EXACT_MATCH inequívoco). `CONFLICT` falha o
   job (`CANONICAL_RESOLUTION_CONFLICT`) em vez de fundir históricos.
2. **Fingerprint ≠ identidade canônica.** O SHA-256 do arquivo é evidência de
   identidade do _arquivo_; o demo não tem `external_match_id`. A persistência
   canônica deixou de exigir `externalMatchId` para aceitar `_attach_match_id`, o
   que antes descartava silenciosamente todo attach de demo.
3. **`NULL ≠ FALSE`.** Flags de bomba (`bombPlanted/Defused/Exploded`) são
   `boolean | null`: só booleano explícito do parser é preservado; ausência ou
   valor inválido é `null`.
4. **Métricas quality-aware.** `metricsAvailability()` descreve o que a demo
   realmente contém (kills, dano, utility, fim de round, economia, timing) e cada
   métrica dependente devolve `null` sem a evidência necessária. Flash assist,
   sendo temporal, exige timing confiável — sem ele é `null`, nunca 0.
5. **Tickrate nunca assumido.** `eventTime()` usa `time_seconds` ou
   `tick / tickrate` apenas quando o tickrate foi informado; o `64` fixo saiu.
6. **Clutch por participação comprovada.** A participação vem do round, não de
   `team != null`.
7. **Resposta do parser limitada.** `Content-Length` é validado antes da leitura e
   o corpo é lido incrementalmente com corte em `MAX_PARSER_PAYLOAD_BYTES`
   (`PARSER_PAYLOAD_TOO_LARGE`, permanente).
8. **Hash sem carregar a demo.** `src/lib/pipeline/sha256.ts` implementa SHA-256
   incremental (chunks de 8 MB); o cliente não usa mais `file.arrayBuffer()`.
9. **Política de demo curta.** Abaixo de `MIN_VALID_ROUNDS` o job falha com
   `DEMO_INSUFFICIENT_SAMPLE` (permanente, sem retry) — distinto de demo sem
   rounds (`VALIDATION_ERROR`).
10. **Deadline real.** O job tem um orçamento absoluto derivado de
    `JOB_STALE_MINUTES`, propagado ao adapter (`deadlineAt`) e verificado entre as
    etapas; esgotado, falha com `JOB_DEADLINE_EXCEEDED` em vez de segurar o slot de
    concorrência até a varredura de stale.
11. **Single writer preservado.** `persistCanonicalObservation()` continua a única
    escritora de fatos canônicos; a projeção por jogador segue separada.

Testes: `src/lib/pipeline/__tests__/hardening27.test.ts` (H1–H15) + suíte
existente = 515 testes. Typecheck, lint e build OK. `match_features.sample_clutches`
aceita `NULL`. **A FASE 2.7 permanece ABERTA**: sem `DEMO_PARSER_URL` /
`DEMO_PARSER_TOKEN` nenhum `.dem` real foi processado, e a FASE 2.8 não foi iniciada.

## 9. FASE 2.7.1 — correção final do attach de demo (fase segue ABERTA)

### 9.1. Defeito corrigido

`public.canonical_attach_source()` exigia `external_match_id`. Uma demo NÃO tem
identificador externo: sua identidade de artefato é o SHA-256 do arquivo. Toda
decisão EXACT do resolver para demo era portanto recusada com
`CANONICAL_ATTACH_INVALID`, e a demo só conseguia criar uma NOVA partida
canônica — o oposto da convergência que a arquitetura promete.

### 9.2. Como o attach funciona agora

Migration `20260910…_phase_271_demo_attach_fingerprint` (aplicada):

- `canonical_attach_source(source, external_match_id, match_id, contract, fingerprint)`
  aceita `external_match_id` **OU** `fingerprint`; **os dois ausentes continuam
  inválidos** (`CANONICAL_ATTACH_INVALID`).
- chave determinística de reserva: `source|ext:<id>` ou `source|fp:<hash>`,
  protegida por `pg_advisory_xact_lock` na mesma transação;
- uma observação já existente **nunca** é reapontada para outra partida
  (`CANONICAL_ATTACH_CONFLICT`);
- `persist_canonical_observation_attached()` repassa o fingerprint e mantém
  attach + persistência **em uma única transação** (single canonical writer);
- FACEIT continua usando `external_match_id`, sem mudança de comportamento;
- nenhuma permissão nova: `EXECUTE` só para `service_role`.

### 9.3. Identidades — distinção documentada

- **fingerprint** = identidade do ARTEFATO / proveniência / idempotência;
- **identidade da partida canônica** = decisão do Match Identity Resolver.

Dois arquivos diferentes podem descrever a mesma partida canônica; o fingerprint
nunca é usado como id canônico.

### 9.4. Isolamento da projeção por jogador

`src/lib/pipeline/persistence.server.ts` passou a montar o update por
`projectionUpdate()`. Redação correta da garantia:

> campos player-scoped (`player_id`, `upload_id`, `team_player`,
> `team_opponent`, `score_player`, `score_opponent`, `result`) só são escritos
> quando a projeção existente não tem dono ou pertence ao mesmo jogador.

Campos match-wide (plataforma, rounds, duração, versão do jogo, metadados)
continuam atualizáveis por qualquer observador.

### 9.5. NULL ≠ ZERO / utility zero

`extractFeatures()` deixou de inferir disponibilidade de utility a partir dos
contadores do jogador (`grenadesUsed > 0 || enemiesFlashed > 0`), o que
transformava um ZERO observado em NULL. Agora usa
`metrics.availability.utilityEvents` (classe de evidência) e
`metrics.availability.economy`. Resultado: utility observada com zero uso ⇒ `0`;
utility não observável ⇒ `null`.

### 9.6. Provas executadas

| item                                       | estado                    | evidência                                                                    |
| ------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------- |
| attach demo com `external_match_id` NULL   | **PASS (banco real)**     | `fp_attach=t`                                                                |
| idempotência do mesmo fingerprint          | **PASS (banco real)**     | `idempotent=t` (1 linha em `match_sources`)                                  |
| mesmo fingerprint apontado a outra partida | **PASS (banco real)**     | `CANONICAL_ATTACH_CONFLICT`                                                  |
| ambos identificadores ausentes             | **PASS (banco real)**     | `CANONICAL_ATTACH_INVALID`                                                   |
| FACEIT por `external_match_id`             | **PASS (banco real)**     | `faceit=t`                                                                   |
| EXACT/NO_MATCH/CONFLICT do resolver        | PASS (unitário)           | `hardening271.test.ts` A–F                                                   |
| isolamento de projeção                     | PASS (unitário)           | G1–G3                                                                        |
| NULL vs ZERO / utility                     | PASS (unitário)           | H1–H2, I1–I3                                                                 |
| tickrate 64 / 128 / timestamp / ausente    | PASS (unitário)           | J, K, L, L2                                                                  |
| clutch 1v1, 1v2 e participante fantasma    | PASS (unitário)           | M1, M2, N, N2                                                                |
| amostra insuficiente                       | PASS (unitário)           | O                                                                            |
| ausência de segunda persistência           | PASS (estrutural)         | projeção não escreve fatos canônicos                                         |
| atomicidade attach+persistência            | **NOT PROVEN em runtime** | verificada estruturalmente (mesma transação); falha proposital não executada |
| concorrência real de attach                | **NOT PROVEN**            | concurrency real not proven in this environment                              |
| pipeline E2E com `.dem` real               | **BLOCKED**               | parser não provisionado                                                      |

A verificação de banco real rodou em transação abortada de propósito
(`RAISE EXCEPTION` final): nenhuma linha permaneceu (`leftover_fp=0`,
`leftover_ext=0`), e existe exatamente **uma** assinatura de
`canonical_attach_source` (sem sobrecarga ambígua).

### 9.7. Correções de documentação exigidas pela auditoria

- **Migrations:** esta rodada CRIOU migration (attach por fingerprint); a rodada
  anterior também alterou `match_features.sample_clutches`. Afirmações de "nenhuma
  migration" ficam corrigidas por §9.2.
- **Projeção:** a redação "projection never overwrites another player" foi
  substituída pela formulação de §9.4.
- **Parser:** a justificativa correta NÃO é "não existe parser JS/WASM". É:
  parsing de demo é workload pesado de CPU/memória; existem implementações e
  bindings em diferentes runtimes; o Edge runtime tem limites de CPU/memória;
  queremos isolamento, versionamento e compatibilidade explícita por build do
  CS2, em um worker independente e sem acesso ao banco.

### 9.8. Estado

**FASE 2.7 — IN PROGRESS / HARDENING CORRECTIONS COMPLETED.** O parser real
continua NÃO provisionado (`DEMO_PARSER_URL` / `DEMO_PARSER_TOKEN` ausentes de
propósito), nenhum `.dem` real foi ingerido e a FASE 2.8 não foi iniciada.
Próximo passo recomendado: FASE 2.7.2 — provisionamento do parser worker.

Gates desta rodada: 539/539 testes, typecheck (tsgo) OK, lint OK, build OK,
linter de segurança do banco sem novos achados.

## 10. FASE 2.7.1 — rodada 4: métricas quality-aware e identidade do parser

### 10.1. Uma única definição de classe de evidência

`src/lib/pipeline/evidence.ts` passa a ser a ÚNICA fonte da classificação de
eventos canônicos em classes de evidência (`UTILITY_EVENT_TYPES` inclui `flash`,
`smoke`, `molotov`, `incendiary`, `he`). O normalizer (flag `missing_utility`) e
`metricsAvailability()` importam desse módulo, portanto não podem mais divergir:
antes, uma partida só com smokes era "sem utility" para uma camada e "com
utility" para a outra.

Semântica: a classe descreve **o dataset**, nunca a atividade do jogador.

| classe             | ausente                                                                        | presente + zero observado                         |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| `killEvents`       | k/d, KAST, opening, clutch, multi-kill, survival = `NULL`                      | `0` (ou `1` em complementos como `survival_rate`) |
| `damageEvents`     | ADR, dano sofrido, eficiência = `NULL`                                         | `0`                                               |
| `utilityEvents`    | utility damage/flash/granadas = `NULL`                                         | `0`                                               |
| `timing`           | trades, early deaths, KAST = `NULL`                                            | `0`                                               |
| `roundEndEvidence` | `survival_rate` = `NULL`                                                       | valor real                                        |
| `economy`          | `buy_discipline`, `damage_per_dollar` = `NULL`; `economy_data_available` = `0` | `economy_data_available` = `1`                    |

Denominador ausente continua `NULL` (ex.: `hs_rate` sem nenhuma kill,
`clutch_win_rate` sem tentativas, `damage_efficiency` sem dano sofrido) — nunca `0`.

### 10.2. Gates em `extractFeatures()`

Todo sinal derivado passa por `gate(<classes de evidência>, valor)`. Somente
fatos do dataset ficam fora do gate: `sample_rounds` e `early_window_seconds`.

### 10.3. Identidade do parser é configuração

`expectedParserIdentity()` lê, dentro da função (nunca no escopo do módulo):
`DEMO_PARSER_EXPECTED_NAME`, `DEMO_PARSER_EXPECTED_VERSION` e
`DEMO_PARSER_EXPECTED_REVISION`. Sem variáveis, valem os valores fixados em
`src/config/pipeline.ts`. Quando a revisão esperada está definida, um worker com
outra revisão é rejeitado (`PARSER_ERROR`). Compatibilidade de major/minor **não**
prova compatibilidade com uma build do CS2: isso só será estabelecido pela matriz
de compatibilidade da FASE 2.7.2.

### 10.4. Provas desta rodada

`src/lib/pipeline/__tests__/quality271.test.ts` — 28 testes com assertions
concretas: matriz NULL vs ZERO por classe de evidência; consistência entre flag
`missing_utility` e `availability.utilityEvents`; tickrate (1280@64 = 20 s,
1280@128 = 10 s, `time_seconds` com precedência, tickrate ausente/0/negativo →
`NULL`, sem `NaN`/`Infinity`); clutch 1v1/1v2/1v3, participante ausente do round
(0 tentativas) e clutch `NULL` sem kill events; contrato do parser (payload
válido, contract version, nome, major/minor, identidade ausente, arrays ausentes,
taxonomia de erros do worker).

Gates: 567/567 testes, typecheck (tsgo) OK, lint OK (apenas 8 warnings
pré-existentes de Fast Refresh), build OK.

### 10.5. Estado

**FASE 2.7 permanece IN PROGRESS.** Parser real não provisionado, nenhum `.dem`
real ingerido, FASE 2.8 não iniciada. Pré-requisitos da FASE 2.7.2: worker de
parser HTTPS com `DEMO_PARSER_URL`/`DEMO_PARSER_TOKEN`, identidade/revisão
esperada configuradas, matriz de compatibilidade por build do CS2 e prova E2E com
`.dem` real.

## FASE 2.7.1C — rodada 5: rating gates, abertura determinável, projeção atômica e deadline global

STATUS DA FASE 2.7: **IN PROGRESS — NOT CLOSED** (parser real continua bloqueado por infraestrutura;
`DEMO_PARSER_URL`/`DEMO_PARSER_TOKEN` não existem).

### 1. Rating — gates de evidência (PASS, provado por teste unitário)

Fórmula e pesos do `compositeRating()` INALTERADOS. O que mudou é quando ele pode ser publicado:

| valor                      | evidência exigida                                                     | NULL quando                  |
| -------------------------- | --------------------------------------------------------------------- | ---------------------------- |
| `sourceRating`             | kill events + damage events + cobertura completa + `roundsPlayed > 0` | falta qualquer uma           |
| `ctRating` / `tRating`     | as mesmas + existir round do lado                                     | falta qualquer uma           |
| `consistency.side_balance` | ambos os side ratings                                                 | qualquer lado NULL (herdado) |
| `kast`                     | kill events + timing + cobertura completa + rounds                    | falta qualquer uma           |

Antes, apenas `damageEvents` era exigido: kills/deaths ausentes entravam na fórmula como zero implícito
e produziam um número fabricado. Casos A–D cobertos em `src/lib/pipeline/__tests__/quality271c.test.ts`.

### 2. Abertura (opening) — determinabilidade temporal (PASS)

- `collectKills()` não ordena mais por `time ?? Infinity`: **instante desconhecido não é instante tardio**.
  A ordenação é apenas por round; toda derivação temporal compara instantes explicitamente.
- `openingDuels()` devolve `openings`, `determinableRounds` e `ambiguousRounds`. Um round só contribui
  quando TODOS os seus kills têm instante conhecido e o menor instante é único (empate = ambíguo).
- Um round ambíguo não invalida os determináveis.
- `firstKills`, `firstDeaths`, `openingAttempts`, `openingSuccess` e `sampleOpeningDuels` agora são
  `number | null`: sem round determinável a amostra é DESCONHECIDA, não zero.
  `match_features.sample_opening_duels` passou a aceitar NULL.

### 3. Cobertura parcial (PASS)

`MetricsAvailability.completeCoverage = quality.partialParse !== true`. Parse parcial nunca implica
cobertura completa: taxas de partida inteira (rating, KAST) viram NULL; contadores brutos observados
(kills, deaths, assists, dano, utilidade, clutch, multi-kills) continuam observáveis, pois são contagens
do que foi visto, não taxas sobre o conjunto completo. Nenhum percentual de completude foi inventado.

### 4. Projeção transacional (IMPLEMENTED / NOT RUNTIME-PROVEN)

`persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb)` — `SECURITY DEFINER`,
`search_path=''`, `EXECUTE` apenas para `service_role` (verificado: anon/authenticated = false).
Em UMA transação: `FOR UPDATE` na partida, guarda de propriedade (colunas match-wide atualizam para
qualquer observador; colunas player-scoped somente sem dono ou com o mesmo dono), upsert de
`match_metrics` por `(match_id, player_id)`, DELETE + INSERT de `match_features`. Antes eram quatro
statements independentes: uma falha entre o DELETE e o INSERT deixava o jogador sem features.
Não cria partida, não escreve tabelas canônicas além das colunas de projeção.

NOT RUNTIME-PROVEN: o rollback real não foi executado contra o banco porque não existe nenhuma partida
canônica persistida (matches = 0) e a política do projeto proíbe semear dados. A prova exige o parser real.

### 5. Deadline global (PASS por inspeção)

O orçamento absoluto (`JOB_STALE_MINUTES`) passa a ser calculado na ENTRADA de `processJob()` e é
verificado antes de `demoExists`, antes e depois do hash em streaming, antes da signed URL, antes do
parser, na normalização, antes da persistência canônica e antes da projeção. Nem o SDK de Storage nem
o contrato do parser expõem `AbortSignal`: chamadas já iniciadas não são canceladas no meio — isso está
documentado no código, não simulado.

### 6. Não-regressão

Códigos de erro, janelas de trade/flash assist, KAST, modelo canônico, resolver, RLS, FACEIT, Gamers Club,
Steam e Identity Graph inalterados. Nenhum arquivo de UI tocado. Parser real não provisionado. 2.8 não iniciada.

Baseline: 576 testes, tsgo e build OK.

## FASE 2.7.1D — rodada 6: cobertura de survival, semântica de taxas em parse parcial e versão do parser

### 1. `survival_rate` — denominador por round (IMPLEMENTED)

Antes, `survival_rate` era liberado por `availability.roundEndEvidence`, que significa apenas
"ALGUM round terminou". 19 de 20 rounds encerrados publicavam uma taxa cujo 20º round tinha
desfecho desconhecido. Agora `metrics.ts` expõe `roundHasEndEvidence(round)` — definição única
(`end_tick`, `duration_seconds`, `winner_side` ou `winner_team`), reutilizada por
`playerSurvivedRound()` — e um novo denominador `CanonicalMetrics.survivalRounds`:

- número de rounds em que o jogador participou, SOMENTE se TODOS eles têm round-end evidence
  E `availability.completeCoverage` é verdadeiro;
- `NULL` em qualquer outro caso. Nunca parcial, nunca `0` por ausência.

`features.ts` calcula `survival_rate = complement(deaths / survivalRounds)`, então cobertura
incompleta produz `NULL`. Um round sem desfecho não é contado como sobrevivência nem como morte.

### 2. Parse parcial — contadores vs taxas de partida (IMPLEMENTED)

Toda taxa cujo denominador é o CONJUNTO DE ROUNDS descreve a partida inteira. Em parse parcial o
conjunto observado não é a partida, então tais sinais ficam `NULL` (`kills_per_round`,
`damage_per_round`, `damage_taken_per_round`, `assists_per_round`, `*_per_round` de utilidade,
`first_death_rate`, `opening_participation`, `trade_participation`, `early_death_free_rate`,
`clutch_frequency`, `multi_kill_rate`, `survival_rate`, KAST).

Permanecem numéricos: contadores diretamente observados (kills, deaths, assists, headshots, dano)
e razões cujo denominador é ele mesmo uma contagem observada (`hs_rate`, `trade_kill_share`,
`kd_balance`, `clutch_win_rate`, `opening_discipline`, `flash_assist_share`). Descartá-los seria
desonesto na direção oposta.

### 3. Versão do parser — histórico da 2.7.1D (SUPERSEDED PELO GATE 1D)

Na 2.7.1D, `0.31.4` era um placeholder não confirmado. O Gate 1D posterior o
substituiu pela versão real selecionada `0.42.0` e marcou
`PARSER_VERSION_CONFIRMED = true`. `PARSER_CONTRACT_VERSION` continua sendo um
conceito SEPARADO (formato de saída) e permanece em `1`.

### 4. Testes

`src/lib/pipeline/__tests__/quality271d.test.ts` — fixtures sintéticas (sem `.dem`, sem worker, sem
rede, sem banco): survival com cobertura total, cobertura parcial de um round, nenhuma cobertura,
parse parcial, round sem desfecho que não vira morte nem sobrevivência, contadores preservados,
taxas de partida nulas, cobertura completa inalterada, `NULL ≠ ZERO` e o flag de versão do parser.

### 5. Não-regressão

Canonical Match Engine, resolver, persistência canônica, projeção transacional, FACEIT, Gamers Club,
Steam, Identity Graph, RLS e códigos de erro inalterados. Nenhum arquivo de UI tocado. Parser real
não provisionado, E2E com `.dem` real NÃO provado, FASE 2.7 permanece IN PROGRESS, 2.8 não iniciada.

Baseline desta rodada: 587/587 testes, tsgo e lint OK.

## FASE 2.7.1E — UMA definição de round-end evidence + determinabilidade de sobrevivência

### 1. `src/lib/pipeline/roundEvidence.ts` (NOVO) — a única definição

Quatro camadas faziam a mesma pergunta ("este round terminou?") com subconjuntos de campos
diferentes, então a mesma observação podia ser válida em uma camada e desconhecida em outra.
A regra agora vive em um único helper `hasRoundEndEvidence()`, que aceita `winnerSide`,
`winnerTeam`, `endTick` ou `durationSeconds` e testa presença com `!= null` — `0` continua sendo
evidência válida, nunca ausência.

Consumidores unificados:

- `normalizer.assessQuality()` → `roundsValid` (antes só `winnerSide`/`endTick`);
- `metrics.metricsAvailability().roundEndEvidence` (antes sem `durationSeconds`);
- `playerSurvivedRound()` e o denominador de sobrevivência, via re-export
  `roundHasEndEvidence()` que apenas delega — não existe segunda implementação.

### 2. Denominador de sobrevivência = rounds DETERMINÁVEIS

"O round terminou" não é "sabemos se ESTE jogador sobreviveu a ele". `survivalRounds` passa a
contar apenas os rounds participados cujo `playerSurvivedRound()` devolve decisão (`true` =
sobrevivência provada, `false` = morte provada). Round indeterminável é excluído, então a ausência
de death event nunca é convertida em sobrevivência. Sem round determinável ou sob cobertura
incompleta o denominador é `NULL` (desconhecido), nunca `0`, e `survival_rate` fica `NULL`.

### 3. Catálogo sincronizado

`features.catalog.ts` documentava fórmulas antigas (`survival_rate = 1 - deaths / rounds_played`).
Cada entrada agora declara `denominator` e `roundDenominated`, e toda entrada round-denominated
documenta a regra de `NULL` sob `partial_parse`. `survival_rate` é documentada contra
`survivalRounds`.

### 4. Testes

`src/lib/pipeline/__tests__/quality271e.test.ts` — 21 testes sintéticos (sem `.dem`, sem worker,
sem rede, sem banco): helper central por campo isolado e com zeros, delegação do re-export,
`roundsValid` com round só de duração e só de `winnerTeam`, availability com/sem evidência,
sobrevivência determinável, round indeterminável excluído, morte explícita mantida, parse parcial,
`NULL ≠ ZERO`, cobertura do catálogo, e a verificação de que EXATAMENTE as features
round-denominated ficam `NULL` sob parse parcial.

### 5. Não-regressão

Nenhuma mudança em banco, schema, migrations, RLS, auth, FACEIT, Gamers Club, Steam, Identity
Graph, resolver, persistência canônica, projeção, contrato do parser ou UI. Parser real não
provisionado, E2E com `.dem` real NÃO provado, FASE 2.7 permanece IN PROGRESS, 2.7.2 e 2.8 não
iniciadas.

Baseline desta rodada: 608/608 testes, tsgo OK, lint com 8 warnings preexistentes.

## FASE 2.7.1F — FINAL SEMANTIC CONTRACT CLEANUP (CLOSED)

Microfase de contrato semântico. Nenhuma alteração em banco/schema/RLS/grants/
auth/security-definer, persistência canônica, resolver, FACEIT, Gamers Club,
Steam, Identity Graph, upload/storage, Pro Score, DNA, Diagnóstico, AI Coach,
Training, UI ou dependências.

### O que foi alinhado

1. **`survivalRounds` documentado pelo que realmente é** (`src/lib/pipeline/types.ts`):
   denominador de _determinabilidade_ — rounds participados com evidência de fim
   **e** decisão não nula de `playerSurvivedRound()` (`true` = sobrevivência
   provada, `false` = morte provada). Round terminado não implica sobrevivência
   determinável. `NULL` = desconhecido, `0` = zero observado.
2. **`roundDenominated` esclarecido** (`features.catalog.ts`): significa
   denominador **derivado do conjunto de rounds** — inclui `rounds_played` **e**
   denominadores derivados como `survivalRounds`. Toda feature round-denominada
   é `NULL` em `partial_parse`.
3. **Fórmulas do catálogo sincronizadas com `features.ts`**, incluindo o clamp
   `[0,1]` realmente aplicado: `min(1, …)` em todas as razões/taxas,
   `survival_rate = 1 - min(1, deaths / survivalRounds)`,
   `damage_per_round = min(1, adr / 100)` com `adr = damage_given / rounds_played`,
   `kast = min(1, kast_percent / 100)`, `rating = min(1, source_rating / 1.6)`
   com a fórmula composta explícita, `side_balance` com clamp explícito.
4. **Identidade do parser separada por conceito** (`src/config/pipeline.ts`):
   `PARSER_NAME` / `PARSER_VERSION` (placeholder, `PARSER_VERSION_CONFIRMED =
false`) / revisão de build / `PARSER_CONTRACT_VERSION` nunca se confundem, e
   nada aqui descreve um worker provisionado.
5. **Testes numéricos de contrato** (`quality271f.test.ts`, 23 testes sintéticos):
   valores reais de `survival_rate`, `kills_per_round`, `damage_per_round`,
   `damage_taken_per_round`, `first_death_rate` + complemento,
   `trade_participation`, `clutch_frequency`, `multi_kill_rate`, `rating`;
   determinabilidade de sobrevivência; `partial_parse ⇒ NULL ≠ 0`; regra única de
   round-end evidence em helper/normalizer/availability; clamp documentado em
   todas as razões; placeholder do parser não confirmado.

### Verificação

- Vitest: **631/631 PASS** (40 arquivos)
- `tsgo --noEmit`: **PASS**
- ESLint: **0 erros**, 8 warnings preexistentes (`react-refresh/only-export-components`)
- Build: **PASS**

### NOT PROVEN / NÃO INICIADO

- Leitura real de `.dem`: **NOT PROVEN** — nenhum worker; `DEMO_PARSER_URL` /
  `DEMO_PARSER_TOKEN` inexistentes.
- E2E real de ingestão: **BLOCKED** pela ausência do parser.
- FASE 2.7.2 (parser real / worker) e FASE 2.8: **NÃO INICIADAS**.

---

## FASE 2.7.2 — GATE 0 CONCLUÍDO / GATES 1+ BLOQUEADOS

### GATE 0 — FINAL CLOSURE AUDIT DA 2.7.1F

Auditoria dos 8 commits entre `91ca826` e `357771d`
(`be9d50d` catálogo, `dba96c5` types+config, `7a79d51`/`17a6ede`/`3ff376b`
`quality271f.test.ts`, `50c0176` catálogo, `ffc2c27` docs/roadmap, `357771d`
docs/build):

- 8 commits auditados: **PASS** — todos restritos a `features.catalog.ts`,
  `types.ts`, `config/pipeline.ts`, testes e documentação. Nenhum toque em
  migrations, RLS, grants, auth, persistência canônica, resolver, FACEIT,
  Steam, Identity Graph, Gamers Club, storage ou UI. Sem regressão, sem
  duplicação de comportamento, sem mudança silenciosa de contrato.
- Catálogo × implementação: **PASS** para as features cobertas por teste
  numérico; **NOT PROVEN** para as demais (documentação coerente, sem prova
  numérica dedicada): `opening_success`, `opening_participation`,
  `untraded_death_rate`, `traded_death_rate`, `early_death_rate`,
  `utility_damage_per_round`, `flash_assists_per_round`,
  `enemies_flashed_per_round`, `grenades_per_round`, `kast`,
  `damage_efficiency`.
- Round-end evidence: **PASS** — definição única em
  `src/lib/pipeline/roundEvidence.ts` (`winnerSide`/`winnerTeam`/`endTick`/
  `durationSeconds` com `!= null`; `0` é evidência válida), consumida por
  `normalizer.assessQuality()`, `metricsAvailability.roundEndEvidence` e
  `roundHasEndEvidence()` (re-export delegante). Nenhuma segunda implementação.
- Survival: **PASS** — `survivalRounds ≠ roundsPlayed`; só entram rounds
  participados com fim comprovado e decisão determinística de
  `playerSurvivedRound()`; cobertura incompleta ⇒ `NULL`.
- NULL ≠ ZERO: **PASS** — os `?? 0` remanescentes somam campos de dano de
  eventos observados; `matchRounds ?? 0` alimenta apenas um denominador que
  `ratio()` converte em `NULL` quando não positivo.
- Partial parse: **PASS** — features round-denominated e `survival_rate`/`kast`/
  `rating` ficam `NULL`; contadores observados permanecem numéricos.
- Parser identity: **PASS** — nome / versão / revisão / versão de contrato /
  schema / analysis separados; `0.31.4` continua `PARSER_VERSION_CONFIRMED =
false`.

**GATE 0 RESULT: PASS** (sem BLOCKER, sem FAIL; dívida remanescente apenas de
cobertura de prova, registrada como NOT PROVEN).

### GATES 1–N — BLOQUEADOS (infraestrutura ausente)

O provisionamento do parser real está **BLOCKED**, não recusado por escopo:

1. `demoparser2` é uma extensão nativa (Rust/PyO3). O runtime de execução deste
   app é um Worker serverless sem binários nativos, sem `child_process` e sem
   CPU longa — o parser não pode rodar dentro da aplicação por construção.
2. A arquitetura correta (worker HTTP externo) exige um host de execução fora
   desta plataforma, endereçável por `DEMO_PARSER_URL`, com segredo
   `DEMO_PARSER_TOKEN`. Nenhum host desse tipo existe e não é possível
   provisioná-lo daqui.
3. Sem worker real não há release/revision verificável para pinar
   (GATE 1.A), portanto a matriz de compatibilidade CS2 (GATE 1.B) não pode ser
   preenchida com dados reais — escrevê-la agora seria inventar evidência.
4. Sem parser não existe `.dem` processado, logo o E2E completo
   (upload → storage → job → worker → parser → adapter → normalizer →
   canonical → metrics → features → persistence), a idempotência real e a
   não-regressão real permanecem **NOT PROVEN**.

O adaptador continua falhando honestamente com `PARSER_UNAVAILABLE`.

**Desbloqueio necessário (fornecido pelo responsável do projeto):** um endpoint
HTTPS de worker executando o parser pinado, mais o token de acesso. Com esses
dois valores, os GATES 1–N podem ser executados sem mudança arquitetural.

### Verificação desta rodada

- Vitest: **631/631 PASS** (40 arquivos)
- Nenhuma alteração de código nesta rodada (apenas auditoria + documentação).

---

## FASE 2.7.2 — GATE 1D: LARGE UPLOAD + REAL PARSER CONFIGURATION

- **TUS large upload: IMPLEMENTED / UNIT TESTED.** O browser envia diretamente
  ao bucket privado `demos` pelo endpoint resumable do Storage, em chunks de 6
  MiB, com retomada por fingerprint vinculado ao path
  `{user_id}/{upload_id}.dem`. A sessão autenticada é renovada antes das
  requisições; nenhuma credencial privilegiada é usada no browser.
- SHA-256 pré-upload, idempotência, verificação SHA-256 server-side,
  `createDemoUpload()`, `enqueueDemoJob()`, polling e retenção foram preservados.
  O enqueue só ocorre depois de `onSuccess`; erro/cancelamento não enfileiram.
- **REAL PARSER WORKER PROVISIONED (informado):** transporte existente aponta por
  `DEMO_PARSER_URL` para o endpoint HTTPS do Railway. Identidade esperada:
  `demoparser2`, versão `0.42.0`, contrato `1`. Revision continua server-side e
  configurável; como `/version` não respondeu no domínio informado, seu valor
  efetivo não foi assumido.
- `DEMO_PARSER_URL`, `DEMO_PARSER_TOKEN`, `DEMO_PARSER_EXPECTED_NAME` e
  `DEMO_PARSER_EXPECTED_VERSION` foram cadastradas no ambiente. Somente
  `DEMO_PARSER_EXPECTED_REVISION` permanece **CONFIGURATION REQUIRED**.
- **Real E2E: NOT YET PROVEN. Real `.dem` parsing: NOT YET PROVEN.** Nenhuma demo
  real foi enviada ou processada neste Gate.
- **Gate 1D: BLOCKED para PASS total.** O código e os testes locais estão
  concluídos, porém a revision efetiva e a conectividade do domínio informado
  não puderam ser confirmadas sem executar o E2E reservado ao próximo Gate.

## FASE 2.7.2 — GATE 1E — APP ↔ WORKER CONTRACT ALIGNMENT

Escopo: apenas transporte e contrato entre o app e o worker de parsing. Nada de
engine canônico, Identity Graph, FACEIT, Gamers Club, Steam, resolver, schema,
métricas, catálogo, evidência, RLS, denominadores ou semântica `NULL ≠ ZERO`.

### Endpoint único e validado

`src/lib/pipeline/parser/parserEndpoint.ts` é a ÚNICA fonte de verdade:

- `DEMO_PARSER_URL` deve ser o endpoint COMPLETO `https://<host>/v1/parse`.
- HTTPS obrigatório; `http://` e URLs malformadas são rejeitadas.
- Nenhuma concatenação de caminho: uma URL sem `/v1/parse` falha em
  `PARSER_CONFIG_ERROR` (permanente) em vez de "consertar" a configuração.
- `/health` e `/version` são derivados da MESMA origem, apenas para diagnóstico.

### Contrato de requisição (`POST /v1/parse`)

```json
{
  "contract_version": 1,
  "upload_id": "<uuid>",
  "demo_url": "<signed url>",
  "demo_sha256": "<64 hex>",
  "file_size": 123
}
```

Token via header `Authorization: Bearer <DEMO_PARSER_TOKEN>` — server-side,
nunca na URL, nunca no corpo, nunca em log.

### Envelope de erro do worker (FastAPI)

```json
{ "detail": { "error_code": "...", "message": "..." } }
```

O formato plano `{ "error_code": ... }` continua aceito por compatibilidade.

### Matriz de classificação (uma única matriz)

| Origem                                                        | Código do pipeline          | Permanente |
| ------------------------------------------------------------- | --------------------------- | ---------- |
| 401                                                           | `PARSER_UNAUTHORIZED`       | sim        |
| 403                                                           | `PARSER_FORBIDDEN`          | sim        |
| 409 / `CONTRACT_MISMATCH`                                     | `PARSER_CONTRACT_MISMATCH`  | sim        |
| 413                                                           | `DEMO_TOO_LARGE`            | sim        |
| 408 / 504 / abort                                             | `PARSER_TIMEOUT`            | não        |
| 502 / 503 / falha de rede                                     | `PARSER_UNAVAILABLE`        | não        |
| `INVALID_DEMO_FORMAT` / `CORRUPTED_DEMO` / `UNSUPPORTED_DEMO` | idem                        | sim        |
| `HASH_MISMATCH`                                               | `PARSER_HASH_MISMATCH`      | sim        |
| `FILE_SIZE_MISMATCH`                                          | `PARSER_FILE_SIZE_MISMATCH` | sim        |
| `DOWNLOAD_ERROR`                                              | `PARSER_DOWNLOAD_ERROR`     | não        |
| corpo não-JSON / estrutura inválida                           | `PARSER_INVALID_RESPONSE`   | sim        |
| 5xx genérico                                                  | `PARSER_ERROR`              | não        |

Falha de transporte NUNCA é classificada como demo inválida.
`mapParserErrorCode()` delega a `classifyWorkerFailure()`: matriz única.

### Diagnóstico

`getAdminParserWorkerStatus` (master-only) consulta `/health` e `/version` e
compara identidade do parser e `contract_version`. Não faz parte do caminho de
parsing e não devolve token nem URL assinada.

### Status do gate

GATE 1E permanece **BLOCKED** na verificação externa: em
`https://cs2-demo-parser-production.up.railway.app/health` e `/version` o
Railway responde `HTTP 404 {"status":"error","code":404,"message":"Application
not found"}`. Logo o deployment/revision do worker NÃO pode ser provado, e o
E2E real com `.dem` continua não provado. Todo o lado app do contrato está
implementado e testado (42 testes em `src/lib/pipeline/__tests__/gate1e.test.ts`).

---

## FASE 2.7.2 — GATE 1E.1 — WORKER CONTRACT SYNC + REVISION LOCK

### Endpoint e diagnóstico

- APP: `DEMO_PARSER_URL` deve ser o endpoint canônico completo
  `https://cs2-demo-parser-production.up.railway.app/v1/parse` (HTTPS obrigatório,
  nunca a origem nua, nunca `/parse`). `/health` e `/version` são derivados da
  origem em `parserEndpoint.ts`; nada é concatenado no caminho de parse.
- `/health` e `/version` são diagnósticos (sem token, sem parse, sem Storage);
  `POST /v1/parse` é a única operação autenticada (`Authorization: Bearer`).

### Identidade e revision lock

`assertParserIdentity()` é a ÚNICA autoridade de identidade e vale igualmente
para a resposta de `/v1/parse` e para o probe de `/version`:

| divergência                              | erro                       | permanência |
| ---------------------------------------- | -------------------------- | ----------- |
| `parser.name` diferente                  | `PARSER_IDENTITY_MISMATCH` | permanente  |
| `parser.version` (major.minor) diferente | `PARSER_IDENTITY_MISMATCH` | permanente  |
| `parser.revision` diferente da esperada  | `PARSER_IDENTITY_MISMATCH` | permanente  |
| revision exigida e não reportada         | `PARSER_IDENTITY_MISMATCH` | permanente  |
| revision exigida e não configurada       | `PARSER_CONFIG_ERROR`      | permanente  |
| `contract_version` diferente de 1        | `PARSER_CONTRACT_MISMATCH` | permanente  |

Revision vazia é ABSENTE — nunca inventada. Em produção o lock é obrigatório por
padrão (`DEMO_PARSER_REVISION_REQUIRED` torna a decisão explícita). Identidade
esperada: `demoparser2` / `0.42.0` / revision de build / contract `1`.

### Matriz oficial APP ↔ WORKER

Os códigos do protocolo estão declarados em `WORKER_ERROR_CODES`
(`parserEndpoint.ts`) e classificados por `classifyWorkerFailure()`; nenhum
segundo switch existe (`mapParserErrorCode()` delega).

| HTTP    | worker `error_code`                                  | PipelineError               | retry      |
| ------- | ---------------------------------------------------- | --------------------------- | ---------- |
| 401     | `UNAUTHORIZED`                                       | `PARSER_UNAUTHORIZED`       | permanente |
| 403     | `FORBIDDEN`                                          | `PARSER_FORBIDDEN`          | permanente |
| 409     | `CONTRACT_MISMATCH` / `UNSUPPORTED_CONTRACT_VERSION` | `PARSER_CONTRACT_MISMATCH`  | permanente |
| 422     | `INVALID_DEMO_FORMAT`                                | `INVALID_DEMO_FORMAT`       | permanente |
| 422     | `CORRUPTED_DEMO`                                     | `CORRUPTED_DEMO`            | permanente |
| 422     | `UNSUPPORTED_DEMO`                                   | `UNSUPPORTED_DEMO`          | permanente |
| 422     | `HASH_MISMATCH`                                      | `PARSER_HASH_MISMATCH`      | permanente |
| 422     | `FILE_SIZE_MISMATCH`                                 | `PARSER_FILE_SIZE_MISMATCH` | permanente |
| 413     | `DEMO_TOO_LARGE`                                     | `DEMO_TOO_LARGE`            | permanente |
| 413     | `PAYLOAD_TOO_LARGE`                                  | `PARSER_PAYLOAD_TOO_LARGE`  | permanente |
| 502/503 | `DOWNLOAD_ERROR` / `DOWNLOAD_FAILED`                 | `PARSER_DOWNLOAD_ERROR`     | transiente |
| 504     | `TIMEOUT` / `PARSE_TIMEOUT` / `DOWNLOAD_TIMEOUT`     | `PARSER_TIMEOUT`            | transiente |
| 500     | `PARSER_ERROR`                                       | `PARSER_ERROR`              | transiente |

Falha de rede/TLS/DNS → `PARSER_UNAVAILABLE`; abort/deadline → `PARSER_TIMEOUT`.
Nenhuma falha de transporte, integridade ou configuração vira "demo inválida".

### Envelope oficial

```json
{ "detail": { "error_code": "CODE", "message": "internal-safe-message" } }
```

`/version`:

```json
{
  "parser": { "name": "demoparser2", "version": "0.42.0", "revision": "..." },
  "contract_version": 1
}
```

### Worker — `services/cs2-demo-parser`

O worker agora EXISTE no repositório (FastAPI + uvicorn, Docker, root Railway
`services/cs2-demo-parser`) e fala exatamente o contrato acima:

- `errors.py` é a única taxonomia do worker, espelhada por `WORKER_ERROR_CODES`;
- contract divergente → 409 `CONTRACT_MISMATCH`; versão desconhecida → 409
  `UNSUPPORTED_CONTRACT_VERSION`. Nunca `PARSER_ERROR`;
- hash divergente → 422 `HASH_MISMATCH` (`Demo integrity check failed.`);
- tamanho divergente → 422 `FILE_SIZE_MISMATCH`;
- download (4xx/5xx/DNS/reset/timeout) → `DOWNLOAD_ERROR` / `DOWNLOAD_FAILED` /
  `DOWNLOAD_TIMEOUT`. Nunca `INVALID_DEMO_FORMAT`;
- só evidência positiva sobre o arquivo gera `INVALID_DEMO_FORMAT`,
  `CORRUPTED_DEMO` ou `UNSUPPORTED_DEMO` (`parser.py::classify_parser_exception`);
  qualquer outra exceção é 500 `PARSER_ERROR`;
- `/health` simples e sem dependências; `/version` determinístico com a MESMA
  revision usada pelo processo;
- download HTTPS-only, redirects desabilitados, streaming, SHA-256 incremental,
  teto de bytes, timeouts, cleanup garantido;
- respostas externas sem stack trace, path, signed URL, token ou SHA completo.

**Revision lock:** o fallback `pypi-0.42.0` foi eliminado. Em produção
(`ENVIRONMENT=production`, default da imagem) `PARSER_REVISION` é obrigatória e
imutável (`git:<full-commit-sha>`); ausente/inválida ⇒ o processo falha closed no
startup. Fora de produção resolve para o marcador explícito `dev:unpinned`, que
nunca é aceito como build id.

Testes do worker: `services/cs2-demo-parser/tests/` (pytest) — auth, contract,
hash, file size, download, parser error, timeout, `/health`, `/version`, revision
(produção fail-closed + dev) e no-leak. `demoparser2` não é necessário para rodar
a suíte: a fronteira de parsing é injetada.

### Status — GATE 1E.1: BLOCKED

Lado APP concluído e provado (`gate1e.test.ts`, `gate1e1.test.ts`); worker
implementado e provado por pytest. O gate NÃO é PASS porque:

1. `GET /health` e `GET /version` do serviço Railway responderam **HTTP 404
   `Application not found`** — o deployment não está no ar;
2. sem `/version` real não há revision para pinar em
   `DEMO_PARSER_EXPECTED_REVISION` (variável ainda ausente no ambiente);
3. a correspondência entre deployment real e revision esperada permanece
   NOT VERIFIED.

Ação manual necessária (após o commit definitivo): configurar no Railway
`PARSER_TOKEN`, `PARSER_CONTRACT_VERSION=1` e `PARSER_REVISION=git:<SHA do
commit implantado>`, redeployar, e então pinar no APP
`DEMO_PARSER_EXPECTED_REVISION` com o MESMO valor e
`DEMO_PARSER_REVISION_REQUIRED=true`.

Nenhum `.dem` real foi processado. GATE 02 não foi iniciado.

---

## FASE 2.7.2F.1–F FINAL — Fundação de identidade e E2E

### Identificadores e resolução

- `participantKey` é a identidade canônica source-local do participante no match/demo.
- `steamId` é evidência externa opcional. Pode coincidir com `participantKey` no parser v1, mas não define seu significado.
- `internalPlayerId` identifica o perfil interno somente após attachment comprovado.
- `resolveAnalyticalParticipant()` é o resolvedor único: falha com `PLAYER_IDENTITY_UNRESOLVED` se a chave não existir e retorna separadamente `participantKey`, chave de correlação de eventos e Steam opcional.
- Um participante sem Steam continua válido quando o source fornece `participant_key`; nickname isolado nunca produz uma chave.
- Método, source, confidence e confirmation são dimensões independentes. Decisões e eventos preservam provenance; o histórico agregado de nickname não substitui o log de decisão.

### Matriz semântica player-scoped

| DATA CLASS | RAW SOURCE                                                                | HOT SOURCE                    | CANONICAL / PROJECTION                     | PLAYER SCOPED                       | AVAILABILITY                         | NULL RULE                                                                     | QUALITY                                                   |
| ---------- | ------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| AIM        | `tick_samples` íntegros em JSONL gzip                                     | `aim_observations` limitado   | metadata sem virar evento                  | `player` = chave resolvida          | `complete`, `limited`, `unavailable` | ausência não vira observação zero                                             | HOT declara rows incluídas, observadas, limite e overflow |
| POSITION   | `tick_samples` íntegros                                                   | `position_snapshots` limitado | metadata sem virar evento                  | filtro exclusivo da chave resolvida | `complete`, `limited`, `unavailable` | coordenada ausente permanece ausente                                          | qualidade vem da seção HOT                                |
| ECONOMY    | rounds/ticks/economia íntegros                                            | `economy_snapshots` limitado  | metadata e economia canônica por round     | filtro exclusivo da chave resolvida | `complete`, `limited`, `unavailable` | saldo/equipamento ausente não vira zero                                       | qualidade vem da seção HOT                                |
| UTILITY    | eventos e trajetórias integrais; trajectory points não são grenade events | eventos compactos HOT         | eventos canônicos + contagem player-scoped | ator deve ser a chave resolvida     | `available`, `unavailable`           | sem cobertura = NULL; cobertura com zero eventos do jogador = zero observável | `missing_utility` distingue ausência de cobertura         |

O RAW continua integral, privado e separado do callback `/complete`. O HOT continua alvo 4 MiB e hard limit 8 MiB. JSON não-finito é convertido para `null` antes de `allow_nan=False`. Chunks mantêm SHA-256 físico, `previousChunkSha256`, digest por seção, root digest e manifest determinísticos; timestamps ficam fora do conteúdo determinístico.

### Métricas e NULL

A cadeia é `participantKey → participante → eventPlayerKey → eventos/rounds`. KAST usa somente rounds com participação comprovada; survival distingue vivo, morto e indeterminável. Opening, trade, damage, utility e clutch são filtrados pelo participante resolvido. Falta de cobertura produz `NULL`/`unavailable`, nunca zero artificial.

### Retry, attempts e espera E2E

- `attempt_number` é a tentativa lógica e não muda em retry técnico.
- `retry_count`/dispatch attempt identifica reenfileiramentos da tentativa.
- Todo retry passa por `retry_demo_job`; não há update direto de status nem chamada administrativa a `processJob()`.
- O runner aguarda finitamente o dispatch solicitado, exige observar seu contador, aceita somente terminal `processed`/`failed` e classifica pending/processing expirado como `BLOCKED`.
- Idempotência requer Run 1 processada, Run 2 reenfileirada pela RPC, Run 2 terminal e comparação posterior. Duas leituras não constituem duas execuções.

### Cache gate e limitações atuais

O job Cache reservado não foi reenfileirado. O preflight real encontrou `/health` saudável, mas `/version` retornou `not_found`; portanto contrato `1` e revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b` não foram comprovados. Cache Run 1, Run 2, idempotência e performance permanecem bloqueados/não executados. Nenhuma conclusão de Player DNA, CS2 PRO Score ou AI Coach pertence a esta fase.
