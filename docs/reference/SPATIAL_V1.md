# `spatial-v1` camada A — posição no instante da morte

Marco 2 da missão de evolução (2026-11-12). Estado: **código pronto, NÃO publicado no worker**.
A publicação é o release R5.8.24 (seção "Release") e exige uma ação manual do dono.

## Causa raiz (fato)

`services/cs2-demo-parser/parser.py` chamava `demo.parse_event(name, [], list(_EVENT_OTHER_PROPS))`.
demoparser2 0.42.0 declara `parse_event(event_name, *, player=None, other=None)`: os argumentos são
**só por palavra-chave**. A chamada posicional sempre levantava `TypeError` e caía no
`demo.parse_event(name)` simples. Consequências:

1. nenhuma coordenada de jogador chegava aos eventos (o adaptador `adapter.py:423-424` e o
   normalizador `normalizer.ts:114-115` já estavam prontos para gravá-las);
2. `_EVENT_OTHER_PROPS` (`total_rounds_played`, `is_warmup_period`, `game_time`) **nunca** chegou às
   linhas de evento em produção; o código que os usaria (`parser.py` ~713–744, ~840) está dormente.

## Mudança

- `player_death` passa a ser lido com `parse_event(name, player=["X","Y","Z"])`; todo outro evento
  usa exatamente a chamada que produção efetivamente fazia (`parse_event(name)`). O fallback continua.
- `_EVENT_OTHER_PROPS` **não** foi ativado: isso mudaria a inferência de round/tick e precisa de
  validação própria (pendência registrada).
- Governança de campos: `player_death.attacker_X/Y/Z` → `events[].position` (MAPPED),
  `player_death.user_X/Y/Z` → `events[].victim_position` (MAPPED), `player_death.assister_X/Y/Z` →
  RAW only (ninguém lê). Catálogo `docs/reference/parser_field_catalog.json` regenerado; auditoria
  `parser_field_catalog.py check` PASS.

## Benchmark e validação (demo autorizada pelo dono, 2026-11-12)

Demo `furia-vs-gamerlegion-m3-dust2.dem` (311.024.457 bytes, SHA-256 `1c2710967417…`), a mesma da
partida `747c7a6b` da conta de teste; copiada para o ambiente isolado, **nada gravado em produção,
nada reprocessado em produção**.

| Medida                                                           | Resultado                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diferença estrutural da saída completa do parser, antes × depois | Só adições: `position`/`victim_position` em 100 eventos `player_death`, 9 campos RAW novos por morte e os digests/inventários que os descrevem. Rounds (16), eventos (5.149) e todos os demais valores idênticos (NaN = NaN) |
| Mortes com posição do autor e da vítima                          | 100 de 100                                                                                                                                                                                                                   |
| Coerência posição × campo `distance` do evento                   | erro relativo mediano 0,07%, p95 1,3%, máximo 3,3% (100 abates)                                                                                                                                                              |
| Posição da vítima no evento × `parse_ticks` no mesmo tick        | 62 idênticas, 46 diferentes por até 5,45 unidades (≈ 0,14 m) — ordem sub-tick; nenhuma ausente                                                                                                                               |
| Custo de tempo                                                   | `parse_event` de mortes 1,4–1,7 s com ou sem props; parse completo 112–113 s antes e depois                                                                                                                                  |
| Memória de pico do benchmark isolado                             | 548 MB                                                                                                                                                                                                                       |
| Volume adicional                                                 | ≈ 52 KB na saída do parser para 100 mortes; no banco, 2 objetos `{x,y,z}` por linha de abate em `round_events.data` (camada A cabe no banco; não há tabela nova)                                                             |
| Faixa de coordenadas (Dust2)                                     | x −2158…1595, y −1156…3060                                                                                                                                                                                                   |
| Zonas (`last_place_name`, lidas no benchmark)                    | 19 nomes do jogo (ex.: LongA, BombsiteB, Middle); **não** gravadas nesta versão                                                                                                                                              |

Testes: `services/cs2-demo-parser/tests/test_event_positions.py` (chamada por palavra-chave, só
mortes, fallback, governança) e, com `CS2_DEMO_FIXTURE`, a demo real (todas as mortes com as duas
posições, nenhum outro evento com posição, gate `RAW→CANONICAL` PASS). Suíte do parser: 543
aprovados, 15 ignorados sem a demo; com a demo, `test_real_demo.py` + `test_event_positions.py`: 12
aprovados.

## Estados de posição

Nesta camada, a posição é `OBSERVED` (lida no tick do próprio evento, do próprio jogador do
evento). Ausente → campo omitido (`missing_positions` continua sinalizado pelo normalizador); nunca
(0,0,0). Interpolação não existe nesta versão.

## O que não muda

Nenhuma migration, nenhuma tabela, nenhuma métrica, nenhuma tela. Partidas já processadas continuam
sem posição (nada é reprocessado). Heatmaps (4.2.2) dependem de uma decisão sobre a limitação L02
("sem métricas de posicionamento") — posição no tick do evento é `STATE_AT_EVENT_TICK`, não fluxo
contínuo de ticks, mas a liberação de qualquer métrica espacial precisa dessa revisão explícita.

## Release (R5.8.24) — sequência já usada no R5.8.23 (`docs/H3E_RELEASE_IDENTITY_TRACEABILITY.md`)

1. Merge do PR com a fila ociosa; o padrão de observação do Railway (`.release-freeze-r5-8-17`)
   impede deploy automático.
2. Railway: `PARSER_REVISION` e `PARSER_BUILD_REVISION` = `git:<merge>`; um único deploy desse
   commit; conferir `/health` e `/version` (revision = semantic = build).
3. PR de re-pin: recorder e assertion de proveniência (migration gerada pelo gerador do
   repositório e conferida contra a computação em produção), blobs críticos (`parser.py`,
   `raw_evidence.py`), probes e testes históricos; aplicar a migration.
4. **Ação do dono no Lovable (Cloud → Secrets), depois publicar:**
   `DEMO_PARSER_EXPECTED_REVISION` e `DEMO_PARSER_EXPECTED_BUILD_REVISION` = `git:<merge>`;
   `H3E91_EXPECTED_WORKER_BUILD_COMMIT` = `<merge>` (sem prefixo). Entre o passo 2 e este, o app
   recusa eventos do worker novo (falha fechada): **nenhuma demo deve ser enviada nessa janela**.
5. `parser-runtime-attestation` → proveniência VERIFIED; H.3-E activation PASS.

Rollback: Railway rollback para `7324404e` (commit `94c6460b`) e restaurar as três secrets.
