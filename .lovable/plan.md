# Gate 02-B — separar canonicalização do vínculo de jogador

## Diagnóstico (confirmado no código atual)

O Run 1 falhou **depois** do parse real bem-sucedido do worker (`ready=true`, `demoparser2@0.42.0`), no passo de identidade:

- `src/lib/pipeline/jobs.server.ts:229-235` — logo após `normalizeParserOutput` + `validateCanonicalMatch`, o job lê `player_profiles.steam_id` e chama `resolveOwnSteamId(match, player.steam_id)`.
- `src/lib/pipeline/validator.ts:54-58` — sem Steam ID no perfil, lança `PipelineError("PLAYER_IDENTITY_UNRESOLVED", "no steam id on profile")`.
- Esse `throw` acontece **antes** de `demoToCanonicalBundle` (linha 258), do Match Identity Resolver (272-308) e de `persistCanonicalObservation` (313). Por isso todas as evidências ficaram 0: nenhuma escrita canônica foi tentada.
- `PLAYER_IDENTITY_UNRESOLVED` está na lista `PERMANENT` (`src/lib/pipeline/errors.ts`), logo o job encerra sem retry.

**Veredito:** sim, `PLAYER_IDENTITY_UNRESOLVED` está bloqueando indevidamente a ingestão. Ele viola a regra já definida de que o CanonicalMatch é source-neutral e não pertence ao jogador: a ausência de vínculo do usuário não invalida os fatos da partida (mapa, rounds, participantes, eventos).

Ponto importante: a persistência canônica **já** aceita ausência de dono — `canonical.persistence.server.ts:66,86` trata `_owner_player_id` como opcional. O bloqueio é apenas a ordem das etapas em `jobs.server.ts`.

O que legitimamente depende do Steam ID:
- `computeMetrics(match, steamId)` (`metrics.ts:413`) e `extractFeatures`;
- `persistDemoProjection({ playerId, steamId, ... })` (`persistence.server.ts:116-124`);
- o marcador `isTargetPlayer` / `internalPlayerId` no bundle (`adapters/demo.adapter.ts:39-85`), que já é opcional.

## Correção mínima proposta

1. **Reordenar `processJob`**: canonicalizar e persistir a observação primeiro, sem exigir Steam ID.
   - Construir o bundle com `targetSteamId: steamId ?? null` e `internalPlayerId: player?.id ?? null`.
   - Rodar o Match Identity Resolver e `persistCanonicalObservation` exatamente como hoje (mesmos estados EXACT/PROBABLE/POSSIBLE/NO_MATCH/CONFLICT; só EXACT auto-anexa; CONFLICT continua falhando o job).
   - Passar `ownerPlayerId: player.id` quando o perfil existir (ele existe mesmo sem Steam ID), preservando a visibilidade/RLS do dono do upload.
2. **Tornar o attachment de jogador uma etapa posterior e não-fatal**:
   - com Steam ID resolvido → métricas, features e `persistDemoProjection` como hoje; job `processed` completo.
   - sem Steam ID (ou Steam ID ausente da demo) → job termina em estado terminal de sucesso parcial, com um motivo explícito registrado no job (novo campo/coluna de motivo, ex. `attachment_state = "unattached"` + `attachment_reason = "no_steam_id_on_profile" | "steam_id_not_in_demo"`), sem métricas e sem projeção.
   - `PLAYER_IDENTITY_UNRESOLVED` deixa de ser erro de parse/persistência e passa a ser um estado de vínculo. Manter o código apenas para a rota que realmente exige jogador (retry manual pedindo projeção), nunca para abortar a canonicalização.
3. **Reprocessamento**: quando o usuário vincular a Steam depois, o retry deve recomputar apenas métricas/features/projeção sobre a partida canônica já existente (idempotente, via o mesmo `attachMatchId`), sem reparse obrigatório e sem duplicar linhas canônicas.
4. **Sem invenção de identidade**: nada de inferir jogador por nickname, nada de mock, nada de afrouxar RLS/policies. O único caminho para vínculo continua sendo Steam ID provado no perfil.
5. **UI/i18n**: o painel de ingestão e `/admin/demo-e2e` devem mostrar "partida analisada, ainda não vinculada ao seu perfil — vincule a Steam para ver suas métricas", nos cinco locales.

## Testes e regressões a adicionar

- Perfil sem `steam_id`: `processJob` grava 1 partida canônica, 1 `match_sources`, participantes, rounds, `round_players` e eventos; `metrics=0`, `features=0`; job terminal com `attachment_state="unattached"`.
- Perfil com Steam ID ausente da demo: mesmo resultado canônico, motivo `steam_id_not_in_demo`.
- Perfil com Steam ID presente: comportamento atual completo (regressão).
- Reprocessar após vincular a Steam: mesma partida canônica (`matchIds` inalterado), métricas/features passam de 0 para 1, nenhuma duplicação de rounds/eventos.
- Resolver intocado: CONFLICT ainda falha o job; PROBABLE/POSSIBLE não auto-anexam.
- Demo inválida/corrompida continua sem escrever nada (`hasNoCanonicalWrite`).
- RLS: um segundo usuário não lê a partida canônica de um upload que não é dele, com ou sem vínculo.

## Como o Gate 02-B deve medir sucesso

Separar o veredito em duas dimensões, ambas obrigatórias no relatório:

- **CANONICAL (obrigatório para PASS)** — exatamente 1 partida canônica, 1 observação por fonte, participantes > 0, rounds ≥ mínimo, `round_players` > 0, eventos > 0, e reprocessamento idempotente.
- **PLAYER PROJECTION (condicional)** — exigida somente quando o Steam ID do executor está resolvido na demo. Sem vínculo, o gate reporta `PASS (canonical) / NOT_ATTACHED (projection)` com o motivo, em vez de FAIL.
- `BLOCKED` continua reservado a worker indisponível/divergente; `FAIL` a evidência que contradiz a expectativa.

Isso exige ajustar `evaluateE2ERun` em `src/lib/pipeline/e2e.ts` para receber a expectativa de attachment, com testes correspondentes em `e2e.verdict.test.ts`.

## Fora de escopo

Parser, worker Railway, contrato `/v1/parse`, Storage/TUS, FACEIT, resolver e schema canônico permanecem inalterados. Nenhuma alteração de segredo ou de política de segurança.
