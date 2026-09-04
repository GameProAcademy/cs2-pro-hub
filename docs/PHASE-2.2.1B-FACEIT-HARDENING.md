# FASE 2.2.1B — FACEIT hardening + data completion

## Princípio de arquitetura

- **FACEIT** → Data API → dados públicos/agregados já processados pela plataforma.
- **DEMO** → upload manual `.dem` → parser → dados granulares.
- As duas fontes **coexistem**: `matches.data_source = 'faceit' | 'demo'`. Uma
  sincronização FACEIT nunca reescreve linha de origem `demo` (o `UPDATE` é
  filtrado por `data_source = 'faceit'`).
- **O CS2 PRO não depende do FACEIT Download API para sua coleta inicial de dados.**
  `demo_url` é tratado apenas como metadado externo: gravamos somente
  `demo_available: true|false|null`, nunca a URL, e nada é baixado.

## Credenciais

Somente server-side, lidas dentro de funções em `src/lib/faceit/faceit.config.server.ts`:

| Variável | Função |
| --- | --- |
| `FACEIT_CLIENT_ID` | client id OAuth (identificador público) |
| `FACEIT_CLIENT_SECRET` | **secreto** — troca de código |
| `FACEIT_API_KEY` | **secreto** — Data API |
| `FACEIT_OAUTH_AUTHORIZE_URL` | endpoint de autorização |
| `FACEIT_OAUTH_TOKEN_URL` | endpoint de token |
| `FACEIT_OAUTH_USERINFO_URL` | resolução de identidade |
| `FACEIT_REDIRECT_URI` | callback (HTTPS; http só em localhost dev) |
| `FACEIT_API_BASE_URL` | opcional (default `https://open.faceit.com/data/v4`) |
| `FACEIT_GAME_ID` | opcional (default `cs2`) |
| `FACEIT_REQUEST_TIMEOUT_MS`, `FACEIT_MAX_RETRIES`, `FACEIT_SYNC_MATCH_LIMIT`, `FACEIT_SYNC_MAX_PAGES`, `FACEIT_API_VERSION` | limites/config |

Nunca em frontend, código, banco, logs, URL, `localStorage` ou
`player_connections.metadata` (guard recursivo no banco + `assertSafeConnectionMetadata`).

## OAuth

Authorization Code + PKCE `S256`. `state` com 256 bits, persistido apenas como
hash SHA-256 em `oauth_connection_states` (acessível somente ao service role),
TTL de 10 min, uso único, vinculado ao usuário que iniciou. O `code_verifier`
vive apenas server-side e é descartado após o uso. O callback consome o state
**também quando o provedor retorna erro**, eliminando qualquer janela de replay.
A resposta de token é validada (status, schema zod, campo `error` em corpo 200,
`token_type` obrigatoriamente `bearer`).

### Identidade canônica

Ordem determinística e documentada em `resolveFaceitIdentityFromPayload`:
`guid` → `player_id` → `playerId` → `sub` (este **somente** se for UUID).
`nickname` nunca é identidade. O `player_id` resolvido é reconferido contra
`GET /players/{player_id}` antes de gravar. Mapeamento:
`player_connections.external_id` = `player_identities.external_id` = FACEIT `player_id`;
`username` = nickname atual; `profile_url` = URL FACEIT (validada como HTTPS `faceit.com`).

## Endpoints usados

- `GET /players/{player_id}` — perfil
- `GET /players?nickname=` — fallback documentado
- `GET /players/{player_id}/history` — histórico paginado
- `GET /players/{player_id}/games/{game_id}/stats` — stats recentes por partida
- `GET /players/{player_id}/stats/{game_id}` — agregado/lifetime
- `GET /matches/{match_id}` — detalhes
- `GET /matches/{match_id}/stats` — stats da partida

## Paginação

`limit` máximo 100, `offset` máximo 1000, `maxMatches` (default 20) e `maxPages`
configuráveis, deduplicação por `match_id`, parada em página vazia/parcial ou sem
novos ids. `truncated` sinaliza corte.

## Freshness

- Perfil: cache de `FACEIT_PROFILE_CACHE_MINUTES` (20) — o dashboard lê **nosso**
  banco e nunca dispara sync completa ao carregar.
- Histórico incremental: `from = último match_date − FACEIT_SYNC_OVERLAP_SECONDS`
  (1 h de tolerância), a deduplicação absorve a sobreposição.
- Partidas: só são rebuscadas quando incompletas (sem mapa, resultado, data ou
  métricas) ou em refresh manual.

## Rate limit e retry

`Retry-After` respeitado em segundos **e** em data HTTP, com teto de 30 s.
Sem cabeçalho: backoff exponencial com *full jitter* (mín. 100 ms, máx. 8 s).
Retentáveis: 429, 500, 502, 503, 504, timeout e falha de rede, limitados por
`FACEIT_MAX_RETRIES`. 400/401/403/404 nunca são retentados. O job registra código
estruturado (`FACEIT_*`) e agenda `next_attempt_at`.

## Idempotência

Unicidade por `player_id + data_source + external_match_id`; violação 23505 na
corrida é resolvida com re-leitura, não com nova linha. `match_metrics` usa
`upsert` em `match_id,player_id`. Um único job ativo por conexão (índice parcial
`faceit_sync_jobs_one_active_per_connection`) e claim condicional
`queued|retrying → processing`.

## Match stats — transformação determinística

`rounds` é uma lista de mapas/segmentos, não de rounds. Nunca usamos `rounds[0]`:
`selectFaceitPlayerRounds` coleta todas as entradas do jogador alvo por
`player_id` (opcionalmente filtradas por `match_id`), somamos contadores e
calculamos ratios por média ponderada pelos rounds de cada segmento.
**NULL ≠ ZERO**: métrica ausente fica `null`; métrica reportada como `0` fica `0`.

## Disconnect / reconnect

Disconnect marca `status = disconnected`, limpa estado de sync, invalida
tentativas OAuth pendentes e cancela jobs em fila. **Nada é apagado**: partidas,
métricas, análises, uploads e identidade histórica permanecem. Reconnect
reutiliza a mesma linha de conexão e a mesma identidade — sem duplicar histórico.

## Observabilidade

Logs estruturados e sem segredos: `sync_started`, `sync_completed`
(found/new/updated/skipped/api_calls/ms), `sync_failed` (código + attempts),
`identity_resolved source=`, `lifetime_stats_unavailable`, e por requisição
`endpoint/status/code/attempt/ms`.

## Limitações conhecidas

- Sem Download API, sem download de demo FACEIT, sem parser de demo FACEIT.
- Sem eventos por round, features, economia factual, trades ou dados posicionais
  a partir da FACEIT — isso é exclusivo do pipeline de demo.
- Lifetime/aggregate stats são armazenadas em `player_connections.metadata`
  (`stats_kind: "aggregate"`), sem tabela histórica nesta fase.
- Sem Gamers Club, Steam, IA, Score, DNA ou Training Engine nesta fase.
