# Checkpoint — Integração Steam / Valve

Atualizado em: 2026-11-18 (America/Sao_Paulo) · sessão `session_012aG79D5h8yCsYxNjWpDaHG`
Documentação técnica: `docs/steam/STEAM_INTEGRATION.md` · Pesquisa: `docs/steam/STEAM_RESEARCH.md`

## ESTADO EXATO PARA RETOMADA

| Item                   | Valor                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Missão                 | Integração Steam/Valve (vínculo OpenID, Web API, aliases, demos, UI, Coach)                                                          |
| Etapa atual            | Implementação concluída em PRs; aguardando CI, merge, migrações e publicação                                                         |
| PRs                    | #343 PM5 docs (**mergeado** `e5d6b182`) · #344 OpenID real + diagnóstico (CI) · #345 identidade/sync/UI/Coach (CI)                   |
| Migrações pendentes    | `20261119000000_steam_link_failures` (dry-run prod OK) · `20261119010000_steam_nickname_aliases` (dry-run prod OK)                   |
| Secrets                | `STEAM_WEB_API_KEY` e `STEAM_INTEGRATION_ENABLED` criados pelo dono no Lovable (2026-11-18); presença ainda não conferida em runtime |
| **Próxima ação exata** | CI verde → merge #344/#345 → aplicar e registrar as duas migrações → publicar → conferir diagnóstico → teste manual do dono          |
| Não repetir            | Pesquisa (STEAM_RESEARCH.md); dry-runs das duas migrações                                                                            |

## Decisões

1. Módulo próprio: as bibliotecas estudadas tinham falhas de origem e de bypass (ver a pesquisa).
2. `openid.realm` é opcional no callback, porque a Steam não o envia. Isso corrigiu um bug que faria todo retorno real falhar.
3. A prova é o SteamID64 de `player_identities` com `verified` + `openid`. A coluna `player_profiles.steam_id` é só fallback legado.
4. Aliases ficam no histórico canônico (`steam_profile`) e nunca vinculam demos sozinhos.
5. Um estado único (`deriveLinkState`) é usado por todas as telas.
6. "Entrar com Steam" não foi ativado, por depender de uma decisão de produto (a Steam não fornece e-mail).
7. Nenhuma lógica FACEIT foi alterada. Mudaram apenas o logotipo nos botões e a invalidação de cache das telas.

## Critérios de encerramento (Parte 15 do Prompt Mestre; classificação honesta, atualizar com evidências)

| #   | Critério                                           | Estado                                                                                   |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Autenticação Steam OpenID funcional                | IMPLEMENTADO · TESTADO LOCALMENTE (produção pendente)                                    |
| 2   | Callback seguro e validado no servidor             | IMPLEMENTADO · TESTADO LOCALMENTE                                                        |
| 3   | SteamID64 confirmado e armazenado                  | IMPLEMENTADO · TESTADO LOCALMENTE                                                        |
| 4   | Web API Key configurada em produção                | PENDENTE DE CONFERÊNCIA (secret criado pelo dono; presença a confirmar pelo diagnóstico) |
| 5   | Dados públicos obtidos quando disponíveis          | IMPLEMENTADO · TESTADO LOCALMENTE                                                        |
| 6   | Perfil Steam exibido corretamente                  | IMPLEMENTADO                                                                             |
| 7   | Conectar, desconectar e reconectar                 | IMPLEMENTADO · PENDENTE DE AÇÃO MANUAL                                                   |
| 8   | Estado coerente em todas as telas                  | IMPLEMENTADO · TESTADO LOCALMENTE                                                        |
| 9   | Logotipo Steam nos botões Steam                    | IMPLEMENTADO (botão de vínculo; ícone no card e na lista)                                |
| 10  | Logotipo FACEIT nos botões FACEIT                  | IMPLEMENTADO (conectar no perfil/análise e "Continuar com FACEIT")                       |
| 11  | Identidade Steam no modelo canônico                | IMPLEMENTADO (`player_identities` + evidência de correlação)                             |
| 12  | Histórico de nicknames                             | IMPLEMENTADO · TESTADO LOCALMENTE (PostgreSQL descartável)                               |
| 13  | Demos identificadas pelo SteamID quando disponível | IMPLEMENTADO · TESTADO LOCALMENTE                                                        |
| 14  | Aliases tratados com segurança                     | IMPLEMENTADO · TESTADO LOCALMENTE                                                        |
| 15  | Ambiguidades preservadas                           | IMPLEMENTADO · TESTADO LOCALMENTE                                                        |
| 16  | Coexistência com a FACEIT                          | IMPLEMENTADO · TESTADO LOCALMENTE (lógica FACEIT inalterada)                             |
| 17  | RLS e isolamento entre contas                      | TESTADO LOCALMENTE (harness de aliases + RLS existente)                                  |
| 18  | Testes automatizados                               | TESTADO LOCALMENTE · CI pendente (#344/#345)                                             |
| 19  | E2E                                                | PENDENTE                                                                                 |
| 20  | Publicação em produção                             | PENDENTE                                                                                 |
| 21  | Teste real de conexão pelo usuário                 | PENDENTE DE AÇÃO MANUAL                                                                  |
| 22  | Teste real de identificação em demo                | PENDENTE DE AÇÃO MANUAL                                                                  |
| 23  | Documentação e checkpoints                         | IMPLEMENTADO (este arquivo, STEAM_INTEGRATION.md, checkpoint central)                    |

Fora dos critérios: estatísticas de CS2 pela Steam — NÃO DISPONÍVEL NA API. "Entrar com Steam" — avaliado e não
ativado (decisão de produto do dono).
