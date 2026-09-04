# Auditoria forense — FACEIT (estado pós FASE 2.2.1C)

Somente diagnóstico. Nenhum arquivo, migration ou dado foi alterado. Tudo abaixo foi verificado por leitura de código e consulta ao PostgreSQL real nesta sessão; o que não pôde ser provado está marcado UNKNOWN.

## A. Veredito executivo

**READY WITH BLOCKERS.**

A arquitetura está correta e não precisa ser refeita para receber as chaves reais: segredos server-only, OAuth2 code+PKCE com state hasheado/single-use/TTL, identidade derivada exclusivamente do userinfo da FACEIT, tabela de jobs própria, unicidade de partidas por `(player_id, data_source, external_match_id)`, mappers que nunca inventam zero. Os bloqueadores são de **execução** (não de desenho): a sincronização depende de trabalho fire-and-forget dentro de uma request serverless e não existe recuperação de job travado em `processing`, o que na prática pode congelar a integração de um usuário para sempre.

## B. Tabela de severidade

| # | Severidade | Achado | Evidência |
|---|---|---|---|
| 1 | CRITICAL | Sync roda em `void processNextFaceitSyncJob().catch()` dentro de request serverless (callback e sync manual). O worker pode ser encerrado no meio; a run inteira (1 profile + N×2 chamadas + lifetime) cabe em uma única request | `src/routes/api/public/integrations/faceit/callback.ts:77`, `src/lib/faceit.functions.ts:242` |
| 2 | CRITICAL | Não existe recuperação de job travado. `faceit_sync_jobs` não tem equivalente de `recoverStaleJobs()`; o índice parcial `faceit_sync_jobs_one_active_per_connection` inclui `processing`, então um job morto bloqueia permanentemente qualquer novo sync daquela conexão | `rg processing src/lib/faceit/*` só encontra o claim (`faceit.sync.server.ts:100-107`); `recoverStaleJobs` existe apenas em `src/lib/pipeline/jobs.server.ts:67` |
| 3 | HIGH | Sem throttle/espaçamento entre chamadas. Só há retry em 429. Com `syncMatchLimit` alto são ~2 chamadas por partida em rajada → risco real de rate limit em cascata | `faceit.sync.server.ts` loop de `history.items`; `faceit.http.ts` não tem limiter |
| 4 | HIGH | Cron avança **um** job FACEIT por invocação e engole o erro em `{status:"failed"}`; não recupera stale nem drena a fila | `src/routes/api/public/pipeline-cron.ts:25,33-39` |
| 5 | HIGH | Sem dead-letter/observabilidade de falha terminal: job vira `failed` e nada mais acontece (nenhum requeue, nenhum alerta, nenhuma contagem em `matches_*` no caminho de erro) | `faceit.sync.server.ts` bloco catch de `processNextFaceitSyncJob` |
| 6 | MEDIUM | `authenticated` tem DELETE em `player_connections` (`connections_delete_own`, grant `ard`). Apagar a conexão faz CASCADE em `faceit_sync_jobs`, mas a linha FACEIT de `player_identities` sobrevive (o guard impede o cliente de apagá-la) → estado inconsistente e, entre usuários, `player_identities_faceit_external_uniq` passa a barrar o vínculo legítimo com `FACEIT_DUPLICATE_ACCOUNT` sem caminho de resolução | `pg_class.relacl` de `player_connections`; policies; `guard_faceit_identity()` |
| 7 | MEDIUM | `resolveFaceitPlayerId()` lê `FACEIT_OAUTH_USERINFO_URL` cru de `process.env`, sem passar por `isHttpsUrl()` (a validação existe só em `faceitConfigStatus`) — um valor http:// mal configurado enviaria o Bearer em claro | `faceit.oauth.server.ts` (bloco `resolveFaceitPlayerId`) |
| 8 | MEDIUM | Parada antecipada da paginação: `if (pageItems.length < limit ...) break`. Se a FACEIT devolver uma página curta sem que o histórico tenha acabado, partidas antigas são perdidas silenciosamente (sem flag) | `faceit.matches.ts` (fim do while) |
| 9 | MEDIUM | Janela incremental usa `match_date` da última partida FACEIT gravada. Se todas as partidas gravadas tiverem `match_date` nulo, `from` fica `undefined` e todo sync incremental vira varredura completa; e uma partida antiga que só aparece depois no histórico fica fora da janela | `faceit.sync.server.ts` (`incrementalFrom`) |
| 10 | MEDIUM | Dados FACEIT não chegam ao dashboard: `playerService` continua 100% mock com `DEMO_DATA` | `src/services/playerService.ts:1-42` |
| 11 | LOW | Índice único duplicado em `match_metrics`: `match_metrics_match_id_player_id_key` e `match_metrics_match_player_key` sobre as mesmas colunas | `pg_indexes` |
| 12 | LOW | HTTP 409 cai no default `FACEIT_BAD_REQUEST`; não há código dedicado | `faceit.errors.ts` (`faceitErrorFromStatus`) |
| 13 | LOW | `matches.platform` (texto livre `'faceit'`) é redundante com `data_source` enum; risco de divergência futura | `faceit.sync.server.ts` insert |
| 14 | UNKNOWN | Nomes de endpoint/campos CS2 (`/players/{id}/stats/{game}`, `game=cs2`, chaves de `player_stats`) não podem ser provados sem chave real; hoje só há mocks | `faceit.stats.ts`, `faceit.mapper.ts`, testes com fetch fake |

## C. Auditoria arquivo por arquivo (resumo dos pontos citáveis)

- `faceit.constants.ts` — PASS. Limites documentados isolados de env (`100`/`1000`, TTL 600s, overlap 3600s).
- `faceit.config.server.ts` — PASS com ressalva. `env()` só dentro de funções; `faceitConfigStatus()` devolve booleanos; `isAllowedRedirectUri()` exige https (http só localhost e fora de produção). Ressalva: `FACEIT_API_BASE_URL` não é validado como https; `userinfoUrl` validado aqui mas não no ponto de uso (achado 7).
- `faceit.oauth.ts` — PASS. `crypto.getRandomValues`, verifier 43–128, S256, state 256 bits, `hashState` SHA-256, `buildAuthorizeUrl` com `response_type=code` + `code_challenge_method=S256`. `resolveFaceitIdentityFromPayload` aceita só `guid|player_id|playerId|sub(UUID)`; nickname nunca é identidade.
- `faceit.oauth.server.ts` — PASS. Só o hash do state persiste; consumo é `UPDATE ... IS NULL` condicional (anti-replay); attempt ligado ao `user_id`; `redirect_uri` do exchange vem do banco, não da query. Token exchange envia `code_verifier` + `Basic client_id:client_secret`, rejeita `token_type` não-bearer, trata erro em corpo 200. **Access/refresh token não são persistidos em lugar nenhum** — logo não há revogação a fazer, e também não há refresh possível (o Data API usa API key, não o token do usuário).
- `faceit.http.ts` — PASS. API key só em `Authorization`, nunca na URL; timeout via AbortController; retry apenas retentável; `parseRetryAfter` aceita delta-seconds e HTTP-date; backoff com jitter e teto de 30s; log estruturado sem corpo e sem chave.
- `faceit.errors.ts` — PASS. 22 códigos estáveis, `message = code`, retentáveis restritos a 429/5xx/timeout/rede, `callbackReason` não vaza nada na URL.
- `faceit.types.ts` — PASS parcial. Zod em todos os payloads, `parseFaceit` → `FACEIT_MALFORMED_RESPONSE`, ausência → `null` (nunca 0). `demo_url` guardado apenas como disponibilidade. Fidelidade aos payloads reais = UNKNOWN (achado 14).
- `faceit.player.ts` / `faceit.stats.ts` / `faceit.matches.ts` — PASS estrutural: 404 → `null` ou `FACEIT_PLAYER_NOT_FOUND`; paginação limitada em page size, páginas, offset e total, com dedupe por `match_id`. Ressalvas 8 e 14.
- `faceit.mapper.ts` — PASS. `faceitHttpsUrl` só aceita https em `*.faceit.com`; `locatePlayerTeam` acha o time pelo `player_id`; score só quando ambos existem; metadata mínima e não sensível.
- `faceit.connect.server.ts` — PASS. `faceitPlayerId` vem sempre do OAuth; confere `player.player_id === faceitPlayerId`; checa dono duplicado em conexão **e** identidade antes de gravar e trata 23505 como `FACEIT_DUPLICATE_ACCOUNT`; reconexão atualiza a mesma linha; `is_verified` só após resolução oficial; disconnect é não destrutivo e cancela jobs `queued|retrying`. Ressalva: não cancela job em `processing` (achado 2).
- `faceit.sync.server.ts` — parcial. Claim condicional é seguro; upsert de match idempotente com fallback de corrida 23505; update de match filtrado por `data_source='faceit'` (nunca reescreve linha de demo); `match_metrics` por `onConflict: match_id,player_id`. Falhas: achados 1,2,3,5,9.
- `faceit.functions.ts` — PASS de superfície. Todos com `requireSupabaseAuth`, `*.server` importados dentro dos handlers, diagnostics restrito a `is_admin_master`, erros devolvidos como código. Falha: achado 1.
- `callback.ts` — PASS de segurança. Rota pública por necessidade, usuário vem do state, redirect é caminho interno fixo, state é queimado até no caminho de erro. Falha: achado 1.
- `pipeline-cron.ts` — ressalva. `authenticateCronRequest` faz Bearer + comparação timing-safe com suporte a segredo anterior: **PASS** para item 10 do pedido (não é possível disparar job arbitrário — o corpo é ignorado). Falha: achados 4 e 5.
- `FaceitPanel.tsx` / `analysis.tsx` — PASS. O browser recebe apenas view state; polling por `refetchInterval`; `authorizeUrl` só é usado como `window.location.href`.

## D. Auditoria tabela por tabela (schema real consultado)

- `oauth_connection_states` — RLS on, **zero policies**, grants só `postgres`/`service_role` → inacessível a `anon` e `authenticated`. PK id, UNIQUE `state_hash`, FK `user_id → auth.users ON DELETE CASCADE`, índice em `expires_at` e `(user_id, provider)`. `code_verifier` em claro, mas fora do alcance de qualquer role cliente. **PASS.**
- `faceit_sync_jobs` — RLS on, grant `authenticated=r`, policy única de SELECT (`owns_player OR is_staff`); nenhum INSERT/UPDATE/DELETE para cliente. FKs CASCADE para `player_connections` e `player_profiles`. CHECK `attempts >= 0`. Índices: `one_active_per_connection` (parcial em queued/processing/retrying), `dispatch_idx(status,next_attempt_at)`, `player_idx`. **PASS**, com o efeito colateral do achado 2.
- `player_connections` — RLS on, grants `authenticated=ard`. INSERT só `owns_player AND status='pending'`; SELECT próprio ou admin_master; DELETE próprio; **sem UPDATE** (estado é do servidor, reforçado por `guard_connection_status`, que também bloqueia metadata sensível via `jsonb_has_sensitive_key`). UNIQUE `(player_id, source, connection_type)` + parcial `(source, external_id) WHERE source='faceit'`. CHECK https em `profile_url` e `source <> 'demo'`. **PASS** exceto achado 6.
- `player_identities` — RLS on, grants `authenticated=arwd`, policy ALL `owns_player OR is_staff`. UNIQUE `(player_id, platform)` + parcial `(platform, external_id) WHERE platform='FACEIT'`. Trigger `player_identities_guard_faceit` levanta `FACEIT_IDENTITY_SERVER_ONLY` para qualquer INSERT/UPDATE/DELETE de linha FACEIT com `auth.uid()` presente → **identidade FACEIT não é forjável pelo cliente: PASS.** `guard_identity_verification` impede o cliente de setar `is_verified`. Observação: identidades STEAM/GAMERS_CLUB continuam graváveis pelo cliente (fora do escopo FACEIT, relevante para a próxima integração).
- `matches` — RLS on, SELECT próprio/staff, ALL para staff. UNIQUE parcial `matches_source_external_uniq (player_id, data_source, external_match_id) WHERE external_match_id IS NOT NULL` → **idempotência correta por plataforma: PASS.** `matches_upload_id_key` parcial preserva o pipeline de demos. CHECK de scores não negativos.
- `match_metrics` — RLS on, SELECT próprio/staff. UNIQUE `(match_id, player_id)` (duplicado, achado 11), FKs CASCADE, CHECK amplo de faixas (inclui KAST/HS/opening 0–100) — combina com "null ≠ zero". **PASS.**
- Triggers `SECURITY DEFINER` relevantes (`guard_faceit_identity`, `guard_connection_status`, `guard_identity_verification`, `jsonb_has_sensitive_key`): todos com `SET search_path TO ''` e referências qualificadas. **PASS.**

## E. Fluxo completo

```text
UI  -> startFaceitConnection (auth)  -> state+verifier no banco, authorizeUrl
FACEIT -> /api/public/integrations/faceit/callback?code&state
        -> consumeFaceitOAuthState (hash, single-use, TTL, user binding)
        -> exchangeFaceitCode (PKCE + Basic)  -> userinfo  -> player_id
        -> finalizeFaceitConnection (conexão + identidade verificada)
        -> enqueueFaceitSync + void processNextFaceitSyncJob()   <-- ELO FRÁGIL (1)
sync    -> profile -> history(from) -> details -> stats -> matches/match_metrics
        -> player_connections.last_sync_*                        <-- sem stale recovery (2)
dashboard/matches/analysis -> playerService (MOCK)               <-- corte de dados (10)
```

O elo OAuth → identidade → conexão está sólido. O elo sync → banco é correto mas depende de execução frágil. O elo banco → dashboard **não existe** ainda.

## F. Falhas de segurança

Nada crítico. Segredos nunca são retornados, logados ou expostos (auditoria de logs: só `endpoint/status/code/attempt/ms`, `identity_resolved source=`, `sync_*` com contadores). Não há token persistido. Pontos abertos: achado 7 (userinfo sem validação https no uso) e achado 6 (DELETE de conexão pelo cliente cria estado irreconciliável).

## G. Falhas de dados/idempotência

Chave única correta e upsert idempotente (PASS). Riscos: perda silenciosa por parada antecipada de página (8), janela incremental dependente de `match_date` (9), `matchesUpdated` contado também em corrida de insert (contador impreciso, LOW), possibilidade de a mesma partida real existir duas vezes — uma via demo, outra via faceit — por desenho.

## H. Falhas de concorrência/jobs

Claim condicional é seguro contra dupla execução (PASS). Faltam: recuperação de `processing` travado (2), drenagem de fila e recuperação no cron (4), tratamento terminal/dead-letter (5), cancelamento de job em execução no disconnect, e limitação de taxa por run (3).

## I. Gaps contra a documentação oficial FACEIT

Estrutura e limites (page 100, offset 1000, `game=cs2`, Bearer key, `Retry-After`) estão coerentes com o Data API v4. Não é possível **provar** paridade de campos e de nomes de endpoint sem chave real: marcado UNKNOWN (14). Download API nunca é chamada — conforme a regra do projeto (PASS).

## J. Testes

Cobertos hoje (130 casos, dois arquivos): PKCE/state/authorize URL, resolução canônica de identidade, mapeamento de status HTTP e não-retentáveis, Retry-After (segundos e data) + jitter/teto, paginação (multi-página, dedupe, maxMatches/maxPages, limit 100, histórico vazio), match stats determinístico por `player_id` com média ponderada, null≠zero, lifetime, demo apenas como disponibilidade, API key fora da URL.

Ausentes: consumo/replay de state contra banco, exchange com verifier errado, `finalizeFaceitConnection` (duplicado entre usuários, reconexão), máquina de estados de `processNextFaceitSyncJob` (claim concorrente, retry/backoff, falha terminal), idempotência de `matches`/`match_metrics` em duas runs seguidas, janela incremental, autenticação do cron, e negativos de RLS por role (o SQL de segurança não cobre `faceit_sync_jobs`/`oauth_connection_states` além do esperado).

## K. Correções para a próxima iteração (ordem de prioridade)

1. Tornar o sync resiliente: parar de depender de fire-and-forget — o cron passa a ser o executor real, drenando a fila com orçamento (N jobs/execução) e o callback/sync manual apenas enfileiram.
2. Recuperação de job travado: requeue de `processing` além de uma janela de stale, com incremento de `attempts` e limite (dead-letter explícito).
3. Cron: recuperar stale, processar em laço com limite de tempo/itens e reportar contadores por status em vez de engolir o erro.
4. Rate limiting por run: espaçamento mínimo entre chamadas e orçamento máximo de chamadas por job, com corte gracioso (`truncated`) em vez de estourar 429.
5. Disconnect: cancelar/neutralizar também o job em `processing` e definir o que acontece com a identidade FACEIT quando a conexão é apagada (bloquear DELETE do cliente ou reconciliar a identidade).
6. Validar `FACEIT_OAUTH_USERINFO_URL` e `FACEIT_API_BASE_URL` como https no ponto de uso.
7. Paginação: distinguir "página curta" de "fim do histórico" e marcar explicitamente truncamento parcial; revisar `from` incremental para não depender só de `match_date`.
8. Contadores honestos (`matchesUpdated` vs corrida) e código próprio para 409.
9. Limpeza: remover o índice único duplicado de `match_metrics`.
10. Testes dos cenários listados em J (foco em jobs, idempotência em duas passagens e negativos de RLS).
11. Só depois: ligar `playerService` aos dados reais (é um marco de produto, não de FACEIT).

## L. O que NÃO deve ser alterado

- Toda a criptografia e o ciclo de vida OAuth/PKCE (`faceit.oauth.ts`, `faceit.oauth.server.ts`), incluindo a decisão de não persistir tokens.
- `oauth_connection_states` (schema, ausência de policies, grants) e o trigger `guard_faceit_identity`.
- `matches_source_external_uniq`, os índices parciais de unicidade FACEIT e o `onConflict` de `match_metrics`.
- `faceit.errors.ts` (códigos estáveis, retentáveis) e `faceit.http.ts` (Bearer, backoff, Retry-After, jitter).
- `faceit.mapper.ts` e `faceit.types.ts` (regra null ≠ zero, https só em faceit.com, demo só como disponibilidade).
- `authenticateCronRequest` e o pipeline de demos (`src/lib/pipeline/*`, `DemoIngestPanel`).
- Superfície de `faceit.functions.ts` e a UI (`FaceitPanel`, `/analysis`): os contratos servem à próxima iteração sem refactor.
- Nada precisa mudar na arquitetura para receber as chaves reais; os bloqueadores são de execução de jobs, não de desenho.

**Gamers Club:** nenhum impedimento arquitetural — `sources/*`, `player_connections`, `data_source` e o padrão de jobs são reaproveitáveis. Recomendação: fechar os itens 1–5 antes, porque a próxima integração herdaria exatamente a mesma fragilidade de execução de jobs.
