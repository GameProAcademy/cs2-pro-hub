# Steam / Valve — pesquisa técnica e decisão de arquitetura

Data: 2026-11-18. Ciclo 1 da missão Steam. Fontes consultadas listadas no fim.

## O que a Steam oferece

| Necessidade                       | Mecanismo oficial                                                               | Observação                                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provar a conta Steam no navegador | **Steam Community OpenID 2.0** (`https://steamcommunity.com/openid/login`)      | Não há OAuth2 para sites; nenhum token é entregue.                                                                                                                                                                                           |
| Identificador estável             | `claimed_id` = `https://steamcommunity.com/openid/id/<SteamID64>`               | SteamID64 tratado sempre como **texto** de 17 dígitos (`7656119…`).                                                                                                                                                                          |
| Dados públicos do perfil          | `ISteamUser/GetPlayerSummaries/v2` (Web API, chave do servidor)                 | Até 100 IDs por chamada. Campos públicos: `steamid`, `personaname`, `profileurl`, `avatar*`, `personastate`, `communityvisibilitystate` (1 = não visível, 3 = público), `profilestate`, `lastlogoff`. Campos privados só com perfil público. |
| Estatísticas de partidas CS2      | **Não existe** endpoint público com histórico competitivo, ADR, KAST ou rating  | Partidas e métricas continuam vindo **só das demos** (e da FACEIT).                                                                                                                                                                          |
| Limites                           | Termos da Web API: até 100.000 chamadas/dia; chave confidencial, pessoal ao app | Dados do usuário só quando ele pede; informar o que é armazenado.                                                                                                                                                                            |
| Marca                             | Termos licenciam exibir nomes/logos da Valve nas páginas que usam a API         | Botões usam o logotipo oficial da Steam.                                                                                                                                                                                                     |

## Formato real do callback (decisivo)

Um callback real logado publicamente (aspnet-contrib, issue #79) traz exatamente:
`openid.ns`, `openid.mode=id_res`, `openid.op_endpoint`, `openid.claimed_id`, `openid.identity`,
`openid.return_to`, `openid.response_nonce`, `openid.assoc_handle`,
`openid.signed=signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle`, `openid.sig`.

**Não há `openid.realm`.** O parser existente (Fase 2.5.2) exigia `openid.realm` e teria
**recusado todo login real**. Os testes antigos fabricavam esse campo. Corrigido nesta missão.

## Vulnerabilidades históricas estudadas

- **socialiteproviders/steam < 3.0** (GHSA-hhw9-35p2-q2c5, CWE-346): não verificava que a resposta
  vinha de `steamcommunity.com`; um servidor OpenID do atacante era aceito. → Exigimos
  `op_endpoint` assinado e **igual** ao endpoint oficial, e o `check_authentication` vai **sempre**
  para o endpoint configurado (nunca para o informado na resposta).
- **passport-steam** (liamcurry): projetos derivados (modern-passport-steam) relatam que a versão
  original permite autenticar como qualquer conta; o Snyk não lista CVE. Padrões de falha
  conhecidos nesse ecossistema: confiar no `claimed_id` sem `check_authentication`, aceitar
  `return_to` diferente do configurado e não amarrar a resposta a um estado de sessão.
- **Steam OpenID signature validation (Stack Overflow 53573820)**: a validação correta é reenviar
  todos os `openid.*` com `openid.mode=check_authentication` ao endpoint oficial e aceitar só
  `is_valid:true`.

## Bibliotecas comparadas

| Opção                                                            | Situação                                                                               | Decisão                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `passport-steam`                                                 | depende de Passport/Express e de `passport-openid`; manutenção fraca; relato de bypass | não usar                                                |
| `modern-passport-steam`                                          | também Passport/Express                                                                | não usar (stack é TanStack Start em Cloudflare Workers) |
| `steam-auth`/`steam-lightweight-openid`                          | só fazem `check_authentication`; não validam `return_to`, `op_endpoint` nem nonce      | não usar                                                |
| **Implementação própria existente** (Fase 2.5, `src/lib/steam/`) | sem dependências, roda no runtime do app, testada                                      | **manter e corrigir**                                   |

## Decisão

Manter o módulo próprio (`src/lib/steam/`), já integrado às estruturas canônicas
(`player_connections`, `player_identities`, `identity_correlation_evidence`, `steam_link_commit`),
e corrigir: `openid.realm` opcional (se vier, tem de ser o nosso), `return_to` dentro do realm e
byte a byte igual ao configurado, `op_endpoint` e `response_nonce` obrigatoriamente assinados,
nonce com formato e janela de tempo, `check_authentication` sempre no endpoint oficial, estado de
uso único no `return_to` assinado, diagnóstico da etapa que falha (sem identificadores).

Login/cadastro com Steam **não** é ativado: a Steam não fornece e-mail (nem verificado), então uma
conta criada só pela Steam não teria recuperação. Fica como decisão de produto (ver
`STEAM_INTEGRATION.md`).

## Fontes

- Steamworks Web API overview / ISteamUser: https://partner.steamgames.com/doc/webapi/isteamuser
- Valve Developer Wiki, Steam Web API: https://developer.valvesoftware.com/wiki/Steam_Web_API
- Steam Web API (dev, OpenID): https://steamcommunity.com/dev — termos: https://steamcommunity.com/dev/apiterms
- OpenID Authentication 2.0: https://openid.net/specs/openid-authentication-2_0.html
- Callback real (sem `openid.realm`): https://github.com/aspnet-contrib/AspNet.Security.OpenId.Providers/issues/79
- Verificador `steam-auth` (campos esperados): https://docs.rs/steam-auth/1.0.0/src/steam_auth/verifier.rs.html
- GHSA-hhw9-35p2-q2c5 (socialiteproviders/steam): https://db.fluidattacks.com/adv/composer/socialiteproviders/steam/GHSA-hhw9-35p2-q2c5
- passport-steam (Snyk): https://security.snyk.io/package/npm/passport-steam
- modern-passport-steam: https://github.com/samplics/modern-passport-steam
