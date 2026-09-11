# FASE 2.7.2A — Ingestão canônica + identificação flexível do jogador

## Diagnóstico (confirmado no código atual)

O Run 1 real de `furia-vs-gamerlegion-m1-cache.dem` chegou ao pipeline real, o worker respondeu (`ready=true`, `demoparser2@0.42.0`, `partial_parse=false`) e a falha ocorreu **depois** do parse, no passo de identidade:

- `src/lib/pipeline/jobs.server.ts:229-235` — após `normalizeParserOutput` + `validateCanonicalMatch`, o job lê `player_profiles.steam_id` e chama `resolveOwnSteamId(...)`.
- `src/lib/pipeline/validator.ts:54-58` — sem Steam ID no perfil, lança `PipelineError("PLAYER_IDENTITY_UNRESOLVED", "no steam id on profile")`.
- Esse `throw` acontece **antes** de `demoToCanonicalBundle` (258), do Match Identity Resolver (272-308) e de `persistCanonicalObservation` (313) — por isso todas as evidências ficaram 0.
- O código está em `PERMANENT` (`src/lib/pipeline/errors.ts`), logo o job encerra sem retry.

**Veredito:** `PLAYER_IDENTITY_UNRESOLVED` está bloqueando indevidamente a ingestão e a canonicalização. A validade da partida foi acoplada à identidade do usuário, contrariando a regra de que o CanonicalMatch é source-neutral e não pertence ao jogador.

A persistência canônica **já** aceita ausência de dono (`canonical.persistence.server.ts:66,86` tratam `_owner_player_id` como opcional). O bloqueio é apenas a ordem das etapas em `jobs.server.ts`.

Dependem legitimamente do Steam ID: `computeMetrics(match, steamId)` (`metrics.ts:413`), `extractFeatures` e `persistDemoProjection({ playerId, steamId, ... })` (`persistence.server.ts:116-124`). O marcador `isTargetPlayer`/`internalPlayerId` do bundle já é opcional (`adapters/demo.adapter.ts:39-85`).

## Separação correta das cinco camadas

1. **validade da partida** — `validateCanonicalMatch` (rounds, jogadores, eventos).
2. **identidade da partida** — fingerprint + Match Identity Resolver (EXACT/PROBABLE/POSSIBLE/NO_MATCH/CONFLICT; só EXACT auto-anexa).
3. **identidade do jogador dentro da partida** — participantes da demo, com sua chave própria, sem depender do usuário.
4. **vínculo com o usuário do CS2 PRO** — attachment separado, opcional, posterior.
5. **método e confiança do vínculo** — registrado explicitamente (ex. `steam_id_profile`), nunca inferido de nickname.

Ordem alvo: DEMO → PARSER → NORMALIZER → CANONICAL MATCH → PERSISTÊNCIA CANÔNICA → PLAYER ATTACHMENT → METRICS → FEATURES → PLAYER PROJECTION.

## Correção mínima

1. **Reordenar `processJob`**: construir o bundle e persistir a observação canônica antes de qualquer exigência de Steam ID (`targetSteamId: steamId ?? null`, `internalPlayerId: player?.id ?? null`). Resolver e persistência permanecem idênticos; CONFLICT continua falhando o job.
2. `ownerPlayerId: player.id` continua sendo enviado quando o perfil existe (ele existe sem Steam ID), preservando visibilidade/RLS do dono do upload.
3. **Attachment como etapa posterior e não-fatal**:
   - Steam ID resolvido na demo → métricas, features e projeção como hoje; job `processed` completo com `attachment_state="attached"`, método e confiança.
   - Steam ID ausente no perfil ou ausente na demo → job termina em sucesso parcial com `attachment_state="unattached"` e motivo (`no_steam_id_on_profile` | `steam_id_not_in_demo`), sem métricas e sem projeção.
   - `PLAYER_IDENTITY_UNRESOLVED` deixa de abortar ingestão; permanece apenas em ações que exigem explicitamente o jogador.
4. **Vínculo posterior idempotente**: ao vincular a Steam depois, recomputar apenas métricas/features/projeção sobre a partida canônica existente, sem duplicar linhas canônicas e sem reparse obrigatório.
5. **Sem enfraquecer nada**: nenhuma inferência por nickname, nenhum mock, nenhuma alteração de Railway, parser, Storage/TUS ou RLS.
6. **UI/i18n**: painel de ingestão e `/admin/demo-e2e` mostram "partida analisada, ainda não vinculada ao seu perfil — vincule a Steam para ver suas métricas", nos cinco locales.

## Detalhes técnicos

- Arquivos a alterar: `src/lib/pipeline/jobs.server.ts` (ordem + attachment), `src/lib/pipeline/validator.ts` (`resolveOwnSteamId` passa a retornar resultado explícito em vez de lançar), `src/lib/pipeline/e2e.ts` (veredito em duas dimensões), `src/lib/pipeline-e2e.functions.ts` e a rota admin (exibir estado de vínculo), locales.
- Estado de vínculo persistido no job (colunas novas nullable + backfill nulo), sem tocar no schema canônico.

## Testes e regressões

- Perfil sem `steam_id`: 1 partida canônica, 1 `match_sources`, participantes/rounds/`round_players`/eventos > 0; `metrics=0`, `features=0`; job terminal `unattached`.
- Steam ID do perfil ausente da demo: mesmo resultado canônico, motivo `steam_id_not_in_demo`.
- Perfil com Steam ID presente: comportamento atual completo (regressão).
- Vínculo posterior: mesma `match_id`, métricas/features 0 → 1, zero duplicação.
- Resolver: CONFLICT falha; PROBABLE/POSSIBLE não auto-anexam.
- Demo corrompida/insuficiente continua sem escrever nada (`hasNoCanonicalWrite`).
- RLS: outro usuário não lê a partida de um upload alheio, com ou sem vínculo.

## Gate 02-B — como medir sucesso

- **CANONICAL (obrigatório para PASS)**: exatamente 1 partida canônica, 1 observação por fonte, participantes > 0, rounds ≥ mínimo, `round_players` > 0, eventos > 0, reprocessamento idempotente.
- **PLAYER PROJECTION (condicional)**: exigida somente quando o Steam ID do executor está resolvido na demo. Sem vínculo, o relatório é `PASS (canonical) / NOT_ATTACHED (projection)` com motivo — não FAIL.
- `BLOCKED` permanece só para worker indisponível/divergente; `FAIL` só para evidência que contradiz a expectativa.

## Fora de escopo

Parser, worker Railway, contrato `/v1/parse`, Storage/TUS, FACEIT, resolver, schema canônico e FASE 2.8.
