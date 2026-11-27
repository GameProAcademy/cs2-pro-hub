# VGL 4.0 — Deep Competitive Experience: validação final

Data: 2026-11-27. Conta de teste `teste@gamepro.academy` (10 partidas, resultados não determinados, 7 mapas, 8 snapshots do DNA v3, plano de 30 dias em 0/4, sem metas).

## PRs e publicação

| PR         | Escopo                                                                                                           | Merge      |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| #426       | Match Experience 2.0: Round em foco, radar do round, economia, visão geral e intros das abas                     | `fb9b1dc8` |
| #427       | Player Identity 2.0 (cartão de identidade, ranks) e Map Identity Panel                                           | `ef546e91` |
| #428       | Central de Treino (visão geral, áreas) e Coach (contexto do mapa 2.0, briefing vazio)                            | `9836a246` |
| #429       | Performance (destaques), Evolução (linha do tempo do DNA), Momentos agrupados, Início (comandos), Admin (ícones) | `c9ca9c99` |
| fechamento | correções encontradas em produção + documentação                                                                 | este PR    |

- Todos com "Main required gates" verde antes do merge (F553 R11.2, parser, contract-sensitive, web lint/build/tests).
- Lovable: `latest_commit_sha = c9ca9c99`, deploy `5d5be4b3-c157-4e30-9ac0-df2e001ba6f6`.
- O fechamento é publicado da mesma forma depois do merge.

## Smokes em produção (`c9ca9c99`)

- VGL smoke `46043709597` (com `coach_send=1`): 14 rotas × 7 larguras (360–1440) com 0 overflow e 0 texto < 12 px; 7 abas da Sala OK; 835 requisições de asset, 0 falhas; 0 erros de página; Coach respondeu (12 números, 0 erros).
- Upload smoke `46043713283`: `open`, `fileChooser`, `invalidFormat`, `releaseCopy` PASS; `ctaTop` 741/699/656/684/727/684/684 (idêntico à VGL 3); `nonGetRequestsAfterLogin` vazio.

## Inspeção manual (Chrome, desktop 1536 px e iframe de 390 px)

| Área        | Verificado                                                                                                                                                         | Resultado                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rounds      | seletor de round (clique no 6), economia em 4 degraus, fatos, kill feed, radar com marcador numerado e legenda                                                     | OK                                                                                                                                                            |
| Resumo      | "Sua partida": K/D/A, rating CT/TR, aberturas, trocas, flash; links para as 6 abas                                                                                 | OK                                                                                                                                                            |
| Player DNA  | cartão de identidade, top 3, contagens                                                                                                                             | **defeito:** arte do C4 em opacidade total sobre os números (desktop e celular) → corrigido no fechamento                                                     |
| Mapas       | painel do mapa selecionado: emblema, partidas, período, radar validado, partidas com K/D/ADR; resultado "—" (não determinado)                                      | OK                                                                                                                                                            |
| Treino      | Central de Treino, Áreas de treino                                                                                                                                 | **defeito:** em 390 px a visão geral passava da borda direita (título da prioridade, barras do plano, 3º bloco de sessões cortados) → corrigido no fechamento |
| Início      | linha Treino / AI Coach / Mapas                                                                                                                                    | OK                                                                                                                                                            |
| Performance | Destaques da janela (maior 1,65 Nuke, menor 0,35 Dust II)                                                                                                          | OK                                                                                                                                                            |
| Evolução    | Linha do tempo do DNA com impressão de 10 dimensões                                                                                                                | OK                                                                                                                                                            |
| Momentos    | agrupamento por partida, "mapa desconhecido" quando não há mapa                                                                                                    | OK                                                                                                                                                            |
| Coach       | conversa existente e resposta; o briefing vazio só aparece em conversa nova (não criada para não gravar dados na conta) — coberto por `vgl4TrainingCoach.test.tsx` | parcial                                                                                                                                                       |
| Admin       | rotas redirecionam para o Início na conta de teste                                                                                                                 | **não validado em produção** (precisa de sessão de administrador)                                                                                             |

## Defeitos encontrados e correções (PR de fechamento)

1. **Arte do cartão de identidade em opacidade total.** Causa: `.vgl-art` anima `opacity` e `transform` com `fill-mode: both`, sobrescrevendo `opacity-[0.1]` e `-translate-y-1/2` no mesmo elemento. Correção: opacidade e posição num wrapper; a animação fica no `Cs2Mask` interno. Teste: `vgl4Closure.test.ts` falha se qualquer `className` combinar `vgl-art` com `opacity-`/`translate-`.
2. **Central de Treino estourando 390 px.** Causa: coluna implícita `auto` do grid abaixo de `lg`. Correção: `grid-cols-1`; aplicado preventivamente aos grids novos da VGL 4 (Round em foco, visão geral, cartão de identidade, HudKit, BriefingKit).
3. **Rótulo "Sua equipe" truncado** na economia em 390 px: agora quebra linha.

Lacuna do smoke: a medição de overflow é da página; um card com `overflow-hidden` esconde o estouro interno (caso 2). Registrado aqui; o script do smoke não foi alterado nesta missão.

## Integridade

- Nenhum arquivo de motor alterado (`ENGINE_UNTOUCHED` em todos os PRs): parser, pipeline, métricas, DNA, Coach, banco, auth, upload.
- Ausente ≠ zero: economia desconhecida é tracejada; resultado não determinado é "—"; dimensão sem índice é tracejada na linha do tempo.
- Sem percentis, médias por mapa, arquétipos, trajetórias ou posição de granadas (sem fonte: `L02_NO_CONTINUOUS_POSITION_SOURCE`, `NO_UTILITY_POSITION_SOURCE`).

## Testes locais

- lint 0 erros; build OK; vitest completo no branch #429: 3286 passaram, 1 falha só de ambiente (`uploadLifecycleConcurrency.integration.test.ts`, precisa de Postgres descartável — não é aprovação).
