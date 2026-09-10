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
