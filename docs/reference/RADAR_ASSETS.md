# Imagens de radar — camada de fundo dos heatmaps

Registro: `src/lib/spatial/radarAssets.ts`. Arquivos: `public/radars/cs2/<mapa>-<nível>.png`.
Teste de integridade (SHA-256 de cada arquivo servido): `src/lib/__tests__/spatialHeatmapUi.test.tsx`.

## Decisão

Uso **provisório** das imagens oficiais de radar da Valve, nos heatmaps e nas visualizações espaciais, durante a fase de desenvolvimento e testes.

- Autorizado pelo dono do projeto em 2026-11-12.
- Depois, o CS2 PRO vai criar radares vetorizados próprios.

## Origem dos arquivos

Cada PNG é a textura de radar do próprio jogo:

- caminho no jogo: `panorama/images/overheadmaps/<mapa>[_lower]_radar_psd.vtex_c`;
- pacote: `game/csgo/pak01_dir.vpk` do Counter-Strike 2 (Steam app 730, build 25218825);
- decodificada para PNG 1024 × 1024 com Source2Viewer-CLI 20.0.6980.

Os arquivos foram obtidos da extração publicada no pacote npm `@mizar-hud/radar-view@0.1.0`
(`dist/radar-provenance.json`, que registra caminho e SHA-256 da fonte e da saída):

- os 16 SHA-256 de saída foram conferidos contra essa proveniência;
- cada SHA-256 está no registro;
- só as imagens, que são da Valve, foram copiadas; nenhum código do pacote (AGPL).

| Mapa                                                                          | Níveis         |
| ----------------------------------------------------------------------------- | -------------- |
| de_ancient, de_anubis, de_cache, de_dust2, de_inferno, de_mirage, de_overpass | default        |
| de_nuke, de_train, de_vertigo                                                 | default, lower |

## Alinhamento

- A imagem cobre exatamente o quadro do radar, de 0 a 1024 nos dois eixos, o mesmo espaço da transformação `radar-transform-v1` (`maps.ts`).
- Sem nova calibração: `pos_x`, `pos_y` e `scale` vêm do mesmo build do jogo das imagens.

Prova visual no de_dust2, com a demo de benchmark autorizada:

- As 200 posições de morte caem no piso jogável.
- As plantas de bomba caem dentro das áreas dos sites A e B desenhadas no radar.
- Os spawns médios no fim do freeze time caem dentro das zonas de spawn TR e CT.

Os outros mapas continuam **NOT_VALIDATED**: a imagem existe, mas o heatmap só é liberado depois
da mesma comparação com posições reais de uma demo do mapa.

## Desacoplamento e substituição futura

- O motor de heatmap (`heatmap.ts`, `maps.ts`) trabalha só em coordenadas de radar e não importa o registro. Há teste para isso.
- A interface pergunta ao registro qual fundo desenhar (`radarAsset(map, level)`). Sem entrada no registro, desenha a grade neutra.
- Para trocar pelos radares próprios:
  1. adicionar entradas `CS2PRO_VECTOR` com o mesmo quadro 1024 × 1024 (PNG/WebP 1024 px ou SVG com `viewBox="0 0 1024 1024"`);
  2. remover as `VALVE_OFFICIAL_PROVISIONAL`.
     Nada mais muda: nem dados, nem transformação, nem testes de posição.

## Rollback

Apagar `public/radars/` e o registro (ou esvaziar `RADAR_ASSETS`). A interface volta à grade neutra.
