# Roadmap

## Concluído
- Segunda auditoria independente (red team) da integração FACEIT — somente diagnóstico, sem alterações de código. Relatório: `.lovable/plan/segunda-auditoria-red-team-faceit-2026-09-04.md`.

## Aberto — FASE 2.2.1D (correções da segunda auditoria, aguardando ordem do usuário)
Blockers antes de Gamers Club:
1. Executor real de jobs FACEIT (parar de depender de promessa solta em request de edge; cron executa).
2. Recuperação de jobs travados em `processing` (janela de stale + attempts + limite).
3. Cron FACEIT: recuperar stale, laço com orçamento de tempo/itens, reportar status/código por job.
4. Orçamento e espaçamento de chamadas por job + limite global de concorrência.
5. Corrigir semântica bo2/bo3 (`score_*`, `rounds`) e extração de `map`; completude que não reprocesse para sempre.
6. Sinalizar truncamento em página curta; revisar heurística `added === 0`.
7. Resolver identidade FACEIT órfã × bloqueio de reconexão (DELETE de conexão pelo cliente).
8. Validar `FACEIT_OAUTH_USERINFO_URL` e `FACEIT_API_BASE_URL` como HTTPS no ponto de uso.
9. Testes com banco: state single-use, duplicate account, claim concorrente, idempotência em duas passagens, auth do cron; fixture de payload real quando houver chave.

Opcionais: índice único duplicado em `match_metrics`, remover `fetchFaceitRecentMatchStats`, contadores honestos, dead-letter visível, historizar ELO/`round_stats`, peso explícito sem `Rounds`.

Fora de escopo até ordem explícita: ligar `playerService` a dados reais (hoje `DEMO_DATA` mock em todas as telas).
