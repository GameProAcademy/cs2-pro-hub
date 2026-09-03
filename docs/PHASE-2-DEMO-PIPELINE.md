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
