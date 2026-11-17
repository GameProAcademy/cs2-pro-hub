# PM3 — Checkpoint (fase ativa)

> Leia este arquivo depois de `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`.
> O texto aqui é conciso de propósito; o detalhe e as evidências ficam em `docs/pm3/PM3_REPORT.md`.
> Antes de agir, confira o estado real no GitHub, no Railway e no Lovable.

Atualizado em: 2026-11-17 · sessão `session_012aG79D5h8yCsYxNjWpDaHG`

## Escopo e limites

- **Fases:** 4.2.5 (módulo C: mira, confrontos e movimentação) e 4.2.6 (módulo D: inteligência de utilitários).
- **Prompt:** Prompt Mestre 3 atualizado em 2026-11-17; o adendo prevalece.
- **Autorização:** autorizado e ativo desde 2026-11-17.
- **Fora de escopo:** PM4/PM5, Tutor LMS, prompts ao agente Lovable, reprocessamento em massa, troca de modelo do Coach e fallback OpenAI.
- **Métricas sem telemetria adequada:** ficam `NOT_MEASURED` (ou `NOT_OBSERVED` quando a demo não registrou), nunca simuladas.
- Null nunca vira zero.

## Estado

| Item               | Valor                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Marco atual        | C5 Release / produção                                                                       |
| Próxima ação exata | ver "Próximos passos" abaixo                                                                |
| `main`             | `5ad16f13`                                                                                  |
| App em produção    | publicação `0719c851` de `d68a82db`; C, D e `Server-Timing` ainda **não publicados**        |
| Worker             | Railway `3335c88d`, `768646ea` (R5.8.30), demoparser2 0.42.2; Source persistente `768646ea` |
| Banco              | migration `20261117120000` (re-pin R5.8.30) aplicada e registrada                           |
| H.3-E              | último PASS em `b0452747`; com R5.8.30, pendente dos secrets e da publicação                |

## Próximos passos

1. O dono troca os 3 secrets: **MANUAL_REQUIRED**; os valores estão no checkpoint central, §22 item 5.
2. Merge do #315.
3. Uma única publicação do app.
4. `gh workflow run parser-runtime-attestation.yml` e depois H.3-E. A 1ª H.3-E falha cedo com `RUN_NOT_COMPLETED`; isso é conhecido.
5. Workflow `PM2 browser E2E`, que agora cobre também `/duels` e `/utility`.
6. Medição `Server-Timing` do replay.
7. Demo nova de FACEIT ou GC enviada pela conta A.
8. Fechamento C6.

## Marcos

| Marco                                          | Situação     | PR / SHA                       | Evidência                              |
| ---------------------------------------------- | ------------ | ------------------------------ | -------------------------------------- |
| PM3-0 Reconciliação do checkpoint              | CONCLUÍDO    | #309 `6031b334`                | —                                      |
| C0 Auditoria de entrada                        | CONCLUÍDO    | —                              | relatório C0                           |
| C1 Inventário de telemetria / viabilidade      | CONCLUÍDO    | —                              | relatório C1 (produção + 3 demos)      |
| C2 Plano (métricas aprovadas e `NOT_MEASURED`) | CONCLUÍDO    | —                              | relatório C2; matriz de liberação #313 |
| C3 Implementação C e D                         | CONCLUÍDO    | #310–#314 merged; #315 aberto  | relatório C3                           |
| C4 Validação                                   | PARCIAL      | testes + 3 demos reais locais  | relatório C4; produção pendente        |
| C5 Release / produção                          | EM ANDAMENTO | worker e migration ok; app não | relatório C5                           |
| C6 Fechamento                                  | PENDENTE     | —                              | —                                      |

## Não repetir

- PM1, PM6 e PM2 inteiros.
- Releases R5.8.25–R5.8.30: o worker `3335c88d` e a migration `20261117120000` já estão aplicados.
- E2E/IDOR do PM2, exceto como regressão.
