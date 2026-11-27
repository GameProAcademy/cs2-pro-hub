# VGL 4.0 — plano de implementação

| PR | Família | Conteúdo | Testes |
| --- | --- | --- | --- |
| vgl4/1-match | Match Experience 2.0 | `RoundFocus`, `RoundRadar`, `EconomyDuel`, `MatchOverview`, `TabIntro`; Rounds com round em foco; Resumo com visão geral; docs da matriz | Marcadores = pontos do round; nulos; economia; idiomas |
| vgl4/2-identity-maps | Player Identity 2.0 e Map Experience | `IdentityCard`, `DimensionRank`, `SnapshotTimeline`, especialidades 2.0; `MapIdentityPanel` | Ranking = assinatura; só snapshots da versão; partidas do mapa |
| vgl4/3-training-coach | Training e Coach | `TrainingOverview`, `TrainingAreas`; contexto do Coach com partidas do mapa; estado vazio do Coach | Áreas = catálogo; texto do Coach idêntico |
| vgl4/4-rest | Performance, Evolução, Momentos, Início, Admin | `HighlightPair`; linha do tempo na Evolução; momentos por partida; atalhos do Início; navegação do Admin | Empate sem destaque; agrupamento preserva itens |
| vgl4/5-closure | Correções de produção e documentação final | `VGL4_FINAL_VALIDATION.md`, `VGL4_ASSETS.md`, checkpoints | Smokes |

Depois de cada merge: deploy pelo fluxo Lovable, VGL smoke (14 rotas × 7 larguras + Coach), upload smoke,
inspeção no Chrome (desktop e moldura de 390 px).
