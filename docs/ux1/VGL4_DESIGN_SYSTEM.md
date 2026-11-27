# VGL 4.0 — design system

Amplia a biblioteca das VGL 1 a 3, sem substituir peças. Os tokens continuam os de `styles.css`: lima, CT azul,
T dourado, roxo de utilitários e vermelho só para estados negativos reais. A tipografia também continua:
Chakra Petch, IBM Plex Sans e Mono.

## Famílias e peças

| Família | Peça | Arquivo | Uso |
| --- | --- | --- | --- |
| Match | `RoundFocus` | `cs2/RoundFocus.tsx` | Round selecionado: cabeçalho, economia, cartões de fato, radar e kill feed |
| Match | `RoundRadar` | `cs2/RoundFocus.tsx` | Radar oficial com marcadores numerados das suas eliminações e mortes do round |
| Match | `EconomyDuel` | `cs2/RoundFocus.tsx` | Compra sua × adversário em duas barras rotuladas |
| Match | `MatchOverview` | `cs2/MatchOverview.tsx` | Faixa de desempenho, HUD de eventos e atalhos da Sala |
| Match | `TabIntro` | `cs2/MatchOverview.tsx` | Cabeçalho de seção das abas |
| Identity | `IdentityCard` | `cs2/IdentityKit.tsx` | Topo do Player DNA |
| Identity | `DimensionRank` | `cs2/IdentityKit.tsx` | Posição #n/N e selo de especialidade ou a desenvolver |
| Identity | `SnapshotTimeline` | `cs2/IdentityKit.tsx` | Snapshots do DNA em linha do tempo |
| Map | `MapIdentityPanel` | `cs2/MapIdentity.tsx` | Arte, dados e partidas do mapa selecionado |
| Training | `TrainingOverview`, `TrainingAreas` | `cs2/TrainingKit.tsx` | Topo da central de treino |
| Briefing | `CoachMapContext` 2.0, `CoachEmptyBriefing` | `cs2/BriefingKit.tsx` | Contexto e estado vazio do Coach |
| HUD | `HighlightPair` | `cs2/HudKit.tsx` | Maior e menor valor de uma série existente |

## Regras de uso

1. **Valor:** um número vem de um campo já existente. Uma visualização nunca calcula taxa, média nova ou percentil.
2. **Ausência:** é "—", tracejado ou estado vazio com explicação; nunca zero.
3. **Cor:**
   - lima = você ou positivo real;
   - vermelho = sua morte ou perda real;
   - CT/T pelo lado;
   - a cor nunca é o único sinal: sempre acompanha texto ou ícone.
4. **Motion:** entrada curta (`vgl-rise`, `vgl-feed`), seleção (`vgl-focus`), marcador do radar (`vgl-ping`). Tudo
   desligado com `prefers-reduced-motion`.
5. **Toque:** alvos ≥ 44 px (`min-h-11`) em controles; marcadores do radar acompanham uma lista acessível.
6. **Textos:** chaves `vgl4.*` nos cinco idiomas.

## Exemplos

```tsx
<RoundFocus rounds={r.rounds} matchId={r.matchId} map={r.map} />
<IdentityCard dims={dna.dimensions} matches={dna.matches} rounds={dna.rounds} />
<MapIdentityPanel map={h.map} matches={overviewMatchesOnMap} support={h.support} />
```
