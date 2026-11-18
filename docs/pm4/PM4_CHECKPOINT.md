# PM4 — Checkpoint (fase ativa)

> Leia este arquivo depois de `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`.
> Conciso de propósito; o detalhe e as evidências ficam em `docs/pm4/PM4_REPORT.md`.
> Antes de agir, confira o estado real no GitHub, no Railway e no Lovable.

Atualizado em: 2026-11-17 (C5 em andamento) · sessão `session_012aG79D5h8yCsYxNjWpDaHG`

## Escopo e limites

- **Fases:** 4.2.7 (módulos E e F: economia e impacto por round) e 4.2.8 (módulo G: evolução e consistência, com a parte de histórico/DNA do módulo J).
- **Fora de escopo:** comparativos Pro/coortes (4.2.10), treinamento adaptativo, biblioteca de momentos (PM5); Tutor LMS; prompts ao agente Lovable; reprocessamento de demos reais.
- Coach: OpenRouter `openai/gpt-oss-20b`, sem fallback OpenAI.
- Null, NOT_MEASURED, INSUFFICIENT_SAMPLE e UNAVAILABLE nunca viram zero.

## Estado

| Item               | Valor                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Marco atual        | C5 em andamento                                                                                            |
| Próxima ação exata | Dono: 3 secrets → `0c646583…`. Depois: H.3-E, merge #322 (G) e PR do Coach/E2E, publicar, E2E, demo nova A |
| `main`             | `1b4bd82f` (#320) sobre `00977821` (#321) e `0c646583` (#319)                                              |
| App em produção    | publicação de `1b4bd82f` (E/F + pins R5.8.31)                                                              |
| Worker             | Railway `584ea563`, `0c646583` (R5.8.31), demoparser2 0.42.2; Source persistente `0c646583`                |
| Banco              | migration `20261117235000` aplicada e registrada                                                           |
| Attestation        | 44207611056 success                                                                                        |

## Marcos

| Marco                 | Situação     | PR / SHA                                                      |
| --------------------- | ------------ | ------------------------------------------------------------- |
| C0 Entrada            | CONCLUÍDO    | —                                                             |
| C1 Descoberta         | CONCLUÍDO    | —                                                             |
| C2 Plano              | CONCLUÍDO    | —                                                             |
| C3 Implementação      | EM ANDAMENTO | #319, #321, #320, #322, Coach/E2E                             |
| C4 Validação          | EM ANDAMENTO | testes + demos locais                                         |
| C5 Release / produção | EM ANDAMENTO | worker `584ea563`, migration `20261117235000`, app `1b4bd82f` |
| C6 Fechamento         | PENDENTE     | —                                                             |

## Não repetir

- PM1, PM6, PM2 e PM3 inteiros.
- Release R5.8.31 do worker (`584ea563`) e a migration `20261117235000`.
