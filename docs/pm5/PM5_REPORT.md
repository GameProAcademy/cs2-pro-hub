# PM5 — Relatório (Fases 4.2.9 e 4.2.10, FACEIT, Coach, revisão mensal) e fechamento da Fase 4.2

> Estados: VALIDADO EM PRODUÇÃO · VALIDADO EM TESTE · IMPLEMENTADO, NÃO VALIDADO · MANUAL_REQUIRED ·
> BENCHMARK_UNAVAILABLE · NÃO APLICÁVEL. Nenhum PASS sem evidência. Sem e-mails, SteamIDs, segredos ou demos.
> Sessão `session_012aG79D5h8yCsYxNjWpDaHG`.

## 1. Resumo executivo

O PM5 entregou o módulo H (treino adaptativo 7/30/90 com evidências, sessões explícitas e versões),
o módulo I (biblioteca privada de momentos com coleções, tags, filtros e replay), o módulo J
(comparativos profissionais com portões de licença; **nenhuma fonte licenciada e comparável existe → `BENCHMARK_UNAVAILABLE`**),
a integração FACEIT (vínculo de conta já existente habilitado com o App Studio do dono, cartão em `/profile`,
e "Continuar com FACEIT" para entrar/criar conta), o Coach com plano/momentos/benchmark (regras 29–31) e a
estrutura de revisão mensal (prévia na página, **sem envio**: não há consentimento armazenado).

FACEIT **validada em produção** pelo dono com uma conta de teste: conectar, desconectar e reconectar funcionam;
sync inicial e incremental `completed`. A conta é nova e não tem partidas nem bloco CS2 na FACEIT, então
nível/ELO/região aparecem como "—" e 0 partidas — o dado real. **Importação de partidas reais** e o
**login "Continuar com FACEIT"** (inclusive `email_verified`) seguem **MANUAL_REQUIRED**: não há conta FACEIT com partidas para teste.

## 2. Baseline

`main` de entrada `4ca69886` (PM4 C6). Worker Railway `584ea563` (R5.8.31, `0c646583`), inalterado no PM5.

## 3. Fases 4.2.1–4.2.10

| Fase              | Situação                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| 4.2.1–4.2.2 (PM1) | concluída (`docs/pm1/`)                                                                              |
| 4.2.3–4.2.4 (PM2) | concluída (`docs/pm2/`)                                                                              |
| 4.2.5–4.2.6 (PM3) | concluída (`docs/pm3/`)                                                                              |
| 4.2.7–4.2.8 (PM4) | concluída (`docs/pm4/`)                                                                              |
| 4.2.9 (H)         | **VALIDADO EM PRODUÇÃO** (página, estados, RLS; plano real depende de amostra ≥ 3 partidas da conta) |
| 4.2.10 (I + J)    | I **VALIDADO EM PRODUÇÃO**; J **BENCHMARK_UNAVAILABLE** com infraestrutura pronta                    |

## 4. Módulos A–J

| Módulo                   | Estado                                               | Evidência                               |
| ------------------------ | ---------------------------------------------------- | --------------------------------------- |
| A Upload/pipeline/parser | preservado                                           | worker R5.8.31 sem mudança; H.3-E (§18) |
| B Mortes/replay          | preservado + salvar momento                          | #336, E2E PM2                           |
| C Duelos                 | preservado + salvar momento                          | #336                                    |
| D Utilitários            | preservado + salvar momento                          | #336                                    |
| E/F Economia e rounds    | preservado (salvar momento desde #326)               | E2E PM4                                 |
| G Evolução               | preservado + revisão mensal + cartão de benchmark    | #329, #334                              |
| H Treino adaptativo      | entregue                                             | #328, #337                              |
| I Momentos               | entregue                                             | #326, #336                              |
| J Benchmarks / DNA       | DNA preservado; comparativos `BENCHMARK_UNAVAILABLE` | #329                                    |

## 5. Oito diferenciais

| #   | Diferencial                    | Estado                                      | Observação                                                                                                                        |
| --- | ------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Onde estou perdendo rounds?    | ENTREGUE (PM2–PM4)                          | `/rounds` separa equipe × jogador; N, coverage, limitações                                                                        |
| 2   | Posicionamento × profissionais | **BENCHMARK_UNAVAILABLE**                   | sem dataset licenciado e comparável; explicado na UI e no Coach                                                                   |
| 3   | Meu pior hábito                | ENTREGUE (PM2)                              | padrões RECURRENT da death review com amostra mínima                                                                              |
| 4   | Como eu deveria ter jogado?    | PARCIAL                                     | contexto da decisão no replay/rounds; Coach apresenta alternativas como hipóteses (regras de PM2–PM4); não há motor contrafactual |
| 5   | Versões de mim mesmo           | ENTREGUE                                    | `/evolution` (janelas, mesmo método) + revisão mensal; treino sem causalidade (regra 29)                                          |
| 6   | Mapa de oportunidades perdidas | ENTREGUE                                    | heatmap com drill-down → replay e salvar momento (#336)                                                                           |
| 7   | AI Coach com evidências        | ENTREGUE                                    | regras 1–31; plano, momentos, benchmark; OpenRouter `openai/gpt-oss-20b`, sem fallback                                            |
| 8   | Revisão mensal automática      | ESTRUTURA PRONTA, ENVIO **MANUAL_REQUIRED** | prévia em `/evolution`; envio exige consentimento e regras de notificação inexistentes                                            |

## 6. Métricas implementadas e não medidas

Implementadas no PM5: prioridade de treino, adesão (só marcações explícitas), métricas do mês (mesmo `aggregate` da Evolução).
Não medidas / não expostas: comparativos profissionais; FACEIT Rating/Swing e métricas próprias do site FACEIT (sem endpoint oficial);
`email_verified` do userinfo FACEIT (a validar com conta real).

## 7. Regras, fórmulas e versões

- `cs2.training-priority.v1`: `score = conf × (0,6·gap + 0,25·trend) + goal`; `gap = (0,60 − DNA)/0,60` só para dimensão observada; `trend = |Δ%|/20` (≤ 1) só com comparação OK e piora; `conf = min(1, amostra/10)`; amostra mínima 3; `goal = 0,15` por objetivo declarado.
- `cs2.training-plan.v1`: 7/30/90 dias → 1/2/3 prioridades; 90 dias com fase 1 (semanas 1–4) só na prioridade principal; revisões [7], [7,14,21,30], [30,60,90]; metas de processo e métricas acompanhadas com linha de base, sem alvo numérico.
- `cs2.exercises.v1` (13 exercícios), `cs2.moments.v1`, `cs2.pro-benchmark.v1`, `cs2.monthly-review.v1`.

## 8. Provenance e coverage

Toda evidência de treino carrega métrica, valor, partidas, cobertura e método; a revisão mensal mostra N e base de data
(`processed` avisado); o benchmark só aceitaria fonte com licença, coleta autorizada, CS2, mesmo método e ≥ 30 partidas.

## 9. Exercícios e fontes

13 exercícios com passos, critério de conclusão e métrica acompanhada. Referências externas verificadas: mapa Aim Botz na
Steam Workshop e referência pública de comandos de prática offline. Exercícios de revisão abrem as páginas do CS2 PRO e a biblioteca de momentos.

## 10. Planos 7/30/90 e critérios

Ver §7. Um plano aberto por usuário; criação, pausa, retomada, conclusão e cancelamento; revisão proposta com diff e aplicada só com aceite
(concorrência otimista; sessões futuras viram SUPERSEDED, nada é apagado); histórico de planos e versões imutáveis.

## 11. Bookmarks/coleções e políticas

Referência à partida própria (partida + round + intervalo de ticks + evento opcional), título, nota, tags, coleções ordenadas;
privado por padrão (sem compartilhamento); partida apagada → texto preservado com `match_id` nulo (UNAVAILABLE); nada canônico é copiado.
Criação a partir de replay, rounds, mortes, duelos, utilitários e heatmap.

## 12. Benchmarks, fontes e licenças

Auditadas: HLTV, datasets Kaggle derivados do HLTV, FACEIT Data API, Leetify, Valve/Steam — nenhuma com licença para exibição derivada
e método comparável. Registro vazio; `BENCHMARK_UNAVAILABLE` na UI, no Coach e na matriz de release (`pro.benchmark`).

## 13. PRs e merges

| PR   | Conteúdo                                                | Merge      |
| ---- | ------------------------------------------------------- | ---------- |
| #326 | módulo I                                                | `7c0a3a4c` |
| #327 | FACEIT habilitado (aliases, OpenID, `/faceit/callback`) | `8a16af3b` |
| #328 | módulo H                                                | `7b506f4f` |
| #329 | módulo J                                                | `78219ea5` |
| #330 | Coach (regras 29–31)                                    | `b3159b35` |
| #332 | cartão FACEIT em `/profile`                             | `2ad34504` |
| #331 | "Continuar com FACEIT"                                  | `3fe6cf36` |
| #334 | revisão mensal (prévia)                                 | `b7e6015c` |
| #335 | E2E PM5                                                 | `07cf8e64` |
| #336 | momentos a partir de mapas/mortes/duelos/utilitários    | `bda6c8d7` |
| #337 | exercícios de revisão → momentos                        | `1ea80708` |
| #333 | checkpoint C3 e matriz FACEIT                           | `98d10f9c` |
| #338 | FACEIT `redirect_popup=true`                            | `95022018` |
| #339 | diagnóstico da etapa que falha no callback FACEIT       | `c189bd76` |
| #340 | strings vazias da FACEIT = ausente; lifetime tolerante  | `72290d77` |
| #341 | link do perfil `{lang}` e identidade verificada         | `eeffaa2e` |

## 14. Migrations

| Versão           | Conteúdo                                         | Dry-run                              | Aplicada / registrada         |
| ---------------- | ------------------------------------------------ | ------------------------------------ | ----------------------------- |
| `20261118120000` | momentos (3 tabelas, 9 policies)                 | `PM5_MOMENTS_DRY_RUN_OK`             | sim, `direct-main-7c0a3a4c-…` |
| `20261118140000` | treino adaptativo (3 tabelas, SELECT-own)        | `PM5_TRAINING_DRY_RUN_OK`            | sim, `direct-main-7b506f4f-…` |
| `20261118160000` | estado de login FACEIT (`purpose`, binding)      | `PM5_FACEIT_LOGIN_DRY_RUN_OK rows=0` | sim, `direct-main-3fe6cf36-…` |
| `20261118180000` | diagnóstico de falhas OAuth FACEIT (só servidor) | `PM5_FACEIT_DIAG_DRY_RUN_OK`         | sim, `direct-main-c189bd76-…` |

## 15. Workflows e testes

Suíte local: ~2 790 testes (a única falha local é `uploadLifecycleConcurrency`, dependente de ambiente, conhecida desde o PM4).
Novos: harnesses PostgreSQL descartáveis com mutação (momentos 28 checks, treino 26, login FACEIT 13), motor de treino (16),
UI de treino (4), benchmarks (7), Coach PM5 (6), login FACEIT (10), revisão mensal (7), pontos de entrada de momentos (6).
CI: todos os PRs com "Main required gates" verde antes do merge. Gates de `main` e E2E: §18 e §20.

## 16. RLS / ownership / segurança

- Momentos: só linhas próprias; inserção exige `owns_canonical_match`; itens de coleção só entre coleção e marcador próprios.
- Treino: o navegador só lê as próprias linhas; nenhuma escrita autenticada (nem na própria linha).
- FACEIT login: estado de uso único com hash, PKCE S256, cookie HttpOnly/Secure/SameSite=Lax contra login CSRF, teto de 120 tentativas/min,
  nunca vínculo por e-mail, conta nova só com e-mail verificado pela FACEIT e livre, sessão via token de uso único no fragmento; nada sensível em log.
  Achado corrigido durante o harness: `NULL ~ regex` passaria num CHECK; constraint ganhou `IS NOT NULL`.
- Coach: títulos de momentos tratados como texto do jogador (sanitizados, limitados, marcados), notas nunca enviadas.

## 17. Performance / custos

Listas por keyset com índices (`user_id, created_at, id`); treino e revisão leem dados já carregados das páginas (sem novo
reprocessamento); Coach recebe no máximo 5 momentos e 3 sessões futuras. Nenhuma chamada de rede extra em runtime para benchmarks.

## 18. Parser / identity / H.3-E

Worker inalterado (Railway `584ea563`, `0c646583`). H.3-E e attestation do SHA final: ver §20.

## 19. Deploys

Publicações do Lovable: `8a16af3b`, `b3159b35`, `2ad34504`, `98d10f9c` e `95022018` (#338).

`98d10f9c`: H.3-E PASS (44250709151), F553 attestation PASS (44250676832), E2E de produção 12/12 (44249188759, incluindo as etapas PM5).

## 20. Smoke tests em produção

- `/faceit/callback` sem estado → redireciona com `reason=invalid_request` (handler ativo).
- `/training` → `data-evidence-state=NO_EVIDENCE` na conta do navegador (sem partidas), sem plano inventado.
- `/evolution` → `BENCHMARK_UNAVAILABLE` com 5 fontes auditadas.
- `/profile` → cartão FACEIT; URL oficial de autorização (redirect `gamepro.network/faceit/callback`, S256, `openid profile email`, `redirect_popup=true`).
- Teste real do dono (conta de teste nova): conectar → **Conectada** + sync `completed` (0 encontradas); desconectar; reconectar → **Conectada** + sync incremental `completed`. `faceit_oauth_failures` sem falhas após #340.

## 21. Falhas encontradas e causa raiz

1. Cartão FACEIT ausente em produção: só era montado no modo de demonstração → movido para `/profile` (#332).
2. Constraint NULL-permissiva no estado de login → corrigida antes do merge (harness com mutação).
3. Lint do #331: traduções novas sem formatação → formatadas.
4. Cancelamentos de gates em `main` por merges seguidos (concorrência esperada); avaliação final só no SHA final.
5. Validação real do dono: a FACEIT parou em "Você deve especificar o parâmetro redirect_popup…" — `accounts.faceit.com` exige `redirect_popup=true` em redirecionamento de página (não documentado). Corrigido no #338 (`95022018`), publicado e conferido na URL de autorização em produção.
6. Callback terminava com motivo genérico `error`, sem log acessível → #339 grava etapa + código (sem identificadores). Registro real: `stage=link, FACEIT_MALFORMED_RESPONSE`.
7. Causa: o validador comum exigia texto não vazio e a FACEIT envia `""` em campos ausentes → `""` vira `null` (#340); `lifetime` com listas não invalida mais o payload.
8. "Ver perfil" abria 404: `faceit_url` vem com `{lang}` literal → preenchido (#341).
9. Identidades mostravam FACEIT "não vinculada" após o vínculo: só `is_verified` era gravado → estado de confiança OAuth completo; desconectar volta para `unlinked` (#341).

## 22. Limitações e riscos residuais

- Importação de partidas FACEIT reais não validada (nenhuma conta de teste com partidas): MANUAL_REQUIRED.
- "Continuar com FACEIT" não testado em produção; `email_verified` pode não existir no userinfo → contas novas não seriam criadas (comportamento conservador).
- Amostra de produção pequena: planos de treino reais exigem ≥ 3 partidas com DNA/evolução.
- Revisão mensal sem envio (sem consentimento/notificações).
- Diferencial 4 sem motor contrafactual (alternativas só como hipóteses do Coach).

## 23. Ações manuais

1. Dono: após #341, desconectar e reconectar a FACEIT uma vez (identidade passa a "verificada").
2. Quando houver conta FACEIT com partidas de CS2: conectar e conferir a importação (e preencher a matriz de campos com respostas reais).
3. Opcional: sair e testar "Continuar com FACEIT" em `/login` com a conta já conectada.

## 24. Rollback

Cada migration traz o rollback no cabeçalho (só tabelas/colunas novas). App: republicar o SHA anterior no Lovable. Worker não mudou.

## 25. Lovable

Nenhum prompt, mensagem ou instrução foi enviado ao agente Lovable. Uso restrito a consulta, SQL técnico autorizado e publicação.

## 26. Itens não concluídos

Importação de partidas FACEIT reais e login com FACEIT (MANUAL_REQUIRED), envio da revisão mensal (sem consentimento), benchmarks (sem fonte licenciada), motor contrafactual.

## 27. Recomendação pós-Fase 4.2

Validar a importação com uma conta FACEIT que tenha partidas de CS2 e atualizar a matriz; avaliar consentimento + notificações para a revisão mensal;
buscar acordo de dados profissionais com licença explícita antes de qualquer comparativo.

## Matriz final

| Módulo         | Fase   | Requisito                                            | Status                                    | Evidência                       | PR                    | Deploy     | Limitação                             |
| -------------- | ------ | ---------------------------------------------------- | ----------------------------------------- | ------------------------------- | --------------------- | ---------- | ------------------------------------- |
| H              | 4.2.9  | planos 7/30/90 com evidência                         | VALIDADO EM TESTE; página em produção     | adaptive.test, trainingRls, UI  | #328                  | `98d10f9c` | plano real precisa de amostra         |
| H              | 4.2.9  | adesão explícita, versões, histórico                 | VALIDADO EM TESTE                         | harness 26 checks               | #328                  | `98d10f9c` | —                                     |
| H              | 4.2.9  | Coach explica plano                                  | VALIDADO EM TESTE                         | coachPm5Context                 | #330                  | `98d10f9c` | sem conversa real observada           |
| I              | 4.2.10 | CRUD, coleções, tags, filtros                        | VALIDADO EM PRODUÇÃO                      | harness 28 checks, E2E PM5      | #326                  | `98d10f9c` | —                                     |
| I              | 4.2.10 | criar de replay/rounds/mortes/duelos/utility/heatmap | VALIDADO EM TESTE                         | momentsEntryPoints              | #326, #336            | `98d10f9c` | —                                     |
| J              | 4.2.10 | fonte/licença/equivalência                           | BENCHMARK_UNAVAILABLE                     | benchmarks.test                 | #329                  | `98d10f9c` | sem dataset                           |
| FACEIT         | PM5    | vínculo OAuth + sync                                 | VALIDADO EM PRODUÇÃO (conta sem partidas) | teste do dono; jobs `completed` | #327, #332, #338–#341 | `eeffaa2e` | importação de partidas não exercitada |
| FACEIT         | PM5    | login/cadastro                                       | VALIDADO EM TESTE                         | faceit.login.test, harness 13   | #331                  | `98d10f9c` | `email_verified` a confirmar          |
| Revisão mensal | PM5    | estrutura sem envio                                  | VALIDADO EM TESTE                         | monthlyReview.test              | #334                  | `98d10f9c` | envio MANUAL_REQUIRED                 |
