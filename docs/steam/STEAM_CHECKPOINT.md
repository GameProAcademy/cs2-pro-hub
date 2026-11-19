# Checkpoint — Integração Steam / Valve

Atualizado em: 2026-11-19 (America/Sao_Paulo) · sessão `session_012aG79D5h8yCsYxNjWpDaHG`
Documentação técnica: `docs/steam/STEAM_INTEGRATION.md` · Pesquisa: `docs/steam/STEAM_RESEARCH.md`

## ESTADO EXATO PARA RETOMADA

| Item                   | Valor                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missão                 | Integração Steam/Valve (vínculo OpenID, Web API, aliases, demos, UI, Coach)                                                                                                                                                                                                                                             |
| Estado                 | **ENCERRADA** em 2026-11-18 por decisão do dono, sem pendências obrigatórias. Única limitação: critério 22 NÃO VALIDADO POR FALTA DE DADOS (NOT_VALIDATED)                                                                                                                                                              |
| `main`                 | `5007544af6377872be4f8dc18446be70a98bc362` (merge do #348)                                                                                                                                                                                                                                                              |
| Produção (app)         | Lovable publicado e sincronizado com `5007544a` (`latest_commit_sha` = `5007544a…`; publicação de 2026-11-19)                                                                                                                                                                                                           |
| Worker                 | Railway R5.8.31, commit `0c646583`, deploy `584ea563`. **Sem alteração para a Steam**: a identificação pela Steam roda no app (`jobs.server.ts`), não no parser                                                                                                                                                         |
| Gates em `5007544a`    | Quality Gates 44443360442, Queue Semantics 44443360396, attestation 44446633720, H.3-E PASS 44446661458 (a 1ª execução 44445613991 falhou pelo padrão conhecido de disparo antecipado, §21 item 5 do checkpoint central). E2E: 44438464636 em `f5fc22b1`, 12/12                                                         |
| Migrações              | Nenhuma pendente. `20261119000000` aplicada e registrada (`45d4529c`, md5 `e584772d…`); `20261119010000` aplicada e registrada (`462929e7`, md5 `12028497…`). `record_steam_alias` sem EXECUTE para `anon`/`authenticated` (conferido)                                                                                  |
| Secrets                | Todos configurados e comprovados em produção, sem revelar valores: `STEAM_INTEGRATION_ENABLED` e realm/return URL (o callback real foi aceito; o inválido foi recusado em `validate`, e não com `CONFIGURATION_MISSING`); `STEAM_WEB_API_KEY` (sincronização real com `last_sync_status=success` e perfil público lido) |
| **Próxima ação exata** | Nenhuma obrigatória. Opcional: com uma demo nova da conta Steam vinculada, enviar e confirmar `attachment_method = steam_id_confirmed` (critério 22)                                                                                                                                                                    |
| Não repetir            | Pesquisa (`STEAM_RESEARCH.md`); dry-runs e aplicação das duas migrações; PRs #343–#348                                                                                                                                                                                                                                  |

## PRs da missão

| PR   | Merge em `main` | Entrega                                                                                                                                         |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| #343 | `e5d6b182`      | Docs: checkpoints do PM5 coerentes com o encerramento C6 (Parte 1 do prompt; PM5 não reaberto)                                                  |
| #344 | `45d4529c`      | OpenID real: `openid.realm` opcional (a Steam não o envia), nonce e campos assinados, padrões de produção, tabela `steam_link_failures`         |
| #345 | `462929e7`      | SteamID provado nas demos, sincronização, aliases (`record_steam_alias`), estado único nas telas, logotipos, admin mascarado, contexto do Coach |
| #346 | `3c72947a`      | Docs (`STEAM_INTEGRATION.md`, este checkpoint) e passo `steam_identities` no E2E                                                                |
| #347 | `f5fc22b1`      | Correção do vínculo (constraint `profile_locator_type`) e overlay "Conectado com sucesso"                                                       |
| #348 | `5007544a`      | Overlay por 6 s, texto do link do card de identidades, validação real e encerramento nos checkpoints                                            |

## Decisões

1. Módulo próprio: as bibliotecas estudadas tinham falhas de origem e de bypass (ver a pesquisa).
2. `openid.realm` é opcional no callback, porque a Steam não o envia. Isso corrigiu um bug que faria todo retorno real falhar.
3. A prova é o SteamID64 de `player_identities` com `verified` + `openid`. A coluna `player_profiles.steam_id` é só fallback legado.
4. Aliases ficam no histórico canônico (`steam_profile`) e nunca vinculam demos sozinhos.
5. Um estado único (`deriveLinkState`) é usado por todas as telas.
6. "Entrar com Steam" não foi ativado, por depender de uma decisão de produto (a Steam não fornece e-mail).
7. Nenhuma lógica FACEIT foi alterada. Mudaram apenas o logotipo nos botões e a invalidação de cache das telas.

## Critérios de encerramento (Parte 15 do Prompt Mestre; classificação final)

| #   | Critério                                           | Estado                                                                                                                                                                                                  |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Autenticação Steam OpenID funcional                | VALIDADO EM PRODUÇÃO (vínculo real do dono em 2026-11-18, após #347)                                                                                                                                    |
| 2   | Callback seguro e validado no servidor             | VALIDADO EM PRODUÇÃO (callback real aceito; callback inválido recusado em `validate`)                                                                                                                   |
| 3   | SteamID64 confirmado e armazenado                  | VALIDADO EM PRODUÇÃO (1 identidade STEAM `verified`/`openid`; `profile_locator_type=numeric_id`)                                                                                                        |
| 4   | Web API Key configurada em produção                | VALIDADO EM PRODUÇÃO (sincronização com `last_sync_status=success`; perfil público lido)                                                                                                                |
| 5   | Dados públicos obtidos quando disponíveis          | VALIDADO EM PRODUÇÃO (persona, avatar, visibilidade "Público", última sincronização exibidos)                                                                                                           |
| 6   | Perfil Steam exibido corretamente                  | VALIDADO EM PRODUÇÃO (print do dono: nome, avatar, SteamID mascarado, perfil, última sincronização)                                                                                                     |
| 7   | Conectar, desconectar e reconectar                 | VALIDADO EM PRODUÇÃO (dono: conectar, desvincular e vincular de novo, 2026-11-18)                                                                                                                       |
| 8   | Estado coerente em todas as telas                  | VALIDADO EM PRODUÇÃO no perfil (prints do dono: card Steam e "Identidades de jogador" mudam juntos); painel do `/upload`: TESTADO EM CI (mesma derivação `getMyExternalLinks`), não observado pelo dono |
| 9   | Logotipo Steam nos botões Steam                    | VALIDADO EM PRODUÇÃO (print do dono: botão "Entrar com a Steam" com o logotipo; ícone no card)                                                                                                          |
| 10  | Logotipo FACEIT nos botões FACEIT                  | VALIDADO EM PRODUÇÃO (`/login`: `svg[data-brand=faceit]`; print do dono: "Conectar FACEIT" com o logotipo no perfil)                                                                                    |
| 11  | Identidade Steam no modelo canônico                | VALIDADO EM PRODUÇÃO (identidade STEAM `verified`/`openid` em `player_identities`, contagem conferida)                                                                                                  |
| 12  | Histórico de nicknames                             | VALIDADO EM PRODUÇÃO (1 alias `steam_profile` gravado pela sincronização real) · harness PG                                                                                                             |
| 13  | Demos identificadas pelo SteamID quando disponível | TESTADO EM CI (`steamDemoIdentity`); real: ver critério 22                                                                                                                                              |
| 14  | Aliases tratados com segurança                     | TESTADO EM CI (`steamDemoIdentity`, harness de aliases)                                                                                                                                                 |
| 15  | Ambiguidades preservadas                           | TESTADO EM CI (conflito e sugestão ambígua sem vínculo)                                                                                                                                                 |
| 16  | Coexistência com a FACEIT                          | VALIDADO EM PRODUÇÃO (Steam vinculada com FACEIT não conectada; lógica FACEIT inalterada; FACEIT validada no PM5)                                                                                       |
| 17  | RLS e isolamento entre contas                      | TESTADO EM CI (harness PostgreSQL de aliases com mutação) e no E2E contra produção (RPC, inserção e diagnóstico recusados ao navegador)                                                                 |
| 18  | Testes automatizados                               | TESTADO EM CI (#344–#348 com todos os checks verdes; gates de `main` em `5007544a` verdes)                                                                                                              |
| 19  | E2E                                                | TESTADO EM CI contra produção: E2E `pm2-browser-e2e` run 44438464636 em `f5fc22b1`, 12/12 (inclui o passo `steam_identities`)                                                                           |
| 20  | Publicação em produção                             | VALIDADO EM PRODUÇÃO (app publicado de `5007544a`, sincronizado com `main`)                                                                                                                             |
| 21  | Teste real de conexão pelo usuário                 | VALIDADO EM PRODUÇÃO (conectar/sincronizar/desvincular/reconectar pelo dono)                                                                                                                            |
| 22  | Teste real de identificação em demo                | NÃO VALIDADO POR FALTA DE DADOS — NOT_VALIDATED (não existe demo nova da conta Steam vinculada; lógica coberta por `steamDemoIdentity` no CI)                                                           |
| 23  | Documentação e checkpoints                         | IMPLEMENTADO (`STEAM_INTEGRATION.md`, este checkpoint e o checkpoint central, reconciliados em 2026-11-19)                                                                                              |

Fora dos critérios: estatísticas de CS2 pela Steam — NÃO DISPONÍVEL NA API. "Entrar com Steam" — avaliado e não
ativado (decisão de produto do dono).

## Incidente: vínculo falhava em `steam_link_commit` (corrigido no #347)

| Item        | Evidência                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sintoma     | Teste real do dono: "Não foi possível concluir a vinculação com a Steam" (2 tentativas)                                                                                                                                                                      |
| Diagnóstico | `steam_link_failures`: `stage=link`, `STEAM_INTERNAL_ERROR` (2 linhas). A validação OpenID passou                                                                                                                                                            |
| Causa raiz  | O mapper gravava `profile_locator_type='steam_id_64'`, mas `player_connections_locator_type_chk` e `player_identities_locator_type_chk` aceitam só `numeric_id` ou `slug`. Defeito presente desde a Fase 2.5, nunca visto porque os testes simulavam o banco |
| Reprodução  | Em produção, numa transação revertida e com SteamID sintético: `23514 player_connections_locator_type_chk`. Com `numeric_id`: commit OK (também revertido)                                                                                                   |
| Correção    | #347 (`f5fc22b1`): o mapper grava `numeric_id`; `steam.dbConstraints.test.ts` lê os valores permitidos das migrations (a mutação com o valor antigo derruba 2 testes)                                                                                        |
| Validação   | Novo teste do dono: vínculo e sincronização OK. Banco (só contagens): 1 conexão Steam ativa, 1 identidade verificada por OpenID, 1 alias `steam_profile`, 0 falhas depois da publicação                                                                      |

## Encerramento (2026-11-18; documentação reconciliada em 2026-11-19)

Resumo dos 23 critérios:

- **15 VALIDADO EM PRODUÇÃO:** 1–12, 16, 20 e 21. O 8 vale para o perfil; o painel do `/upload` foi coberto no CI.
- **6 TESTADO EM CI:** 13, 14, 15, 17, 18 e 19. O E2E roda contra produção.
- **1 NÃO VALIDADO POR FALTA DE DADOS (NOT_VALIDATED):** 22.
- **IMPLEMENTADO:** 23 (documentação).

O dono encerrou a etapa depois de validar em produção vínculo, sincronização, desvínculo e novo vínculo, o estado coerente no perfil e a tela de sucesso (6 s). **A missão Steam está definitivamente encerrada, sem pendências obrigatórias.**

- **Opcional (critério 22):** identificar uma demo real pela Steam quando existir uma demo nova da conta vinculada. Confirmar `attachment_method = steam_id_confirmed`.
- **Não ativado:** "Entrar com Steam". Depende de uma decisão de produto, porque a Steam não fornece e-mail.
- **Não disponível na API:** estatísticas de CS2 pela Steam.
- **Worker:** permanece em R5.8.31 (`0c646583`, `584ea563`); a Steam não exigiu mudança no parser.
