# R5.8.25 — demoparser2 0.42.0 → 0.42.2 (causa raiz demonstrada)

## Problema

A demo de teste autorizada pelo dono (`furia-vs-vitality-m2-dust2.dem`, SHA-256 `b5af62a7…`, job
`ced11a74`, 2026-11-13) parou em `blocked_raw_audit` / `RAW_AUDIT_BLOCKED`.

## Causa raiz (reproduzida localmente com o próprio arquivo)

1. O demoparser2 **0.42.0** lança `Exception('EntityNotFound')` em todo `parse_event` desta demo.
   - A demo foi gravada num servidor BLAST.tv Premier, numa build recente do CS2.
   - `list_game_events` ainda lista 43 eventos.
   - Issues upstream: https://github.com/LaihoE/demoparser/issues (#321 "EntityNotFound on parse_event / parse_ticks for patch 14152 demos", #339).
2. O `parser.py` registra cada evento como indisponível (`*_unavailable`, 48 avisos).
   - O resultado tem 0 rounds e 0 eventos.
   - Os gates de cobertura (`EVENT/ROUND/TICK/ECONOMY/GRENADE-COVERAGE`, `RAW-EVIDENCE-01`) bloqueiam corretamente.
   - A posição no tick da morte (R5.8.24) **não tem relação** com isso.
3. A **0.42.2** lê a demo. A 0.42.1 ainda falha.
4. Com a 0.42.2, o único bloqueio restante é legítimo: o evento `vote_cast`, uma votação no servidor, nunca tinha sido catalogado.

## Mudança

- `requirements.txt`: `demoparser2==0.42.2`.
- Constantes de versão do worker passam a 0.42.2: `settings`, `raw_evidence`, `raw_manifest_audit`, `runtime_evidence`, `forensic_audit` e docstrings.
- `pypi-0.42.0` continua proibido como revisão.
- `capability_catalog`: o baseline estático (`PARSER_VERSION` 0.42.0, `PARSER_APIS`) fica **inalterado**, porque a matriz reconciliada e o inventário de mapeamento canônico são gerados dele e os digests (`cf0549c2…`/`a276b030…`) estão fixados no banco. A API nova da 0.42.2, `parse_weapons`, entra em `REVIEWED_RUNTIME_API_ADDITIONS` (`RAW_ONLY`, sem uso) e só é acrescentada à reconciliação quando aparece na superfície do runtime instalado (`RUNTIME_PARSER_VERSION` 0.42.2). Uma API nova não revisada continua órfã e bloqueia (teste).
- Identidade do parser no app: `src/config/pipeline.ts` `PARSER_VERSION` = 0.42.2 e `rawArtifactContract.ts` passa a usar essa constante. Necessário no mesmo PR: o E2E de recuperação da fila roda o worker real e o contrato bruto 0.42.2 seria rejeitado com `PARSER_IDENTITY_MISMATCH`. Fixtures que representam o worker em execução foram atualizadas; o fixture do contrato forense v2 foi reassinado com o JSON canônico do app.
- A9.1: o parser de navegador continua WASM 0.42.0; os workflows A9.1 instalam `demoparser2==0.42.0` para a referência Python, e `python_reference.py` não muda.
- `vote_cast` revisado como RAW only (`raw_evidence.REVIEWED_RAW_ONLY_EVENT_FIELDS` + `docs/reference/parser_field_reviews.json`). Qualquer outro campo novo do evento continua bloqueando (teste).
- `stamina` (amostras de tick) já estava em `MOVEMENT_FIELDS`.
- `scripts/f553/r11/job_bound.py`: espera a versão 0.42.2 do worker real rodado no CI.

**Fora desta release, de propósito:**

- `scripts/canonical_mapping_gate.py`, `scripts/canonical_v3/contract.py` e a matriz de proposta. Eles declaram `sourceParserVersion 0.42.0` no inventário de mapeamento canônico, cujo digest (`cf0549c2…`, release BLOCKED, 105 linhas) está fixado no recorder do banco. Mudar exigiria uma nova release de mapeamento.
- As identidades de atestação (`parserAttestation.ts`, `parser_runtime_attestation.py`, `h3e91_live_preflight.py`, `r5_8_3_release_preflight.py`, sondas). Vão no PR de re-pin, depois do deploy, como na R5.8.24.
- O recorder e a assertion no banco: `parser_version '0.42.0'` → `'0.42.2'` na migration de re-pin.
- Os textos das limitações L01–L03 em `admissionV3.ts` citam a 0.42.0 como a versão em que foram estabelecidas. A 0.42.2 não acrescenta API que as resolva (não há enumeração de capacidades nem de ticks; `usercmd` continua indisponível em demos de servidor).

## Evidências (sandbox, `pandas 3.1.1 / numpy 2.5.4`, as versões que o build do Railway resolve)

| Demo                                                 | 0.42.0                                                | 0.42.2 (este branch)                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| furia-vs-vitality-m2-dust2 (nova, autorizada)        | 0 rounds, 0 eventos, **BLOCKED** (gates de cobertura) | 23 rounds, 6.977 eventos, 142/142 mortes com `position` e `victim_position`, **PASS/APPROVED** |
| furia-vs-gamerlegion-m3-dust2 (benchmark autorizado) | 16 rounds, 5.149 eventos, PASS/APPROVED               | 16 rounds, 5.149 eventos, 100/100 posições, **PASS/APPROVED**                                  |

Diff completo da saída na demo de benchmark, 0.42.0 contra 0.42.2: **nenhuma diferença em rounds, eventos ou jogadores**. Diferenças encontradas:

- campo `stamina` acrescentado às amostras de tick (4.096 itens);
- catálogo e digests de superfície do runtime, que mudam com a versão (`parse_weapons`).

Testes:

- worker: 551 passaram, 16 ignorados;
- posições com a demo real: 9 passaram;
- governança do catálogo de campos: PASS;
- 2 testes novos: `vote_cast` RAW only com bloqueio de campo futuro; pin 0.42.2.

## Release (mesmo procedimento da R5.8.24)

1. Merge sob o freeze do watch pattern, com a fila ociosa.
2. `PARSER_REVISION`/`PARSER_BUILD_REVISION` = `git:<merge>`, com deploys ignorados; depois, um único deploy desse commit.
3. Conferir `/health` e `/version`: `parser.version` = 0.42.2 e revisões coerentes.
4. PR de re-pin:
   - migration de re-pin R5.8.25 (versão, deployment, commit e blobs);
   - identidades do app e dos scripts;
   - aplicar a migration no banco gerenciado.
5. Dono: as três secrets do app, com o novo commit; publicar.
6. Atestação VERIFIED e H.3-E PASS.
7. Reprocessar **somente** o job da demo de teste autorizada, como nova tentativa (D24).

## Rollback

- Railway: rollback para `0ff96670` (`4badf606`, demoparser2 0.42.0).
- Restaurar as três secrets.
- Aplicar o rollback do re-pin.
