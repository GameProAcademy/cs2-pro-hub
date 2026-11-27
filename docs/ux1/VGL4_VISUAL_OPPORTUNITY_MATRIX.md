# VGL 4.0 — matriz de oportunidades (2026-11-27)

Base: `main` `1902fa73` (#425), igual ao commit publicado no Lovable. Confirmado no GitHub antes do trabalho.
Regra desta matriz: **ela não reduz a missão.** Cada área prioritária tem uma experiência concreta a construir,
não um ajuste. O que não for feito tem motivo técnico registrado em "Não executado".

## Auditoria: o que os dados permitem (fonte da verdade = código)

| Fonte (já existente, só leitura) | Campos | Abre a experiência |
| --- | --- | --- |
| `getSpatialHeatmap({ map, matchId, layer })` | pontos com `round`, `x`/`y` no radar (0–1024), `side`, `weapon`, `headshot`; células; excluídos por motivo | **Radar tático do round**: onde você matou e morreu em cada round, sobre o radar oficial |
| `getMatchRounds({ matchId })` | por round: lado, vencido, economia das duas equipes, abertura, clutch, pós-plant, `me` (K/D/dano), `timeline` | Round em foco, barra de economia, kill feed |
| `OverviewMatch` | mapa, data, resultado e placar quando resolvidos, K/D/A, ADR, KAST, HS%, rating, aberturas, trocas, flash, clutches, rating CT/T | Visão geral da partida, painel do mapa, histórico por mapa |
| `getDnaHistory()` | snapshots com versão, estado, dimensões 0–100 | Cartão de identidade, linha do tempo de snapshots |
| `getRealPlayerDna()` | dimensões, sinais, status | Ranking das dimensões medidas |
| `EXERCISES` (`cs2.exercises.v1`) | 15 exercícios com áreas (= dimensões do DNA), minutos, dificuldade, equipamento | Categorias reais do catálogo |
| `getAdaptiveTraining()` | plano, sessões, adesão, próxima revisão | Visão geral do treino |
| `coachTokens()` / `coachSectionKind()` | mapas, armas, lados e números citados; seções reconhecidas | Contexto e cartões do Coach |

Produção, conta de teste:
- 10 partidas; resultado não resolvido em todas;
- 7 mapas;
- DNA com 8 snapshots `dna-weighted-v3`;
- plano de 30 dias ativo (0/4);
- sem metas;
- 9 notificações.

## Referências

- **HLTV:** acrescentou filtros por economia das duas equipes (a compra do seu time contra a do adversário) às estatísticas de CS2.
  - Uso aqui: a economia "sua × adversário" de cada round vira uma barra visual.
- **FACEIT:** lançou páginas de partida novas e mantém um botão para voltar ao placar antigo.
  - Uso aqui: o detalhe é preservado sob demanda.
- **Leetify:** explica cada estatística ao passar o mouse sobre o "?" ao lado dela.
  - Uso aqui: dicas nas especialidades.
- **Retrospectivas da Leetify:** usam uma "identidade" baseada nas estatísticas mais fortes do jogador.
  - Inspiração para o cartão de identidade. Aqui sem rótulo inventado: só as dimensões medidas mais altas.
- **VLR (Valorant):** divide a página da partida em abas (Overview, Performance, Economy, Logs) e mostra em que round cada multikill e clutch aconteceu.
  - Uso aqui: o round em foco reúne evento, economia e posição.

## Matriz por experiência

### A. Match Experience 2.0 — obrigatória

| Item | Conceito construído | Dados | Aceite |
| --- | --- | --- | --- |
| Visão geral (Resumo) | Painel de partida acima dos KPIs:<br>• faixa de desempenho K/D/A, rating e rating CT/T;<br>• HUD de eventos da partida (aberturas, trocas, flash, clutches);<br>• atalhos visuais para Rounds, Duelos, Mortes, Mapa e Replay | `OverviewMatch` | Nulo = "—"; nenhum número novo |
| Round em foco | Na aba Rounds, painel do round selecionado:<br>• cabeçalho (número, lado, resultado, motivo, OT);<br>• economia sua × adversário;<br>• cartões K/D/dano, abertura, clutch e bomba;<br>• **radar do round**;<br>• kill feed numerado | `RoundReport` + heatmap | Seleção pela faixa; teclado; celular |
| Radar do round | Radar oficial com marcadores numerados das suas eliminações (lima) e mortes (vermelho) daquele round, com arma e headshot; legenda; estados (mapa sem radar, sem posição no round) | `getSpatialHeatmap` (KILLS e DEATHS da partida, filtrados pelo round) | Cada marcador = um ponto real; nada interpolado |
| Faixa de rounds | O seletor do round em foco é o `RoundJump`, com estado selecionado | — | `aria-pressed` |
| Abas | A aba ativa ganha cabeçalho de seção com ícone e descrição curta | — | Navegação intacta |

### B. Player Identity 2.0 — obrigatória

| Item | Conceito | Dados | Aceite |
| --- | --- | --- | --- |
| Cartão de identidade | Topo do Player DNA:<br>• silhueta da dimensão mais alta como arte;<br>• "assinatura" com as 3 maiores (#1–#3) em barras;<br>• contadores de dimensões medidas e não medidas;<br>• base do snapshot | `getRealPlayerDna`, histórico | Mesmos números do radar |
| Dimensões | Cada cartão ganha a posição no ranking (#n de N medidas) e o selo "especialidade" ou "a desenvolver", pela mesma regra da assinatura | `signature()` | Não medida não recebe posição |
| Especialidades (Início/Perfil) | Chip com silhueta da dimensão, posição e dica de leitura | snapshot | Mesmos valores |
| Evolução do jogador | Snapshots como linha do tempo vertical (data, partidas, dimensões com índice), por versão | histórico | Só a mesma versão |

### C. Map Experience — alta

| Item | Conceito | Dados | Aceite |
| --- | --- | --- | --- |
| Painel de identidade do mapa | Ao lado do heatmap:<br>• arte, emblema e nome;<br>• suporte do radar;<br>• nº de partidas;<br>• primeira e última data;<br>• lista das partidas no mapa (data, resultado, K/D, ADR) com link para a Sala;<br>• miniatura do radar oficial | `OverviewMatch`, `radarAsset` | Sem média nova; links funcionam |
| Galeria 2.0 | Cartão selecionado em destaque (já VGL3) + transição da arte | — | — |

### D. Training Command Center — alta

| Item | Conceito | Dados | Aceite |
| --- | --- | --- | --- |
| Visão geral | Painel no topo:<br>• prioridades (top 3 com ícone da dimensão);<br>• plano (estado, período, adesão em segmentos, próxima revisão);<br>• sessões por estado | prioridades, plano | Mesmos valores |
| Áreas de treino | Grade das áreas reais do catálogo com silhueta, ícone e nº de exercícios disponíveis, marcando as que são prioridade | `EXERCISES` | Só áreas com exercício |

### E. AI Coach — alta

| Item | Conceito | Aceite |
| --- | --- | --- |
| Contexto 2.0 | "Mapas citados" lista também as partidas daquele mapa (data, K/D, link para a Sala), sem escolher uma | Só partidas do mapa citado |
| Estado vazio | Painel de briefing com o que o Coach usa (partidas, DNA) e as perguntas rápidas | Contagens reais |
| Cartões de briefing | Seções reconhecidas já viram painéis (VGL 1); preservar | Texto idêntico |

### F. Performance, Evolução, Momentos, Início, Perfil, Admin — média

| Área | Conceito |
| --- | --- |
| Performance | Painel "Destaques" com a partida de maior e de menor rating (os próprios valores; empate = sem destaque) e link para a Sala |
| Evolução | Linha do tempo de snapshots do DNA (mesma da identidade) abaixo da comparação |
| Momentos | Momentos agrupados por partida, com o emblema do mapa no cabeçalho do grupo |
| Início | Atalhos de comando (Treino, Coach, Mapas) com o estado real de cada um |
| Perfil | Especialidades 2.0 (as mesmas do Início) |
| Admin | Navegação do painel em cartões com ícone; operações intactas |
| Metas, Notificações | Preservadas (VGL 2) |
| Upload | Protegido |

## Não executado (com motivo)

- **Trajetórias, presença e rota no radar:** não há fonte contínua de posição. O próprio motor declara `L02_NO_CONTINUOUS_POSITION_SOURCE`.
- **Posição de granadas:** `NO_UTILITY_POSITION_SOURCE`.
- **Médias por mapa (ADR, rating):** seriam agregações novas. O painel do mapa mostra os valores de cada partida.
- **Arquétipo de jogador ("suporte", "entry"):** seria uma classificação inventada.
