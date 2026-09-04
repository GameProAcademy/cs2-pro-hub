# Segunda auditoria (red team) — FACEIT

Somente diagnóstico. Nada foi editado. Cada afirmação abaixo tem caminho+linha do commit atual ou objeto real do PostgreSQL consultado nesta sessão. Onde não foi possível provar, está UNKNOWN — não PASS.

Nota de processo: estou em modo de planejamento, então não pude registrar a tarefa em `roadmap.md`; este arquivo de plano é o único editável aqui. Registre "FASE 2.2.1D — correções da segunda auditoria" no roadmap na próxima iteração de build.

## 0. Onde a primeira auditoria estava certa, exagerada ou errada

| Alegação da 1ª auditoria | Veredito do red team |
|---|---|
| UNIQUE `(player_id, data_source, external_match_id)` — PASS | **CONFIRMADO** (índice parcial real, ver §1) |
| Identidade FACEIT não forjável pelo cliente | **CONFIRMADO** (trigger + nenhum handler aceita player_id) |
| `oauth_connection_states` inacessível ao cliente | **CONFIRMADO** por `relacl`: só `postgres`, `service_role`, `sandbox_exec`; sem `anon`/`authenticated`, zero policies |
| CRITICAL fire-and-forget | **CONFIRMADO, e pior do que descrito**: o runtime alvo é Cloudflare Workers (edge), sem `waitUntil` em nenhum ponto → a continuação após a resposta não tem garantia nenhuma |
| CRITICAL job travado sem recuperação | **CONFIRMADO e elevado**: além de travar, deixa a integração do usuário permanentemente inutilizável (§3) |
| "Índice único duplicado em match_metrics" — LOW | **CONFIRMADO** (`match_metrics_match_id_player_id_key` e `match_metrics_match_player_key`, mesmas colunas) |
| Achado 6 (DELETE de conexão) classificado MEDIUM | **Subestimado no diagnóstico, mas sem takeover**: é bloqueio permanente de reconexão para outro usuário, sem caminho de resolução no produto (§2) |
| Achado 8 (página curta) MEDIUM | **CONFIRMADO e agravado**: o `truncated` não é marcado nesse caminho, então a perda é silenciosa até para o chamador (§7) |
| "Endpoints coerentes com o Data API v4" | **PARCIALMENTE FALSO como PASS**: `from`/`to` em segundos confirmado por documentação de terceiros; o limite `offset ≤ 1000` **não** é documentado oficialmente e `fetchFaceitRecentMatchStats` é código morto com semântica errada (§6) |
| Nada além disso em CRITICAL/HIGH | **FALSO**: há dois HIGH novos de fidelidade/custo de dados (§12: bo3 e mapa) |

## 1. UNIQUE de `matches` e idempotência — PASS (com um falso conforto)

Objeto real:
`CREATE UNIQUE INDEX matches_source_external_uniq ON public.matches (player_id, data_source, external_match_id) WHERE external_match_id IS NOT NULL`

- Duas execuções seguidas: PASS. `faceit.sync.server.ts:279-283` (classificação por `external_match_id` + `data_source='faceit'`), insert com captura de `23505` e re-SELECT `:343-355`, `match_metrics` upsert `onConflict: match_id,player_id` `:371-374`. Rodar o mesmo sync duas vezes não duplica nada.
- Entre usuários: PASS por desenho — a chave inclui `player_id`, então a mesma partida FACEIT pode existir uma vez por jogador. Isso é correto (cada `player_profiles` tem métricas próprias) e não é vazamento: `matches_select_own`/`match_metrics_select_own` usam `owns_player(player_id)`.
- Falso conforto: o UNIQUE **não** impede a mesma partida real coexistir como `data_source='demo'` e `data_source='faceit'` para o mesmo jogador. Duas linhas, duas métricas, dois pesos em qualquer agregação futura. Hoje é inofensivo (nada agrega), mas viraria dupla contagem no Score/DNA. **FAIL futuro, PASS atual.**
- Contador desonesto: `matchesUpdated` é incrementado também quando o insert perde uma corrida (`:330`), e `matchesFound` conta o histórico inteiro, incluindo os `matchesSkipped`. LOW.

## 2. Trace `player_connections` DELETE → identidade → jobs → matches

Fatos do banco: policy `connections_delete_own DELETE USING owns_player(player_id)` (o cliente pode apagar); `faceit_sync_jobs_connection_id_fkey ... ON DELETE CASCADE`; `player_identities_player_id_fkey → player_profiles ON DELETE CASCADE` (não depende da conexão); trigger `player_identities_guard_faceit` bloqueia qualquer INSERT/UPDATE/DELETE de linha FACEIT quando `auth.uid()` existe.

Consequências provadas:
1. DELETE da conexão → jobs somem por CASCADE; `matches`/`match_metrics` permanecem (FK é para `player_profiles`); a linha FACEIT de `player_identities` **sobrevive e é indelével pelo cliente**. → **identidade órfã: FAIL.**
2. Mesmo usuário reconectando: `finalizeFaceitConnection` não acha conexão → INSERT; `identityOwner.player_id === playerId` → passa (`faceit.connect.server.ts:64-79`). Funciona, mas `reconnected=false` → job `initial` → varredura completa do histórico (custo de API desnecessário). **PASS funcional, MEDIUM de custo.**
3. Outro usuário: `identityOwner.player_id !== playerId` → `FACEIT_DUPLICATE_ACCOUNT` para sempre, mesmo sem nenhuma conexão viva, e sem nenhuma tela/rota para reconciliar. **FAIL de produto (HIGH), não de segurança.**
4. Takeover: **não existe.** Nem por conexão (`player_connections_faceit_external_uniq`), nem por identidade (`player_identities_faceit_external_uniq`), nem por parâmetro (nenhum handler aceita `player_id`; ele vem sempre do userinfo). **PASS.**
5. Vazamento entre usuários: **não existe.** Todas as leituras são `owns_player`/`is_staff`; `anon` não tem grant em nenhuma dessas tabelas (`relacl` verificado). **PASS.**
6. Efeito colateral silencioso do DELETE: ele apaga o histórico de `faceit_sync_jobs` do usuário (CASCADE) — a auditoria de sync é destruível pelo cliente. LOW/MEDIUM de trilha.

## 3. Máquina de estados de `faceit_sync_jobs` — FAIL

Índice real: `UNIQUE (connection_id) WHERE status IN ('queued','processing','retrying')`.

- `queued` (INSERT, `:57-61`): 23505 → devolve `alreadyRunning` `:63-74`. PASS.
- `queued|retrying → processing`: SELECT candidato `:89-96` + UPDATE condicional `.in("status",["queued","retrying"])` `:101-107`. Compare-and-swap correto → **sem dupla execução do mesmo job: PASS.**
- `processing → completed` `:120-131`; `→ retrying|failed` `:142-154`, com `attempts+1`, retry só se `retryable && attempts < 3`, backoff `min((retryAfter||30)*attempts, 900s)`. PASS.
- **`processing → (nada)`: FAIL CRÍTICO.** Nenhuma linha do projeto reverte `processing`: `rg processing src/lib/faceit` só encontra o claim e o filtro de cancelamento. `recoverStaleJobs()` existe apenas para a pipeline de demos (`src/lib/pipeline/jobs.server.ts:67`). Um worker morto no meio deixa a linha em `processing` permanentemente; o índice parcial então:
  - faz todo `enqueueFaceitSync` devolver `alreadyRunning: true` (`:73`) → botão de sync inútil para sempre;
  - `FaceitPanel` entra em polling de 5s eterno (`FaceitPanel.tsx:69-71`) porque o job "ativo" nunca sai.
  Resultado: **um único crash inutiliza a integração daquele usuário de forma definitiva, sem caminho de auto-recuperação e sem tela de admin para consertar.**
- Fire-and-forget em serverless: `callback.ts:77` e `faceit.functions.ts` (`requestFaceitSync`) usam `void processNextFaceitSyncJob().catch(() => undefined)`. O alvo de deploy é Worker de edge; não há `ctx.waitUntil`. A run inteira (1 profile + 2 chamadas por partida + lifetime) está dentro de uma request cujo tempo de CPU é limitado. **FAIL** — e é exatamente o gatilho do item anterior: o cenário de travamento não é raro, é o caminho comum em históricos grandes.
- Retry storm: não há tempestade de retry (máx. 3, com backoff). Há, porém, **rajada de API sem limite**: nenhum espaçamento entre chamadas, nenhum orçamento de chamadas por job, e nenhum limite global de jobs simultâneos entre conexões diferentes (o claim é por job, não por processo). Um cron + N usuários clicando produzem N syncs paralelos. **FAIL (HIGH).**
- Cancelamento indevido: `disconnectFaceit` marca `failed` apenas `queued|retrying` (`faceit.connect.server.ts:214-219`) — correto; um job em `processing` morre sozinho no `FACEIT_NOT_CONNECTED` (`:201-203` do sync). PASS. Efeito colateral: esse cancelamento é por `player_id`, não por conexão — hoje equivalente, mas frágil se um dia existir outra conexão FACEIT.
- Dead letter: inexistente. `failed` é terminal e invisível (sem requeue, sem alerta, sem tela). **FAIL (MEDIUM).**

## 4. `pipeline-cron` — PASS na autenticação, FAIL na operação

- Autenticação: `authenticateCronRequest` (`src/integrations/supabase/cron-auth.ts:12-32`) exige `Bearer`, compara com `timingSafeEqual` sobre SHA-256, aceita segredo anterior, e sem segredo configurado devolve 500 (fail-closed). Chamado antes de tudo (`pipeline-cron.ts:19-20`). **Job arbitrário: impossível** — o corpo da request é ignorado por completo. PASS.
- DoS: sem segredo não há trabalho; com segredo o único abuso é acelerar o consumo da fila. Não há loop infinito (uma iteração por invocação). PASS.
- Timeout: uma invocação faz `recoverStaleJobs` + `cleanupExpiredDemos(50)` + processar 1 job de demo + 1 job FACEIT **na mesma request de Worker** (`:27-38`). O job FACEIT sozinho pode ser dezenas de chamadas HTTP → risco real de estourar o tempo do Worker e, com isso, deixar o job FACEIT em `processing` (fecha o círculo com §3). **FAIL (HIGH).**
- Observabilidade: erro do sync é engolido em `{status:"failed"}` (`:34-39`), sem código nem job id. **FAIL (MEDIUM).**
- Não há recuperação de stale FACEIT no cron (só a de demos). **FAIL (CRITICAL, mesma raiz de §3).**

## 5. OAuth + PKCE ponta a ponta — PASS

- Verifier CSPRNG 43–128, challenge S256, `response_type=code`, `code_challenge_method=S256` (`faceit.oauth.ts:24-40,68-78`).
- Só o SHA-256 do state é persistido (`faceit.oauth.ts:48-56`; uso em `faceit.oauth.server.ts`), TTL 600s, UNIQUE `oauth_connection_states_state_hash_key`.
- Replay: consumo é `UPDATE ... WHERE consumed_at IS NULL` (compare-and-swap) — dois callbacks concorrentes com o mesmo state: só um vence. PASS. O caminho de erro também queima o state (`callback.ts:42-46`).
- Fronteira transacional: `consume → exchange → userinfo → finalize` **não é atômico**. Se o exchange falhar, o state já foi queimado (correto) e o usuário precisa reiniciar (comportamento aceitável, não bug). Não há estado intermediário persistido, então não há linha meio-gravada. PASS.
- Redirect URI: vem da config validada (`isAllowedRedirectUri`, HTTPS obrigatório, http só em localhost fora de produção) e é relida do banco no exchange — **não** da query string. Sem open redirect: o callback só redireciona para `/analysis?...` fixo (`callback.ts:20-29`). PASS.
- `token_type` diferente de bearer é rejeitado; erro dentro de corpo 200 é rejeitado; client secret só em `Authorization: Basic` server-to-server. Tokens **nunca** persistidos. PASS.
- Scopes: `openid profile email` — mínimo para identidade. PASS.
- Segredos em log: auditados todos os `console.*` do escopo FACEIT — apenas endpoint/status/código/tentativa/ms, ids de job, contadores e nome da fonte de identidade. Nenhum token, state, verifier, chave, header ou corpo upstream. PASS.
- Único furo: `resolveFaceitPlayerId` usa `FACEIT_OAUTH_USERINFO_URL` cru, sem `isHttpsUrl()` no ponto de uso (validado só em `faceitConfigStatus`). MEDIUM — envio de Bearer em claro se mal configurado.

## 6. Comparação com o Data API v4 — PARCIAL / UNKNOWN

- Base `https://open.faceit.com/data/v4`, `Authorization: Bearer`, `GET /players/{id}`, `/players/{id}/history`, `/matches/{id}`, `/matches/{id}/stats`, `/players/{id}/stats/{game}`: **coerentes** com a documentação e com clientes de referência públicos.
- `from`/`to` em **segundos** UNIX: confirmado por documentação de terceiros; `incrementalFrom` divide por 1000 e subtrai o overlap (`faceit.sync.server.ts` `incrementalFrom`) → **PASS**.
- `game=cs2`: valor default do projeto (`faceit.constants.ts`). Plausível, **UNKNOWN** sem chave real (a FACEIT já usou `csgo`; um valor errado devolve histórico vazio, não erro).
- `offset ≤ 1000`: **não é limite documentado oficialmente** — é convenção de comunidade. Como está implementado, o teto trunca o histórico em 1000 e marca `truncated`. Conservador, não incorreto, mas a justificativa "conforme docs" é um falso PASS.
- `fetchFaceitRecentMatchStats` (`faceit.stats.ts:12-25`, path `/players/{id}/games/{game}/stats`) é **código morto** (`rg` mostra zero chamadas) e o path não corresponde ao endpoint de estatísticas agregadas do v4. **FAIL leve (código morto enganoso).**
- Campos de `/matches/{id}/stats`: nomes usados (`Kills`, `Deaths`, `Assists`, `ADR`, `Headshots %`, `KAST`, `Rating`, `Quadro Kills`, `Penta Kills`, `Rounds`) são os nomes públicos conhecidos, mas **não há nenhum fixture de payload real**. **UNKNOWN** — se um nome divergir, o campo fica `null` silenciosamente (nunca zero, isso é PASS) e o AI Coach recebe métrica ausente sem nenhum sinal de erro.

## 7. Paginação — FAIL (perda silenciosa)

`faceit.matches.ts:41-87`.
- Dedupe: correto (Set por `match_id`, mantido entre páginas).
- `maxMatches`/`maxPages`/`limit≤100`/`offset≤1000`: todos aplicados; `offset += pageItems.length` (não `limit`) evita pular itens.
- Perda real: `if (pageItems.length === 0 || pageItems.length < limit || added === 0) break;` **sem marcar `truncated`**. Uma página curta que não seja fim de histórico (comportamento observado na FACEIT quando itens são filtrados no servidor) encerra a varredura e o chamador não tem como saber. `truncated` só é marcado por teto de offset e por `maxMatches`. **FAIL (MEDIUM/HIGH conforme frequência).**
- `added === 0` como fim de histórico é uma heurística perigosa junto com o `from` sobreposto: a primeira página de um incremental pode ser inteiramente de partidas já conhecidas e encerrar antes de alcançar as novas, se a ordem retornada não for estritamente decrescente. **FAIL condicional (UNKNOWN sem API real).**

## 8. Validação Zod e perda de dados úteis ao AI Coach — PASS estrutural, FAIL de aproveitamento

- Todos os payloads passam por schema; falha → `FACEIT_MALFORMED_RESPONSE`; ausência → `null`, nunca 0 (`faceit.types.ts:12-20,196-200`). PASS.
- Campos descartados que teriam valor para o Coach e hoje se perdem: `elo`/`skill_level` por jogo ficam só na metadata da conexão (não historizados → impossível traçar evolução de ELO); `round_stats` de mapa (Winner, Rounds, Score, Region) não são gravados; roster/adversários não são gravados; `best_of`/`maps_played` ficam apenas em `source_metadata`; `team_stats` inteiro é ignorado; `demo_url` propositalmente descartado (correto). Nada disso é bug, mas o "dado FACEIT" armazenado hoje é mais pobre do que o disponível. **MEDIUM de produto.**

## 9. `match_metrics` — PASS com dois defeitos

- Chave: `UNIQUE (match_id, player_id)` — **duplicada** (`match_metrics_match_id_player_id_key` + `match_metrics_match_player_key`). LOW.
- FKs: `match_id → matches CASCADE`, `player_id → player_profiles CASCADE`. PASS.
- RLS: `match_metrics_select_own (owns_player OR is_staff)` + `match_metrics_admin_manage (is_staff)`; sem grant para `anon`. Cliente não escreve. PASS.
- Ranges: `match_metrics_ranges_check` exige `kast`/`hs_percent` em 0–100 e `rating ≥ 0`. Como o mapper usa média ponderada de valores FACEIT já em 0–100 e rating ≥ 0, não há violação esperada; **mas** se a FACEIT devolver `Headshots %` como fração (0–1) em algum endpoint, o valor entra silenciosamente errado (não viola o CHECK). UNKNOWN.
- null vs zero: PASS, com testes (`hardening.test.ts:112-133`).
- Jogador certo em todos os mapas: PASS provado por leitura — `selectFaceitPlayerRounds` casa exclusivamente por `player_id`, varre **todas** as entradas (uma por mapa), opcionalmente filtra por `match_id`, e agrega com contadores somados e razões ponderadas por `Rounds` de cada mapa (`faceit.mapper.ts:325-408`). Nunca usa `rounds[0]` nem nickname. Ressalva: quando `round_stats.Rounds` está ausente o peso vira 1 (`:381`), o que enviesa a média entre mapas de tamanhos diferentes. LOW.

## 10. Dashboard / matches / analysis — FAIL (dado real não chega ao produto)

`src/services/playerService.ts:1-42` retorna exclusivamente mock de `src/data/demoPlayer.ts` sob `DEMO_DATA`. Nenhuma tela consome `matches`/`match_metrics` reais (`rg faceit` em `dashboard.tsx`, `matches.tsx`, `performance.tsx`, `player-dna.tsx`: zero ocorrências). A única superfície real é o `FaceitPanel` em `/analysis`, que mostra estado da conexão e a contagem de partidas sincronizadas.

Impacto exato no produto hoje: a integração **grava** dados corretos que **ninguém vê**. Um usuário conecta a FACEIT, o sync roda, e o dashboard continua exibindo números de demonstração — indistinguíveis de dados reais para quem não leu o aviso. É o maior risco de percepção do produto neste momento, e é anterior a qualquer bug da FACEIT.

## 11. Testes — o que executa código de verdade

**Executa código real (PASS, 130 casos):** primitivas PKCE, resolução canônica de identidade, mapeamento de status/retryabilidade HTTP, `parseRetryAfter` + backoff/jitter/teto, client HTTP contra `fetch` falso (inclusive "chave nunca na URL"), paginação com servidor falso (multipágina, dedupe, `maxMatches`/`maxPages`, offset, limite 100), mappers de partida/métricas (agregação ponderada multi-mapa, null≠zero, `demo_available`).

**Superficial ou inexistente (UNKNOWN — nada é provado):**
- Zero testes tocam banco: `faceit.oauth.server.ts`, `faceit.connect.server.ts`, `faceit.sync.server.ts` não têm nenhum teste. Ou seja, **todas as garantias mais críticas** (single-use de state, duplicate account, claim de job, idempotência de upsert em duas passagens, janela incremental) são asseguradas apenas por leitura de código.
- Zero testes do handler de callback e do cron (inclusive o gate de autenticação).
- Zero testes provando que o índice parcial rejeita o segundo job ativo.
- Zero fixtures de payload real da FACEIT — todos os objetos são escritos à mão, então os testes de mapper confirmam a *nossa* suposição de formato, não o formato da FACEIT. É o falso PASS mais perigoso da suíte.
- Zero teste do cenário de teardown serverless (não é unit-testável; exige mudança de arquitetura para ser observável).

## 12. CRITICAL/HIGH que a primeira auditoria não encontrou

1. **HIGH — bo3/bo2 corrompem `score_*` e `rounds`.** `mapFaceitMatchToMatch` calcula `rounds = score_player + score_opponent` (`faceit.mapper.ts:225-228`). Em partida de mais de um mapa, `results.score` da FACEIT é **mapas ganhos**, não rounds: uma bo3 2–1 grava `rounds = 3` e `score_player = 2`. Ao mesmo tempo `match_metrics.rounds_played` vem de `round_stats.Rounds` (correto, ex.: 65). As duas colunas ficam mutuamente inconsistentes na mesma partida — envenenamento direto de qualquer cálculo futuro de ADR/KAST/Score por round.
2. **HIGH — partidas "incompletas para sempre" causam custo de API crescente.** "Completo" exige `map`, `result`, `match_date` e métricas (`faceit.sync.server.ts:268-274`), mas `map` só é extraído de `voting.map.pick[0]` (`faceit.mapper.ts:245`). Partidas sem voting (hub/campeonato com mapa fixo) e partidas sem `/stats` disponível **nunca** ficam completas → cada sync incremental refaz details+stats dessas partidas indefinidamente. O custo por sync cresce com o histórico e não converge, aumentando a chance de 429 e de estourar o tempo do Worker (que por sua vez trava o job — §3).
3. **MEDIUM/HIGH — `truncated` não sinaliza a parada por página curta** (§7): perda de histórico sem nenhum rastro.
4. **MEDIUM — sem limite global de concorrência/orçamento de chamadas** por processo: N usuários = N syncs paralelos com a mesma chave de API.
5. **MEDIUM — `player_connections` DELETE pelo cliente apaga a trilha de `faceit_sync_jobs`** por CASCADE, e deixa identidade órfã indelével (§2).
6. **MEDIUM — código morto `fetchFaceitRecentMatchStats`** com path de endpoint que não corresponde ao v4: convida a um bug futuro.
7. **LOW — peso 1 quando `Rounds` está ausente** enviesa médias entre mapas (§9).
8. **LOW — `matchesFound`/`matchesUpdated` imprecisos** (§1), o que torna a observabilidade otimista.

## (a) Blockers obrigatórios antes de Gamers Club

1. Executor de jobs de verdade: parar de depender de promessa solta em request de edge. Enfileirar na request; executar só no cron (ou com primitiva explícita de trabalho pós-resposta).
2. Recuperação de `processing` travado (janela de stale + `attempts` + limite), senão qualquer crash inutiliza a conta em definitivo.
3. Cron: recuperar stale FACEIT, processar em laço com orçamento de tempo/itens, e reportar status/código por job em vez de engolir o erro.
4. Orçamento e espaçamento de chamadas por job + limite de concorrência global.
5. Corrigir a semântica de bo2/bo3 (`score_*`, `rounds`) e a extração de `map`, com critério de completude que não deixe partidas em reprocessamento eterno.
6. Sinalizar truncamento em página curta e revisar a heurística `added === 0`.
7. Fechar o estado irreconciliável identidade órfã × reconexão (bloquear DELETE do cliente ou reconciliar identidade ao apagar/desconectar).
8. Validar `FACEIT_OAUTH_USERINFO_URL` e `FACEIT_API_BASE_URL` como HTTPS no ponto de uso.
9. Testes que executem os caminhos com banco: state single-use, duplicate account, claim concorrente, idempotência em duas passagens, cron auth — mais um fixture de payload real assim que houver chave.

Todos os nove são **de execução/fidelidade, não de arquitetura**: a estrutura de `sources/*`, `player_connections`, `data_source` e jobs é reaproveitável para Gamers Club. Herdar hoje significaria herdar exatamente os itens 1–4.

## (b) Correções opcionais

- Remover o índice único duplicado de `match_metrics`.
- Remover `fetchFaceitRecentMatchStats` (código morto) e dar código próprio ao 409.
- Contadores honestos (`matchesFound` sem os skipped, `matchesUpdated` sem corrida).
- Dead-letter/visibilidade de `failed` (tela de admin ou requeue manual).
- Historizar `elo`/`skill_level` e guardar `round_stats` por mapa para o AI Coach.
- Peso explícito quando `Rounds` falta, em vez de 1.
- Reduzir custo do "initial" após DELETE+reconexão do mesmo usuário.

## (c) Itens que devem permanecer intocados

- Todo o ciclo OAuth/PKCE e a decisão de nunca persistir tokens (`faceit.oauth.ts`, `faceit.oauth.server.ts`).
- `oauth_connection_states` como está: sem policies, sem grant para `anon`/`authenticated`.
- Trigger `player_identities_guard_faceit` e `guard_connection_status` (+ `jsonb_has_sensitive_key`).
- `matches_source_external_uniq`, os índices parciais de unicidade FACEIT, o `onConflict: match_id,player_id` e o filtro `.eq("data_source","faceit")` em todo UPDATE.
- `faceit.errors.ts` (códigos estáveis) e `faceit.http.ts` (Bearer em header, retry só retentável, Retry-After, jitter, teto de 30s).
- Regra null ≠ zero em `faceit.types.ts`/`faceit.mapper.ts`; seleção por `player_id` em `selectFaceitPlayerRounds`; `demo_available` sem URL.
- `authenticateCronRequest` e toda a pipeline de demos.
- Superfície de `faceit.functions.ts` e a UI (`FaceitPanel`, `/analysis`).
