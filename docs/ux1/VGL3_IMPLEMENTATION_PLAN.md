# VGL 3.0 — projeto visual e plano de implementação (2026-11-27)

Deriva de `VGL3_VISUAL_OPPORTUNITY_MATRIX.md`. Só apresentação; o motor não muda.

## Cinco famílias e as peças de cada uma

| Família              | Peças existentes                                                             | Peças novas (VGL 3.0)                                      |
| -------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A. Competitive HUD   | `HudStat`, `MetricCard`, `RadialGauge`, `ToneBadge`, `SideBadge`, `SideLogo` | `ScoreLine` (placar compacto com estado "não determinado") |
| B. Tactical Radar    | `MapArt`, `MapEmblem`, `MapGallery`, heatmap no radar oficial                | Estado "selecionado" na galeria                            |
| C. Player Identity   | `DnaSignature`, `DnaTrend`, `ProfileHero`                                    | `SpecialtyStrip` (mesma `signature()`)                     |
| D. Match Timeline    | `RoundStrip`, `SideSplit`, `RoundItem`, `EventGlyph`                         | `RoundMarks`, `KillFeed`, `RoundJump`                      |
| E. Tactical Briefing | Camadas O → I → R do Raio-X, seções do Coach                                 | `BriefingRail`, `CoachMapContext`                          |

Arquivos novos ficam em `src/components/cs2/` (`MatchTimeline.tsx`, `IdentityKit.tsx`, `BriefingKit.tsx`).
Nenhuma dependência nova. Nenhum asset novo: o pacote `public/cs2` e os radares já cobrem as peças.

## Motion

Reaproveita `vgl-rise`, `vgl-lift`, `vgl-grow`, `vgl-sweep`. Novos:

- `vgl-feed`: entrada lateral curta das linhas do kill feed;
- `vgl-focus`: anel lima ao saltar para um round.

Tudo desligado com `prefers-reduced-motion`.

## PRs

| PR                  | Escopo                                                                                                                                                                | Critério de aceite                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| vgl3/1-timeline     | `MatchTimeline.tsx` (`KillFeed`, `RoundMarks`, `RoundJump`, `ScoreLine`); Sala: marcas na faixa, kill feed no round, navegação por round, placar no cabeçalho; motion | Cada linha do feed vem de um item real; placar só quando o servidor tem; testes |
| vgl3/2-home-matches | Início: defeitos 1 e 2, `SpecialtyStrip`; Partidas: placar no cartão, KPIs 2×N, aviso de limitação; Perfil: especialidades                                            | Sem sobreposição a 360–430 px; mesmos números do DNA                            |
| vgl3/3-briefing     | Coach: cabeçalho compacto no celular, altura da conversa, `CoachMapContext`; Raio-X: `BriefingRail`; DNA: metodologia em "Como ler"                                   | Texto do Coach idêntico; nenhuma conclusão nova                                 |
| vgl3/4-maps-density | Mapas: selecionado; Momentos: emblema; Evolução e Performance: tabelas como cartões no celular; Treino: categorias; Admin: `StatCard`                                 | Mesmos valores; sem rolagem lateral                                             |
| vgl3/5-closure      | Correções vistas em produção, `VGL3_FINAL_VALIDATION.md`, `VGL3_ASSETS.md`, checkpoints                                                                               | Smokes verdes; capturas antes/depois                                            |

## Testes por PR

tsc, eslint, build, vitest completo (falha só de ambiente documentada), teste de proteção do Upload, testes novos
de dados (contagem, nulos, texto preservado), 5 idiomas por chave nova. Depois do deploy: VGL smoke (14 rotas × 7
larguras, Coach), upload smoke, capturas no Chrome (desktop e moldura de 390 px).
