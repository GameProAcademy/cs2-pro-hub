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

## Aberto (fases seguintes, fora de 2.2.1C)

- [ ] Agendamento externo do cron (`/api/public/pipeline-cron`) com o segredo já configurado.
- [ ] Gamers Club, dashboard real, Player DNA e AI Coach com dados reais.

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
