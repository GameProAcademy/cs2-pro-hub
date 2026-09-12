
## FASE 2.7.2B — RAW DEMO EVIDENCE & FULL COVERAGE — IMPLEMENTADA / E2E REAL BLOCKED

- Evidência parser-native separada do APP Raw Contract e do Canonical Engine.
- Inventário dinâmico via `list_game_events()`, com distinção explícita entre stream indisponível, vazio e falho.
- Eventos brutos preservam `raw_fields`; propriedades desconhecidas são catalogadas como `UNMAPPED_BUT_AVAILABLE`.
- Capacidades `parse_ticks()` e `parse_grenades()` são testadas e amostradas separadamente do canônico.
- Evidência de player, round, economia, posições, movimento, armas, granadas e campos ausentes usa `NULL/UNKNOWN`, sem coerção para zero/false/string vazia.
- `raw_demo_evidence_reports` recebe upsert idempotente antes da normalização e é consultável somente pelo owner/staff; escrita permanece `service_role`.
- `round_players` só pode surgir de sides/economia observados em snapshots reais nos ticks de início/fim; nenhum registro artificial foi criado.
- Console `/admin/demo-e2e` mostra manifest, event/player/tick/grenade coverage, matriz RAW→CONTRACT→CANONICAL e gates.
- Gates `RAW-EVIDENCE-01`, `EVENT-COVERAGE`, `PLAYER-COVERAGE`, `ROUND-COVERAGE`, `ECONOMY-COVERAGE`, `TICK-COVERAGE`, `GRENADE-COVERAGE` e `RAW→CANONICAL` são calculados sem relaxar o Gate 02-B.
- Testes determinísticos cobrem inventário, vazio versus falha, campos nativos, NULL semantics, digest, mapeamento e projeção por evidência.
- O E2E real de `furia-vs-gamerlegion-m1-cache.dem` não foi executado nesta rodada porque o artefato privado não está disponível no ambiente. Portanto os gates baseados na demo real permanecem **BLOCKED**, e a FASE 2.8 não foi iniciada.
