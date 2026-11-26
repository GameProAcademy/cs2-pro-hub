# /upload "Analisar meu jogo" — evolução visual, validação (2026-11-26)

Autorização do dono em 2026-11-26 (plano A–G aprovado com as decisões abaixo). Nenhum parser, backend, job, banco,
Storage, RLS, autenticação, integração, identificação, máquina de estados, contrato, limite ou validação de upload mudou.

## Decisões do dono

| Item                    | Decisão                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| P2 — frase do dropzone  | Corrigir só o texto de `analyze.notSent`                                                   |
| P5 — selos do histórico | Manter. Qualquer mudança no histórico é proposta separada                                  |
| P3 — FACEIT             | Investigar antes; depois de ver as evidências, autorizou a correção recomendada (só texto) |
| `PlayerIdentityPanel`   | Protegido nesta etapa, mesmo sendo tecnicamente separado                                   |
| Mobile                  | Layout atual até 1024 px, inclusive a posição de "Selecionar arquivo"                      |

## PRs

| PR   | Etapa | Conteúdo                                                                                                      | Merge      |
| ---- | ----- | ------------------------------------------------------------------------------------------------------------- | ---------- |
| #397 | E0    | Rede de proteção: bytes de 30 arquivos, 365 chaves × 5 idiomas, 28 renders SSR; smoke Playwright sem escrita  | `73d39504` |
| #398 | E1    | Textos: descrição e metadados só com a demo; `analyze.notSent`; título do card; enum do Gamers Club traduzido | `20e8b8d2` |
| #399 | E2    | Coluna "Como funciona" a partir de 1280 px; ícones nos cards                                                  | `f05ddfac` |
| #400 | E3    | Fontes de dados com `ToneBadge`, espaçamento entre painéis, aviso de fontes sem contradição com o FACEIT      | `229fe5a8` |

Todos com "Main required gates" verde. Publicação: deploy Lovable `6b55ec29` de `229fe5a8`.

## Proteção dos fluxos congelados

`src/lib/__tests__/uploadProtectedFlows.test.tsx` + `fixtures/uploadProtected.json` (linha de base `9d86fecf`):

1. **Arquivos:** git-blob de `UploadBox`, `DemoIngestPanel`, `DemoFlowModal`, `DemoFlowView`, `DemoPlayerIdentity`,
   `DemoProcessingStatus`, `DemoGuidancePanel`, `ReportProblem`, `demoFlowCopy`, `demoUploadFeedback`,
   `PlayerIdentityPanel`, das bibliotecas do pipeline que eles usam e dos textos `demoFlow`/`guidance` nos 5 idiomas.
2. **Chaves:** 365 chaves que esses arquivos podem exibir, nos 5 idiomas.
3. **SSR:** caixa de envio (5 idiomas), 20 fases do modal e 3 estados das etapas; os 28 hashes são distintos.

Prova negativa local: um byte a mais no `UploadBox.tsx` e uma frase francesa alterada fazem o teste falhar.

Única mudança autorizada no fixture (registrada em `AUTHORIZED_CHANGES`): `analyze.notSent` nos 5 idiomas e os 5
renders da caixa de envio. `git diff 9d86fecf` nos arquivos protegidos, em `src/lib/sources`, `src/lib/faceit` e
`supabase`: 0 linhas.

## FACEIT — investigação (só leitura)

| Camada   | Evidência                                                                                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código   | OAuth (`faceit.oauth*`, `faceit.connect.server`), worker no `pipeline-cron`, persistência canônica em `matches`/`match_metrics` (`faceit.sync.server`, `faceit.canonical.server`), lida pelo resumo do jogador (`playerData.functions`) |
| Produção | 1 conta FACEIT `connected`; 4 jobs `completed` (1 `initial`, 3 `incremental`), todos com `matches_found = 0`; 0 linhas FACEIT em `match_sources`; 0 métricas FACEIT                                                                     |

Conclusão: implementação efetiva em código, conexão e sincronização funcionando, mas nenhuma partida FACEIT chegou à
análise em produção. Por isso o selo do registro ("Disponível agora", conectável) ficou, e o aviso deixou de dizer que
nenhuma integração está ativa: agora diz que a demo .dem é a fonte principal da análise, que a conta FACEIT pode ser
conectada no Perfil e que as demais fontes só têm a arquitetura preparada. Registro e integração não mudaram.

## `PlayerIdentityPanel` — separação

O painel lê só `getMyExternalLinks` (contas Steam/FACEIT vinculadas, somente leitura, sem mutação). O fluxo de
identificação do jogador na demo (`DemoPlayerIdentity`) usa `getDemoIdentity`, `declareDemoPlayer` e
`decideAutomaticDemoPlayer` de `pipeline-identity.functions`. Não há módulo compartilhado além de i18n e utilitários.
Mesmo assim o painel ficou intocado (bytes travados) e mantém a largura inteira.

## Validação em produção

Workflow `Upload smoke E2E` (sem escrita), execução `45808610430`, contra `gamepro.network`:

| Verificação                                        | Resultado                                     |
| -------------------------------------------------- | --------------------------------------------- |
| Página abre (título, dropzone, botão)              | PASS                                          |
| Seletor de arquivo abre (nenhum arquivo escolhido) | PASS                                          |
| `.txt` rejeitado localmente, sem requisição        | PASS                                          |
| Release com o texto novo do dropzone               | PASS (o texto antigo não aparece)             |
| Requisições que poderiam gravar                    | 0                                             |
| Modal via `?identify=`                             | Não exercido: a conta A não tem demo pendente |

| Largura | Transbordo | Texto < 12 px | Botão presente | Coluna "Como funciona" |
| ------- | ---------- | ------------- | -------------- | ---------------------- |
| 360     | 0          | 0             | sim            | oculta                 |
| 390     | 0          | 0             | sim            | oculta                 |
| 430     | 0          | 0             | sim            | oculta                 |
| 768     | 0          | 0             | sim            | oculta                 |
| 1024    | 0          | 0             | sim            | oculta                 |
| 1440    | 0          | 0             | sim            | visível                |

O modal, a identificação e as etapas estão cobertos pelo travamento de bytes e de render SSR acima.

## Pendências

- **Texto protegido ainda errado:** depois de escolher o arquivo, `analyze.ready` diz "pronto para envio
  (processamento indisponível nesta etapa)". Não foi autorizado; precisa de decisão do dono.
- **Peculiaridade anterior mantida:** `lg:col-span-3` no card de fontes cria duas colunas implícitas vazias entre
  1024 e 1279 px, e o card de envio fica mais estreito que o de fontes (140 px de diferença, medido a 1536 px antes
  desta etapa; a partir de 1280 px a grade explícita nova substitui esse efeito). Mantido porque o layout até
  1024 px está congelado.
- **Capturas antes/depois:** não feitas nesta sessão (Claude in Chrome indisponível).
- **Testes manuais 5–8** (envio real, nick não encontrado, seleção e confirmação, etapas completas): exigem uma demo
  nova e criam dados; ficam para uma sessão com o dono.
