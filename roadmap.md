# Roadmap

## FASE 2.2.1C — Final FACEIT hardening (concluída)

- [x] (A) Execução fire-and-forget removida do callback OAuth e de `requestFaceitSync`.
- [x] (B) Job não pode mais ficar preso em `processing`: heartbeat + recuperação.
- [x] (C) `recover_stale_faceit_sync_jobs()` respeitando o teto de tentativas.
- [x] (D) Cron virou worker real, com claim atômico e orçamento de tempo.
- [x] (E) Orçamento de chamadas por job, concorrência global e espaçamento mínimo.
- [x] (F) Semântica BO1/BO2/BO3: score = mapas na série, rounds só de rounds reais.
- [x] (G) Convergência de partidas incompletas (`source_complete`, tentativas).
- [x] (H) Paginação sinaliza `truncated` + `stopReason`; página curta não é fim.
- [x] (I) Disconnect sempre lógico; DELETE do cliente só em conexão `pending`.
- [x] (J) HTTPS exigido no ponto de uso de userinfo e da Data API.
- [x] (L) Índice UNIQUE duplicado de `match_metrics` removido.
- [x] (M) Contadores honestos (inserted / updated / existed / skipped / failed / deferred).
- [x] (N) `fetchFaceitRecentMatchStats` (código morto) removido.

## Aberto (fases seguintes)

- [ ] Agendamento externo do cron (`/api/public/pipeline-cron`) com o segredo já configurado.
- [ ] Dashboard real, Pro Score, Player DNA, diagnóstico e AI Coach com dados reais (hoje mock sob `DEMO_DATA`).
- [ ] Worker real de parser de `.dem` (`FEATURES.realDemoParser = false`).
- [x] Gamers Club: INDISPONÍVEL por bloqueio externo (403/Cloudflare, sem API pública). Não haverá contorno de anti-bot.


## FASE 2.2.1D — FACEIT FINAL VALIDATION PATCH (concluída)
- `finished` baseado em `finished_at`/status terminal (`isFaceitMatchFinished`); `match_date` nunca é prova.
- Convergência isolada em `faceitMatchConverged`: partida ongoing nunca converge por tentativas.
- API call budget virou hard ceiling no `FaceitClient` (conta retries; erro `FACEIT_API_BUDGET_EXHAUSTED`).
- Worker deadline propagado ao client (abort = min(timeout, deadline); `FACEIT_WORKER_DEADLINE_EXCEEDED`).
- Disconnect race: update final de `player_connections` guardado por `status = 'connected'`.
- Testes novos: `faceit.validation.test.ts` (21) e `faceit.lifecycle.test.ts` (3). Total 169.

## FASE 2.3 — Gamers Club — PARCIAL / BLOQUEADA

**Bloqueio (Regra Zero).** Não existe API pública oficial da Gamers Club e todas as
requisições não autenticadas ao site público — inclusive a home — respondem
`HTTP 403` com desafio interstitial da Cloudflare (`cf-mitigated: challenge`).
Contornar isso exigiria cookie de sessão, stealth browser, proxy rotativo ou
bypass de CAPTCHA, todos explicitamente proibidos. Portanto NÃO há caminho de
coleta permitido e nada de collector foi implementado.

Implementado:
- [x] Validador/parser de URL pública (`src/lib/gamersclub/gamersclub.url.ts`): host allowlist,
      HTTPS obrigatório, rejeita userinfo/porta/`javascript:`/`data:`/sufixo falso, normaliza
      trailing slash, query e fragment, extrai `external_id` numérico ou slug.
- [x] Erros estruturados GC (somente códigos alcançáveis hoje).
- [x] `is_verified` nunca é promovido por URL informada (`GAMERS_CLUB_IDENTITY_VERIFIABLE = false`).
- [x] Estados de disponibilidade de fonte (`src/lib/sources/availability.ts`):
      implemented / available / degraded / unavailable / configuration_missing / unsupported.
      GC = `unavailable` (`anti_bot_challenge`), não colecionável.
- [x] Correção de honestidade: `IMPLEMENTED_SOURCES = ["demo", "faceit"]`;
      `getSourceAdapter` não devolve mais adapter falso para FACEIT; `FEATURES.faceitIntegration = true`.
- [x] Testes: 23 casos GC (URL + invariantes). Suíte total 212/212.

Bloqueado (não implementado, e não implementável sem acesso permitido):
- [ ] collector/HTTP client GC, parser de perfil, parser de histórico, normalizer canônico
- [ ] `gamers_club_sync_jobs`, `gamers_club_profile_snapshots`, worker/cron, cache, snapshots
- [ ] UI "Conectar Gamers Club", refresh manual, security checks GC, migrations

Desbloqueio possível: API/parceria oficial da Gamers Club, ou confirmação escrita
de um endpoint público sem autenticação e sem desafio anti-bot.

## FASE 2.3 — Gamers Club + Player Identity Graph — PARTIAL / BLOCKED_EXTERNAL_ACCESS
- Locator model (numeric_id vs slug, externalIdConfirmed), access classification, provider abstraction,
  HTTP/deadline/budget/retry semantics, bounded pagination, cache TTL + freshness, job lifecycle,
  identity correlation engine with evidence hierarchy — implemented and tested (265 tests).
- DB: identity state + locator columns, identity_correlation_evidence, gamers_club_profile_snapshots,
  gamers_club_sync_jobs, atomic claim + stale recovery (service_role only).
- UI: GamersClubPanel + PlayerIdentityPanel on /upload (honest blocked/correlated states).
- BLOCKED: collection itself — gamersclub.com.br answers HTTP 403 Cloudflare challenge; no official API.
  Collector/parser/worker remain unimplemented on purpose. Unblocks with an authorised provider.

## FASE 2.4 — Player Profile + Identity Graph + Verification Engine + CS2 Map Pool — DONE
- Perfil 100% persistente (nenhuma página lê `demoProfile`): `player_profiles`
  (nickname, country ISO-2 com CHECK, main_platform em STEAM_PREMIER/FACEIT/GAMERS_CLUB/OTHER,
  experience, team) + `player_profile_roles` (9 códigos estáveis) + `player_profile_goals`
  (6 códigos, único primário via índice parcial). RLS owner-only write, leitura owner/staff.
- Server fns `src/lib/profile.functions.ts` (`getPlayerProfile`/`savePlayerProfile`) sob
  `requireSupabaseAuth`; hook `usePlayerProfile`; `FEATURES.profilePersistence = true`.
- Cadastro e perfil compartilham a mesma taxonomia (`src/lib/profile/taxonomy.ts`),
  país detectado por navigator.language/locale/timezone (persistido sempre vence).
- Verification engine puro (`src/lib/profile/verification.ts`): `calculateIdentityConfidence`,
  `deriveIdentityStatus`, `evaluateVerification`, `profileCompleteness`. Termômetro e badge
  derivados de dados reais; badge só com prova de posse e perfil completo, sem conflito.
- Identidades externas read-only na UI; `guard_identity_verification()` impede auto-promoção
  (is_verified/identity_status/confidence_score/verification_method/verified_at/external_id/platform).
- Map pool CS2 versionado (`src/lib/cs2/maps.ts`): Cache no Active Duty desde 2026-07-08,
  Overpass fora; gráficos mostram "—" quando não há dados reais.
- Correção de UI encontrada em teste real: o `Select` do Radix espelha o valor num `select`
  nativo dentro do `<form>` e emite `""` na montagem, apagando país/plataforma/experiência
  recém-carregados. Handlers agora ignoram valor vazio; recarregar mantém os valores salvos.
- Checks: typecheck limpo, 287/287 testes, build OK, verificação end-to-end no navegador
  (salvar → reload → valores vindos do banco: nickname thg, BR, FACEIT, 1_3Y, IGL+AWPER, CLIMB_RATING primário).

## FASE 2.5 — Steam Identity Foundation (concluída)

- Steam entra como **fonte de identidade, nunca de partidas**: a Valve não publica
  histórico CS2. Codificado em `availability.ts` (`identity_only`, não coletável),
  `sourceCapabilities.ts` (só `identity: supported`) e
  `STEAM_MATCH_DATA_SUPPORTED = false`.
- OpenID 2.0 (não OAuth: a Steam não oferece servidor OAuth2 para vínculo) — nenhum
  token existe para guardar. `connection_type` ganhou o valor `openid`.
- Anti-CSRF/replay: `steam_link_attempts` guarda só o **hash** do state, TTL 10 min,
  uso único com `UPDATE ... WHERE status='pending'`; RLS com zero policies e sem GRANT
  para anon/authenticated. O state viaja dentro do `return_to`, que a Steam assina.
- Callback valida estrutura → `check_authentication` (só `is_valid:true`) → consumo.
  O SteamID64 nunca vem de query param confiável.
- Propriedade única: pré-checagem na aplicação + índices parciais únicos
  `player_connections_steam_external_uniq` / `player_identities_steam_external_uniq`
  (23505 → `STEAM_DUPLICATE_ACCOUNT`).
- Estruturas canônicas: `player_connections`, `player_identities`,
  `identity_correlation_evidence`. Nenhuma tabela Steam paralela de identidade.
- Correlação: `authenticated_link` (1.0) verifica a identidade Steam; `steam_id64`
  (0.95) cruza com FACEIT/Gamers Club promovendo no máximo a `strongly_correlated`;
  divergência grava **conflict**, nunca resolve em silêncio.
- Privacidade: SteamID64 completo só para o dono (mascarado até revelar); auditoria,
  logs, e-mails e o Admin usam sempre a forma mascarada.
- Desvincular é não destrutivo: partidas/análises/planos permanecem; revoga-se a
  confiança e cancelam-se as tentativas pendentes.
- Design system de e-mail (`src/lib/email/`): tema, componentes em tabela, layout dark,
  6 templates AUTH com placeholders do backend exportados em
  `docs/email/supabase-auth/` + avisos de segurança Steam. Renderiza, não envia.
- `.env.example` + `ENVIRONMENT.md`; `.env` no `.gitignore`. Sem chave configurada a
  integração diz `not_configured` e não desenha botão — nenhuma chave é pedida ao jogador.
- Checks: typecheck limpo, 354/354 testes, lint 0 erros, build OK, checks persistentes
  29a–29g PASS no banco.

## FASE 2.5.2C — Steam + e-mail transacional (fechamento)

- [x] Link e unlink do Steam viraram transação única (`steam_link_commit` / `steam_unlink_commit`, service_role): conexão + identidade + evidência + auditoria são atômicos.
- [x] Takeover e posse do perfil revalidados dentro do banco; índices UNIQUE seguem como última defesa.
- [x] Unlink nunca reescreve um `conflict` registrado (histórico preservado).
- [x] Consumo de state 100% atômico; vínculo de usuário vem só da linha vencedora (`STEAM_STATE_ALREADY_USED`).
- [x] Throttle de início do link atômico via `claim_steam_link_slot` (advisory lock por usuário).
- [x] Transporte real de e-mail: Hostinger Mail API (HTTPS). Nenhum caminho SMTP existe (Workers não abre TCP).
- [x] HTTP 202 = `accepted` (aceito/enfileirado), nunca "entregue"; 4xx permanente, 429/5xx transitório com `Retry-After` respeitado e limitado.
- [x] Idempotência com claim/lease no banco (`claim_email_delivery`): aceito nunca reenvia, falho pode retentar, lease vivo bloqueia concorrente, lease expirado é recuperado.
- [x] Checks permanentes 30a–30d e 17 novos testes de transporte/configuração.

## FASE 2.6.0 — hardening final da 2.5.2C

- [x] E-mail fail-closed: falha ao reservar o envio devolve `EMAIL_CLAIM_UNAVAILABLE` (retentável) em vez de seguir adiante.
- [x] Teto global de tentativas por e-mail (9) em `src/config/email.ts`; esgotado devolve `EMAIL_RETRY_BUDGET_EXHAUSTED` (não retentável).
- [x] Semântica única de corrida de state: qualquer state já usado sai como `STEAM_STATE_ALREADY_USED` (`publicSteamErrorCode`) no callback e nos server functions.
- [x] Correlação é suplementar: se a construção da evidência falhar, o vínculo de posse é mantido e o estado é registrado honestamente como `correlation_status=pending`.
- [x] Remetente das fixtures de e-mail alinhado a `hub@gamepro.academy`.

## FASE 2.6 — Canonical Match Engine (domínio)

- [x] `CANONICAL_SCHEMA_VERSION = 2` com três eixos independentes de versão (canônico, análise, contrato por fonte).
- [x] Domínio neutro: series opcional, match = um mapa jogável, observação por fonte, participantes sem `player_id`, rounds neutros vs estado por jogador, eventos preservando IDs externos.
- [x] Qualidade e cobertura por camada com motivos explícitos; NULL nunca vira ZERO.
- [x] Contrato único de adapter (`CanonicalSourceAdapter`); DEMO e FACEIT traduzidos; Gamers Club falha alto (`external_access_blocked`).
- [x] Match Identity Resolver com EXACT/PROBABLE/POSSIBLE/NO_MATCH/CONFLICT; só EXACT anexa automaticamente; prioridade de fonte não é merge.
- [x] Projeção por jogador (vitória/derrota/"meu placar") derivada, nunca gravada no match.
- [x] 37 testes novos (454 no total), typecheck limpo, lint limpo, build OK.
- [x] 2.6.2 banco (match_series/match_sources/match_participants/round_players) e 2.6.5 persistência transacional — APLICADOS e provados contra o banco real (ver 2.6.9 e 2.6.11.5).

## FASE 2.6.9 — persistência canônica: prova contra o banco real

- [x] Idempotência provada com dados de teste no banco real: a MESMA observação gravada
      duas vezes devolveu o mesmo `match_id`/`match_source_id`, `created=false` e manteve
      1 partida, 1 fonte, 4 participantes, 2 rounds, 8 estados por round, 1 evento
      (`observation_count` 1 → 2).
- [x] Precedência de fonte provada: uma observação FACEIT (nível de partida, sem rounds,
      placar 99–1, mapa nulo) convergiu para a MESMA partida pelo fingerprint e NÃO
      sobrescreveu mapa, placar, contagem de rounds nem qualidade vindos do demo;
      `canonical_source`/`round_source` seguem `demo` e a segunda fonte foi registrada.
- [x] `NULL ≠ FALSE` confirmado no banco: `survived` seguiu NULL nos 8 estados por round,
      `winning_team` NULL e `player_id` NULL (partida não pertence a um jogador).
- [x] Falha real encontrada e corrigida: um estado por round citando participante
      inexistente era aceito em silêncio (linha órfã). `persist_canonical_observation`
      agora recusa a observação inteira com `CANONICAL_PARTICIPANT_UNKNOWN` /
      `CANONICAL_ROUND_UNKNOWN`; reteste confirmou erro e ZERO linhas gravadas.
- [x] Fixtures de teste removidas do banco ao final (nenhum dado real tocado).
- [x] Fechado na FASE 2.6.11: `faceit.sync.server.ts` grava EXCLUSIVAMENTE por
      `persistFaceitObservation()` (adapter + resolver + persistência transacional);
      concorrência real e RLS negativa provadas na FASE 2.6.11.5.


## FASE 2.6.11.2 — erro de runtime do painel administrativo

- [x] Causa: o menu lateral consultava a sessão administrativa em TODAS as páginas
      autenticadas. Para um jogador comum a resposta era uma recusa (`ADMIN_FORBIDDEN`)
      e, quando ainda não havia sessão no navegador, `Unauthorized: No authorization
      header provided` — dois erros visíveis no console em uso perfeitamente normal.
- [x] Correção: novo `getAdminSessionProbe()` (mesma verificação no servidor) devolve
      `null` para quem não é administrador e só falha em problema de infraestrutura;
      o hook só consulta quando existe sessão no navegador. O portão de `/admin`
      continua usando `getAdminSession()` estrito.
- [x] Prova em navegador real, sessão de jogador: `/login`, `/register`,
      `/reset-password`, `/dashboard`, `/matches`, `/profile`, `/upload` sem erros de
      `ADMIN_FORBIDDEN`/`Unauthorized`; `/admin` redireciona para `/dashboard`;
      recarregar `/dashboard` mantém a sessão.
- [x] Privilégios mínimos reconfirmados: tabelas canônicas só com leitura para usuário
      autenticado, zero acesso anônimo; rotinas de persistência canônica apenas
      `service_role`, SECURITY DEFINER com `search_path=''`.
- [x] O aviso de desenvolvimento do React em `/dashboard` foi eliminado na FASE 2.6.11.5:
      os portões de `/_authenticated` e `/admin` decidem em `beforeLoad` e navegam de
      forma declarativa (`<Navigate replace />`), sem atualizar estado durante o render.


## FASE 2.6.11.3 — Production cross-source identity closure

- [x] **Bloqueio P0 encontrado — descoberta de candidatos dependia do jogador.**
      `loadCandidates()` filtrava `matches.player_id = playerId`. Uma partida canônica
      NÃO pertence a um jogador (provado no banco: `player_id IS NULL`), portanto a
      descoberta ficava cega. Agora é neutra: encontra candidatos pelos participantes
      provados no Identity Graph (`match_participants.steam_id64`) e pela janela
      competitiva, nunca pelo dono.
- [x] **Bloqueio P0 encontrado — nenhuma evidência EXACT legítima entre fontes.**
      O demo tem fingerprint, a FACEIT não, e os ids externos das duas fontes não se
      relacionam: na prática nunca haveria convergência real. Regra nova e determinística:
      roster COMPLETO e IDÊNTICO de dez contas provadas pelo Identity Graph, mesmo mapa,
      mesma janela competitiva e sem placar contraditório ⇒ `EXACT_MATCH`
      (`cross_source_roster_identical`). Nada mais foi enfraquecido: parcial continua
      `PROBABLE`/`POSSIBLE`, contradição continua `CONFLICT`, e só EXACT anexa.
      Nenhum fingerprint é copiado, nenhum SteamID64 é inventado.
- [x] **Bloqueio P0 encontrado — erro técnico virava "identidade inexistente".**
      As consultas ao Identity Graph ignoravam `error`. Agora falha de banco/permissão
      levanta `FaceitIdentityResolutionError` (IDENTITY_RESOLUTION_ERROR) e a ausência
      real devolve `IDENTITY_UNRESOLVED` — estados distintos para quem chama.
- [x] Prova no banco real (fixtures isoladas, removidas ao final, zero dado real tocado):
      demo persistida (1 partida, 1 round, 2 eventos); FACEIT anexada ⇒ MESMA partida;
      6 repetições ⇒ 1 partida, 1 observação FACEIT, `observation_count = 7`, 10
      participantes sem duplicação; caso negativo (placar contraditório) ⇒ partida
      separada; anexo a partida inexistente ⇒ `CANONICAL_ATTACH_TARGET_NOT_FOUND` com
      ZERO sobras (rollback).
- [x] RLS reprovada em sessão simulada por papel: participante vê a partida; usuário
      autenticado não participante não vê partida, participantes nem observações;
      `admin_master` vê por política explícita `is_staff`; anônimo sem acesso;
      `INSERT` direto em `matches` negado; `EXECUTE` da rotina de persistência negado
      para `authenticated`. Rotinas canônicas: SECURITY DEFINER, `search_path=''`,
      EXECUTE só para `postgres`/`service_role`.
- [x] Runtime em navegador real: visitante em `/`, `/login`, `/register`,
      `/reset-password` sem erros; jogador em `/dashboard`, `/matches`, `/profile`,
      `/upload` sem erros; `/admin` redireciona para `/dashboard`.
- [x] Suíte: 461 → 480 testes, typecheck, lint e build OK. Novo teste
      `production-cross-source-identity-closure.test.ts` percorre as funções de produção
      (roster FACEIT → Identity Graph → descoberta de candidatos → resolvedor → anexo).
- [x] **Concorrência real PROVADA** (limitação anterior removida): `scripts/canonical-proof.ts`
      dispara SEIS gravações PARALELAS (`Promise.all`) da MESMA observação pelo caminho de
      produção (`persistCanonicalObservation` → `persist_canonical_observation_attached`).
      Resultado verificado no banco: 6/6 concluídas, 1 partida canônica, 1 linha de
      observação (`observation_count = 6`), roster com 10 participantes, zero duplicação.
- [x] **Prova canônica reexecutável e versionada:** `bun scripts/canonical-proof.ts` cria as
      fixtures, executa o caminho de produção contra o banco real e imprime PASS/FAIL por
      gate (observação demo, partida sem dono, `NULL ≠ FALSE`, convergência entre fontes,
      preservação de rounds da fonte forte, idempotência, rollback atômico do anexo,
      não-fusão de partida contraditória, concorrência paralela, leitura anônima negada,
      escrita negada ao usuário autenticado quando há token) e remove tudo ao final,
      confirmando zero sobras. Execução atual: 12 PASS / 0 FAIL / 1 SKIPPED
      (gate de usuário autenticado exige `PROOF_USER_ACCESS_TOKEN`).
- [x] **Aviso de hidratação eliminado:** o portão autenticado (`ssr: false`) não troca mais a
      rota durante a hidratação — decide em `beforeLoad`, renderiza nada e navega para
      `/login` após a primeira pintura. Console de visitante em rota protegida agora limpo;
      jogador autenticado continua entrando direto no `/dashboard`.

## FASE 2.6.11.4 — Prova final no banco real e fechamento da convergência temporal

- [x] **Semântica temporal corrigida.** `match_date` da FACEIT é `finished_at ?? started_at`:
      podia ser o FIM da partida sendo comparado com o INÍCIO do demo. Agora a identidade
      usa timestamps canônicos (`canonicalStartTimestamp`/`canonicalEndTimestamp`): quando
      só existe o instante final, o início é `null` — nunca inventado — e a convergência
      compara início com início.
- [x] **Ambiguidade nunca vira anexo arbitrário.** Dois candidatos EXACT ⇒ `CONFLICT` com
      `ambiguous_multiple_exact_candidates` e `candidate = null`.
- [x] **Prova reexecutável** em `scripts/canonical-proof.ts` (24 gates), sempre pelo caminho
      de produção, com fixtures próprias e limpeza verificada ao final.
- [x] **Concorrência real**: 6 escritores simultâneos da mesma observação ⇒ 1 partida
      canônica, 1 observação por fonte, roster sem duplicação, zero `match_sources` órfão.
      Introspecção de PIDs das sessões continua NÃO PROVADA (sem `dblink`/RPC privilegiada).
- [x] **RLS com sessão autêntica**: dono lê a própria partida (1 linha); autenticado não
      participante lê 0 linhas; anônimo recebe `permission denied`; escrita e execução da
      rotina negadas ao aplicativo.
- [x] **Runtime**: visitante e jogador validados em navegador headless, sem erros de console
      nem de hidratação; `/admin` redireciona não-admin para `/dashboard`.
- [x] 490/490 testes, typecheck limpo, lint sem erros, build OK.
- [x] Relatório: `docs/PHASE-2.6.11.4-FINAL-DATABASE-PROOF.md`.

## FASE 2.6.11.5 — Prova E2E do pipeline FACEIT real e fechamento

- [x] **Prova reexecutável no banco real** (`bun scripts/faceit-pipeline-proof.ts`, 19 gates)
      pelo caminho de produção (`persistFaceitObservation`), com contas e identidades reais,
      sem `fakeDb`, sem fingerprint/SteamID inventado e com limpeza verificada.
      Resultado: PASS=18, FAIL=0, BLOCKED=0, NOT_PROVEN=1.
- [x] **Convergência DEMO↔FACEIT** provada sem fingerprint e sem id externo compartilhado:
      1 partida canônica, 2 observações, 10 participantes vindos só do Identity Graph.
- [x] **Negativas provadas**: partida parecida mas diferente não converge; identidade
      irresolúvel bloqueia; falha de consulta é `IDENTITY_RESOLUTION_ERROR` (≠ ausência);
      dois candidatos EXACT ⇒ `CONFLICT`; attach a alvo inexistente faz rollback total.
- [x] **Descoberta neutra por jogador** provada: o alvo tinha `player_id = NULL` quando foi
      encontrado; `matches.player_id` é projeção por jogador, nunca sinal de identidade.
- [x] **Runtime corrigido**: gate autenticado e gate administrativo agora navegam de forma
      declarativa (`<Navigate>`), decidindo ainda fail-closed em `beforeLoad`. Fim do
      `Unauthorized: No authorization header provided`, do `ADMIN_FORBIDDEN` exibido como
      erro, do mismatch de hidratação em `/admin` e do aviso de update em componente
      desmontado. Navegador headless: zero erros deslogado e logado.
- [x] **Teste mock renomeado** para `unit-mock-cross-source-identity-closure.test.ts`, sem
      afirmar ser prova de produção.
- [x] 490/490 testes, typecheck limpo, lint sem erros, build OK, linter de banco sem
      achado novo.
- [ ] NOT_PROVEN: introspecção de PIDs do PostgreSQL (limitação do ambiente). Invariante
      garantida por lock advisory em transação + unicidade `match_sources(source, external_match_id)`.
- [x] Relatório: `docs/PHASE-2.6.11.5-FINAL-FACEIT-PRODUCTION-E2E-CLOSURE.md`.

## FASE 2.6.11.5A — Integridade das evidências e reconciliação do roadmap

- [x] **Gates frágeis reforçados** em `scripts/faceit-pipeline-proof.ts`:
      - gate 06 agora prova a convergência pelo conteúdo das observações (fingerprint
        FACEIT nulo, fingerprint do demo igual à fixture, ids externos distintos), e não
        apenas pela contagem de linhas;
      - gate 09 encadeia as asserções: exatamente 10 SteamIDs distintos gravados, cada um
        presente nas identidades resolvidas pelo Identity Graph e cada id externo FACEIT
        contabilizado no pareamento;
      - gate de limpeza verifica participantes, séries, conexões, perfis, identidades e
        observações — nenhuma linha órfã sobrevive à execução.
      Reexecução: PASS=18, FAIL=0, BLOCKED=0, NOT_PROVEN=1 (introspecção de PIDs do
      PostgreSQL, limitação do ambiente).
- [x] **Deficiência real de banco encontrada e corrigida**: o check permanente
      "23. all foreign keys have a supporting index" estava FAIL. Sete chaves
      estrangeiras não tinham índice de apoio (`gamers_club_profile_snapshots`,
      `gamers_club_sync_jobs`, `steam_link_attempts`, `match_sources` ×2,
      `round_players` ×2). Índices criados; nenhuma política, grant ou estrutura mudou.
- [x] **Suíte de segurança permanente 100% PASS**: 67/67 (63 via `psql`; os 4 checks
      `26a–26d` exigem execução privilegiada da função-guarda e foram provados pelo
      runner privilegiado — a própria negação de EXECUTE ao aplicativo é o check `25f`).
- [x] **Contradições do roadmap eliminadas**: 2.6.2/2.6.5 marcados como aplicados,
      pendência do `faceit.sync.server.ts` fechada (grava só por `persistFaceitObservation`),
      aviso de render do React marcado como resolvido, Gamers Club registrado como
      bloqueio externo definitivo.
- [x] **README reconciliado** com o estado real: Steam é fonte de identidade (Valve não
      publica histórico de CS2), FACEIT e Canonical Match Engine reais, Pro Score/DNA/
      diagnóstico/Coach/treino ainda mock sob `DEMO_DATA`, Gamers Club indisponível.
- [x] **Runtime revalidado** em navegador headless: deslogado (`/`, `/login`, `/register`,
      `/reset-password`, `/dashboard`, `/admin`) e logado como jogador (`/dashboard`,
      `/matches`, `/profile`, `/upload`, `/training`, `/admin` → `/dashboard`) — zero erros
      de console e zero erros de página nos dois cenários.
- [x] 490/490 testes, typecheck limpo, `eslint` sem erros (8 warnings preexistentes de
      react-refresh), build OK, linter de banco sem achado novo (14 conhecidos e
      justificados).

### Veredito

**FASE 2.6.11.5A — CLOSED. READY FOR PHASE 2.7.**

## FASE 2.7 — Real demo ingestion + canonical analytics foundation (EM ANDAMENTO)

Objetivo: `.dem` real → upload → job → parser real → normalização → identidade →
observação canônica → resolver → persistência transacional → métricas → features →
data quality. Fora de escopo: Pro Score, DNA, Diagnosis, AI Coach, Training.

- [x] **Dupla persistência do demo eliminada (GATE 28)**: a rotina canônica
      transacional roda primeiro e é a única escritora de fatos canônicos;
      `persistDemoProjection()` grava apenas a projeção por jogador
      (`matches` conveniência, `match_metrics`, `match_features`). Fim do risco de
      segunda linha de partida quando o demo converge com FACEIT.
- [x] **Auditoria semântica das features (GATE 20)**: catálogo
      `src/lib/pipeline/features.catalog.ts` com fórmula, unidade, intervalo,
      direção, significado, comportamento nulo, amostra e impacto na confiança.
      Inversões corrigidas: `early_death_rate`, `untraded_death_rate`,
      `damage_taken_per_round`; complementos passam a ter nome próprio
      (`early_death_avoidance`, `early_death_free_rate`).
- [x] **NULL nunca virá 0**: denominador zero devolve `null` em todas as razões
      (o antigo `Math.max(x, 1)` mascarava ausência de amostra como zero).
- [x] **Taxonomia de erros**: `DEMO_EMPTY`, `IDENTITY_RESOLUTION_ERROR`,
      `CANONICAL_RESOLUTION_CONFLICT`, `CANONICAL_PERSISTENCE_ERROR`,
      `METRICS_ERROR`, `FEATURES_ERROR`, `JOB_TIMEOUT`, `JOB_STALE`,
      `RESOURCE_LIMIT`, `STORAGE_ERROR` — com mensagens nos cinco idiomas.
- [x] **Limites e versões**: `PARSER_MAX_DURATION_MS`, `MAX_PARSER_PAYLOAD_BYTES`,
      `METRICS_VERSION`, `FEATURES_VERSION` (gravados na metadata da observação e
      em `matches.demo_metadata` para linhagem).
- [x] 500/500 testes, typecheck limpo, lint sem erros, build OK. Nenhuma
      migration, política, grant ou rotina de banco alterada.
- [ ] **BLOCKED (P1) — parser real não provisionado**: ler `.dem` de CS2 exige
      parser nativo e CPU longa, impossível no runtime edge da aplicação. O
      contrato do worker externo existe, mas `DEMO_PARSER_URL` e
      `DEMO_PARSER_TOKEN` não estão cadastrados; sem eles o job falha com
      `PARSER_UNAVAILABLE`. GATES 02, 03 e os gates que exigem arquivo real
      (01 completo, 05 parcial, 08, 14–19 sobre demo, 22–24 do caminho demo)
      permanecem BLOCKED / NOT_PROVEN — nunca PASS.
- [ ] Pendência de infraestrutura: agendamento externo de `/api/public/pipeline-cron`.
- [x] **Hardening P1–P2 (rodada 2)**: resolver canônico ligado ao caminho demo
      (descoberta neutra + `canConvergeCrossSource`), fingerprint separado da
      identidade canônica, attach de demo sem `external_match_id`, flags de bomba
      `boolean | null`, métricas quality-aware, tickrate nunca assumido, clutch por
      participação comprovada, resposta do parser limitada por `Content-Length` e
      stream, SHA-256 incremental no cliente, política de demo curta
      (`DEMO_INSUFFICIENT_SAMPLE`), deadline absoluto do job
      (`JOB_DEADLINE_EXCEEDED`) e single writer preservado. 515/515 testes.
- [x] **FASE 2.7.1 — attach de demo corrigido (rodada 3)**: migration aplicada —
      `canonical_attach_source()` aceita `external_match_id` **ou** `fingerprint`
      (os dois ausentes continuam inválidos), reserva com chave determinística e
      advisory lock, nunca reaponta uma observação já anexada, e
      `persist_canonical_observation_attached()` mantém attach + persistência na
      mesma transação. FACEIT inalterado. Provado contra o banco real em transação
      abortada: fingerprint attach, idempotência, `CANONICAL_ATTACH_CONFLICT`,
      `CANONICAL_ATTACH_INVALID` e caminho FACEIT.
- [x] **Isolamento da projeção**: campos player-scoped só são escritos quando a
      projeção não tem dono ou pertence ao mesmo jogador (`projectionUpdate()`).
- [x] **Utility zero corrigido**: disponibilidade vem da classe de evidência
      (`availability.utilityEvents`), não dos contadores do jogador — zero
      observado é `0`, ausência de evidência é `null`.
- [x] Testes: `hardening271.test.ts` (A–O, assertions concretas) + H8/H9
      reforçados. 539/539 testes, typecheck (tsgo), lint e build OK.
- [ ] **NOT PROVEN**: atomicidade attach+persistência verificada estruturalmente,
      não provada em runtime; concorrência real de attach não provada neste
      ambiente.
- [x] Documento da fase: `docs/PHASE-2.7-REAL-DEMO-INGESTION-AND-CANONICAL-ANALYTICS.md`.

**FASE 2.7 — IN PROGRESS / HARDENING CORRECTIONS COMPLETED.** Não fechada: parser
real ainda não provisionado, nenhum `.dem` real ingerido, FASE 2.8 não iniciada.
Próximo passo: FASE 2.7.2 — provisionamento do parser worker.
