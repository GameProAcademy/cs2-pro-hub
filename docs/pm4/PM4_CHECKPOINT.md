# PM4 — Checkpoint

> Leia este arquivo depois de `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`.
> Conciso de propósito; o detalhe e as evidências ficam em `docs/pm4/PM4_REPORT.md`.
> Antes de agir, confira o estado real no GitHub, no Railway e no Lovable.

Atualizado em: 2026-11-17 (fechamento C6) · sessão `session_012aG79D5h8yCsYxNjWpDaHG`

## Escopo e limites

- **Fases:** 4.2.7 (módulos E e F: economia e impacto por round) e 4.2.8 (módulo G: evolução e consistência, com a parte de histórico/DNA do módulo J).
- **Fora de escopo:** comparativos Pro/coortes (4.2.10), treinamento adaptativo, biblioteca de momentos (PM5); Tutor LMS; prompts ao agente Lovable; reprocessamento de demos reais.
- Coach: OpenRouter `openai/gpt-oss-20b`, sem fallback OpenAI.
- Null, NOT_MEASURED, INSUFFICIENT_SAMPLE e UNAVAILABLE nunca viram zero.

## Estado

| Item               | Valor                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Marco atual        | **C6 CONCLUÍDO: PM4 concluído** (2026-11-17)                                                                   |
| Próxima ação exata | Nenhuma no PM4. PM5 só com autorização do dono                                                                 |
| `main`             | `f1cb9e8e` (+ este PR de docs)                                                                                 |
| App em produção    | publicação de `f1cb9e8e` (E/F `/rounds`, G `/evolution`, Coach regras 27/28)                                   |
| Worker             | Railway `584ea563`, `0c646583` (R5.8.31), demoparser2 0.42.2; Source persistente `0c646583`                    |
| Banco              | migration `20261117235000` aplicada e registrada                                                               |
| Gates              | attestation 44207611056; H.3-E PASS 44210630121 (`1b4bd82f`) e 44218097807 (`f1cb9e8e`); E2E 44215050582 12/12 |

## Marcos

| Marco                 | Situação  | PR / SHA                                                                         |
| --------------------- | --------- | -------------------------------------------------------------------------------- |
| C0 Entrada            | CONCLUÍDO | —                                                                                |
| C1 Descoberta         | CONCLUÍDO | —                                                                                |
| C2 Plano              | CONCLUÍDO | —                                                                                |
| C3 Implementação      | CONCLUÍDO | #319, #321, #320, #322, #324                                                     |
| C4 Validação          | CONCLUÍDO | testes + demos locais                                                            |
| C5 Release / produção | CONCLUÍDO | worker `584ea563`, migration, app `f1cb9e8e`, H.3-E, E2E, demo nova com paridade |
| C6 Fechamento         | CONCLUÍDO | este PR                                                                          |

## Não repetir

- PM1, PM6, PM2 e PM3 inteiros.
- Release R5.8.31 do worker (`584ea563`) e a migration `20261117235000`.
- Troca dos secrets R5.8.31 e a demo nova da conta A.
- E2E/IDOR do PM4, exceto como regressão.
