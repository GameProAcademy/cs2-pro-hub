# Fase 2 — Ingestão e processamento de demos `.dem`

## Limitação honesta de runtime

A aplicação roda em runtime edge (Cloudflare Worker). `demoparser2` é uma
biblioteca nativa (Rust/Python) e **não pode executar nesse runtime**: não há
addons nativos, subprocessos nem orçamento de CPU longo.

Por isso o parsing real acontece em um **worker externo dedicado**, chamado por
HTTP a partir do servidor. Não existe parser simulado no código: se o worker não
estiver configurado, os jobs falham com `PARSER_UNAVAILABLE` e a interface diz
isso explicitamente. Nenhum dado é inventado.

Segredos necessários (servidor):

- `DEMO_PARSER_URL` — endpoint HTTPS do worker
- `DEMO_PARSER_TOKEN` — bearer verificado pelo worker

## Contrato do worker

`POST DEMO_PARSER_URL` com `Authorization: Bearer <DEMO_PARSER_TOKEN>` e corpo:

```json
{ "contract_version": 1, "upload_id": "uuid", "demo_url": "signed-url", "demo_sha256": "hex", "file_size": 123 }
```

Resposta: `RawParserOutput` (`src/lib/pipeline/types.ts`) com
`contract_version: 1`, `parser: { name, version }`, `players`, `rounds`,
`events`. Erros: HTTP != 2xx com `{ "error_code": "CORRUPTED_DEMO" | "INVALID_DEMO_FORMAT" | "UNSUPPORTED_DEMO" | "TIMEOUT" }`.

## Fluxo

```text
browser: hash SHA-256 -> createDemoUpload -> upload direto no bucket privado
       -> enqueueDemoJob -> polling de status
server: validate -> parser adapter -> normalizer -> validate canônico
       -> identidade (Steam ID explícito) -> métricas -> features
       -> persistência (service role) -> cleanup por retenção
```

Estados: `pending -> processing -> processed | failed`.

## Camadas

| Módulo | Responsabilidade |
| --- | --- |
| `src/config/pipeline.ts` | versões, limites, retenção, janelas, concorrência |
| `src/lib/pipeline/errors.ts` | taxonomia estruturada; permanente vs transitório |
| `src/lib/pipeline/types.ts` | contrato do parser + schema canônico |
| `src/lib/pipeline/parser/adapter.ts` | abstração `DemoParserAdapter` |
| `src/lib/pipeline/parser/remoteParser.server.ts` | transporte HTTP para o worker |
| `src/lib/pipeline/validator.ts` | validação de arquivo, canônica e identidade |
| `src/lib/pipeline/normalizer.ts` | parser -> canônico (puro) |
| `src/lib/pipeline/metrics.ts` | KAST, trades, opening, clutch, utility (puro) |
| `src/lib/pipeline/features.ts` | sinais das dez dimensões DNA (puro) |
| `src/lib/pipeline/persistence.server.ts` | escrita permanente (service role) |
| `src/lib/pipeline/jobs.server.ts` | ciclo de vida, retries, stale, cleanup |
| `src/lib/pipeline.functions.ts` | API do jogador |
| `src/lib/pipeline-admin.functions.ts` | observabilidade master |
| `src/routes/api/public/pipeline-cron.ts` | manutenção agendada (bearer secret) |

## Dados

Permanentes: `matches`, `match_metrics`, `match_rounds`, `round_events`,
`match_features`, `demo_jobs`, `uploads`.

Temporário: o arquivo `.dem` no bucket privado `demos`, em
`{user_id}/{upload_id}.dem`, removido após 24h (sucesso) ou 72h (falha).

Idempotência: `uploads.demo_sha256` por usuário e `matches.upload_id` único —
reprocessar substitui os derivados, nunca duplica.

## Métricas documentadas

- **KAST**: round conta quando houve kill, assist (incl. flash assist),
  sobrevivência, ou morte trocada dentro de `TRADE_WINDOW_SECONDS`.
- **Trade**: morte trocada quando um companheiro mata o autor da morte dentro da
  janela configurada.
- **Opening duel**: primeiro kill cronológico do round.
- **source_rating**: composto transparente do próprio match
  (`0.45*KPR/0.7 + 0.25*(1-DPR/0.75) + 0.30*ADR/80`). **Não é o CS2 PRO Score.**

## Qualidade e honestidade

Cada job registra `extraction_confidence`, `partial_parse`, `quality_flags`,
`rounds_detected/valid`. Sinais sem dados retornam `null` — nunca valores
inventados. As features **não** são diagnóstico: o Score e o diagnóstico
definitivos são de uma fase posterior.

## Segurança

- Upload com a sessão do próprio usuário; policies limitam a pasta `{uid}/` e a
  extensão `.dem`.
- Somente `service_role` escreve dados derivados; jogadores têm leitura própria.
- Identificação apenas por Steam ID explicitamente salvo no perfil; nunca por
  apelido. Sem isso: `PLAYER_IDENTITY_UNRESOLVED`.
- Erros expostos ao jogador são códigos estruturados, sem stack trace nem caminhos.
- O cron é autenticado por bearer secret e não devolve PII.

## Testes

`bun run test` — 27 testes puros de contrato, normalização, métricas, features,
validação, identidade e taxonomia de erros, usando uma fixture **sintética**
(`src/lib/pipeline/__tests__/fixture.ts`). O repositório **não** contém um `.dem`
real; a validação end-to-end com demo real exige o worker configurado.

## Extensão

Trocar parser: implementar `DemoParserAdapter` e alterar apenas
`resolveParserAdapter()`. Novos eventos: adicionar em `EVENT_ALIASES` /
`CanonicalEventType`. Mudança de schema: subir `SCHEMA_VERSION`
(e `ANALYSIS_VERSION` quando métricas/features mudarem).

## Fase 2.1 — Hardening (correções cirúrgicas)

Nenhuma funcionalidade nova foi adicionada nesta fase; apenas correções de
correção e segurança sobre a arquitetura da Fase 2.

1. **`storage_path` no INSERT** — `createDemoUpload()` gera o UUID do upload
   antes do INSERT e grava `storage_path = {user_id}/{upload_id}.dem` na própria
   inserção. Não existe mais janela em que a linha exista sem caminho.
2. **Duplicidade explícita** — o mesmo SHA-256 do mesmo usuário devolve
   `duplicate`, `duplicateStatus` (`processed` / `pending` / `failed`) e o job
   existente. Uma demo já processada não é reenviada nem reprocessada: os dados
   derivados são permanentes.
3. **Enqueue e retry assíncronos** — `enqueueDemoJob()`, `retryMyDemoJob()` e
   `adminRetryDemoJob()` apenas enfileiram (`pending` / `queued`) e retornam. O
   parse acontece na camada worker/cron; o usuário nunca espera o parser dentro
   da requisição.
4. **Claim atômico** — `claimNextJob()` usa a função SQL
   `claim_next_demo_job(_max_concurrent)` (`SECURITY DEFINER`,
   `search_path = ''`, `FOR UPDATE SKIP LOCKED`), que respeita o limite de
   concorrência e marca `processing` na mesma transação. `processJob()` aceita um
   job já reivindicado e, fora desse caminho, só promove linhas ainda `pending`.
5. **Integridade real do arquivo** — o hash enviado pelo navegador é somente
   chave de idempotência. Antes do parse, `computeStoredDemoSha256()` recalcula
   o SHA-256 dos bytes armazenados no bucket privado; divergência falha com
   `CORRUPTED_DEMO`.
6. **Contrato do parser** — o adapter valida `contract_version`, o nome do
   parser (`demoparser2`) e compatibilidade major/minor da versão pinada.
   Payload de outro parser ou de versão incompatível é rejeitado.
7. **Score por time** — `ownScores()` deriva `score_player` / `score_opponent`
   do time do jogador (`teamA` / `teamB`), não do lado inicial. Sem associação
   confiável de time, score e resultado ficam nulos.
8. **KAST por rounds jogados** — o denominador conta apenas rounds em que o
   Steam ID resolvido aparece (lado, economia ou evento). Sem participação,
   `kast` é `null`.
9. **Economia sem proxy de dano** — `buy_discipline` e `damage_per_dollar` são
   `null`. Só existe o sinal factual `economy_data_available`.
10. **Reset de senha com allowlist** — `safeResetPasswordUrl()` valida origem
    exata contra uma allowlist, exige `https` (exceto localhost fora de
    produção) e normaliza sempre para `/reset-password`, descartando path,
    query e fragmento.

Testes: 40 testes unitários (`bun run test`), incluindo identidade/versão do
parser, KAST por participação, economia nula, score por time e allowlist de
redirect. Permanece verdadeiro que nenhum `.dem` real foi parseado: o worker
externo continua não configurado (`PARSER_UNAVAILABLE`). Fase 3 (motor de
análise/IA), integrações e pagamentos não foram implementados.
