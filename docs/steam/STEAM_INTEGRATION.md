# Integração Steam / Valve — documentação técnica

Missão: integração Steam/Valve (autorizada em 2026-11-18). Pesquisa e decisão de arquitetura:
`docs/steam/STEAM_RESEARCH.md`. Estado e evidências: `docs/steam/STEAM_CHECKPOINT.md`.
Base anterior (Fase 2.5): `docs/PHASE-2.5-STEAM-IDENTITY.md`.

> Repositório público: este documento não contém SteamIDs, e-mails, valores de secrets nem
> dados de demos de usuários.

## 1. O que a Steam fornece (e o que não fornece)

| Recurso                                        | Uso no CS2 PRO                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| OpenID 2.0 (`steamcommunity.com/openid/login`) | **Prova** de posse da conta: devolve o SteamID64 assinado pela Steam |
| Web API `ISteamUser/GetPlayerSummaries/v2`     | Perfil **público**: persona, avatar, URL, visibilidade               |
| Estatísticas de partidas de CS2                | **NÃO DISPONÍVEL NA API.** Nenhum número é atribuído à Steam         |
| E-mail                                         | **Não fornecido.** Por isso "Entrar com Steam" não cria contas (§9)  |

## 2. Arquitetura

```
Navegador ──startSteamConnection──▶ servidor (steam_link_attempts: state de uso único, TTL 600 s)
   │                                         │ redirect (return_to assinado contém gp_state)
   ▼                                         ▼
Steam OpenID ──────── callback ────▶ /api/public/integrations/steam/callback
                                       1. throttle  2. parseSteamCallback (validação completa)
                                       3. check_authentication (servidor→Steam)  4. consumo do state
                                       5. steam_link_commit (RPC atômica)  6. perfil público + alias
                                       └▶ /profile?connection=steam_success|steam_error&reason=
```

Módulos (`src/lib/steam/`):

| Arquivo                       | Responsabilidade                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `steam.openid.ts`             | Parser/validador do callback; nonce; mascaramento                                           |
| `steam.openid.server.ts`      | Início da tentativa, `check_authentication`, consumo do state                               |
| `steam.config.server.ts`      | Configuração (booleans apenas); padrões de produção para realm/return URL                   |
| `steam.connect.server.ts`     | `finalizeSteamConnection` (RPC `steam_link_commit`), correlação FACEIT, unlink              |
| `steam.profile.server.ts`     | `GetPlayerSummaries` com a chave do servidor                                                |
| `steam.sync.server.ts`        | Sincronização do perfil público e gravação de aliases                                       |
| `steam.diagnostics.server.ts` | `steam_link_failures` (estágio + código, sem identificadores)                               |
| `src/lib/steam.functions.ts`  | Server functions do navegador: estado, iniciar, sincronizar, desvincular, diagnóstico admin |

Identidade e estado (`src/lib/identity/`):

| Arquivo                              | Responsabilidade                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `verifiedSteam.ts`                   | Única resposta para "qual SteamID64 está **provado** para este jogador?"        |
| `linkState.ts`                       | `deriveLinkState`: um único estado para todas as telas                          |
| `externalLinks.ts` / `.functions.ts` | Lista FACEIT / Gamers Club / Steam com estado derivado (RLS do próprio usuário) |

## 3. Fluxo OpenID e validações do callback

`parseSteamCallback` recusa o retorno se qualquer item falhar:

- `openid.ns` = `http://specs.openid.net/auth/2.0`; `openid.mode` = `id_res` (`cancel` → cancelado);
- `openid.op_endpoint` = endpoint configurado;
- `openid.claimed_id` = `openid.identity` = `https://steamcommunity.com/openid/id/<SteamID64>`;
- SteamID64 por regex `^7656119[0-9]{10}$`, sempre **texto** (nunca número);
- `openid.return_to` com a mesma origem do realm, o mesmo caminho do callback e o `gp_state` da tentativa;
- `openid.realm` é **opcional** (a Steam não o envia); se vier, precisa ser igual ao configurado;
- campos assinados obrigatórios em `openid.signed`: `op_endpoint`, `claimed_id`, `identity`, `return_to`, `response_nonce`;
- `openid.response_nonce`: formato OpenID, até 255 caracteres, idade ≤ 15 min, relógio adiantado ≤ 5 min;
- `check_authentication` feito pelo servidor contra o endpoint configurado; só `is_valid:true` passa.

Contra replay, CSRF e concorrência:

- o state é aleatório, guardado só como hash, de uso único e expira em 600 s;
- o state é ligado ao usuário autenticado que iniciou a tentativa;
- o consumo é atômico; um segundo uso responde "consumido";
- há throttle por usuário (`claim_steam_link_slot`) e no callback;
- índices únicos parciais impedem que um SteamID seja vinculado a duas contas (`duplicate_account`).

## 4. Dados e modelo

Estruturas reutilizadas (nenhuma tabela paralela):

| Tabela                          | Papel                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `player_connections`            | Conexão `source='steam'`, `connection_type='openid'`: status, persona, URL, `last_sync_*`, `metadata.profile` |
| `player_identities`             | Identidade `platform='STEAM'`: `verified` + `is_verified` + `verification_method='openid'` = prova            |
| `identity_correlation_evidence` | Correlação com o `steam_id_64` declarado pela FACEIT (match/conflito)                                         |
| `player_nickname_history`       | **Aliases** de persona, fonte `steam_profile` (migração `20261119010000`)                                     |
| `steam_link_attempts`           | Tentativas OpenID (somente servidor)                                                                          |
| `steam_link_failures`           | Diagnóstico de falhas (estágio, código, status HTTP), migração `20261119000000`                               |

Campos de `metadata.profile` (fonte: `GetPlayerSummaries`):

- `persona_name`, `avatar` (apenas https), `profile_public`, `visibility`, `country`, `created_at`;
- `steam_id_64_masked`;
- `synced_at`.

Um campo ausente fica `null`, nunca zero.

Desvincular:

- a conexão passa a `disconnected`;
- a identidade volta a `correlated` e perde a verificação;
- o histórico não é apagado;
- nenhuma tela mostra dados antigos de uma conta desvinculada.

## 5. Estados (fonte única)

`deriveLinkState(connection, identity, config)`:

| Estado         | Condição                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| `UNAVAILABLE`  | integração não configurada e sem conexão                                  |
| `NOT_LINKED`   | sem conexão ativa                                                         |
| `PENDING`      | conexão ativa, identidade **não** verificada                              |
| `VERIFIED`     | identidade provada; perfil público ainda não sincronizado                 |
| `SYNCED`       | identidade provada e perfil sincronizado ao menos uma vez                 |
| `SYNC_PENDING` | sincronização em andamento (FACEIT: job `queued`/`processing`/`retrying`) |
| `ERROR`        | identidade provada, última sincronização falhou                           |

Perfil privado **não** derruba o estado: a conta continua `VERIFIED`/`SYNCED`.

Telas que usam essa derivação:

- card Steam do perfil;
- card "Identidades de jogador";
- painel de identidade do `/upload`, que antes recebia observações fixas;
- Coach.

O admin mostra apenas o SteamID **provado**, mascarado.

## 6. Sincronização e aliases

- `syncSteamConnection` só funciona para identidade provada e conexão ativa.
- Limite de uma chamada a cada 5 min por jogador. A API permite 100.000/dia por chave; o uso é mínimo.
- Sem chave Web API, o resultado é `UNAVAILABLE` e nenhum dado é inventado.
- Erro da API grava em `last_sync_status='error'` e `last_sync_error` apenas o código interno.
- Atualiza persona, avatar, URL, visibilidade e `synced_at`. Os campos de confiança da identidade nunca são tocados.
- Ao vincular, o perfil público e o alias também são gravados, em modo "melhor esforço": falhar aqui nunca desfaz o vínculo.

A RPC `record_steam_alias(player, nickname, steam_id)` é `SECURITY DEFINER` com `search_path ''`. Só `service_role` pode executá-la. Ela:

- grava apenas se a identidade STEAM do jogador estiver `verified` + `is_verified` para **aquele** SteamID64;
- normaliza com NFKC, colapso de espaços e minúsculas, no máximo 64 caracteres;
- é idempotente: `ON CONFLICT DO NOTHING`, sem inflar `times_seen`;
- nunca rebaixa, reatribui nem altera `steam_id` de um registro `manual_selection` ou `demo_observation`;
- nunca apaga histórico.

## 7. Identificação de demos

Fluxo `resolvePlayerAttachment`, usado pelo worker do app (`jobs.server.ts`) e pela declaração manual:

1. Usa o **SteamID64 provado** (`readVerifiedSteamId64`). A coluna legada `player_profiles.steam_id` é só fallback.
2. Se exatamente um participante da demo tem esse SteamID, vincula com `steam_id_confirmed`, confiança alta.
3. Se dois participantes têm o mesmo SteamID, é **conflito**: nada é vinculado.
4. Se o SteamID provado não está na demo, nada é vinculado automaticamente (`steam_id_not_in_demo`) e a seleção manual continua disponível.
5. A vinculação automática por apelido continua usando **somente** `manual_selection`. Um alias Steam nunca vincula.

A sugestão "é você?" (`suggestParticipantForPlayer`):

- usa primeiro o SteamID provado (base `steam_id`);
- depois tenta o histórico de apelidos, mas nunca sugere um participante cujo SteamID contradiz o provado;
- só sugere quando o apelido é único na demo inteira;
- é apenas uma pergunta: o jogador confirma.

Nenhuma demo antiga é reprocessada pela integração. Demos novas usam o SteamID provado. Para uma demo existente, o jogador pode reenviar ou selecionar manualmente.

## 8. Coach

O bloco `externalAccounts` e a regra 32 do prompt do Coach informam:

- `steam.identity`: `CONFIRMED` ou `NOT_LINKED`;
- `state`;
- `profilePublic` (`null` = desconhecido);
- `personaName` e `aliases`, como **texto não confiável**, limpos e limitados;
- `faceitSteamAgreement`: `MATCH`, `MISMATCH` ou `UNKNOWN`;
- `matchStatsFromSteam: NOT_AVAILABLE`.

Nenhum SteamID, chave ou token chega ao modelo.

## 9. Login com Steam: avaliação, sem ativação

A Steam não fornece e-mail nem recuperação de conta. Criar contas só com Steam exigiria uma decisão de produto do dono, que ainda não foi tomada:

- e-mail obrigatório depois do primeiro acesso;
- política de recuperação;
- risco de contas duplicadas.

**Estado: não ativado.** O caminho suportado é vincular a Steam a uma conta existente.

## 10. Secrets e configuração (somente nomes)

Todos ficam em Lovable → Cloud → Secrets.

| Variável                    | Obrigatória | Observação                                                              |
| --------------------------- | ----------- | ----------------------------------------------------------------------- |
| `STEAM_INTEGRATION_ENABLED` | sim         | `true` liga o fluxo; o padrão é desligado                               |
| `STEAM_WEB_API_KEY`         | para sync   | Somente no servidor; nunca no bundle, em logs, erros ou commits         |
| `STEAM_OPENID_REALM`        | não         | Padrão `https://gamepro.network`                                        |
| `STEAM_OPENID_RETURN_URL`   | não         | Padrão `https://gamepro.network/api/public/integrations/steam/callback` |
| `STEAM_OPENID_ENDPOINT`     | não         | Padrão `https://steamcommunity.com/openid/login`                        |

O domínio da chave Web API é `gamepro.network`. O domínio de preview do Lovable não é produção.

## 11. Testes

| Suíte                                                  | Cobertura                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `steam.openid`, `steam.hardening*`, `steam.production` | Validação do callback (forma real sem `realm`, nonce, assinatura, replay) |
| `steam.diagnostics`                                    | Registro de falhas sem identificadores                                    |
| `steam.sync`                                           | Sync: provado/desconectado/throttle/sem chave/privado/erro; aliases       |
| `steamAlias.integration` (PostgreSQL descartável)      | 22 verificações de RLS/permissões/idempotência, mais um teste de mutação  |
| `steamLinkState`                                       | Estados, prova OpenID, visão unificada, dados antigos ocultos             |
| `steamDemoIdentity`                                    | Vínculo por SteamID provado, conflito, sugestão sem contradição           |
| `steamContext` (Coach)                                 | Confirmado × não vinculado, concordância FACEIT, sem SteamID              |

## 12. Manutenção

- Uma mudança na Steam (formato do callback, campos da API) começa por `steam.openid.ts` / `steam.profile.server.ts` e pelos testes `steam.production`.
- Chave comprometida: revogar em `steamcommunity.com/dev/apikey`, gerar outra e substituir só o secret. O vínculo OpenID não depende da chave.
- Diagnóstico de produção: `steam_link_failures` (contagem por estágio e código) e `getSteamDiagnostics`, que só o admin master vê e que mostra apenas booleans e contadores.
