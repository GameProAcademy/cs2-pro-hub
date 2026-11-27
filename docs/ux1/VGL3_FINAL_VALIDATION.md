# VGL 3.0 — validação final (2026-11-27)

## Estado

- **Commit inicial:** `94ce7677` (#420).
- **PRs:**

| PR               | Escopo                                                             | Merge          |
| ---------------- | ------------------------------------------------------------------ | -------------- |
| #421             | Matriz, plano e família Match Timeline (Sala)                      | `c8bf87cd`     |
| #422             | Especialidades, Início e Partidas no celular, placar desconhecido  | `8f8826cf`     |
| #423             | Tactical Briefing: Raio-X, Coach (contexto de mapas, celular), DNA | `8ec8c6da`     |
| #424             | Tabelas empilhadas no celular, Mapas, Momentos, Treino, Admin      | `aa3129cc`     |
| PR de fechamento | Correções vistas em produção e esta documentação                   | ver checkpoint |

- **Publicado:** deploy Lovable `3f2dda1f` de `aa3129cc` (#421–#424). O PR de fechamento ganha deploy próprio.

## Componentes

| Família           | Novos                                                         | Reaproveitados                                      |
| ----------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Competitive HUD   | `SegmentedCount`, `ScoreLine`                                 | `MetricCard` (+`className`), `HudStat`, `ToneBadge` |
| Tactical Radar    | estado "Selecionado" da galeria                               | `MapGallery`, `MapArt`, `MapEmblem`                 |
| Player Identity   | `SpecialtyStrip`, `latestSpecialties`                         | `signature()`, `DNA_ICON`, `comparableSnapshots()`  |
| Match Timeline    | `KillFeedLine`, `RoundMarks`, `RoundMarksLegend`, `RoundJump` | `RoundStrip`, `SideSplit`, `WeaponArt`, `HudIcon`   |
| Tactical Briefing | `BriefingRail`, `CoachMapContext`, `citedMaps`                | `coachTokens()`, camadas do Raio-X                  |
| Layout            | `lib/ui/stackedTable.ts`                                      | —                                                   |

Motion novo: `vgl-feed`, `vgl-score`, `vgl-focus`, desligados com `prefers-reduced-motion`.
Assets: nenhum novo (ver `docs/reference/VGL3_ASSETS.md`).

## Por tela

| Tela                | Mudança                                                                                                                                                           | Produção                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Início              | Especialidades (iguais ao DNA: 80, 68, 66 / 34, 35); botão do hero em linha própria no celular (defeito corrigido); KPIs 2×N no celular                           | Conferido desktop e 390 px                              |
| Partidas            | KPIs 2×N e aviso empilhado no celular; placar desconhecido "— : —" com rótulo                                                                                     | Smoke                                                   |
| Sala                | Marcas na faixa (abertura, clutch, bomba) com legenda; navegação por round; kill feed real no round (round 7: 10 linhas = 10 eventos); placar só quando resolvido | Conferido desktop e 390 px                              |
| Mapas               | Selo "Selecionado" e brilho                                                                                                                                       | Conferido                                               |
| Player DNA          | Base metodológica e método do radar em "Base desta leitura" (mesmo texto)                                                                                         | Conferido 390 px                                        |
| Raio-X              | Trilha Observado 6 → Inferência 3 → Recomendação 3, com salto                                                                                                     | Conferido                                               |
| Performance         | Componentes do Score como cartões no celular                                                                                                                      | Smoke                                                   |
| Evolução            | 10 métricas como cartões no celular, sem rolagem lateral (largura 375 = 375)                                                                                      | Conferido 390 px                                        |
| Treino              | Adesão como segmentos (0/4, igual ao texto)                                                                                                                       | Conferido                                               |
| Coach               | Cabeçalho compacto no celular (área da conversa maior); "Mapas citados" sob a resposta (Mirage, 2 partidas)                                                       | Conferido desktop e 390 px                              |
| Perfil              | Especialidades abaixo do hero                                                                                                                                     | Smoke                                                   |
| Momentos            | Faixa lateral por tipo                                                                                                                                            | Smoke                                                   |
| Metas, Notificações | Preservadas (VGL 2 continuação)                                                                                                                                   | Smoke                                                   |
| Admin               | Régua lima no indicador; resto preservado                                                                                                                         | **Não validado em produção** (conta de teste sem admin) |
| Upload              | Sem mudança                                                                                                                                                       | Upload smoke idêntico                                   |

## Testes

- **Local:** tsc, eslint e build OK. Vitest: 3255 passaram. Uma falha é só de ambiente:
  `uploadLifecycleConcurrency.integration.test.ts` precisa de um Postgres descartável, ausente aqui.
- **Novos:** `vgl3Timeline` (13), `vgl3Identity` (7), `vgl3Briefing` (8), `vgl3Density` (8), `vgl3Closure` (3).
  Cobrem dados reais por linha, nulos, texto preservado e os cinco idiomas.
- **Gates:** "Main required gates" verde em #421–#424.
- **Produção:**
  - VGL smoke `45985745386` (coach_send=1):
    - 14 rotas × 7 larguras, com 0 overflow e 0 texto < 12 px;
    - 7 abas da Sala sem falhas;
    - 711 assets, nenhuma falha;
    - 0 erros de página;
    - o Coach respondeu (12 números).
  - Upload smoke `45985748571`: os mesmos `ctaTop` de antes (741/699/656/684/727/684/684), nenhuma escrita.

## Integridade

- O diff não toca `*.functions.ts`, `*.server.ts`, `supabase/`, `scripts/`, nem `src/lib/{pipeline,metrics,combat,utility,dna,faceit,sources,spatial}`.
- `coachContext`, provider, modelo, prompts, memória e streaming do Coach também não mudam.
- Nenhum número novo: os componentes leem os mesmos campos (`RoundReport`, `TimelineItem`, histórico do DNA, `adherence`) e não calculam taxas.

## Limitações

- **Admin:** a conta de teste é redirecionada nas 9 rotas. A inspeção visual precisa de uma sessão de administrador.
- **Celular:** o Chrome do dono não reduz a janela. As capturas de 390 px foram feitas numa moldura da mesma origem; as larguras 360–1440 estão cobertas pelo smoke.
- **Idiomas:** os cinco idiomas foram verificados por teste. A troca de idioma na interface não foi feita em produção, porque grava a preferência da conta.
- **Placar:** a conta de teste não tem resultado resolvido. Placar conhecido só foi coberto por teste.
