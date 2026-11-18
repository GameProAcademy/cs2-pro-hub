# PM5 — Checkpoint

> Leia este arquivo depois de `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`.
> Conciso de propósito. Antes de agir, confira o estado real no GitHub, no Lovable e no Railway.

Atualizado em: 2026-11-18 — **PM5 encerrado (C6)**, PR #342 `10da2e7f` · sessão `session_012aG79D5h8yCsYxNjWpDaHG`

## Escopo e limites

- **Fases:** 4.2.9 (módulo H: treino adaptativo), 4.2.10 (módulo I: biblioteca de momentos; módulo J: benchmarks profissionais), integração FACEIT (login/cadastro, vínculo, sync, reconciliação, matriz de campos), integração do Coach, estrutura de revisão mensal (sem envio sem consentimento), auditoria A–J.
- **Limites:** nenhum prompt ao agente Lovable; nenhum scraping; nenhum reprocessamento amplo de demos; Coach em OpenRouter `openai/gpt-oss-20b` sem fallback; Tutor LMS externo; null/NOT_MEASURED/UNAVAILABLE nunca viram zero; credenciais nunca em chat, arquivo ou commit.

## Estado

**PM5 ENCERRADO (C6).** Fechamento documental: PR #342, commit `10da2e7f637adfe42fb1ab2a506ca5534a6a5776`.

| Item            | Valor                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Marco           | **C6 Fechamento — encerrado**                                                                             |
| `main`          | `10da2e7f` (merge do #342, só documentação)                                                               |
| App em produção | publicação de `eeffaa2e` (#341); última validação completa em `98d10f9c`: H.3-E PASS, E2E 12/12           |
| Banco           | migrations `20261118120000`, `20261118140000`, `20261118160000`, `20261118180000` aplicadas e registradas |
| Worker          | inalterado: Railway `584ea563`, R5.8.31                                                                   |

## PRs (todos mergeados)

| PR        | Conteúdo                                                                      | Merge                                          |
| --------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| #326      | Módulo I — biblioteca de momentos                                             | `7c0a3a4c`                                     |
| #327      | FACEIT habilitada (aliases, OpenID, `/faceit/callback`)                       | `8a16af3b`                                     |
| #328      | Módulo H — treino adaptativo                                                  | `7b506f4f`                                     |
| #329      | Módulo J — portões de licença, `BENCHMARK_UNAVAILABLE`                        | `78219ea5`                                     |
| #330      | Coach: plano, momentos, estado do benchmark (regras 29–31)                    | `b3159b35`                                     |
| #331      | "Continuar com FACEIT"                                                        | `3fe6cf36`                                     |
| #332      | Cartão FACEIT em `/profile`                                                   | `2ad34504`                                     |
| #333      | Checkpoint C3 e matriz FACEIT (histórico)                                     | `98d10f9c`                                     |
| #334–#337 | Revisão mensal, E2E PM5, momentos a partir de outras telas, treino → momentos | `b7e6015c`, `07cf8e64`, `bda6c8d7`, `1ea80708` |
| #338–#341 | Correções FACEIT achadas no teste real do dono                                | `95022018`, `c189bd76`, `72290d77`, `eeffaa2e` |
| #342      | Relatório final e checkpoints                                                 | `10da2e7f`                                     |

## Resultado (sem reabrir o PM5)

- **FACEIT:** implementada; conectar, desconectar e reconectar **validados pelo usuário em produção** (conta de teste sem partidas; sync `completed`).
- **Importação de partidas reais FACEIT:** **NÃO VALIDADA** — não há conta de teste com partidas de CS2.
- **Login/cadastro novo por FACEIT ("Continuar com FACEIT"):** **NÃO VALIDADO** em produção (`email_verified` não confirmado).
- **Benchmark profissional:** **indisponível** (`BENCHMARK_UNAVAILABLE`) — nenhuma fonte licenciada e comparável.
- **Revisão mensal:** disponível **como prévia** em `/evolution`, **sem envio automático** (não há consentimento armazenado).

Relatório final: `docs/pm5/PM5_REPORT.md` (PRs #326–#342).

## Decisões

- Treino: tabelas novas `adaptive_training_*`; as legadas `training_plans`/`training_plan_items` (0 linhas) ficam intactas. Escrita só pelo servidor; revisão só com aceite (nova versão imutável).
- Benchmarks: nenhuma fonte licenciada e comparável encontrada (HLTV, Kaggle/HLTV, FACEIT Data API, Leetify, Steam) → `BENCHMARK_UNAVAILABLE` com infraestrutura de validação pronta.
- FACEIT login: conta nova só com e-mail que a FACEIT declara verificado e que ninguém usa; nunca vínculo por e-mail; cookie HttpOnly contra login CSRF; sessão via token de uso único no fragmento.
- Matriz de campos: `docs/pm5/FACEIT_FIELD_MATRIX.md`.

## Pendências

Não reabrem o PM5; ficam registradas como limitações:

- Importação de partidas FACEIT reais: aguarda uma conta FACEIT com partidas de CS2.
- "Continuar com FACEIT" em produção e `email_verified`: não testados.
- Benchmark profissional: aguarda fonte licenciada.
- Revisão mensal: envio depende de consentimento e notificações (não existem).

## Não repetir

- PM1–PM5 inteiros; PRs #326–#342; migrations `20261118120000`, `20261118140000`, `20261118160000`, `20261118180000`.
