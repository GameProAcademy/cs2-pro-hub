# PM5 — FACEIT: matriz endpoint × campo × status

> Fonte: documentação oficial (docs.faceit.com, Data API v4) e a descoberta OpenID
> `https://api.faceit.com/auth/v1/openid_configuration`, consultadas em 2026-11-18.
> Nada aqui vem de scraping. A coluna **Validação real** só muda para CONFIRMADO depois de uma
> sincronização real em produção (pendente: exige que o dono conecte a conta FACEIT).

Status: **OBTIDO** (o código lê e grava) · **ARMAZENADO BRUTO** (guardado sem uso em métrica) ·
**NÃO USADO** (disponível, sem uso) · **NÃO_EXPOSTO** (não há endpoint oficial) · **A VALIDAR**.

## OAuth / OpenID (Fluxo 1 e 2)

| Endpoint                          | Campo                      | Uso no CS2 PRO                               | Status                                  | Validação real          |
| --------------------------------- | -------------------------- | -------------------------------------------- | --------------------------------------- | ----------------------- |
| `accounts.faceit.com` (authorize) | `code`, `state`            | PKCE S256, state de uso único (hash)         | OBTIDO                                  | A VALIDAR               |
| `/auth/v1/oauth/token`            | `access_token`, `id_token` | usado só na requisição; **nunca persistido** | OBTIDO                                  | A VALIDAR               |
| `/auth/v1/resources/userinfo`     | `guid` / `sub`             | id da conta FACEIT (identidade)              | OBTIDO                                  | A VALIDAR               |
| userinfo                          | `nickname`                 | exibição; nunca identificador                | OBTIDO                                  | A VALIDAR               |
| userinfo                          | `email`                    | só no login com FACEIT, conta nova           | OBTIDO                                  | A VALIDAR               |
| userinfo                          | `email_verified`           | conta nova só com `true`                     | OBTIDO se presente                      | **A VALIDAR (crítico)** |
| discovery                         | revogação de token         | —                                            | NÃO_EXPOSTO (sem `revocation_endpoint`) | —                       |

## Data API v4 (`https://open.faceit.com/data/v4`, `Authorization: Bearer <api key>`)

| Endpoint                                                                        | Campo                                                                                                                                  | Uso no CS2 PRO                                                                | Status                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /players/{id}`                                                             | `nickname`, `avatar`, `country`, `faceit_url`                                                                                          | cartão FACEIT em /profile                                                     | OBTIDO                                                               |
| `GET /players/{id}`                                                             | `games.cs2.skill_level`, `games.cs2.faceit_elo`, `region`                                                                              | cartão FACEIT (valor da FACEIT, rotulado como tal)                            | OBTIDO                                                               |
| `GET /players/{id}/history?game=cs2` (offset 0–1000, limit 1–100, from/to unix) | lista de partidas                                                                                                                      | descoberta de partidas para importar                                          | OBTIDO                                                               |
| `GET /matches/{id}`                                                             | status, mapa, times, `results.score`, `detailed_results`                                                                               | partida canônica `data_source=faceit` (placar só se FACEIT informar por mapa) | OBTIDO                                                               |
| `GET /matches/{id}/stats`                                                       | `rounds[].teams[].players[].player_stats` (`Kills`, `Deaths`, `Assists`, `Headshots %`, `ADR`, `Quadro Kills`, `Penta Kills`, `MVPs`…) | `match_metrics` do jogador (soma de contadores; razões ponderadas por rounds) | OBTIDO (chaves **não documentadas**: lidas por nome, ausente = null) |
| `GET /matches/{id}/stats`                                                       | `KAST`, `Rating`                                                                                                                       | só se a FACEIT enviar a chave                                                 | A VALIDAR (não documentadas)                                         |
| `GET /players/{id}/stats/cs2`                                                   | `lifetime`, `segments`                                                                                                                 | mapa numérico plano                                                           | ARMAZENADO BRUTO                                                     |
| `GET /players/{id}/games/cs2/stats` (offset 0–200, limit 1–100, from/to ms)     | estatísticas por partida                                                                                                               | —                                                                             | NÃO USADO                                                            |
| —                                                                               | demos (`demo_url`)                                                                                                                     | **não baixadas** (fora do escopo; sem autorização para reprocessar)           | NÃO USADO                                                            |

## Exibidos no site da FACEIT sem endpoint oficial equivalente

| Dado no site                                                   | Status no CS2 PRO                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| FACEIT Rating / "Swing" e métricas próprias de impacto do site | **NÃO_EXPOSTO** — não aparecem na Data API documentada; não são estimados nem copiados     |
| Rankings, percentis e comparações com outros jogadores         | NÃO_EXPOSTO / não usados (ver módulo J: sem benchmark licenciado)                          |
| Estatísticas de utilitários, entradas e clutches do site       | NÃO_EXPOSTO na Data API documentada; no CS2 PRO vêm **só das demos** enviadas pelo jogador |

## Reconciliação API × demo

Implementada na Fase 2.6.11 (`src/lib/faceit/faceit.canonical.server.ts`), reaproveitada sem mudança:

- A observação FACEIT passa pelo Match Identity Resolver (janela de 6 h por jogador). Só uma decisão de identidade **positiva e não revisável** anexa a observação a uma partida canônica já existente (por exemplo, a mesma partida enviada como demo); ambiguidade mantém as fontes separadas.
- Nada é mesclado à força: a precedência de fonte da rotina de persistência decide qual observação escreve cada coluna canônica. Nenhuma linha de demo é reescrita.
- Demos antigas sem evidência RAW aprovada não são alvo de convergência.
- bo2/bo3: uma série + uma partida por mapa **informado** pela FACEIT; sem placar por mapa, só a série é gravada (nenhuma partida inventada).
- Métricas exclusivas de demo (trocas, economia, utilitários, posicionamento, rounds) **nunca** são produzidas a partir da FACEIT. Ausente na FACEIT = `null`, nunca `0`.
- Rate limit: a FACEIT não documenta limites numéricos; 429/503 viram `RATE_LIMITED`/`TEMPORARY` com novas tentativas do worker.
