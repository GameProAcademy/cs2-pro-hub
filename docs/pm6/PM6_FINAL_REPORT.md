# PM6 — Relatório final (compatibilidade, integridade de partida, nicks, segurança)

Data: 2026-11-14 (America/Sao_Paulo). Sessão `session_012aG79D5h8yCsYxNjWpDaHG`.
Classificação usada: IMPLEMENTADO · VALIDADO EM TESTE · VALIDADO EM PRODUÇÃO · PARCIAL · NÃO TESTADO · BLOQUEADO.

## 1. Resumo executivo

- **Segurança (B):** duas falhas reais encontradas no SQL do banco gerenciado.
  - O catálogo público expunha linhas inativas.
  - Políticas de storage forense não vinculavam o arquivo ao dono.
  - A correção foi feita por migration e validada em produção por papel (anônimo, usuário comum, admin dono). O scanner do Lovable segue **NÃO VERIFICADO** por mim.
- **Integridade de partida (C):** o gate `cs2.match-integrity.v1` exige fim oficial e ≥ 9 rounds válidos. Está ligado ao fluxo real, com worker, app, UX e Coach.
  - Release R5.8.27 publicada, re-pinada, atestada VERIFIED.
  - Caminho de surrender validado com uma demo real: a fixture pública do CI.
- **Histórico de nicks (D):** auto-anexação conservadora por nick exato confirmado antes. **IMPLEMENTADO, VALIDADO EM TESTE**, publicado.
- **GamersClub Cache (E):** o roster pelos controllers é **viável** (evidência diferencial), mas **não implementado**. A demo continua bloqueada, agora também por não ter fim oficial verificável.
- **Performance (G):** sem problema comprovado em produção. Nenhum limite foi alterado.

## 2. Política final de elegibilidade

Só é analisada a demo de uma partida **encerrada oficialmente** — normalmente ou por surrender — com **pelo menos 9 rounds válidos efetivamente jogados**.

- O mínimo de 9 é regra do CS2 PRO, inspirada na política pública do SCOPE.GG; não é regra da Valve. Ele está em `MATCH_INTEGRITY_CONTRACT.minValidRounds`.
- Sinais de fim, em ordem de confiabilidade:
  - `game_phase = 5` no último `round_end`: HIGH;
  - motivo `t_surrender`/`ct_surrender`: HIGH;
  - `cs_win_panel_match`: MEDIUM;
  - EOF: nunca basta.
- Rounds anulados por reset, duplicados ou incompletos não contam. Rounds não jogados após um surrender nunca são criados.
- Um disconnect seguido de retorno não bloqueia: jogadores não são rounds.
- Para um bloqueio, o job grava a decisão (escrita única, `demo_jobs.match_integrity`) e é bloqueado pelo RPC durável com `MATCH_INTEGRITY:<status>`. O usuário vê uma mensagem específica, nos 5 idiomas.
- O AI Coach recebe `matches[].matchEnd` (NORMAL/SURRENDER, rounds válidos) e a regra 24: não contar, projetar ou penalizar rounds não jogados.

Detalhes e medições: `docs/pm6/PM6_MATCH_INTEGRITY.md`.

## 3. Reconhecimento automático de nicks

A anexação por histórico vale somente quando todas as condições abaixo se cumprem:

- o perfil não tem Steam vinculado;
- não há seleção explícita para a demo;
- a correspondência automática não foi rejeitada;
- **exatamente um** participante tem, caractere a caractere, um nick que o usuário confirmou manualmente antes;
- nenhum outro participante tem o mesmo nick, nem com diferença de caixa ou espaços;
- nenhum Steam ID registrado na confirmação contradiz o do participante.

Na gravação: método `confirmed_nickname_history`, origem `user`, confirmação `user_confirmed`, evento `auto_resolved`. Qualquer outro caso mantém a seleção manual que já existia. O histórico é lido só para o dono do job e só com `source = manual_selection`.

## 4. Matriz de compatibilidade (2026-11-14)

| Origem             | Fixtures            | Integridade (fluxo real)                          | Estado                                                              |
| ------------------ | ------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Valve/Premier      | 1 (2024)            | não medida na geração 2024                        | `SUPPORTED_AND_VALIDATED` (2024, RAW); Premier 2026 `NOT_TESTED`    |
| FACEIT             | 1 (2026)            | `MATCH_COMPLETED`, 28 rounds (1 anulado)          | `SUPPORTED_AND_VALIDATED` em teste; produção depende de upload real |
| GamersClub Mirage  | 1 (2026)            | `MATCH_COMPLETED`, 34 rounds (sem painel final)   | `SUPPORTED_AND_VALIDATED` em teste                                  |
| GamersClub Cache   | 1 (2026)            | `MATCH_FINAL_ROUND_INCOMPLETE`; sem `player_info` | `BLOCKED` (sem fim oficial; roster viável, não implementado)        |
| Torneio/GOTV       | 2 (BLAST 2026)      | `MATCH_COMPLETED`, 23 rounds                      | `SUPPORTED_AND_VALIDATED` (produção já validada no PM1)             |
| Surrender          | 1 (fixture pública) | `MATCH_SURRENDER_COMPLETED`, 10 rounds            | `SUPPORTED_AND_VALIDATED` em teste e no E2E da fila                 |
| Comunidade/privado | 0                   | —                                                 | `NOT_TESTED`                                                        |
| POV                | 0                   | —                                                 | `NOT_TESTED`                                                        |

As metas de corpus do PM6 (5 Valve, 10 FACEIT, 5 GC, 3 privados, 3 torneios, 2 POV, bots) **não foram atingidas**.

## 5. Segurança Lovable

Ver `docs/security/PM6_LOVABLE_SECURITY_AUDIT.md`:

- PR #284 e migration `20261114010000`;
- matriz de acesso real em produção;
- scanner NOT_VERIFIED.

## 6. PRs, merges e migrations

| PR   | Conteúdo                                 | Merge      | Migration                   |
| ---- | ---------------------------------------- | ---------- | --------------------------- |
| #284 | Segurança catálogo/storage               | `00e767fa` | `20261114010000` (aplicada) |
| #285 | Avaliador `cs2.match-integrity.v1`       | `c29d1ae8` | —                           |
| #286 | Docs e status                            | `ea8528aa` | —                           |
| #287 | Integração C (worker + app + UX + Coach) | `3837a810` | `20261114030000` (aplicada) |
| #288 | Auto-anexação por nick (D)               | `07cda181` | `20261114040000` (aplicada) |
| #289 | Re-pin R5.8.27                           | `36b8a37a` | `20261114050000` (aplicada) |

Todas as migrations foram registradas em `supabase_migrations.schema_migrations`, com o commit e o md5.

## 7. Release R5.8.27 e identidade do parser

- **Railway:** deployment `7690b171-087f-46ca-9899-a5b96d8c32cb`, SUCCESS, commit `3837a810`, um único deploy via agente.
- **`/version` nos dois hosts:** demoparser2 0.42.2, revision = semantic = build = `git:3837a810…`, `embedded` true, `declared_revision_matches` true.
- **Versão instalada:** requisito `demoparser2==0.42.2`, camada de dependências em cache. A leitura via `importlib` pelo preflight autenticado **não foi feita**, porque o token é secreto.
- **Atestação:** run 43556680355, proveniência `6e8d0a33`, **VERIFIED**. Confere deployment, commit e os blobs `parser.py 99ff0ccc` e `adapter.py 020f847a`.
- **H.3-E:** ver §8.
- **Railway `source.commitSha`:** segue `4716f894`. A causa é o pin persistente criado na R5.8.16. Reapontá-lo foi recusado pelo classificador desta sessão. A troca de Source na interface dispara um build, o que geraria um novo deployment e exigiria novo re-pin.
  - **Plano:** na próxima release do worker, o dono troca o Source para o commit aprovado, e esse build é o único deploy.

## 8. Gates

No SHA final `36b8a37a`:

- **H.3-E: PASS 18/18** (run 43558879886): target, quality_gates, f553_post_completion, r5_8_3, r5_8_4, queue_semantics, main_required_gates, artefatos e decisões, persistence, transport, runtime, bridge_identity, parser_lock, managed_snapshot e predem_matrix.
- As execuções anteriores (43556719744 e 43558427432) deram BLOCKED só porque os workflows de push da main ainda não tinham terminado.
- F553 pós-conclusão: success (43558865643).
- Quality Gates, Queue Semantics, R5.8.3 e R5.8.4: success.

## 9. Testes

- Worker: 565 passed.
- Scripts: 378 passed.
- vitest completo: 2446 passed na integração C, mais os 11 de D.
- Harnesses PostgreSQL descartáveis:
  - RLS/storage: 29 checks e teste de mutação;
  - `match_integrity`: 10 checks e teste de mutação. Ele pegou o defeito da `CHECK` que resultava em NULL e passava.
- E2E real da fila (worker real, bridge, storage): PASS. Antes, pegou o defeito do payload `/v1/parse`, que descartava a evidência nova.

## 10. Limitações restantes, classificadas

1. **Scanner do Lovable:** NÃO VERIFICADO. O painel não é acessível por mim; o dono confirma em Security.
2. **Validação em produção de C e D com upload real:** PENDENTE. Precisa de um upload da conta de teste, autorizado pelo dono.
3. **Etapa E (`LIVE_CONTROLLER_ROSTER`):** viável e não implementada.
   - Na GC Cache, os controllers mostram 10 SteamIDs, 5 por lado em todos os 12 inícios de round.
   - Na GC Mirage, o roster pelos controllers coincide com o inventário oficial.
   - Implementar exige proveniência própria no gate PLAYER-COVERAGE e na governança RAW, em `raw_evidence.py` (blob atestado).
4. **Fidelidade de rounds na GC Cache:** `round_start`/`round_end` não estão no inventário, mas são legíveis. Ler esses eventos mesmo sem inventário pertence à mesma frente da etapa E.
5. **Railway `source.commitSha`:** divergência só de metadado (§7).
6. **Corpus:** lacunas da §4.
7. **Performance:** nos últimos 30 dias de produção, máximo de 137 s por job (limite de parse 240 s) e zero falhas de recurso. No sandbox, a GC Mirage levou 178,8 s e 4,8 GB de pico (limite 8 GB). Margem registrada, sem mudança.

## 11. Prontidão para o PM2

**Pronto para o PM2, com ressalvas classificadas.** Em produção:

- a release R5.8.27 está ativa, atestada VERIFIED, com H.3-E PASS 18/18;
- o gate de encerramento e a auto-anexação por nick estão publicados (app `36b8a37a`, publicação `9627d525`);
- a correção de segurança foi validada por papel.

Continuam abertos, sem bloquear o PM2:

1. Upload real de controle em produção, com a demo pública de surrender da fixture, feito pela conta de teste com autorização do dono, para provar C e D no fluxo publicado.
2. Confirmação do scanner do Lovable pelo dono.
3. Etapa E (roster pelos controllers e leitura de `round_*` fora do inventário).
4. Alinhar o `source.commitSha` da Railway na próxima release.
5. Expandir o corpus.
