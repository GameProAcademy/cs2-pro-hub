# Heatmaps espaciais — `spatial-heatmap-v1` + `radar-transform-v1` (PM1, entrega 4.2.2)

Código puro:

- `src/lib/spatial/maps.ts` (mapas e transformação);
- `src/lib/spatial/heatmap.ts` (read model).

Testes: `src/lib/__tests__/spatialHeatmap.test.ts`.

## Fonte dos dados

- `round_events` do tipo `kill`, uma linha por morte.
- `data.position` é a posição do **atacante** e `data.victim_position` a da **vítima**, as duas **no tick da morte**.
- Origem: parser R5.8.24 (spatial-v1 camada A, `docs/reference/SPATIAL_V1.md`).
- São amostras pontuais. Não são trajetória, presença, ocupação, rota nem tempo de exposição, e nada aqui interpola entre elas.

## Camadas

| Camada   | Posição usada                       | Entidade                     | Tick     | Quem entra             |
| -------- | ----------------------------------- | ---------------------------- | -------- | ---------------------- |
| `DEATHS` | `round_events.data.victim_position` | vítima (o próprio jogador)   | da morte | mortes do jogador      |
| `KILLS`  | `round_events.data.position`        | atacante (o próprio jogador) | da morte | eliminações do jogador |

Rótulo na interface: "sua posição no tick da sua morte" e "sua posição no tick da eliminação".
Nunca aparece o rótulo genérico "local da kill".

**NOT_MEASURED** (não calculadas, com o motivo):

- posição de dano causado/recebido: `player_hurt` não tem posição;
- presença, rotas e tempo de exposição: L02, sem fonte contínua permitida;
- utilitários: sem posição de lançamento ou detonação no contrato.

## Lado CT/T

- O lado é o do próprio jogador **naquele round**, vindo de `round-context-v1` (`round_players.side`). É a mesma fonte do Marco 1, sem cópia.
- Lado desconhecido fica fora dos filtros CT/T e é contado em `excluded.SIDE_UNKNOWN`.
- Lado do jogador, vencedor do round e identidade de time seguem como campos separados (L04).

## Transformação (`radar-transform-v1`)

Fórmula, conforme a documentação da Valve para minimapas:

- radar_x = (x − pos_x)/scale;
- radar_y = (pos_y − y)/scale;
- espaço de 1024 × 1024 px, origem no canto superior esquerdo.

Parâmetros:

- Vêm dos arquivos do jogo `resource/overviews/<mapa>.txt`, no `pak01_dir.vpk` (CS2, app 730, build 25218825). O SHA-256 de cada arquivo-fonte está no código.
- Foram conferidos com a proveniência de extração publicada no pacote npm `@mizar-hud/radar-view@0.1.0`. Do pacote ficam só os fatos numéricos e a origem; nenhum código ou imagem dele (licença AGPL).

Mapas com dois níveis (nuke, train, vertigo):

- o nível é decidido pela altitude, com o limite em `AltitudeMax` da seção "lower";
- cada nível é um plano separado.

### Validação por mapa

Só um mapa **VALIDATED** gera heatmap. Os demais aparecem como "mapa ainda não validado", sem
desenho (PM1 §7.4).

| Mapa                                                                    | Estado        | Evidência                                                                                        |
| ----------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| de_dust2                                                                | **VALIDATED** | Ver lista abaixo                                                                                 |
| mirage, inferno, nuke, ancient, anubis, cache, overpass, train, vertigo | NOT_VALIDATED | Parâmetros oficiais, ainda não comparados com posições reais. Basta uma demo autorizada do mapa. |

Evidência do de_dust2, com a demo de benchmark autorizada (SHA-256 `1c271096…`) e demoparser2 0.42.0:

- 200 de 200 posições de morte caem dentro do radar (x 72–925, y 41–999).
- Spawns no fim do freeze time, 30 amostras de cada lado:
  - T no centro-baixo, média radar (380, 915);
  - CT em cima, média radar (621, 187).
- Plantas de bomba, `bomb_planted` com `user_X/Y`, formam dois aglomerados, um por site:
  - radar (~250, 153), 6 plantas;
  - radar (~790, 163), 6 plantas.
- Conclusão: norte em cima, sem espelhamento, escala coerente.

Script reproduzível: parse de `round_freeze_end` + `parse_ticks(["X","Y","team_num"])` + `bomb_planted(player=["X","Y","Z"])`.

## Posições inválidas — nunca em (0,0)

Cada morte elegível sem posição desenhável é contada num destes motivos:

| Motivo           | Significado                                 |
| ---------------- | ------------------------------------------- |
| `MISSING`        | ausente; parser anterior ao R5.8.24         |
| `INVALID`        | não numérica ou não finita                  |
| `SUSPECT_ORIGIN` | exatamente (0,0,0), padrão de preenchimento |
| `OUT_OF_BOUNDS`  | fora da imagem do radar                     |
| `OTHER_LEVEL`    | válida, mas no outro nível do mapa          |
| `SIDE_UNKNOWN`   | lado desconhecido com filtro CT/T ativo     |
| `UNKNOWN_MAP`    | mapa desconhecido                           |

## Bins, contagem e normalização

- Grade de 32 × 32 células de 32 px de radar, o que dá cerca de 140 unidades de mundo no dust2.
- Contagem por célula. A soma das células é igual aos eventos desenhados.
- `events`: envelope `metric-contract-v1.1`.
  - Valor = eventos desenhados.
  - `coverage` = desenhados / elegíveis no plano.
  - Status:
    - `OBSERVED` com cobertura total;
    - `PARTIAL` com cobertura parcial;
    - `UNAVAILABLE` quando há elegíveis mas nenhum tem posição, ou o mapa não é suportado;
    - `NOT_OBSERVED` quando não há elegíveis (valor `null`, nunca 0).
- `perRound`:
  - eventos desenhados / rounds do jogador no filtro de lado;
  - `INSUFFICIENT_SAMPLE` abaixo de 10 eventos (heurística declarada);
  - `null` com denominador zero.
- Participação % por célula: célula / desenhados, calculada na interface só quando `perRound` não está em `INSUFFICIENT_SAMPLE`.
- Não há densidade temporal: exigiria exposição/tempo, que não é medido (spec §11.4).
- Não há suavização: as células mostram contagens observadas.

## Limites e desempenho

- Agregação sob demanda, no servidor, sobre as mortes do próprio jogador.
- Uma partida tem cerca de 100–200 mortes no total; as do jogador são uma fração disso.
- Nunca se envia tick por tick ao navegador.
- Drill-down limitado a 5.000 pontos (`pointsTruncated`). As contagens continuam completas.
- Determinístico e idempotente: entrada em qualquer ordem produz a mesma saída, e um evento duplicado conta uma vez.

## Imagens de radar

Uso provisório das imagens oficiais da Valve, autorizado pelo dono em 2026-11-12. A camada é
desacoplada do motor: `docs/reference/RADAR_ASSETS.md`. Sem imagem registrada, o fundo é a grade
neutra. Trocar o fundo não muda nenhum dado.

## Rollback

Reverter os PRs. Não há migration, e a camada é só leitura.
