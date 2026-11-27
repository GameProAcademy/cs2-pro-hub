# VGL 4.0 — assets

Nenhum arquivo de asset foi adicionado, trocado ou alterado na VGL 4.0.

As peças novas reaproveitam o pacote registrado em `docs/reference/CS2_ASSETS.md`:

- `RoundRadar` (foco do round) usa os radares `public/cs2/radar/*` via `radarAsset(map, "default")`, as armas em `public/cs2/weapons/*.svg` e `public/cs2/hud/headshot.svg`;
- `EconomyDuel` e `RoundFacts` usam apenas tokens e pictogramas `GameIcon`;
- `MapIdentityPanel` e `CoachMapContext` usam `MapArt`, `public/cs2/maps/emblem/*.webp` e o radar do mapa;
- `IdentityCard`, `SpecialtyStrip`, `TrainingAreas` usam as silhuetas de `DIMENSION_ART` (já registradas na VGL 2.0) via `Cs2Mask`;
- `SnapshotTimeline`, `HighlightPair`, `HomeCommandRow`, `MatchOverview` e os ícones do Admin usam `GameIcon`, `MapEmblem` e `lucide-react`.

O que continua valendo:

- **Origem e substituição:** como em `CS2_ASSETS.md`. O registro `src/lib/cs2/assets.ts` é o único ponto de troca.
- **Uso em tempo de execução:** nenhuma URL externa (smoke VGL `46043709597`: 835 requisições de asset, 0 falhas).
- **Licença:** a pendência das imagens da Valve continua registrada. O código MIT do repositório de origem não libera os direitos da arte.
