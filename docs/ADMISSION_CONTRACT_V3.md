# Contrato de admissão RAW v3 (`cs2.raw-admission.v3`, ruleset 1)

Implementação: `src/lib/pipeline/admissionV3.ts` (lógica pura) · Registro: `supabase/migrations/20261014230000_raw_admission_v3_decisions.sql` · Testes: `src/lib/pipeline/__tests__/admissionV3.test.ts` e os cenários `admission_v3_*` de `scripts/queue/recovery_integration_probe.py`.

## Por que existe

O contrato forense v2 exige que todos os 21 gates do produtor passem. Com o demoparser2 0.42.0, nenhuma demo real consegue isso, por dois motivos:

- **Três gates estruturais não têm autoridade independente.** São o catálogo de capacidades (02), o domínio completo de ticks (05/06) e o `usercmd` (17).
- **Cinco gates semânticos o produtor não consegue provar.** São header (10), rounds (12), bomba (13), combate (14) e times/placar (16). Os eventos das evidências RAW não carregam o número do round (na fixture pública, `round=None` em todos os 73 `player_death`), então o produtor não relaciona evento e round.

## O que a v3 não faz

- Não altera a v2. O veredito v2 continua BLOCKED, com os motivos copiados literalmente na decisão v3 (`v2.producer_reasons`).
- O contrato final v2 nunca é produzido para uma admissão v3 (`v2.final_contract_produced = false`).
- Nada histórico é reescrito: auditoria v1 (`raw_evidence_artifacts.audit_status`), artefatos, chunks e manifestos ficam como estão.
- Não remove quarentena nem promove partidas canônicas. `CANONICAL_MATCH_QUARANTINED` e a partida `a7b27f16` continuam intocados.

## Estados

| Estado        | Onde aparece                       | Significado                                                                                                                                                     |
| ------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PASS`        | veredito, gate                     | Verificado e satisfeito.                                                                                                                                        |
| `LIMITED`     | veredito, gate                     | Só restam limitações do registro abaixo. Cada uma precisa casar com condições de evidência exatas e codificadas, e todas as demais condições foram verificadas. |
| `BLOCKED`     | veredito, gate                     | Qualquer outra falha, motivo não reconhecido ou condição não provada.                                                                                           |
| `UNAVAILABLE` | **estado de evidência** de um gate | O parser não fornece a capacidade. **Nunca** é veredito e nunca conta como sucesso: só é admitido via limitação registrada.                                     |
| `UNPROVEN`    | estado de evidência                | O produtor não provou a propriedade; ela vai para a reverificação no bundle canônico.                                                                           |

## Fluxo

1. **Fase A** (`classifyForensicV2ForAdmissionV3`) roda só quando o validador v2 recusa o contrato do produtor. Ela classifica cada gate v2 e cada motivo v2.
   - Motivos de integridade bloqueiam: digest, identidade do parser, mapeamento, inventários, contagem de gates.
   - Gates sem regra v3 bloqueiam: por exemplo 04, 07, 08, 20 e 21.
2. **Reauditoria física**, idêntica à da v2. Relê os chunks, confere a cadeia, os totais, o root digest, a reconciliação produtor↔físico e as 36 dimensões. Qualquer falha lança erro, como na v2.
3. **Fase B** (`verifyCanonicalSemanticsV3`) roda sobre o bundle canônico que seria persistido, depois de `validateCanonicalBundle`:
   - **Header:** o mapa canônico é igual ao `map_name` do chunk físico `header`, que é um registro independente.
   - **Rounds:** numeração contígua; intervalos fechados, conhecidos e sem sobreposição; todo evento dentro do intervalo do seu round.
   - **Bomba:** defuse ou explosão só depois de um plant no mesmo round; no máximo um de cada por round; as flags do round concordam com os eventos.
   - **Combate:** toda vítima é um participante conhecido; atacante conhecido ou mundo; ninguém morre duas vezes no mesmo round; dano numérico e não negativo.
   - **Times/placar:** todo round tem vencedor por slot; o placar declarado é igual à contagem de vitórias por slot; exatamente dois times.
4. **Decisão** (`decideAdmissionV3`). É um documento com digest (SHA-256 sobre o JSON canônico do app). Fica registrado em `raw_admission_decisions` **antes** de qualquer escrita canônica, inclusive quando bloqueia.
5. **Admissão** (`rawArtifactApprovalV3`). A barreira de persistência canônica revalida o documento (`admissionDecisionV3Reasons`) e sua ligação com o artefato, o root digest e a reconciliação.

## Registro de limitações (ruleset 1)

| ID                                      | Gate(s)     | Indisponível                                                                | Condições de evidência exatas                                                                                                                                                                                                                          | Classes proibidas         | Restrição                                                       |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------- |
| `L01-CAPABILITY-SURFACE-UNENUMERABLE`   | 02          | Enumeração exaustiva e independente da superfície de capacidades do runtime | Catálogo válido e `complete=true`; reconciliação com 0 entradas não resolvidas, duplicadas, órfãs ou de diferença de conjunto; única falha `runtime_surface_status=UNAVAILABLE`; superfície sem erros                                                  | `CAPABILITY_COMPLETENESS` | Não afirmar auditoria exaustiva de capacidades                  |
| `L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE` | 05, 06      | Autoridade independente para o domínio completo de ticks                    | Fonte `UNAVAILABLE` e não autoritativa; 0 lotes tentados; falhas exatamente `expected_tick_domain_unavailable` e `verified_independent_tick_authority_required`; 0 ticks faltantes, duplicados, inválidos, fora de ordem ou sobrepostos (07 e 08 PASS) | `CONTINUOUS_TICK_STREAM`  | Sem métricas de movimento, posicionamento ou tempo de exposição |
| `L03-USERCMD-UNAVAILABLE`               | 17          | Stream de input (`usercmd`) auditado                                        | Motivo exatamente `usercmd_unavailable_or_unproven` e cobertura `UNAVAILABLE`                                                                                                                                                                          | `USER_INPUT`              | Sem análises de mira, counter-strafe, spray ou reação           |
| `L04-MATCH-RESULT-UNRESOLVED`           | 16 (fase B) | Times, vencedores por slot e placar                                         | **Ausência total**: nenhum participante com time, nenhum round com vencedor, placar e vencedor nulos. Dados parciais ou contraditórios dão **BLOCKED**                                                                                                 | `MATCH_RESULT`            | Sem resultado; fora da taxa de vitória                          |

## Matriz métricas × dados

`METRIC_DATA_DEPENDENCIES_V3` declara as classes de dados de que cada coluna persistida de `match_metrics` depende: `EVENTS`, `ROUNDS`, `STATE_AT_EVENT_TICK` e `DECLARED_TICKRATE`.

`PROJECTION_DATA_DEPENDENCIES_V3` faz o mesmo para as colunas de projeção de `matches`, que dependem de `MATCH_RESULT`.

Três testes amarram a matriz ao código:

- Ela cobre **todas** as colunas de `match_metrics` do schema. Uma métrica nova sem declaração quebra o teste.
- As limitações L01 a L03 não excluem nenhuma métrica.
- `metrics.ts` e `features.ts` não referenciam `usercmd`, `buttons`, `view_angles`, `aim_punch`, `shots_fired`, `tick_rows`, `full_tick`, `position_snapshots` nem `aim_observations`.

A L04 exclui `matches.result`, `matches.score_player`, `matches.score_opponent`, `matches.team_player` e `matches.team_opponent`. A projeção grava essas colunas como `null` (`persistence.server.ts` `withoutExcluded`). Se alguma limitação futura excluir uma coluna de `match_metrics`, a projeção recusa gravar (fail closed) até que a dependência das features seja revisada.

## Proveniência

- **`raw_admission_decisions`** guarda a decisão completa. É append-only: UPDATE, DELETE e TRUNCATE são recusados. A identidade é amarrada ao job, upload, tentativa, sha256 da DEM e artefato (com root digest). Só o service role tem acesso.
- **`demo_jobs.admission_*`** guarda contrato, veredito, limitações, métricas excluídas e o id da decisão. O dono lê esses campos sob RLS (`demo_jobs_select_own`). Depois de definidos, não podem ser trocados.
- **Produto:** o Dashboard e o histórico marcam cada partida como **Certificado** ou **Limitado**, com as limitações por extenso. Os agregados informam quantas partidas limitadas entram na conta. Uma partida LIMITED nunca é escondida por outra admissão da mesma partida.

## Investigação do demoparser2 0.42.0 (resumo verificável)

- **API instalada** (`DemoParser`): `list_game_events`, `list_updated_fields`, `parse_event(s)`, `parse_grenades`, `parse_header`, `parse_item_drops`, `parse_player_info`, `parse_skins`, `parse_ticks(wanted_props, *, players, ticks, prop_states)` e `parse_voice`. Nenhuma API enumera de forma independente o conjunto completo de capacidades nem o domínio de ticks.
- **Domínio de ticks.** `parse_ticks(ticks=None)` devolve todos os ticks que o próprio parser emite. Isso é saída do parser, não autoridade independente. O `parse_header` da fixture não traz `playback_ticks`. Conclusão: a propriedade "todos os ticks presentes" é **não provada** (L02). Lacunas, duplicações e sobreposições observadas continuam bloqueando.
- **`usercmd`.** O binário expõe `usercmd_viewangle_x/y/z`, `usercmd_buttonstate_1/2/3`, `usercmd_forward_move`, `usercmd_left_move`, `usercmd_mouse_dx/dy`, `usercmd_impulse`, `usercmd_weapon_select`, `usercmd_subtick_moves`, `usercmd_consumed_server_angle_changes` e `usercmd_input_history`. Na fixture pública (GOTV), 12 dessas propriedades pedidas em 640 ticks não retornaram nenhuma coluna. O worker não as pede nem as audita. Nenhuma métrica as usa (L03).
