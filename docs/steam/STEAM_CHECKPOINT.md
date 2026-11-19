# Checkpoint — Integração Steam / Valve

Atualizado em: 2026-11-18 (America/Sao_Paulo) · sessão `session_012aG79D5h8yCsYxNjWpDaHG`
Documentação técnica: `docs/steam/STEAM_INTEGRATION.md` · Pesquisa: `docs/steam/STEAM_RESEARCH.md`

## ESTADO EXATO PARA RETOMADA

| Item                   | Valor                                                                                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missão                 | Integração Steam/Valve (vínculo OpenID, Web API, aliases, demos, UI, Coach)                                                                                                                                                                                                       |
| Etapa atual            | Vínculo Steam VALIDADO EM PRODUÇÃO pelo dono (após #347). Overlay de sucesso ajustado para 6 s                                                                                                                                                                                    |
| PRs                    | #343 (`e5d6b182`), #344 (`45d4529c`), #345 (`462929e7`) **mergeados**; este PR: docs + E2E Steam                                                                                                                                                                                  |
| Migrações pendentes    | Nenhuma. `20261119000000` aplicada e registrada (`45d4529c`, md5 `e584772d…`); `20261119010000` aplicada e registrada (`462929e7`, md5 `12028497…`); `record_steam_alias` sem EXECUTE para `anon`/`authenticated` (conferido)                                                     |
| Secrets                | `STEAM_INTEGRATION_ENABLED` e realm/return URL válidos em produção: um callback vazio falhou em `validate` com `STEAM_OPENID_INVALID_RESPONSE` (e não `CONFIGURATION_MISSING`), registrado em `steam_link_failures`. `STEAM_WEB_API_KEY`: a confirmar pela primeira sincronização |
| **Próxima ação exata** | Dono: desvincular/reconectar e enviar uma demo nova com a Steam vinculada. Depois: E2E no `main` e fechamento dos critérios 7, 19, 21, 22                                                                                                                                         |
| Não repetir            | Pesquisa (STEAM_RESEARCH.md); dry-runs das duas migrações                                                                                                                                                                                                                         |

## Decisões

1. Módulo próprio: as bibliotecas estudadas tinham falhas de origem e de bypass (ver a pesquisa).
2. `openid.realm` é opcional no callback, porque a Steam não o envia. Isso corrigiu um bug que faria todo retorno real falhar.
3. A prova é o SteamID64 de `player_identities` com `verified` + `openid`. A coluna `player_profiles.steam_id` é só fallback legado.
4. Aliases ficam no histórico canônico (`steam_profile`) e nunca vinculam demos sozinhos.
5. Um estado único (`deriveLinkState`) é usado por todas as telas.
6. "Entrar com Steam" não foi ativado, por depender de uma decisão de produto (a Steam não fornece e-mail).
7. Nenhuma lógica FACEIT foi alterada. Mudaram apenas o logotipo nos botões e a invalidação de cache das telas.

## Critérios de encerramento (Parte 15 do Prompt Mestre; classificação honesta, atualizar com evidências)

| #   | Critério                                           | Estado                                                                                                                |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Autenticação Steam OpenID funcional                | VALIDADO EM PRODUÇÃO (vínculo real do dono em 2026-11-18, após #347)                                                  |
| 2   | Callback seguro e validado no servidor             | VALIDADO EM PRODUÇÃO (callback real aceito; callback inválido recusado em `validate`)                                 |
| 3   | SteamID64 confirmado e armazenado                  | VALIDADO EM PRODUÇÃO (1 identidade STEAM `verified`/`openid`; `profile_locator_type=numeric_id`)                      |
| 4   | Web API Key configurada em produção                | VALIDADO EM PRODUÇÃO (sincronização com `last_sync_status=success`; perfil público lido)                              |
| 5   | Dados públicos obtidos quando disponíveis          | VALIDADO EM PRODUÇÃO (persona, avatar, visibilidade "Público", última sincronização exibidos)                         |
| 6   | Perfil Steam exibido corretamente                  | VALIDADO EM PRODUÇÃO (print do dono: nome, avatar, SteamID mascarado, perfil, última sincronização)                   |
| 7   | Conectar, desconectar e reconectar                 | Conectar VALIDADO EM PRODUÇÃO; desconectar/reconectar PENDENTE DE AÇÃO MANUAL                                         |
| 8   | Estado coerente em todas as telas                  | IMPLEMENTADO · TESTADO LOCALMENTE                                                                                     |
| 9   | Logotipo Steam nos botões Steam                    | VALIDADO EM PRODUÇÃO (botão "Entrar com a Steam" com o logotipo; ícone no card)                                       |
| 10  | Logotipo FACEIT nos botões FACEIT                  | VALIDADO EM PRODUÇÃO (`/login`: `svg[data-brand=faceit]` presente); botões de conectar no perfil/análise IMPLEMENTADO |
| 11  | Identidade Steam no modelo canônico                | IMPLEMENTADO (`player_identities` + evidência de correlação)                                                          |
| 12  | Histórico de nicknames                             | VALIDADO EM PRODUÇÃO (1 alias `steam_profile` gravado pela sincronização real) · harness PG                           |
| 13  | Demos identificadas pelo SteamID quando disponível | IMPLEMENTADO · TESTADO LOCALMENTE                                                                                     |
| 14  | Aliases tratados com segurança                     | IMPLEMENTADO · TESTADO LOCALMENTE                                                                                     |
| 15  | Ambiguidades preservadas                           | IMPLEMENTADO · TESTADO LOCALMENTE                                                                                     |
| 16  | Coexistência com a FACEIT                          | IMPLEMENTADO · TESTADO LOCALMENTE (lógica FACEIT inalterada)                                                          |
| 17  | RLS e isolamento entre contas                      | TESTADO LOCALMENTE (harness de aliases + RLS existente)                                                               |
| 18  | Testes automatizados                               | TESTADO EM CI (#344 e #345: todos os checks verdes)                                                                   |
| 19  | E2E                                                | PENDENTE                                                                                                              |
| 20  | Publicação em produção                             | VALIDADO EM PRODUÇÃO (`462929e7`; bundle `index-DdHe30Q3.js` servido em gamepro.network)                              |
| 21  | Teste real de conexão pelo usuário                 | PENDENTE DE AÇÃO MANUAL                                                                                               |
| 22  | Teste real de identificação em demo                | PENDENTE DE AÇÃO MANUAL                                                                                               |
| 23  | Documentação e checkpoints                         | IMPLEMENTADO (este arquivo, STEAM_INTEGRATION.md, checkpoint central)                                                 |

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
