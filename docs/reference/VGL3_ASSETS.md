# VGL 3.0 — assets

Nenhum arquivo de asset foi adicionado, trocado ou alterado na VGL 3.0.

As peças novas reaproveitam o pacote existente, registrado em `docs/reference/CS2_ASSETS.md`:

- `KillFeedLine` e `RoundMarks` usam `public/cs2/weapons/*.svg` e `public/cs2/hud/{headshot,icon_c4_default,icon_defuse_default,icon_bomb_explosion_default,icon_skull_default}.svg`;
- `CoachMapContext` usa `public/cs2/maps/emblem/*.webp`;
- `SpecialtyStrip` usa os pictogramas `GameIcon`.

O que continua valendo:

- **Origem e substituição:** como em `CS2_ASSETS.md`. As telas não referenciam arquivos diretamente; o registro `src/lib/cs2/assets.ts` é o único ponto de troca.
- **Uso em tempo de execução:** nenhuma URL externa.
- **Licença:** a pendência das imagens da Valve continua registrada. O código MIT do repositório de origem não libera os direitos da arte.
