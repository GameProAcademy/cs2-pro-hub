# PM5 — Checkpoint

> Leia este arquivo depois de `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`.
> Conciso de propósito. Antes de agir, confira o estado real no GitHub, no Lovable e no Railway.

Atualizado em: 2026-11-18 (C6) · sessão `session_012aG79D5h8yCsYxNjWpDaHG`

## Escopo e limites

- **Fases:** 4.2.9 (módulo H: treino adaptativo), 4.2.10 (módulo I: biblioteca de momentos; módulo J: benchmarks profissionais), integração FACEIT (login/cadastro, vínculo, sync, reconciliação, matriz de campos), integração do Coach, estrutura de revisão mensal (sem envio sem consentimento), auditoria A–J.
- **Limites:** nenhum prompt ao agente Lovable; nenhum scraping; nenhum reprocessamento amplo de demos; Coach em OpenRouter `openai/gpt-oss-20b` sem fallback; Tutor LMS externo; null/NOT_MEASURED/UNAVAILABLE nunca viram zero; credenciais nunca em chat, arquivo ou commit.

## Estado

| Item            | Valor                                                           |
| --------------- | --------------------------------------------------------------- |
| Marco atual     | **C3 Implementação** (C4/C5 parciais para I e FACEIT link)      |
| `main`          | `8a16af3b` (merge do #327)                                      |
| App em produção | publicação de `eeffaa2e`; `98d10f9c` com H.3-E PASS e E2E 12/12 |
| Banco           | migration `20261118120000` (momentos) **aplicada e registrada** |
| Worker          | inalterado: Railway `584ea563`, R5.8.31                         |

## PRs

| PR   | Conteúdo                                                              | Situação                              |
| ---- | --------------------------------------------------------------------- | ------------------------------------- |
| #326 | Módulo I — biblioteca de momentos                                     | MERGED `7c0a3a4c`; migration aplicada |
| #327 | FACEIT: aliases de secrets, endpoints OpenID, rota `/faceit/callback` | MERGED `8a16af3b`                     |
| #328 | Módulo H — treino adaptativo (migration `20261118140000`, dry-run OK) | aberto, CI                            |
| #329 | Módulo J — portões de licença, `BENCHMARK_UNAVAILABLE`                | aberto (empilhado em #328)            |
| #330 | Coach: plano, momentos, estado do benchmark (regras 29–31)            | aberto (empilhado em #329)            |
| #331 | "Continuar com FACEIT" (migration `20261118160000`, dry-run OK)       | aberto, CI                            |
| #332 | Cartão FACEIT em `/profile` (faltava no modo de dados reais)          | aberto, CI                            |

Relatório final: `docs/pm5/PM5_REPORT.md` (PRs #326–#341).

## Decisões

- Treino: tabelas novas `adaptive_training_*`; as legadas `training_plans`/`training_plan_items` (0 linhas) ficam intactas. Escrita só pelo servidor; revisão só com aceite (nova versão imutável).
- Benchmarks: nenhuma fonte licenciada e comparável encontrada (HLTV, Kaggle/HLTV, FACEIT Data API, Leetify, Steam) → `BENCHMARK_UNAVAILABLE` com infraestrutura de validação pronta.
- FACEIT login: conta nova só com e-mail que a FACEIT declara verificado e que ninguém usa; nunca vínculo por e-mail; cookie HttpOnly contra login CSRF; sessão via token de uso único no fragmento.
- Matriz de campos: `docs/pm5/FACEIT_FIELD_MATRIX.md`.

## Pendências

- MANUAL_REQUIRED: conta FACEIT com partidas de CS2 para validar a importação; teste de "Continuar com FACEIT" (`email_verified`).
- Dono: desconectar/reconectar a FACEIT uma vez após #341 para a identidade aparecer verificada.

## Não repetir

- PM1–PM4 inteiros; PRs #326–#341; migrations `20261118120000`, `20261118140000`, `20261118160000`, `20261118180000`.
