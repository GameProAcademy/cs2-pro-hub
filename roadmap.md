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
