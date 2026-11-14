# PM2 v2 — C0 (entrada), C1 (descoberta), C2 (plano)

Data: 2026-11-14 (America/Sao_Paulo). Fases 4.2.3 e 4.2.4, módulos B e I.
Classificação: FATO (lido no banco, no código ou em produção) · HIPÓTESE · LACUNA.

## C0 — Entrada (estado real conferido)

| Item                       | Estado (FATO, 2026-11-14 ~16:15Z)                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `main`                     | `66d4af1d` (merge do #290). Workflows de push: Quality Gates, R5.8.3, R5.8.4, F553 pós e H.3-E success |
| Worker                     | Railway `7690b171`, commit `3837a810` (R5.8.27), demoparser2 0.42.2                                    |
| Pins no banco              | recorder `640a6f72`, asserção `475c6849` (= R5.8.27)                                                   |
| Última migration           | `20261114050000`                                                                                       |
| Fila                       | 0 jobs pending/processing                                                                              |
| `match_integrity`          | 0 jobs com decisão; nenhuma demo foi processada desde a R5.8.27                                        |
| Railway `source.commitSha` | `4716f894` (só metadado; alinhar na próxima release usando a troca de Source como o único deploy)      |
| PM6 etapa E                | `DEFERRED — TECHNICALLY FEASIBLE, NOT REQUIRED FOR PM2`                                                |

### Alerta de segurança do Lovable (§6)

**FATO.** As três políticas `r5_forensic_staging_objects_master_{select,insert,update}` em produção contêm `is_admin_master(auth.uid()) AND owner_id = (auth.uid())::text AND bucket_id = 'r5-forensic-staging' AND name = '<objeto fixo>'`, em USING e em WITH CHECK, igual à migration `20261114010000` (#284).

- Não há políticas duplicadas em nenhuma tabela do schema `storage`; só existem políticas em `storage.objects`.
- Acesso real medido no PM6:
  - anônimo: 0 objetos;
  - usuário comum: só a própria pasta de `demos` e 0 objetos forenses;
  - admin master dono: 1 objeto forense.

**HIPÓTESE (o scanner não identifica as políticas).** O achado que persiste, "3 affected policies", aponta provavelmente para o trio `demos_insert_own` / `demos_select_own` / `demos_update_own`.

- É exatamente um trio INSERT/SELECT/UPDATE.
- As três provam a posse pela **pasta** (`storage.foldername(name)[1] = auth.uid()`), e não pela coluna `owner_id`.
- `demos_select_own` também libera leitura para `is_staff` (suporte).

**Avaliação.** A posse pela pasta isola os usuários. O INSERT e o UPDATE impedem escrever fora da própria pasta, e o isolamento A↔B foi provado em teste e em produção. Exigir `owner_id` deixaria ilegíveis as 10 demos gravadas sem dono (gravadas pelo serviço) e mexeria no upload retomável. Isso não tem relação com o PM2 e não será alterado aqui.

**Estado: NOT_VERIFIED** (não foi confirmado no painel quais políticas o scanner aponta). Não é tratado como resolvido.

## C1 — Descoberta (dados reais em produção)

| Fonte           | O que existe                                                                                                                                                                                                                                            | Lacuna                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `round_events`  | 901 `kill` (tick, arma, headshot, distance, ator/vítima por SteamID, `data`: blind/noscope/penetration/wallbang); 3.827 `damage` (com `armor_damage`); 20.202 `weapon_fire`; 981 smoke / 976 flash / 494 HE; bomb plant/defuse/explode; round_start/end | **Só 142 kills com posição** (`data.position`/`victim_position`: a partida do PM1). Utilitários e dano **sem posição** |
| `round_players` | por jogador e round: side, survived, kills, deaths, `opening_kill`/`opening_death`, `traded`/`trade_kill`, dinheiro e equipamento                                                                                                                       | regra de trade herdada do pipeline (a documentar e reaproveitar)                                                       |
| `match_rounds`  | start/end tick, vencedor, `win_reason`, bomba, tempos                                                                                                                                                                                                   | —                                                                                                                      |
| Trajetórias     | **não existem**                                                                                                                                                                                                                                         | o replay 2D exige posições amostradas por round, que o worker não persiste hoje                                        |
| Mapas           | `src/lib/spatial/maps.ts`: **de_dust2 VALIDATED**; mirage/inferno/nuke e as demais **NOT_VALIDATED**                                                                                                                                                    | validar outros mapas exige evidência por mapa (§8.1)                                                                   |
| Integridade     | `demo_jobs.match_integrity` (PM6)                                                                                                                                                                                                                       | partidas anteriores ao contrato: `null` (não medido, nunca "completa")                                                 |

### Consequências diretas (FATO → decisão)

1. **Ficha de morte (4.2.3):** os fatos e derivações estão disponíveis para todas as partidas: tick, round, arma, headshot, distância, vivos por lado reconstruídos da sequência de kills, trade observado na janela, abertura e contexto do round.
   - A posição só existe onde foi gravada; nos demais casos é `NOT_MEASURED`, nunca 0.
   - **Exposição, isolamento, re-peek e rotação/timing ficam `NOT_SUPPORTED`** nesta entrega: exigem posição dos aliados e trajetória, que não estão persistidas. Nada disso é inferido por proximidade.
2. **Replay 2D (4.2.4):** precisa de uma nova release do worker, com posições amostradas por round e eventos com tick.
   - Sem reprocessamento de partidas reais (não autorizado), **o replay só existe para partidas processadas depois da release**.
   - Para as anteriores, o estado é explícito: "replay indisponível para esta partida".
3. **Mapas:** o replay e as posições da ficha só são desenhados em mapas `VALIDATED`. Validar mirage/cache/inferno com as demos locais autorizadas é um passo explícito do plano (evidência por mapa, sem reaproveitar a transformação da Dust II).

## C2 — Plano (PRs pequenos, na ordem)

| #   | PR                                                                                                                                                                                                       | Worker? | Migration                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------- |
| 1   | Contrato `cs2.death-context.v1` (puro): fatos, derivações e lacunas por morte; janelas em ticks a partir do tickrate real; tratamento de world/self kill, round anulado/incompleto e integridade         | não     | —                                       |
| 2   | Catálogo `cs2.death-rules.v1` (`TRADE_NOT_OBSERVED`, `OPENING_DEATH`, `NUMERIC_DISADVANTAGE`, `POST_PLANT_CONTEXT`; exposição/isolamento/re-peek/rotação `NOT_SUPPORTED`) e agregação com amostra mínima | não     | —                                       |
| 3   | API protegida (dono derivado da sessão, limites) e ficha de morte na UI (5 idiomas), com link do heatmap → morte                                                                                         | não     | — (leitura por RLS existente)           |
| 4   | Feedback do jogador separado dos fatos                                                                                                                                                                   | não     | tabela própria, com RLS do dono         |
| 5   | Worker: posições amostradas por round (`round_position_samples`) e utilitários com tick e posição                                                                                                        | **sim** | tabela de amostras, com RLS via partida |
| 6   | API de segmento de replay (um round, limites, dono) e componente 2D com controles e timeline                                                                                                             | não     | —                                       |
| 7   | Deep links heatmap ↔ ficha ↔ replay; contexto do Coach (event refs, versão de regra, amostra, cobertura)                                                                                                 | não     | —                                       |
| 8   | Release (Source alinhado como único deploy), re-pin, atestação, H.3-E, publicação e validação com upload de controle                                                                                     | sim     | re-pin                                  |

Cada PR traz testes positivos, negativos e de borda, testes de RLS entre dois usuários quando houver dado novo, i18n completo e rollback.
