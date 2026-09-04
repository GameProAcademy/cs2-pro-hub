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
