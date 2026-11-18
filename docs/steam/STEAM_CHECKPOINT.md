# Checkpoint — Integração Steam / Valve

Atualizado em: 2026-11-18 (America/Sao_Paulo) · sessão `session_012aG79D5h8yCsYxNjWpDaHG`
Documentação técnica: `docs/steam/STEAM_INTEGRATION.md` · Pesquisa: `docs/steam/STEAM_RESEARCH.md`

## ESTADO EXATO PARA RETOMADA

| Item                   | Valor                                                                                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missão                 | Integração Steam/Valve (vínculo OpenID, Web API, aliases, demos, UI, Coach)                                                                                                                                                                                                       |
| Etapa atual            | Publicado em produção (`462929e7`); aguardando o teste manual do dono e o E2E                                                                                                                                                                                                     |
| PRs                    | #343 (`e5d6b182`), #344 (`45d4529c`), #345 (`462929e7`) **mergeados**; este PR: docs + E2E Steam                                                                                                                                                                                  |
| Migrações pendentes    | Nenhuma. `20261119000000` aplicada e registrada (`45d4529c`, md5 `e584772d…`); `20261119010000` aplicada e registrada (`462929e7`, md5 `12028497…`); `record_steam_alias` sem EXECUTE para `anon`/`authenticated` (conferido)                                                     |
| Secrets                | `STEAM_INTEGRATION_ENABLED` e realm/return URL válidos em produção: um callback vazio falhou em `validate` com `STEAM_OPENID_INVALID_RESPONSE` (e não `CONFIGURATION_MISSING`), registrado em `steam_link_failures`. `STEAM_WEB_API_KEY`: a confirmar pela primeira sincronização |
| **Próxima ação exata** | Teste manual do dono (conectar → sincronizar → desconectar → reconectar → enviar demo); depois E2E no `main` e atualização dos critérios 1, 4–8, 19–22                                                                                                                            |
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
| 1   | Autenticação Steam OpenID funcional                | IMPLEMENTADO · TESTADO EM CI; produção: configuração ativa comprovada, vínculo real PENDENTE DE AÇÃO MANUAL           |
| 2   | Callback seguro e validado no servidor             | IMPLEMENTADO · TESTADO EM CI; produção: callback inválido recusado em `validate` (registrado sem identificadores)     |
| 3   | SteamID64 confirmado e armazenado                  | IMPLEMENTADO · TESTADO LOCALMENTE                                                                                     |
| 4   | Web API Key configurada em produção                | PENDENTE DE CONFERÊNCIA (secret criado pelo dono; presença a confirmar pelo diagnóstico)                              |
| 5   | Dados públicos obtidos quando disponíveis          | IMPLEMENTADO · TESTADO LOCALMENTE                                                                                     |
| 6   | Perfil Steam exibido corretamente                  | IMPLEMENTADO                                                                                                          |
| 7   | Conectar, desconectar e reconectar                 | IMPLEMENTADO · PENDENTE DE AÇÃO MANUAL                                                                                |
| 8   | Estado coerente em todas as telas                  | IMPLEMENTADO · TESTADO LOCALMENTE                                                                                     |
| 9   | Logotipo Steam nos botões Steam                    | IMPLEMENTADO (botão de vínculo; ícone no card e na lista)                                                             |
| 10  | Logotipo FACEIT nos botões FACEIT                  | VALIDADO EM PRODUÇÃO (`/login`: `svg[data-brand=faceit]` presente); botões de conectar no perfil/análise IMPLEMENTADO |
| 11  | Identidade Steam no modelo canônico                | IMPLEMENTADO (`player_identities` + evidência de correlação)                                                          |
| 12  | Histórico de nicknames                             | IMPLEMENTADO · TESTADO LOCALMENTE (PostgreSQL descartável)                                                            |
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
