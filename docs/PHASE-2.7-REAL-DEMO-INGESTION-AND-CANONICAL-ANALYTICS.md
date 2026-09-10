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

| feature | antes | agora | direção |
|---|---|---|---|
| `early_death_rate` | `1 - earlyDeaths/deaths` (era avoidance) | `earlyDeaths/deaths` | ↓ |
| `early_death_avoidance` | inexistente aqui | `1 - earlyDeaths/deaths` | ↑ |
| `untraded_death_rate` | `1 - untraded/deaths` | `untraded/deaths` | ↓ |
| `damage_taken_per_round` | `1 - dano/round/120` | `dano/round/120` | ↓ |
| `decision_making.early_death_avoidance` | mesmo nome, outro denominador | renomeado `early_death_free_rate` (`1 - earlyDeaths/rounds`) | ↑ |

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

| Gate | Status | Nota |
|---|---|---|
| 01 upload real | PARTIAL | upload/registro funcionam; sem parser não há ciclo completo |
| 02 parser real | **BLOCKED** | worker externo não provisionado |
| 03 determinismo | BLOCKED | depende de 02 |
| 04 arquivo inválido | PASS | validação de extensão/tamanho/vazio, códigos precisos |
| 05 limite de recurso | PARTIAL | tamanho e timeout de transporte sim; CPU/memória no worker |
| 06/07 identidade real | PASS | só SteamID explícito; nada derivado de nickname |
| 08 identity graph | PARTIAL | caminho preservado; prova real depende de 02 |
| 09 adapter canônico | PASS | demo passa por `demoToCanonicalBundle` |
| 10 persistência canônica | PASS | escrita canônica só pela rotina transacional |
| 11 neutralidade de player | PASS | projeção nunca sobrescreve outro jogador |
| 12/13 idempotência/atomicidade | PASS (canônico) | provado na 2.6.11.5A; demo agora usa o mesmo caminho |
| 14/15/16 convergência | BLOCKED (demo real) | provas existentes usam fixture canônica |
| 17 parse parcial | PARTIAL | tratamento implementado; prova real depende de 02 |
| 18/19 métricas/features | PASS (fixture) | 500 testes; sobre demo real: BLOCKED |
| 20 semântica de features | PASS | catálogo + testes |
| 21 data quality | PASS | quality/coverage/confidence derivados de cobertura real |
| 22 linhagem | PASS | versões e ids gravados |
| 23/24 recuperação/concorrência | NOT_PROVEN | claim atômico e stale recovery existem; prova E2E depende de 02 |
| 25/26 RLS/storage | PASS (herdado, sem alteração) | suíte de segurança inalterada |
| 27 cleanup | PASS | provas anteriores mantidas |
| 28 fim da dupla persistência | **PASS** | ver §4.1 |
| 29/30 sem regressão | PASS | 500/500 testes, typecheck, lint, build |

## 7. Próximos passos

1. Provisionar o worker de parse e cadastrar `DEMO_PARSER_URL` e
   `DEMO_PARSER_TOKEN`; então executar GATE 01–03, 05, 08, 14–19, 22–24 com
   arquivo `.dem` real e fixtures A–G.
2. Configurar o agendamento externo de `/api/public/pipeline-cron`
   (pendência de infraestrutura, não de código).
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
   identidade do *arquivo*; o demo não tem `external_match_id`. A persistência
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

| item | estado | evidência |
| --- | --- | --- |
| attach demo com `external_match_id` NULL | **PASS (banco real)** | `fp_attach=t` |
| idempotência do mesmo fingerprint | **PASS (banco real)** | `idempotent=t` (1 linha em `match_sources`) |
| mesmo fingerprint apontado a outra partida | **PASS (banco real)** | `CANONICAL_ATTACH_CONFLICT` |
| ambos identificadores ausentes | **PASS (banco real)** | `CANONICAL_ATTACH_INVALID` |
| FACEIT por `external_match_id` | **PASS (banco real)** | `faceit=t` |
| EXACT/NO_MATCH/CONFLICT do resolver | PASS (unitário) | `hardening271.test.ts` A–F |
| isolamento de projeção | PASS (unitário) | G1–G3 |
| NULL vs ZERO / utility | PASS (unitário) | H1–H2, I1–I3 |
| tickrate 64 / 128 / timestamp / ausente | PASS (unitário) | J, K, L, L2 |
| clutch 1v1, 1v2 e participante fantasma | PASS (unitário) | M1, M2, N, N2 |
| amostra insuficiente | PASS (unitário) | O |
| ausência de segunda persistência | PASS (estrutural) | projeção não escreve fatos canônicos |
| atomicidade attach+persistência | **NOT PROVEN em runtime** | verificada estruturalmente (mesma transação); falha proposital não executada |
| concorrência real de attach | **NOT PROVEN** | concurrency real not proven in this environment |
| pipeline E2E com `.dem` real | **BLOCKED** | parser não provisionado |

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

| classe | ausente | presente + zero observado |
| --- | --- | --- |
| `killEvents` | k/d, KAST, opening, clutch, multi-kill, survival = `NULL` | `0` (ou `1` em complementos como `survival_rate`) |
| `damageEvents` | ADR, dano sofrido, eficiência = `NULL` | `0` |
| `utilityEvents` | utility damage/flash/granadas = `NULL` | `0` |
| `timing` | trades, early deaths, KAST = `NULL` | `0` |
| `roundEndEvidence` | `survival_rate` = `NULL` | valor real |
| `economy` | `buy_discipline`, `damage_per_dollar` = `NULL`; `economy_data_available` = `0` | `economy_data_available` = `1` |

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

| valor | evidência exigida | NULL quando |
| --- | --- | --- |
| `sourceRating` | kill events + damage events + cobertura completa + `roundsPlayed > 0` | falta qualquer uma |
| `ctRating` / `tRating` | as mesmas + existir round do lado | falta qualquer uma |
| `consistency.side_balance` | ambos os side ratings | qualquer lado NULL (herdado) |
| `kast` | kill events + timing + cobertura completa + rounds | falta qualquer uma |

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

### 3. Versão do parser — placeholder explícito (DOCUMENTED)

`PARSER_VERSION = "0.31.4"` nunca foi verificada contra um build público real. Continua sendo
apenas o valor ESPERADO na checagem de identidade do worker (sobrescrevível por
`DEMO_PARSER_EXPECTED_VERSION`) e agora vem acompanhada de `PARSER_VERSION_CONFIRMED = false`.
`PARSER_CONTRACT_VERSION` é um conceito SEPARADO (formato de saída) e permanece inalterado.
Escolher e fixar a versão real do parser é escopo da FASE 2.7.2.

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
