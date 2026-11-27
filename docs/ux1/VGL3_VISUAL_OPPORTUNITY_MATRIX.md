# VGL 3.0 — matriz de oportunidades visuais (2026-11-27)

Fase 1 da missão "VGL 3.0 — Competitive Immersion Experience". Base: `main` `94ce7677` (#420), confirmado no
GitHub antes do trabalho. Fonte da verdade: o código e a produção, não os documentos antigos.

## Método

- **Documentos lidos:** `VISUAL_SYSTEM.md`, `VISUAL_GAME_LANGUAGE.md`, `VISUAL_PHASE_VALIDATION.md`,
  `VGL2_CONTINUATION.md`, `CS2_ASSETS.md`, `RADAR_ASSETS.md`, checkpoint UX1 §2.17–§2.20. Divergência encontrada:
  `VISUAL_SYSTEM.md` ainda diz "fora do escopo: arte oficial de mapa ou arma", superado pela VGL 2.0
  (registrado aqui; o documento antigo fica como histórico).
- **Código:** rotas em `src/routes/_authenticated`, componentes em `components/{cs2,common,real,coach,training,
notifications,profile,moments,admin}`, tipos de dados (`OverviewMatch`, `RoundReport`, `TimelineItem`,
  `XRayDiagnosis`, `DnaHistoryEntry`), motion em `styles.css`.
- **Produção (Claude in Chrome, conta de teste, 10 partidas):** 15 telas em 1440 px e 6 em 390 px (moldura de
  390 px da mesma origem, porque a janela do Chrome não reduz). Capturas em `/tmp/vgl3/before`, entregues ao
  dono.
- **Densidade medida em produção** (texto do `main`, por rota): palavras, números, painéis, altura da página.

| Rota           | Altura 1440 | Altura 390 | Palavras | Números | Painéis | Parágrafos > 120 caracteres |
| -------------- | ----------- | ---------- | -------- | ------- | ------- | --------------------------- |
| /dashboard     | 2383        | 4111       | 395      | 116     | 26      | 3                           |
| /matches       | 1960        | 3950       | 526      | 135     | 12      | 4                           |
| Sala (resumo)  | 948         | 1472       | 114      | 31      | 8       | 0                           |
| /moments       | 900         | 900        | 86       | 7       | 3       | 0                           |
| /maps          | 2256        | 3166       | 355      | 80      | 13      | 1                           |
| /player-dna    | 4229        | **8445**   | 894      | 241     | 66      | 6                           |
| /analysis      | 2589        | 4011       | 486      | 96      | 18      | 2                           |
| /performance   | 3914        | **6699**   | 959      | 200     | 24      | 4                           |
| /evolution     | 3541        | —          | 968      | 202     | 7       | 6                           |
| /training      | **5778**    | —          | 909      | 159     | 19      | 3                           |
| /goals         | 900         | —          | 79       | 5       | 1       | 2                           |
| /coach         | 900         | —          | 288      | 48      | 3       | 7                           |
| /profile       | 3905        | —          | 1253     | 86      | 22      | 2                           |
| /notifications | 1410        | —          | 325      | 67      | 14      | 0                           |
| /upload        | 7591        | —          | 1386     | 60      | 39      | 13                          |

### Defeitos reais encontrados na auditoria

1. **Início, 390 px:** o botão "Abrir a Sala da Partida" do hero sobrepõe o nome do mapa (captura mobile390-01).
2. **Início e Partidas, 390 px:** os 5 KPIs ficam em uma coluna, cada um com altura de cartão inteiro (página de
   4111 px); o aviso "Partidas limitadas" quebra em uma coluna estreita ao lado do selo.
3. **Coach, 390 px:** as ações do cabeçalho (Conversas, Personalizar, Apagar, Nova conversa) ocupam duas linhas e
   a área de mensagens fica com cerca de 100 px visíveis.
4. **Player DNA, 390 px:** 8445 px de altura; os textos metodológicos abrem a página antes de qualquer dado.

## Referências externas

| Fonte                                               | O que observar                                                                                                                          | Uso no CS2 PRO                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Leetify, página de partida (rating por round)       | Cabeçalho com resultado e placar (ex.: "Victory 13:8"), mapa e K/D/A; lista de rounds com lado, ganho/perdido e o evento que mais pesou | Placar e mapa primeiro; rounds com lado e resultado em uma linha; detalhe sob demanda |
| op.gg CS2 2D Replay                                 | Replay por round com botões de round, linha do tempo e eventos no radar; aviso de que nem toda partida tem replay                       | Navegação por round na Sala; estado honesto quando não há replay                      |
| Scope.gg                                            | Erros resumidos depois de cada partida, contribuição na partida, histórico                                                              | Briefing curto antes do detalhe                                                       |
| Refrag (Bootcamp, Prefire, NADR, Routines, Academy) | Treino por modos e categorias (mira, utilitários, retakes), rotinas                                                                     | Cartões de treino por categoria do catálogo real                                      |
| HUD do CS2 (kill feed, placar, radar)               | Kill feed: atacante, arma, headshot, vítima; destaque da própria jogada                                                                 | Kill feed com os eventos reais do round                                               |

Nada é copiado: os padrões orientam hierarquia e leitura; a arte continua a do pacote `public/cs2`.

## Linha de base aprovada (protegida)

Tema escuro, lima, CT azul, T dourado, roxo de utilitários; Chakra Petch, IBM Plex Sans e Mono; tokens de
`styles.css`; `Cs2Art` (`MapArt`, `MapEmblem`, `WeaponArt`, `HudIcon`, `SideLogo`, `RadialGauge`),
`MatchVisuals` (`LastMatchHero`, `MatchCard`, `HudStat`), `DnaVisuals`, `PerformanceVisuals`, `ProfileHero`,
`GameIcon`, `ToneBadge`, `SideBadge`, `MapTile`, `WeaponLabel`, `GrenadeLabel`, motion `vgl-*` com
`prefers-reduced-motion`. Upload (#397–#404) protegido por `uploadProtectedFlows`.

## Matriz por tela

Legenda dos estados: L = carregando, V = vazio, E = erro, P = parcial, I = amostra insuficiente.

### 1. Início (`/dashboard`)

| Campo         | Registro                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado atual  | Cabeçalho tático; hero da última partida (cena do mapa + 8 eventos HUD); 5 KPIs; tabela de 5 partidas; "Seus mapas"; Score; DNA; envios                     |
| Já feito      | VGL 1 (ícones, selos), VGL 2 (hero, map pool)                                                                                                               |
| Permanece     | Hero, KPIs (mesmos valores), tabela, Score e DNA                                                                                                            |
| Problemas     | Defeitos 1 e 2; nada resume "como estou" em termos de especialidade; DNA só como radar                                                                      |
| Dados         | `OverviewMatch` (10), snapshot DNA (`dimensions`), Score                                                                                                    |
| Oportunidades | Painel de especialidades (3 maiores e 2 menores índices medidos, iguais aos do DNA); KPIs em grade 2×N no celular; hero com CTA abaixo do título no celular |
| Referências   | Leetify (resumo no topo), HUD                                                                                                                               |
| Assets        | Silhuetas de dimensão já registradas (`DIMENSION_ART`)                                                                                                      |
| Reaproveitar  | `signature()` e chips de `DnaVisuals`; `MetricCard`; `LastMatchHero`                                                                                        |
| Novos         | `SpecialtyStrip` (compacto, reaproveita a lógica da assinatura)                                                                                             |
| Motion        | `vgl-rise` escalonado nos chips                                                                                                                             |
| Mobile        | CTA do hero em linha própria; KPIs em 2 colunas                                                                                                             |
| Estados       | L/E já existentes; DNA não estável → painel não aparece (sem inventar)                                                                                      |
| Riscos        | Duplicar o DNA: mitigado reaproveitando a mesma função                                                                                                      |
| Aceite        | Sem sobreposição em 360–430; chips com os mesmos números do DNA; teste                                                                                      |

### 2. Partidas (`/matches`)

| Campo         | Registro                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado atual  | 5 KPIs; aviso de limitação; 6 cartões com arte; tabela completa                                                                                                                                            |
| Permanece     | Tabela completa, cartões, KPIs                                                                                                                                                                             |
| Problemas     | O cartão mostra placar e resultado só quando resolvidos; sem resultado, o lugar fica vazio, sem explicar (correção da revisão: a primeira leitura dizia que o placar nunca aparecia); defeito 2 no celular |
| Dados         | `result`, `scorePlayer`, `scoreOpponent`, `resultStatus` (na conta de teste: todos não determinados)                                                                                                       |
| Oportunidades | Faixa de placar no cartão ("13 : 8", vitória/derrota) com "—" e "não determinado" quando a demo não resolve; KPIs 2×N no celular                                                                           |
| Referências   | Leetify ("Victory 13:8")                                                                                                                                                                                   |
| Reaproveitar  | `MatchCard`, `ToneBadge`                                                                                                                                                                                   |
| Novos         | `ScoreLine` (placar compacto, compartilhado com a Sala)                                                                                                                                                    |
| Mobile        | KPIs 2 colunas; aviso de limitação com o selo acima do texto                                                                                                                                               |
| Estados       | Resultado desconhecido → "—" com rótulo; nunca 0 : 0                                                                                                                                                       |
| Aceite        | Cartão mostra placar real ou "—"; teste com resultado conhecido e desconhecido                                                                                                                             |

### 3. Sala da Partida (`/matches/$id`, 7 abas)

| Campo         | Registro                                                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado atual  | Cabeçalho com cena do mapa; abas com ícone; resumo com 4 KPIs + painel CT/T + faixa de rounds; rounds como cartões táticos; duelos, mortes (com arma), utilitários, mapa (heatmap), replay 2D         |
| Permanece     | Tudo; o replay 2D real e o heatmap não mudam                                                                                                                                                          |
| Problemas     | Faixa de rounds não mostra o que aconteceu no round (abertura, clutch, bomba); a linha do tempo do round expandido é texto corrido; placar não aparece no cabeçalho                                   |
| Dados         | `RoundReport`: lado, vencido, `opening.byMe/onMe`, `clutch`, `postPlant` (planted/defused/exploded), `timeline` (atacante e vítima como você/aliado/adversário, lado, arma, headshot, trocado, vivos) |
| Oportunidades | Marcas de evento sob cada round da faixa; kill feed no round expandido; navegação por round na aba Rounds; placar no cabeçalho                                                                        |
| Referências   | Kill feed do CS2; op.gg (botões de round); Leetify                                                                                                                                                    |
| Assets        | `weapons/*.svg`, `hud/headshot.svg`, `icon_c4`, `icon_defuse`, `icon_bomb_explosion`                                                                                                                  |
| Reaproveitar  | `RoundStrip`, `SideSplit`, `EventGlyph`, `WeaponArt`, `HudIcon`                                                                                                                                       |
| Novos         | `KillFeed`/`KillFeedRow`, `RoundMarks`, `RoundJump`                                                                                                                                                   |
| Motion        | Entrada das linhas do kill feed; destaque do round ao saltar                                                                                                                                          |
| Mobile        | Kill feed em uma linha por evento, rótulos curtos; faixa com rolagem horizontal                                                                                                                       |
| Estados       | Round inválido mantém o aviso; arma ambígua sem arte; sem `timeline` → nada                                                                                                                           |
| Riscos        | Texto da frase completa sumir: mantido como `sr-only` e `title`                                                                                                                                       |
| Aceite        | Cada linha do feed = um item real da `timeline`; teste de contagem; 7 abas no smoke                                                                                                                   |

### 4. Momentos (`/moments`)

| Campo         | Registro                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Estado atual  | Coleções; filtros; lista de momentos com ícone por tipo                                          |
| Problemas     | Item sem identidade de mapa quando o mapa é conhecido (a conta de teste tem "mapa desconhecido") |
| Oportunidades | Emblema do mapa e faixa lateral por tipo; manter "mapa desconhecido" quando não há mapa          |
| Implementação | Conforme matriz: ajuste leve no item                                                             |
| Aceite        | Momento com mapa mostra emblema; sem mapa, só texto                                              |

### 5. Mapas (`/maps`)

| Campo         | Registro                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Estado atual  | Galeria de 7 mapas com arte e contagem (VGL 2); filtros; heatmap no radar oficial; legenda; células                               |
| Permanece     | Galeria, filtros, heatmap (dados e radar intactos)                                                                                |
| Problemas     | O mapa selecionado não tem um painel de identidade; legenda e explicações longas                                                  |
| Dados         | Contagem de partidas por mapa (já na galeria), suporte do heatmap, radar registrado                                               |
| Oportunidades | Destaque do mapa selecionado (anel lima, rótulo "selecionado"); painel do mapa com emblema, nome, partidas e o radar em miniatura |
| Reaproveitar  | `MapGallery`, `radarAsset()`                                                                                                      |
| Novos         | Nenhum componente novo além do estado selecionado                                                                                 |
| Mobile        | Galeria em 2 colunas                                                                                                              |
| Aceite        | Selecionado visível; nenhum número novo                                                                                           |

### 6. Player DNA (`/player-dna`)

| Campo         | Registro                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Estado atual  | Radar; assinatura técnica; 10 dimensões com medidor radial e sinais; histórico; tendência por dimensão |
| Permanece     | Tudo, incluindo regras de comparabilidade                                                              |
| Problemas     | Defeito 4: textos metodológicos antes dos dados no celular                                             |
| Oportunidades | Metodologia em "Como ler" expansível (mesmo texto); assinatura logo após o radar                       |
| Aceite        | Mesmo texto presente; página menor no celular                                                          |

### 7. Raio-X (`/analysis`)

| Campo         | Registro                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Estado atual  | Camadas numeradas Observado → Inferência → Recomendação; painéis por dimensão com silhueta; CT/TR |
| Problemas     | A sequência O → I → R só aparece rolando; nenhum mapa da leitura no topo                          |
| Oportunidades | Barra de briefing com as três camadas e links de salto                                            |
| Novos         | `BriefingRail`                                                                                    |
| Aceite        | Três camadas visíveis no topo; nenhum texto alterado                                              |

### 8. Performance (`/performance`)

| Campo         | Registro                                                                              |
| ------------- | ------------------------------------------------------------------------------------- |
| Estado atual  | Score com anel e tabela de componentes; faixa de partidas; HUD de combate; 7 gráficos |
| Já feito      | VGL 2 continuação                                                                     |
| Problemas     | 6699 px no celular; tabela de componentes como planilha no celular                    |
| Oportunidades | Tabela de componentes como linhas compactas no celular (mesmos números)               |
| Implementação | Ajuste de responsividade; preservar o resto                                           |

### 9. Evolução (`/evolution`)

| Campo         | Registro                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| Estado atual  | Filtros; "antes → agora" (VGL 2); tabela de 10 métricas com consistência |
| Problemas     | Tabela de 4 colunas com texto mono em quebra no celular                  |
| Oportunidades | Cada métrica como cartão no celular (mesmos campos)                      |
| Aceite        | Mesmos valores, sem rolagem lateral                                      |

### 10. Treino (`/training`)

| Campo         | Registro                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------- |
| Estado atual  | Prioridades numeradas com medidor de referência; plano de 30 dias; metas do plano; catálogo |
| Problemas     | Página de 5778 px; método e metas em texto corrido                                          |
| Dados         | Prioridades (`cs2.training-priority.v2`), plano e sessões, catálogo real                    |
| Oportunidades | Categorias visuais do catálogo real (ícone da dimensão); estado do plano como faixa         |
| Restrição     | Não criar exercícios nem ligar métrica a treino sem relação estabelecida                    |
| Implementação | Conforme matriz: ajustes leves, sem mudar o conteúdo                                        |

### 11. Metas (`/goals`)

Feito na VGL 2 continuação (seções, cartões, medalhas). Conta de teste sem metas: estado vazio com ilustração.
Preservar; validar no celular.

### 12. AI Coach (`/coach`)

| Campo         | Registro                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado atual  | Cabeçalho tático; radar ao gerar; respostas em seções ou com destaque de mapa, arma, lado e números (VGL 2)                                                                                          |
| Permanece     | Motor inteiro; texto idêntico                                                                                                                                                                        |
| Problemas     | Defeito 3 (celular); sem contexto visual do que a resposta cita                                                                                                                                      |
| Oportunidades | Ações do cabeçalho como botões de ícone no celular; altura mínima da conversa; "Mapas citados" sob a resposta, ligando às partidas daquele mapa (só mapas citados no texto e presentes nas partidas) |
| Novos         | `CoachMapContext`                                                                                                                                                                                    |
| Riscos        | Inventar conclusão: o painel só lista o mapa e a contagem de partidas já existentes                                                                                                                  |
| Aceite        | Conversa com pelo menos 50% da altura no celular; texto idêntico (teste)                                                                                                                             |

### 13. Perfil (`/profile`)

Hero de identidade feito na VGL 2 continuação. Oportunidade: especialidades do DNA no hero (mesmos chips do
Início). Sem dados privados.

### 14. Notificações (`/notifications`)

Feito na VGL 2 continuação (por dia, não lidas, falhas). Preservar.

### 15. Upload (`/upload`)

Protegido. Auditado só para preservar: nenhuma mudança.

### 16. Admin (9 rotas)

| Campo                 | Registro                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ |
| Estado atual (código) | `AdminShell` + `PageHeader`; `StatCard` sem ícone; tabelas e listas com tokens       |
| Produção              | Conta de teste não é admin: as 9 rotas redirecionam (verificado)                     |
| Oportunidade          | `StatCard` com régua lima e ícone discreto, como o `MetricCard`                      |
| Implementação         | Conforme matriz: só o cartão de indicador; sem mudar operações, permissões ou lógica |
| Pendência             | Validação visual com sessão de administrador                                         |

## O que não pode ser feito sem dados novos

- Placar por lado do adversário, posições ao vivo fora do replay, trajetórias e locais de granada fora dos
  eventos registrados.
- Percentis, ranks ou comparação com outros jogadores.
- Progresso de metas calculado no cliente.
- Contexto de partida no Coach a partir de uma inferência sobre qual partida a resposta quis dizer.

## Revisão depois da implementação

- **Sala:** o bloco de placar "não determinado" repetia o texto da linha de resultado no cabeçalho. Agora só aparece com placar resolvido.
- **Kill feed no celular:** o tick técnico ficou oculto abaixo de `sm`.
- **Player DNA:** o método do radar também foi para "Base desta leitura".
- **Mapas:** o painel de detalhe do mapa não foi feito. O cartão do heatmap já mostra o emblema e o nome do mapa selecionado; o que faltava era o destaque na galeria.

## Revisão crítica

A matriz prioriza defeitos reais (celular) e lacunas de leitura (Sala, Início, Coach) sobre trocas cosméticas.
Telas já resolvidas na VGL 2 (Metas, Notificações, Performance desktop) são preservadas com ajustes de celular.
