# PM3 — Checkpoint (fase ativa)

> Leia este arquivo depois de `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`.
> O texto aqui é conciso de propósito; o detalhe e as evidências ficam em `docs/pm3/PM3_REPORT.md`.
> Antes de agir, confira o estado real no GitHub, no Railway e no Lovable.

Atualizado em: 2026-11-17 (fechamento C6) · sessão `session_012aG79D5h8yCsYxNjWpDaHG`

## Escopo e limites

- **Fases:** 4.2.5 (módulo C: mira, confrontos e movimentação) e 4.2.6 (módulo D: inteligência de utilitários).
- **Prompt:** Prompt Mestre 3 atualizado em 2026-11-17; o adendo prevalece.
- **Autorização:** autorizado e ativo desde 2026-11-17.
- **Fora de escopo:** PM4/PM5, Tutor LMS, prompts ao agente Lovable, reprocessamento em massa, troca de modelo do Coach e fallback OpenAI.
- **Métricas sem telemetria adequada:** ficam `NOT_MEASURED` (ou `NOT_OBSERVED` quando a demo não registrou), nunca simuladas.
- Null nunca vira zero.

## Estado

| Item               | Valor                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Marco atual        | **C6 CONCLUÍDO: PM3 Etapa B concluída** (2026-11-17)                                                  |
| Próxima ação exata | Nenhuma no PM3. PM4/PM5 só com nova autorização do dono                                               |
| `main`             | `ad7b73b2` (+ este PR de docs)                                                                        |
| App em produção    | publicação de `ad7b73b2` (C, D, Coach, `Server-Timing`, latência do replay)                           |
| Worker             | Railway `3335c88d`, `768646ea` (R5.8.30), demoparser2 0.42.2; Source persistente `768646ea`           |
| Banco              | migration `20261117120000` aplicada e registrada                                                      |
| H.3-E              | PASS 18/18 em `cf1c58ac`; `ad7b73b2`: PASS (44135596325; Quality Gates 44130271326, F553 44135539281) |
| E2E                | 12/12 em `cf1c58ac` (44122519497) e em `ad7b73b2` (44134721473)                                       |

## Marcos

| Marco                                          | Situação  | PR / SHA                           | Evidência                                                |
| ---------------------------------------------- | --------- | ---------------------------------- | -------------------------------------------------------- |
| PM3-0 Reconciliação do checkpoint              | CONCLUÍDO | #309 `6031b334`                    | —                                                        |
| C0 Auditoria de entrada                        | CONCLUÍDO | —                                  | relatório C0                                             |
| C1 Inventário de telemetria / viabilidade      | CONCLUÍDO | —                                  | relatório C1                                             |
| C2 Plano (métricas aprovadas e `NOT_MEASURED`) | CONCLUÍDO | #313 (matriz de liberação)         | relatório C2                                             |
| C3 Implementação C e D                         | CONCLUÍDO | #310–#315, #317                    | relatório C3                                             |
| C4 Validação                                   | CONCLUÍDO | testes + 3 demos locais            | relatório C4                                             |
| C5 Release / produção                          | CONCLUÍDO | publicações `cf1c58ac`, `ad7b73b2` | relatório C5 (H.3-E, E2E, demo nova, paridade, latência) |
| C6 Fechamento                                  | CONCLUÍDO | este PR                            | relatório C6                                             |

## Não repetir

- PM1, PM6 e PM2 inteiros.
- Releases R5.8.25–R5.8.30: o worker `3335c88d` e a migration `20261117120000` já estão aplicados.
- E2E/IDOR do PM2, exceto como regressão.
