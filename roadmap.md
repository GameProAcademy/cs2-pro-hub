# Roadmap

## Recuperação do Preview + player_blind RAW Evidence — CONCLUÍDA

- [x] Confirmar que o preview interno executa o commit esperado e que os erros Hero/Home vêm de uma instância antiga.
- [x] Preservar integralmente Lovable Cloud, Auth, Storage, banco e variáveis gerenciadas.
- [x] Incluir `player_blind` na allowlist única de eventos do RAW Evidence.
- [x] Validar worker, APP, build e rotas internas `/login`, `/admin` e `/dashboard`.
- [x] Registrar o 401 externo separadamente, sem alterar a aplicação para contorná-lo.

## FASE 2.7.2B — RAW Demo Evidence & Full Coverage — IMPLEMENTED / NOT CLOSED

- [x] Conexão oficial do Supabase/Lovable Cloud preservada e cliente fail-closed, sem fallback ou banco alternativo.
- [x] Histórico real de demos em `/analysis`, derivado de `uploads`, `demo_jobs` e `matches` sob RLS do utilizador.
- [x] Aba administrativa `Demos`, separada da visão técnica de uploads e protegida pela autorização existente.
- [x] Inventário integral de eventos separado da allowlist de extração; amostragem determinística limitada a 4096 ticks.
- [x] Estados explícitos de capacidade, `partial_parse` derivado de falhas reais e mapeamentos RAW-only justificados.
- [x] Evidência RAW permanece separada do Canonical Engine, preservando `NULL/UNKNOWN` e sem fabricar entidades.
- [ ] E2E real completo com uma demo privada válida (BLOCKED: arquivo `.dem` não disponível no ambiente).
- [ ] Fechamento da fase após aprovação de todos os gates reais; FASE 2.8 não iniciada.

## FASE UX — Processamento de demo com progresso e etapas (concluída)

- [x] Progresso visual estimado derivado exclusivamente do stage real, com faixas determinísticas, monotonicidade e teto por etapa.
- [x] Painel premium com etapa atual, etapas concluídas/futuras, mensagens amigáveis e estados de conclusão/falha.
- [x] Polling existente de 4 segundos preservado, sem consulta paralela ou mudança no backend.
- [x] Acessibilidade da barra e anúncios de mudança de etapa; animações respeitam redução de movimento.
- [x] Novas mensagens disponíveis em pt-BR, pt-PT, inglês, espanhol e francês.
- [x] Testes de mapeamento, fallback, monotonicidade, falha, traduções, acessibilidade e polling.

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

- [x] **Gates frágeis reforçados** em `scripts/faceit-pipeline-proof.ts`: - gate 06 agora prova a convergência pelo conteúdo das observações (fingerprint
      FACEIT nulo, fingerprint do demo igual à fixture, ids externos distintos), e não
      apenas pela contagem de linhas; - gate 09 encadeia as asserções: exatamente 10 SteamIDs distintos gravados, cada um
      presente nas identidades resolvidas pelo Identity Graph e cada id externo FACEIT
      contabilizado no pareamento; - gate de limpeza verifica participantes, séries, conexões, perfis, identidades e
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
- [x] **Worker externo configurado no app**: o parser nativo permanece fora do
      runtime edge; URL HTTPS e token server-only foram cadastrados no Gate 1D.
      A conectividade e o processamento de `.dem` real seguem NOT PROVEN.
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

**FASE 2.7 — IN PROGRESS / HARDENING CORRECTIONS COMPLETED.** Não fechada: nenhum
`.dem` real ingerido, FASE 2.8 não iniciada. Próximo passo: E2E real do worker.

- [x] **FASE 2.7.1 — métricas quality-aware (rodada 4)**: classe de evidência
      definida uma única vez em `src/lib/pipeline/evidence.ts` (normalizer e
      `metricsAvailability()` compartilham a mesma lista, agora com `smoke` e
      `incendiary`); todos os sinais derivados em `extractFeatures()` passam por
      gate de disponibilidade — ausência de evidência é `NULL`, zero observado é
      `0`, denominador ausente é `NULL`; `sample_rounds` e `early_window_seconds`
      permanecem fatos sem gate.
- [x] **Identidade do parser configurável**: `expectedParserIdentity()` lê
      `DEMO_PARSER_EXPECTED_NAME` / `_VERSION` / `_REVISION` dentro da função, com
      fallback para `src/config/pipeline.ts`; revisão esperada, quando definida, é
      exigida. Compatibilidade major/minor não prova compatibilidade com build do
      CS2 (matriz fica para a 2.7.2).
- [x] Testes: `quality271.test.ts` (28 testes) — matriz NULL vs ZERO, coerência
      `missing_utility` ↔ `availability.utilityEvents`, matemática de tickrate,
      clutch por participação e contrato do parser. 567/567 testes, typecheck
      (tsgo), lint e build OK.
- [ ] **FASE 2.7.2 (pré-requisitos)**: worker HTTPS de parser
      (`DEMO_PARSER_URL`/`DEMO_PARSER_TOKEN`), identidade/revisão esperada
      configuradas, matriz de compatibilidade por build do CS2 e prova E2E com
      `.dem` real.

## FASE 2.7.1C

- [x] Rating (source/CT/T) exige kill + damage + cobertura completa; fórmula inalterada
- [x] KAST exige cobertura completa
- [x] Abertura só sobre rounds determináveis; instante desconhecido ≠ instante tardio; amostra NULL quando indeterminável
- [x] `completeCoverage` na matriz de disponibilidade (parse parcial nunca é cobertura completa)
- [x] Projeção do demo em UMA transação (`persist_demo_projection`, service_role only) — rollback real NÃO provado em runtime (nenhuma partida canônica no banco)
- [x] Deadline global desde a entrada do job, checado antes de storage, hash, signed URL, parser, persistência e projeção
- [ ] Parser real `.dem` (worker configurado; E2E ainda NOT PROVEN)
- [ ] FASE 2.8 não iniciada

## FASE 2.7.1D

- [x] `survival_rate` exige round-end evidence em TODOS os rounds do denominador (`metrics.survivalRounds`); cobertura incompleta = NULL, nunca parcial nem 0
- [x] `roundHasEndEvidence()` como definição única, reutilizada por `playerSurvivedRound()`
- [x] Parse parcial: taxas com denominador de rounds ficam NULL; contadores observados e razões sobre contagens observadas permanecem
- [x] Registro histórico: a versão era placeholder nessa rodada; o Gate 1D depois confirmou `0.42.0`. Contrato inalterado.
- [x] `quality271d.test.ts` (fixtures sintéticas). 587/587 testes, tsgo e lint OK

## FASE 2.7.1E

- [x] `src/lib/pipeline/roundEvidence.ts`: a ÚNICA definição de round-end evidence
      (`winnerSide` | `winnerTeam` | `endTick` | `durationSeconds`, presença por `!= null`).
- [x] Normalizer (`roundsValid`), metrics availability, `playerSurvivedRound()` e denominador
      passam a usar o mesmo helper; `roundHasEndEvidence()` virou re-export delegante.
- [x] `survivalRounds` conta apenas rounds participados com sobrevivência DETERMINÁVEL;
      indeterminável é excluído e nunca vira sobrevivência — denominador `NULL`, nunca `0`.
- [x] `features.catalog.ts` sincronizado: `denominator` + `roundDenominated` por feature,
      `survival_rate` documentada contra `survivalRounds`.
- [x] `quality271e.test.ts` (21 testes sintéticos). Rodada: 608/608 testes, tsgo e lint OK.
- [ ] FASE 2.7 permanece IN PROGRESS — parser real `.dem` e E2E real NÃO provados
- [ ] FASE 2.7.2 (próxima): matriz de compatibilidade CS2 e E2E real
- [ ] FASE 2.8 não iniciada

### FASE 2.7.1F — FINAL SEMANTIC CONTRACT CLEANUP — CLOSED

- `survivalRounds` documentado como denominador de determinabilidade (não `roundsPlayed`).
- `roundDenominated` = denominador derivado do conjunto de rounds (inclui `survivalRounds`).
- Fórmulas do catálogo sincronizadas com `features.ts`, com o clamp `[0,1]` explícito.
- Identidade do parser separada: nome / versão / revisão / versão de contrato (a versão foi confirmada no Gate 1D posterior).
- 23 novos testes numéricos de contrato (`quality271f.test.ts`).
- Verificação: 631/631 testes, `tsgo` OK, lint 0 erros (8 warnings preexistentes), build OK.
- FASE 2.7.1: **CLOSED**. FASE 2.7: **IN PROGRESS** (parser real e E2E `.dem` NOT PROVEN).
- FASE 2.7.2: próxima. FASE 2.8: não iniciada.

### FASE 2.7.2 — GATE 0 PASS / PARSER REAL BLOQUEADO

- [x] GATE 0 (auditoria de fechamento da 2.7.1F): 8 commits no escopo, sem regressão;
      round evidence PASS, survival PASS, NULL≠ZERO PASS, partial parse PASS,
      parser identity PASS; catálogo PASS nas features com prova numérica e
      NOT PROVEN nas demais (dívida de cobertura, sem divergência de comportamento).
- [x] Rodada de verificação: 631/631 testes.
- [ ] GATES posteriores (revision pinada, matriz CS2, E2E `.dem`, idempotência):
      **NOT PROVEN** — o worker foi configurado no Gate 1D, sem executar demo real.
- [ ] FASE 2.7 permanece IN PROGRESS. FASE 2.8 não iniciada.

### FASE 2.7.2 — GATE 1D

- [x] Upload grande migrado do envio padrão para TUS retomável, em chunks de 6 MiB,
      direto do browser ao bucket privado `demos`, preservando o path
      `{user_id}/{upload_id}.dem`, sessão do usuário, RLS e SHA-256 antes/depois.
- [x] Job continua sendo enfileirado somente após a conclusão inequívoca do TUS;
      falha ou cancelamento não enfileiram processamento; duplicata processada não
      reenvia o arquivo.
- [x] Parser esperado atualizado para `demoparser2 0.42.0`, contrato 1; revision
      permanece configurável e não foi inventada.
- [x] URL/identidade e `DEMO_PARSER_TOKEN` configurados server-only; revision real
      continua **CONFIGURATION REQUIRED**. O domínio informado respondeu 404 na
      verificação pública, portanto conectividade do worker está **NOT PROVEN**.
- [ ] E2E real e parse de `.dem` real: **NOT PROVEN**, reservados ao próximo Gate.
- **Estado do Gate 1D: BLOCKED** para fechamento total: implementação e testes
  locais passaram, mas revision e conectividade efetiva do domínio não foram
  comprovadas; nenhuma demo real foi processada por determinação deste Gate.

### FASE 2.7.2 — GATE 1E — CONTRATO APP ↔ WORKER

- [x] `src/lib/pipeline/parser/parserEndpoint.ts` como fonte única: `DEMO_PARSER_URL`
      exige HTTPS e o caminho completo `/v1/parse`, sem concatenação; `/health` e
      `/version` derivados da mesma origem apenas para diagnóstico.
- [x] Requisição alinhada ao worker: `contract_version`, `upload_id`, `demo_url`,
      `demo_sha256`, `file_size`; token só no header `Authorization`, nunca em URL,
      corpo ou log.
- [x] Envelope FastAPI `detail.error_code` lido corretamente, com compatibilidade
      para o formato plano.
- [x] Matriz única de classificação (HTTP + `error_code`), com códigos novos
      `PARSER_CONFIG_ERROR`, `PARSER_UNAUTHORIZED`, `PARSER_FORBIDDEN`,
      `PARSER_CONTRACT_MISMATCH`, `PARSER_INVALID_RESPONSE`, `PARSER_DOWNLOAD_ERROR`,
      `PARSER_HASH_MISMATCH`, `PARSER_FILE_SIZE_MISMATCH`; `mapParserErrorCode()`
      delega à mesma matriz. Falha de transporte nunca vira demo inválida.
- [x] Diagnóstico master-only `getAdminParserWorkerStatus` (`/health` + `/version`),
      fora do caminho de parsing, sem expor token nem URL assinada.
- [x] Mensagens dos novos códigos traduzidas em pt-BR, pt-PT, en, es, fr.
- [x] 42 testes em `src/lib/pipeline/__tests__/gate1e.test.ts`; suíte total 681/681,
      typecheck limpo, lint sem erros (8 warnings preexistentes).
- [ ] Verificação externa do worker: **BLOCKED**. `/health` e `/version` em
      `https://cs2-demo-parser-production.up.railway.app` respondem
      `HTTP 404 {"status":"error","code":404,"message":"Application not found"}`.
      Revision do deployment e E2E real com `.dem`: **NOT PROVEN**.
- **Estado do Gate 1E: BLOCKED** — lado app completo e provado; lado worker
  inacessível. FASE 2.8 não iniciada.

## FASE 2.7.2 — GATE 1E.1 — WORKER CONTRACT SYNC + REVISION LOCK — BLOCKED

- [x] `WORKER_ERROR_CODES` declara o protocolo oficial do worker num único lugar
- [x] `classifyWorkerFailure()` cobre todos os códigos oficiais (matriz única)
- [x] `mapParserErrorCode()` continua delegando (nenhum segundo switch)
- [x] `PARSER_IDENTITY_MISMATCH` (permanente) para name/version/revision divergentes
- [x] `assertParserIdentity()` usado por `/v1/parse` e pelo probe `/version`
- [x] revision lock fail-closed; obrigatório em produção (`DEMO_PARSER_REVISION_REQUIRED`)
- [x] revision vazia tratada como ausente, nunca inventada
- [x] integridade (hash/size) e transporte nunca viram "demo inválida"
- [x] testes: `gate1e1.test.ts` + suíte existente preservada
- [x] `PAYLOAD_TOO_LARGE` do worker → `PARSER_PAYLOAD_TOO_LARGE` (regra específica do app)
- [x] worker `services/cs2-demo-parser` no repositório: FastAPI, envelope único,
      taxonomia alinhada, download seguro, `/health`, `/version`
- [x] worker: fallback `pypi-0.42.0` removido; produção exige `PARSER_REVISION`
      imutável e falha closed; fora de produção usa `dev:unpinned` explícito
- [x] worker: suíte pytest (auth, contract, hash, size, download, parser error,
      timeout, health, version, revision, no-leak)
- [ ] deployment Railway alinhado, `/health` e `/version` 200, revision real pinada
      (BLOCKED: serviço responde HTTP 404 `Application not found`;
      `DEMO_PARSER_EXPECTED_REVISION` ainda não configurável)

## FASE 2.7.2 — GATE 02 — PRIMEIRO E2E `.dem` REAL — BLOCKED

- [x] Preflight real: endpoint HTTPS completo `/v1/parse`; `/health` 200;
      `/version` 200 com `demoparser2 0.42.0`, contrato 1 e revision
      `git:c1a87f68ccf84e99b3a8ae07133b4a686669d814`.
- [x] APP pinado à mesma revision imutável; token permanece server-side e não foi
      exibido. `DEMO_PARSER_EXPECTED_REVISION` está ausente no ambiente, portanto
      o fallback imutável do código continua sendo a expectativa efetiva.
- [x] Job agora reutiliza o probe oficial antes de criar a signed URL e antes do
      POST `/v1/parse`; falha de saúde/identidade/contrato bloqueia o parse.
- [x] Bucket `demos` confirmado privado; policy `demos_update_own` adicionada para
      permitir continuação TUS apenas na pasta autenticada e somente em `.dem`.
- [ ] Demo `.dem` real: **BLOCKED — nenhum artefato real foi fornecido nos uploads**.
- [ ] TUS, Storage, job, Worker POST, RawParserOutput, validação semântica,
      CanonicalMatch, persistência, projeção e idempotência reais: **NOT EXECUTED**.
- **Estado do Gate 02: BLOCKED**, não PASS. Retomar exclusivamente quando uma demo
  real completa (mínimo 8 rounds e contendo o Steam ID vinculado do usuário de
  real completa (mínimo 8 rounds e contendo o Steam ID vinculado do usuário de
  teste) for fornecida ao upload oficial em `/upload`.

## FASE 2.7.2 — WORKER ADAPTER → RawParserOutput — DONE (Gate 02 segue BLOCKED)

- [x] `services/cs2-demo-parser/adapter.py`: camada única de tradução
      demoparser2 → contrato do APP (`normalize_header/players/rounds/events`,
      `resolve_event_round`, posições).
- [x] Eventos finais planos (`{type, round, ...}`); o aninhamento `{type, data}`
      foi eliminado. `steamid` → `steam_id`, com validação de Steam ID.
- [x] Rounds derivados de ticks reais de `round_start`/`round_end`, `number`
      inteiro positivo, `duration_seconds` apenas com tickrate real.
- [x] Round de cada evento resolvido por janela de ticks determinística; eventos
      sem round são omitidos e contabilizados em warning (`round = 0` nunca).
- [x] NULL ≠ FALSE preservado: stream ilegível fica ausente, stream lido sem
      ocorrência vira `false`; economia ausente é omitida com warning.
- [x] `player_hurt` e `bomb_exploded` incluídos (damage e bomba) sem inventar
      dados; `players_flashed` documentado como indisponível.
- [x] Container non-root (`parser`, UID 10001, `TMPDIR=/tmp/parser`).
- [x] `__pycache__`/`*.pyc` removidos do versionamento e bloqueados no
      `.gitignore`; fixtures `.dem` ignoradas.
- [x] Testes: adapter (players/header/rounds/eventos/round resolution/posições/
      NULL semantics/determinismo) + contrato completo do `RawParserOutput`.
      Worker 78 passed / 3 skipped; APP 716 passed; tipos, lint e build OK.
- [ ] `tests/test_real_demo.py` pronto porém **SKIPPED**: nenhuma demo `.dem`
      real disponível. **Gate 02 permanece BLOCKED.**

## FASE 2.7.2 — UX de demos incompletas / corrompidas

- [x] `CORRUPTED_DEMO` continua **permanente**: o job falha, sem retry
      automático e sem `CanonicalMatch`, projeção, métricas ou features
      (o erro é lançado antes de qualquer persistência canônica).
- [x] Retry server-side (`retryMyDemoJob`) recusa re-enfileirar qualquer job cuja
      falha seja permanente (`JOB_NOT_RETRYABLE`).
- [x] UI: estado dedicado de FALHA com título "Não conseguimos analisar esta
      demo", orientação para reenviar a demo original/completa e CTA
      "Enviar outra demo" que devolve o usuário ao fluxo de upload.
- [x] Botão "Tentar novamente" oculto para falhas permanentes; aviso de extração
      parcial nunca aparece em job falhado (PROCESSANDO → FALHOU).
- [x] Nenhum detalhe técnico exposto (código, parser, hash, Storage, stack).
- [x] Matriz de erros preservada por categoria (formato, corrompida, não
      suportada, timeout, indisponível, interno, integridade).
- [x] Testes: `src/lib/pipeline/__tests__/corrupted272.test.ts`; APP 723 passed,
      tipos, lint e build OK.

## FASE 2.7.2 — GATE 02-A — HARDENING COMPORTAMENTAL (DONE; GATE 02 REAL E2E segue BLOCKED)

- Novo teste runtime `src/lib/pipeline/__tests__/corrupted272.runtime.test.ts`: executa o
  `processJob()` REAL com apenas banco, storage e parser mockados. Prova por execução que
  `CORRUPTED_DEMO` (HTTP 422 do worker) aborta antes de normalização, métricas, features,
  bundle/resolver canônico, `persistCanonicalObservation()` e `persistDemoProjection()`.
- Prova de estado: job `status=failed`, `stage=failed`, `error_code=CORRUPTED_DEMO`, sem requeue
  automático mesmo com retries disponíveis; upload `failed` e nunca `processed`.
- Prova de ausência de parcial: nenhum update carrega `partial_parse`, `match_id`, `quality_flags`
  ou valor `partial`.
- Idempotência: job já `failed` com `CORRUPTED_DEMO` não inicia novo parse; `PARSER_TIMEOUT`
  (transitório) continua sendo reenfileirado — taxonomy preservada.
- `corrupted272.test.ts` (classificação 422 → permanente) mantido intacto.
- Auditoria SCHEMA_VERSION: mantido `1`. É a versão da camada de ingestão de demo
  (`demo_jobs.schema_version`/`uploads.schema_version`), eixo distinto de
  `CANONICAL_SCHEMA_VERSION = 2` (`canonical_schema_version`, DEFAULT 2 nas migrations).
  Nenhuma migration alterou a forma dessas linhas de ingestão. Documentado em `src/config/pipeline.ts`.
- Worker (`services/cs2-demo-parser/`) e contratos não foram alterados.
- Bloqueio remanescente para GATE 02 REAL E2E: execução com as demos reais (Mirage truncada,
  Cache, Dust2) contra o worker Railway.

## FASE 2.7.2 — GATE 02-B — Runner E2E de demo real (protegido)

- `src/lib/pipeline/e2e.ts` — regras puras de veredito: `BLOCKED` quando o preflight
  do worker falha ou o job não é terminal; cenário negativo exige falha PERMANENTE
  e zero escrita canônica/projeção; cenário positivo exige exatamente 1 match
  canônico + participantes + rounds + eventos + 1 métrica + 1 features + revisão do
  parser registrada; idempotência compara a evidência antes/depois.
- `src/lib/pipeline-e2e.functions.ts` — server functions master-only
  (`getDemoE2EPreflight`, `runDemoE2E`, `getDemoE2EEvidence`). `runDemoE2E` chama o
  `processJob()` REAL (mesmo caminho do cron, mesmo worker Railway), lê a evidência
  direto do banco antes/depois via `match_sources` (fingerprint/upload) e grava
  auditoria `DEMO_E2E_RUN`. Rerun de job terminal exige `rerun: true` explícito.
- `src/routes/_authenticated/admin/demo-e2e.tsx` — console interno: preflight
  (Gate 1E.1), upload da demo real, run 1, reprocessamento para idempotência e
  evidência bruta. Nenhum dado sintético.
- `src/lib/pipeline/__tests__/e2e.verdict.test.ts` — 13 testes das regras do gate.
- Status: infraestrutura do Gate 02-B PRONTA. O E2E positivo/negativo real
  permanece **BLOCKED** até que arquivos `.dem` reais (Mirage inválida, Cache/Dust2
  válida) sejam fornecidos — nenhum `.dem` existe no projeto.

## FASE 2.7.2A — INGESTÃO CANÔNICA + IDENTIFICAÇÃO FLEXÍVEL DO JOGADOR — DONE

Causa do FAIL do Run 1 (`PLAYER_IDENTITY_UNRESOLVED / no steam id on profile`)
removida: o vínculo do jogador deixou de ser pré-condição do parse.

- `processJob()` agora canonicaliza e persiste a observação ANTES de qualquer
  exigência de Steam ID; `ownerPlayerId` continua sendo o dono do upload.
- `resolveOwnParticipant()` retorna estado + motivo real
  (`no_player_profile` | `no_steam_id_on_profile` | `steam_id_not_in_demo`)
  em vez de lançar. `resolveOwnSteamId()` permanece para quem exige jogador.
- Métricas, features e projeção só rodam com Steam ID PROVADO na demo.
- `demo_jobs` ganhou `attachment_state`, `attachment_method`,
  `attachment_confidence`, `attachment_reason` (com constraints de coerência).
- Gate 02-B passou a medir duas dimensões: CANONICAL (obrigatório) e
  PLAYER PROJECTION (condicional) → `PASS (canonical) / NOT_ATTACHED`.
- Resolver intocado (só EXACT auto-anexa; CONFLICT ainda falha o job).
- UI do jogador e console admin mostram o estado/motivo; i18n nos 5 locales.

Estado: 761/761 testes, typecheck, lint e build OK. O E2E real da demo depende
apenas de uma nova execução do Run 1 pelo usuário.

### Identificação explícita do jogador (fechamento)

- `src/lib/pipeline/attachment.ts`: domínio puro separando MATCH IDENTITY,
  PLAYER IDENTITY, USER ATTACHMENT e IDENTITY METHOD. Estados `attached` /
  `unattached` / `conflict`; métodos `steam_id_confirmed`,
  `self_declared_player`, `self_declared_nickname`; origem `system`/`user`;
  confiança `high` / `user_confirmed` / `low` / `unresolved`.
- Nickname: normalização conservadora (NFKC, espaços, case). Sem fuzzy, sem
  inferir Steam ID a partir de nickname. Nickname duplicado → `ambiguous`.
- Steam ID confirmado tem precedência; declaração divergente → `conflict`,
  nunca sobrescrita silenciosa.
- `demo_jobs` ganhou `attachment_source`, `attachment_confidence_label`,
  `attachment_participant_key`, `declared_participant_key`,
  `declared_nickname`, `observed_nickname`, `attachment_declared_at`,
  `attachment_declared_by` + constraints de forma da declaração.
- `src/lib/pipeline-identity.functions.ts`: `getDemoIdentity()` lista os
  jogadores detectados sob RLS do dono; `declareDemoPlayer()` valida posse,
  resolve pelo domínio, grava auditoria e reprocessa o MESMO CanonicalMatch
  (idempotente) apenas quando a declaração resolve um jogador.
- `DemoPlayerIdentity.tsx`: "Quem é você nesta demo?" com seleção de jogador,
  nickname, desambiguação e opção de deixar para depois; i18n nos 5 locales.
- Testes: `attachment.identity.test.ts` (13 casos) cobrindo perfil ausente,
  Steam ausente/não encontrado, seleção explícita, nickname único/ambíguo/
  inexistente, precedência e conflito. 776/776 testes, typecheck, lint, build OK.
- E2E real da demo NÃO reexecutado nesta fase (fora do escopo); FASE 2.8 não
  iniciada.

## FASE 2.7.2B — RAW DEMO EVIDENCE & FULL COVERAGE — IMPLEMENTADA / E2E REAL BLOCKED

- Evidência parser-native separada do APP Raw Contract e do Canonical Engine.
- Inventário dinâmico via `list_game_events()`, com distinção explícita entre stream indisponível, vazio e falho.
- Eventos brutos preservam `raw_fields`; propriedades desconhecidas são catalogadas como `UNMAPPED_BUT_AVAILABLE`.
- Capacidades `parse_ticks()` e `parse_grenades()` são testadas e amostradas separadamente do canônico.
- Evidência de player, round, economia, posições, movimento, armas, granadas e campos ausentes usa `NULL/UNKNOWN`, sem coerção para zero/false/string vazia.
- `raw_demo_evidence_reports` recebe upsert idempotente antes da normalização e é consultável somente pelo owner/staff; escrita permanece `service_role`.
- `round_players` só pode surgir de sides/economia observados em snapshots reais nos ticks de início/fim; nenhum registro artificial foi criado.
- Console `/admin/demo-e2e` mostra manifest, event/player/tick/grenade coverage, matriz RAW→CONTRACT→CANONICAL e gates.
- Gates `RAW-EVIDENCE-01`, `EVENT-COVERAGE`, `PLAYER-COVERAGE`, `ROUND-COVERAGE`, `ECONOMY-COVERAGE`, `TICK-COVERAGE`, `GRENADE-COVERAGE` e `RAW→CANONICAL` são calculados sem relaxar o Gate 02-B.
- Testes determinísticos cobrem inventário, vazio versus falha, campos nativos, NULL semantics, digest, mapeamento e projeção por evidência.
- O E2E real de `furia-vs-gamerlegion-m1-cache.dem` não foi executado nesta rodada porque o artefato privado não está disponível no ambiente. Portanto os gates baseados na demo real permanecem **BLOCKED**, e a FASE 2.8 não foi iniciada.
