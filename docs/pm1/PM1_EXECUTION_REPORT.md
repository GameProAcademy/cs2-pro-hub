# PM1 — Relatório de execução (Fases 4.2.1 e 4.2.2, Módulos A e B)

Prompt: `docs/specifications/CS2_PRO_PROMPT_MESTRE_1.txt`. Especificação vigente:
`docs/specifications/CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre_v1.1.md`.
Continuidade canônica: `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`. Este relatório é o detalhe do PM1.

Convenção: **FATO** = verificado nesta sessão, com a fonte indicada; **HIPÓTESE** = inferido do
código, sem prova em produção; **LACUNA** = evidência que ainda falta.

## C0 — Entrada (auditoria read-only, 2026-11-12)

| Item                                  | Estado                                                                                             | Evidência                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 4.1                              | **FATO: concluída**                                                                                | `FASE_4_2_MAPEAMENTO.md` §0. PR #255 (`e4a329ef`) merged. Migrations `20261106100000/110000/120000` aplicadas. Nenhum PR aberto da 4.1. |
| `main`                                | **FATO:** `932839afbe8160d90fc58b592f8d2406bc8d026e` (merge do #269)                               | `gh api repos/.../commits/main`                                                                                                         |
| PRs abertos                           | **FATO:** 14 antigos (#7–#161), todos de fases anteriores; nenhum toca a 4.2                       | `GET /pulls?state=open`                                                                                                                 |
| PR #263 (Marco 0)                     | **FATO:** merged                                                                                   | merge `bf57069e`                                                                                                                        |
| PR #264 (Marco 1, `round-context-v1`) | **FATO:** merged, publicado e validado em produção                                                 | merge `e60a70f6`. Lados e resultados conferidos no Raio-X da conta de teste contra o cálculo no banco (checkpoint).                     |
| PR #266 (4.2.1 `metric-contract-v1`)  | **FATO:** merged                                                                                   | merge `4c6f5067`                                                                                                                        |
| PR #267 (spatial-v1 camada A, parser) | **FATO:** merged e servido                                                                         | merge `4badf606`                                                                                                                        |
| Parser servido                        | **FATO:** Railway `0ff96670`, SUCCESS, commit `4badf606`. Deploy anterior `7324404e` REMOVED.      | `list-deployments` (Railway)                                                                                                            |
| Identidade/atestação                  | **FATO:** provenance `0ce00afd` VERIFIED. `assert_verified_parser_provenance` = VERIFIED.          | `parser_runtime_provenance` (consulta read-only)                                                                                        |
| H.3-E                                 | **FATO:** PASS 18/18 no run 43201041009 (`932839af`)                                               | GitHub Actions                                                                                                                          |
| Última migration                      | **FATO:** `20261112090000_r5_8_24_repin_runtime_release` aplicada (`direct-lovable-cloud-apply`)   | `supabase_migrations.schema_migrations`                                                                                                 |
| Provedor do Coach                     | **FATO (código):** OpenRouter + `openai/gpt-oss-20b`, sem fallback OpenAI. Nada no PM1 toca nisso. | `docs/AI_COACH_PROVIDERS.md`                                                                                                            |

## C1 — Descoberta

### Posições (Módulo A, 4.2.2)

| Camada da cadeia         | Estado                                                                                                                                                                                              | Evidência                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Parser                   | **FATO:** `player_death` lido com `X/Y/Z` do atacante (`attacker_*`), da vítima (`user_*`) e do assistente (`assister_*`, só RAW) no tick da morte. Benchmark: 100/100 mortes com as duas posições. | `services/cs2-demo-parser/parser.py`, `docs/reference/SPATIAL_V1.md` |
| Adapter do worker        | **FATO (código):** `position` e `victim_position`                                                                                                                                                   | `adapter.py:423-424`                                                 |
| Bridge/transporte (app)  | **FATO (código):** `RawParserEvent.position/victim_position`                                                                                                                                        | `src/lib/pipeline/types.ts:96-97`                                    |
| Normalizer               | **FATO (código):** copia para `CanonicalEvent.data.position` / `data.victim_position`, só eventos de morte                                                                                          | `src/lib/pipeline/normalizer.ts:113-114`                             |
| Adapter canônico         | **FATO (código):** `data: event.data`                                                                                                                                                               | `src/lib/canonical/adapters/demo.adapter.ts:183`                     |
| Persistência             | **FATO (definição no banco):** `persist_canonical_observation(jsonb,uuid,uuid)` grava `COALESCE(e.value->'data','{}')` em `round_events.data`                                                       | `pg_get_functiondef` (read-only)                                     |
| Persistência em produção | **LACUNA:** nenhuma partida processada desde o deploy R5.8.24. As 6 partidas existentes (de_cache ×2, de_mirage, de_ancient, de_nuke, de_dust2) não têm posição, e não serão reprocessadas.         | `round_events` (read-only): 0 eventos nos últimos 3 dias             |
| Prova ponta a ponta      | **MANUAL_REQUIRED:** uma demo nova da conta de teste, autorizada pelo dono (pedido feito em 2026-11-12).                                                                                            | —                                                                    |

O que as posições **são**: amostras pontuais no tick de cada morte. O que **não são**: trajetória,
presença, ocupação, rota ou tempo de exposição. Essas camadas ficam **NOT_MEASURED**: não existe
fonte contínua permitida (L02).

### Lado CT/T (reuso do Marco 1)

**FATO:** `round_players.side` por participante e por round, lido sob RLS. A função pura
`buildMatchRounds` (`src/lib/roundContext.ts`) já resolve o lado do próprio jogador por round
(conflito → `UNKNOWN`). O PM1 reutiliza essa fonte e não cria outra. Identidade de time, vencedor
do round e lado do jogador continuam campos separados; L04 segue vigente para identidade de time e
placar.

### RLS / ownership (read-only)

**FATO** (`pg_policies`):

- `round_events`, `match_rounds` e `matches`: SELECT com `is_staff(auth.uid()) OR owns_canonical_match(...)`.
- `round_players` e `match_participants`: SELECT com `owns_canonical_match(match_id)`.
- O read model do PM1 roda com a sessão do usuário (`requireSupabaseAuth`), nunca com o service role, e filtra pelo próprio participante. Um staff, portanto, também vê só os próprios eventos no heatmap.

### Métricas (4.2.1)

**FATO:**

- Catálogo existente: `src/lib/metrics/canonicalMetrics.ts` (`metrics-catalog-v1`, 17 métricas exibidas, com teste de cobertura da UI).
- Envelope, taxonomia e matriz de liberação: `src/lib/metrics/metricContract.ts` (#266).
- Lacunas registradas no #266:
  - envelope ainda não adotado em read models novos;
  - `coverage`/`evidence_refs` não preenchidos;
  - `PARTIAL` ausente: a especificação v1.1 o introduziu em 12/11.

### Transformação de coordenadas

**FATO:**

- Parâmetros oficiais de radar (`pos_x`, `pos_y`, `scale`, seções verticais) vêm dos arquivos do jogo `resource/overviews/<mapa>.txt`, extraídos do `pak01_dir.vpk` (Steam build 25218825, app 730).
- Valores e SHA-256 de cada arquivo-fonte registrados em `src/lib/spatial/maps.ts` (PR B).
- A fórmula é a documentada pela Valve para minimapas: x_radar = (x − pos_x)/scale; y_radar = (pos_y − y)/scale, numa imagem de 1024 px.
- Fontes:
  - https://developer.valvesoftware.com/wiki/Creating_a_working_mini-map
  - https://developer.valvesoftware.com/wiki/Level_Overviews
  - a proveniência JSON de extração publicada no pacote npm `@mizar-hud/radar-view@0.1.0`, usada **só** para conferir os números. Nada do pacote é incluído (AGPL); ficam apenas os fatos numéricos, com a origem citada.

**Imagens de radar:** arte da Valve. **Decisão do dono pendente** (licença); não embutidas. O heatmap
usa o espaço de coordenadas do radar sobre fundo neutro em grade.

## C2 — Plano

| PR      | Escopo                                                                                                                                                                                  | Migration                                                                     | Rollback                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| A       | Especificação v1.1 e PM1 registrados; `PARTIAL` no contrato (`metric-contract-v1.1`); este baseline                                                                                     | não                                                                           | reverter                    |
| B       | `src/lib/spatial/`: mapas e transformação versionada, validação de coordenadas, semântica de camadas, bins, coverage em envelope; validação do dust2 com a demo de benchmark autorizada | não                                                                           | reverter                    |
| C       | Read model `getSpatialHeatmap` + drill-down: sessão do usuário, filtros validados no servidor, limites, lado pelo `round-context-v1`                                                    | não (agregação sob demanda; índice só com plano de consulta que o justifique) | reverter                    |
| D       | UI: mapa, camadas, filtros, legenda, lista textual, drill-down, estados; i18n nos 5 locales                                                                                             | não                                                                           | reverter                    |
| Release | Publicação do app (Lovable `deploy_project`); validação com a demo autorizada; parser e H.3-E intocados                                                                                 | —                                                                             | republicar o build anterior |

Decisões:

- Sem migration: as posições já são persistidas em `round_events.data` (jsonb), e a agregação sob demanda de uma partida tem custo baixo (poucas centenas de mortes). Uma tabela agregada duplicaria dado bruto sem benefício medido.
- Mapas sem validação com posições reais aparecem como "mapa ainda não validado", nunca com um heatmap possivelmente errado (§7.4 do PM1).
- Sem feature flag: o projeto não tem mecanismo de flags (risco 12 do checkpoint). A liberação é controlada pelo estado de validação de cada mapa e pela cobertura dos dados.

## C3 — Implementação

| PR       | Conteúdo                                                                                                                                                                                                                                                                                                                                                | Estado |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| #270 (A) | Especificação v1.1 e PM1 registrados; `metric-contract-v1.1` com `PARTIAL` (4 testes, 1 mutante); este baseline                                                                                                                                                                                                                                         | CI     |
| B        | `src/lib/spatial/maps.ts` (`radar-transform-v1`: 10 mapas com fonte e SHA-256; dust2 VALIDATED por pontos de referência); `src/lib/spatial/heatmap.ts` (`spatial-heatmap-v1`: camadas DEATHS/KILLS, exclusões por motivo, envelope com cobertura, por round, bins 32×32, limite de payload); 26 testes, 3 mutantes; `docs/reference/SPATIAL_HEATMAP.md` | CI     |

| #272 (C) | `getSpatialHeatmap` (sessão do usuário, zod strict, por partida, só o próprio participante, só `data->position`/`data->victim_position`); `ownParticipantKeys` reutilizado; sonda RLS de dois usuários cobre `round_events` e `round_players` | CI |
| D | Página `/maps` (nav "Mapas"): filtros na URL (mapa, partida, camada, lado, nível, arma), radar + células + pontos, legenda com N/cobertura/por round, "Fora do mapa", "Não medido", células mais densas (alternativa textual), drill-down round/tick; estados vazio/não validado/NOT_OBSERVED/UNAVAILABLE/PARTIAL/erro; i18n 81 chaves × 5 locales; radares oficiais (decisão do dono, provisório) em camada desacoplada `radarAssets.ts` com SHA-256 por arquivo | CI |

Decisões do dono (2026-11-12, 21:21): demo nova da conta de teste autorizada para a validação ponta a ponta (sem backfill); imagens oficiais de radar autorizadas provisoriamente (`docs/reference/RADAR_ASSETS.md`).

Merges: #270 → `e6e507d3`; #271 → `a2ab17a6`; #272 → `b7272b97`; #273 → `ea7ed8df` (todos com os 7 checks verdes no SHA exato do PR).

## C4 — Validação

- CI: Web tests/lint/build, CS2 parser tests, contract-sensitive, F553 R11.2, Main required gates, Queue semantics e Queue recovery E2E — verdes nos heads dos #270–#273. #272 teve uma falha de infraestrutura do runner (porta 54322 em uso ao subir o Supabase local, "address already in use") — job reexecutado sem mudança de código, verde.
- **RLS com dois usuários (banco descartável, run do #273):** `RLS_TWO_USERS` PASS — A vê só as próprias linhas de `round_events`/`round_players` (1/0), B só as suas (0/1), `anon` negado, A não reescreve posições de B (`denied:42501`).
- Local: 2.399 testes passam (1 falha só de ambiente: `initdb` ausente no sandbox; roda no CI).
- Visual (componente real + CSS do build, posições reais da demo de benchmark, Playwright): desktop 1280 px e celular 375 px sem rolagem horizontal; 14/14 mortes desenhadas sobre o piso jogável do radar; drill-down round 14, tick 145778.

## C5 — Release

- App publicado pelo Lovable (`deploy_project` `f93e82a7`) a partir de `ea7ed8df`; parser e H.3-E intocados (Railway `0ff96670`).
- Imagem `/radars/cs2/de_dust2-default.png` servida em produção com SHA-256 `08282971…` = registro.
- `/maps` em produção, conta admin: estado vazio (sem partidas próprias) — o read model não expõe dados de outro jogador mesmo com a política `is_staff` da RLS.
- `/maps` em produção, conta de teste (dados reais, sem posições — parser antigo): Dust II "validado", Cache/Mirage "não validado"; camada mortes: `UNAVAILABLE`, cobertura **0/7**, motivo "Sem posição registrada 7"; camada eliminações lado CT: **0/2**. Conferido no banco (read-only): 7 mortes próprias no dust2; eliminações próprias por lado CT 2 / TR 11.
- **Demo nova autorizada (furia-vs-vitality-m2-dust2):** job `ced11a74` → `blocked_raw_audit` / `RAW_AUDIT_BLOCKED` (artefato RAW `ready`, auditoria `blocked`; nada persistido).
  - **Causa raiz (reproduzida com o próprio arquivo, copiado da pasta Downloads do dono):** o demoparser2 **0.42.0** lança `EntityNotFound` em todo `parse_event` desta demo (servidor BLAST.tv, build recente do CS2; issues upstream #321/#339). O parser registra cada evento como indisponível, e os gates de cobertura bloqueiam corretamente. Não tem relação com as posições. A 0.42.1 ainda falha; a **0.42.2** lê a demo: 23 rounds, 6.977 eventos e **142/142 mortes com `position` e `victim_position`**, `PASS/APPROVED`. O único campo novo, `vote_cast`, foi revisado como RAW only.
  - A demo de benchmark dá saída idêntica em 0.42.0 e 0.42.2 (rounds, eventos e jogadores); só o campo `stamina` e os digests da superfície do runtime mudam.
- **Release R5.8.25** (procedimento da R5.8.24; `docs/reference/R5_8_25_DEMOPARSER2_0422.md`, `docs/H3E_RELEASE_IDENTITY_TRACEABILITY.md`):
  - #275 (`c3593d48`, 8/8 checks):
    - demoparser2 0.42.2 no worker;
    - baseline estático do catálogo mantido, então os digests de mapeamento canônico `cf0549c2…`/`a276b030…` não mudam;
    - `parse_weapons` revisado como RAW only;
    - A9.1 fixado em 0.42.0;
    - identidade do app 0.42.2.
  - Deploy único e controlado: Railway `d57b9089` SUCCESS. `/version` = demoparser2 0.42.2, `git:c3593d48…`, `declared_revision_matches` true.
  - #276 (`67655b5a`, 7/7 checks): re-pin.
    - Migration `20261113040000` aplicada no banco gerenciado: recorder `cbb03f77…`, assertion `a3401a4b…`. Foi registrada em `schema_migrations` (`direct-main-67655b5a-20261113040000`).
    - Antes, foi validada num PostgreSQL 16 local com as definições exatas de produção: idempotente, fail-closed e com rollback exato.
  - App publicado (`b8c5cdea`). Atestação do runtime **VERIFIED**: run 43363586797, provenance `841c0bb9`, `assert_verified_parser_provenance` = VERIFIED.
  - H.3-E (run 43363661529): FAIL só em `parser_lock` e `bridge_identity`, porque as secrets do app ainda nomeiam `4badf606`/0.42.0. Pendente: o dono trocar as 4 secrets.

## C6

Preenchido no fechamento.
