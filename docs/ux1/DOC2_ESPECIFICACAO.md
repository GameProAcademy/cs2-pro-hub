> Cópia em texto do artefato UX-1 (https://claude.ai/artifact/YTeUHV1mKu37LoxbpN6WGS), Documento 2, rev 4, extraída em 2026-11-24 para consulta nas sessões de execução. A fonte é o artefato.

# Documento 2 — Especificação consolidada de produto O produto passa a ter cinco áreas: Início, Partidas, Meu jogo, Treino e Coach. A partida vira um lugar com URL própria, a Sala da Partida, e todas as análises por partida que hoje vivem em páginas separadas com `?matchId` viram abas dela. Nada é removido: Replay, Clutch, Trade, ADR, KAST, HS e Player DNA continuam, só mudam de endereço.
## 1. Mapa de navegação Os 17 itens atuais (`navigation.ts` L33–53) e as 21 rotas de `src/routes/_authenticated/` se redistribuem assim:
| Item atual | Rota atual | Nova área | Novo lugar |
| Dashboard | `/dashboard` | Início | página inicial |
| Partidas | `/matches` | Partidas | lista |
| Rounds | `/rounds?matchId` | Partidas | aba Rounds da Sala |
| Mortes | `/deaths?matchId` | Partidas | aba Mortes da Sala |
| Confrontos | `/duels?matchId` | Partidas | aba Duelos da Sala |
| Utilitários | `/utility?matchId` | Partidas | aba Utilitários da Sala |
| Mapas | `/maps?matchId` | Partidas | aba Mapa da Sala (visão por partida); a visão agregada vai para Meu jogo |
| Replay | `/replay?matchId&round&tick` | Partidas | aba Replay da Sala; o deep link atual continua válido |
| Momentos | `/moments` | Partidas | filtro "Momentos salvos" na lista |
| Performance | `/performance` | Meu jogo | seção Tendências |
| Evolução | `/evolution` | Meu jogo | seção Evolução |
| Player DNA | `/player-dna` | Meu jogo | seção principal |
| Raio-X | `/analysis` | Meu jogo | seção Diagnóstico |
| Treinamento | `/training` | Treino | página principal, com uma lista única de prioridades |
| Metas | `/goals` | Treino | seção Metas |
| Coach | `/coach` | Coach | página, mais um painel contextual em todas as áreas |
| Perfil | `/profile` | menu da conta | fora das 5 áreas |
| Analisar demo | `/upload` | ação global | botão no cabeçalho e estado vazio de Partidas | Regras de navegação
- A Sala da Partida ganha a rota `/matches/$matchId` com abas (`?tab=`). As rotas antigas por partida redirecionam para a aba equivalente, preservando `matchId`, `round` e `tick`. A Sala não tem tabela nova; ela só lê o que as páginas atuais já leem.
- O título visível da Sala é contextual, no formato "Mirage · 17 nov". "Sala da Partida" é só o nome interno.
- No desktop, a barra lateral mostra as 5 áreas. No mobile, a barra inferior mostra as 5 áreas com rótulo inteiro (hoje são 4 e o rótulo é cortado na última palavra, `AppShell.tsx` L204, L218).
- Os nomes "Meu Raio-X" e "Performance" não viram áreas.
## 2. Fluxos principais
- Primeira demo. Analisar demo → envio → processamento (texto para o jogador, sem estados de engenharia) → Sala da Partida da demo nova. O card "Não tenho uma demo" sai (origem: `upload.tsx` L152, L175, L200).
- Rever uma partida. Partidas → linha inteira clicável → Sala, aba Resumo → linha de rounds → Replay no tick do evento.
- Entender um número. Qualquer KPI → painel de método (fórmula, denominador, amostra, versão) → linha de evidência → Replay no `{matchId, round, tick}` do `EvidenceRef`.
- Do diagnóstico ao treino. Meu jogo → dimensão do DNA → barras dos sinais → "Treinar isto" → item da lista única do Treino.
- Perguntar ao Coach. Painel do Coach a partir de qualquer tela, com o contexto da tela (partida, dimensão ou item de treino) enviado como referência, nunca como números recalculados.
## 3. Sala da Partida
- Cabeçalho de contexto: mapa, data (`played_at`, ou o rótulo "data de processamento" quando `dateSource` = processed, `playerOverview.ts` L81–98), lado inicial, rounds jogados e resultado. Quando a partida tem L04, o resultado aparece como "Resultado não determinado", nunca como vazio.
- Abas: Resumo · Rounds · Duelos · Mortes · Utilitários · Mapa · Replay.
- Resumo: quatro KPIs da partida (ADR, KAST, HS, K/D), a faixa de rounds, os três momentos com evidência e o atalho para o Replay.
- Faixa de rounds: um quadrado por round com a cor do lado vencedor quando `winner_side` existe. Com o texto "Seu lado venceu X de Y rounds", aprovado só com a condição descrita no Documento 6 (R-07).
- Anonimato: os outros jogadores aparecem como T1–T5 e CT1–CT5, estáveis dentro da partida. Não há matriz nominal 5×5, nem agregação de terceiros entre partidas, nem dado de terceiros enviado ao Coach.
## 4. Meu jogo e Player DNA
- O radar grande preenchido em verde-lima continua sendo o elemento principal da tela. Ele não vira barras nem miniatura.
- Ao lado (desktop) ou abaixo (mobile) ficam as barras dos sinais da dimensão selecionada. Selecionar um eixo do radar destaca a barra, e selecionar uma barra destaca o eixo.
- Toda dimensão sem valor aparece no radar como eixo marcado "sem amostra", sem ponto. Hoje ela some (`RealDna.tsx` L68–80).
- O rótulo da dimensão precisa refletir o sinal que de fato a preenche. A dimensão Clutch mostra hoje a taxa de multi-kill (D-05). A dimensão Posicionamento é feita de trades e primeiras mortes, não de posição (`features.catalog.ts` L259–305).
- Cada valor 0–100 é rotulado como "índice CS2 PRO" e nunca aparece com o mesmo nome de uma grandeza real.
## 5. Treino
- Uma única lista de prioridades, com um único motor. Hoje são dois: `adaptive.ts` e `trainingPlan.ts`.
- Cada item mostra o sinal, o valor, a amostra em eventos ou rounds, a confiança e a evidência. Itens que não atingem o mínimo do Documento 4 aparecem como "em observação", sem recomendação.
- Os links do Tutor LMS continuam só como links. Não há API nem sincronização.
## 6. Coach contextual
- O painel abre em qualquer largura de tela; hoje some abaixo de 1024 px (`CoachFab.tsx` L28, L36).
- O contexto da tela segue como referência (`matchId`, dimensão, item de treino) no mesmo carregador de servidor que já existe (`coach.functions.ts` L384–436). O cliente não envia números, e `validateCoachInput` (`coachContext.ts` L75–103) continua aceitando só os campos atuais até haver aprovação técnica.
- O Coach cita os mesmos valores das telas, porque lê o mesmo agregado canônico. Ele não recalcula.
## 7. Estados de dados Um componente por status do contrato `metric-contract-v1.1` (`metricContract.ts` L20–30):
| Status | O que o jogador vê | Pode virar número? |
| OBSERVED | valor | sim |
| DERIVED | valor + "calculado pelo CS2 PRO" | sim |
| INFERRED | valor + "atribuição" | sim, com aviso |
| PARTIAL | valor + "parte das partidas" + cobertura | sim, com cobertura |
| INSUFFICIENT_SAMPLE | "Amostra insuficiente: X de Y eventos" | não |
| NOT_OBSERVED | "Não registrado nesta demo" | não (nunca zero) |
| NOT_MEASURED | "O CS2 PRO não mede isto" | não |
| UNAVAILABLE | "Indisponível para esta partida" + motivo (ex.: L04) | não |
## 8. Responsividade
- Larguras de referência: 375, 390, 430, 768, 1024 e 1440 px.
- Nenhuma tabela fica sem contêiner de rolagem (nove casos hoje, D-18). Tabelas longas viram cartões abaixo de 640 px, mantendo o link de Replay visível.
- O corte horizontal da raiz (`AppShell.tsx` L128) só é aceitável depois que todas as tabelas tiverem contêiner próprio.
- Listas longas (Mortes, 27.158 px no mobile) ganham agrupamento por round e paginação.
- O menu mobile fecha com Esc, prende o foco e devolve o foco ao botão.
## 9. Idiomas
- Idiomas: pt-BR, pt-PT, en, es e fr. Os nomes das 5 áreas e todos os estados do item 7 precisam existir nos cinco antes de qualquer liberação.
- Siglas de jogo (ADR, KAST, HS, K/D) não são traduzidas. O nome descritivo ao lado delas é traduzido.
- Os textos sobre posições desatualizados (`spatial/pt-BR.ts` L78–79 e equivalentes) são corrigidos nos cinco idiomas ao mesmo tempo.
- Não verifiquei se pt-PT, es e fr têm hoje a mesma cobertura de chaves que pt-BR e en (Documento 8).
## 10. Rodada 2 (2026-11-23): decisões incorporadas
| Tema | Decisão do proprietário | Efeito nesta especificação |
| Métricas | Valor único por métrica quando jogador, período, partidas, escopo e cobertura são os mesmos; fonte canônica; soma onde for matematicamente adequado | Documento 3, seção 5; implementação condicionada a V-1 a V-4 |
| Score | 94,0 nunca aparece como ADR; separar ADR, índice de dano, Score e dimensão de dano | Documento 3, seção 5.3 |
| Player DNA | Radar lima grande protagonista; alternativa A preferida; Clutch sem multi-kill; HS por kills; nova versão separada | Seção 14 e Documento 5 |
| Treino | Uma lista; amostra na unidade do sinal; sem intervalo universal | Documento 4, seção 5 |
| L02 | Decisão em aberto; não remover posições legítimas | Seção 12.1 (matriz) |
| L04 | "Seu lado venceu X de Y" só com dado comprovado; contrato inalterado | Seção 12.2 (condições e redação proposta) |
| Mobile | Correções básicas em paralelo ao catálogo, sem esconder funções | Seção 13 |
| Navegação | 5 áreas e Sala da Partida com título contextual aprovadas conceitualmente | Seção 11 |
## 11. Como reaproveitar o que existe sem duplicar cálculo Cada página por partida já é um componente que recebe `matchId` pela URL e chama sua própria função de servidor (`rounds.tsx`, `deaths.tsx`, `duels.tsx` e `utility.tsx` L12–23; `maps.tsx` L14–29; `replay.tsx` L7–34). A Sala da Partida só precisa montar esses componentes como abas, passando o mesmo `matchId`.
| Mudança | Tipo | O que muda | O que é reaproveitado | Risco de duplicar lógica |
| Rota `/matches/$matchId` com `?tab=` | navegação frontend | rota nova; redirecionamento das 6 rotas antigas preservando `matchId`, `round`, `tick` | `RealRoundsPage`, `RealDeathReviewPage`, `RealCombatPage`, `RealUtilityPage`, `RealHeatmapPage`, `RealReplayPage` | nenhum: nenhuma função de servidor nova |
| 5 áreas na barra lateral e inferior | navegação frontend | `navigation.ts` L33–53; `AppShell.tsx` L204, L218 | ícones e rotas atuais | nenhum |
| Seletor de partida dentro de cada página | componente | some quando a página está dentro da Sala (prop) | o seletor atual continua nas rotas antigas até o redirecionamento | nenhum |
| Cabeçalho de contexto e Resumo | componente | componente novo | a linha da partida que `playerOverview` já carrega | sim, se recalcular: deve ler o valor por partida já gravado |
| Faixa de rounds | componente | componente novo | `round-context-v1` (`roundContext.ts`) | sim, se contar vencedores por conta própria: deve usar `buildMatchRounds` |
| Estados de dado (8) | componente | componentes novos | `metricContract.ts` (status) | nenhum |
| Catálogo `metrics-catalog-v2` | contrato backend (cálculo) | uma função de agregação importada por Início, Partidas, Performance, Evolução, Raio-X e Coach | `evolution.ts` L225 já soma | é a correção da duplicação atual (D-28) |
| Contexto da tela para o Coach | contrato backend | `validateCoachInput` aceita ids validados | `coach.functions.ts` L384–436 | nenhum: o servidor carrega |
| Rótulos de jogadores estáveis na partida | contrato backend (pequeno) | `replay/segment.ts` L117–126 passa a numerar por partida, não por round | mesma fonte | nenhum |
| DNA v3 e Treino v2 | contrato backend (cálculo) | versões novas, lado a lado com as atuais | `features.catalog.ts`, `playerDna.ts`, `training/*` | nenhum se v2 e v3 forem versões, não edições |
| Dimensão nova (Multi-kill) no snapshot | dados (esquema) | coluna nova em `player_dna_snapshots` | snapshots existentes continuam válidos | — |
| Numeradores gravados (dano total, rounds KAST, kills com HS) | dados (esquema), opcional | colunas novas | não é necessário: a reconstrução é exata ou com erro ≤ 0,05×rounds (D-26) | — |
## 12. Posições (L02) e resultado dos rounds (L04)
### 12.1 L02: o que permite e o que restringe L02 não vale só para algumas partidas: o worker declara o domínio completo de ticks indisponível em toda demo (D-32). L02 proíbe persistir ou mostrar métrica de movimento, posicionamento ou tempo de exposição tirada do fluxo contínuo. Ele declara expressamente que eventos e o estado do jogador lido no tick exato do evento não são afetados (`admissionV3.ts` L100–113). As trajetórias do Replay (`cs2.round-trajectory.v1`) são leituras reais a cada 16 ticks, com lacunas explícitas, guardadas fora da evidência RAW governada (`trajectory.py` L1–21). Interpretação proposta (decisão Q-03): mostrar essas amostras como desenho é compatível com L02, porque cada ponto é uma leitura observada e nada é afirmado sobre os ticks não lidos. Transformar essas amostras em métrica (distância, tempo exposto, presença, rotas) continua proibido.
| Tipo de dado ↓ / tipo de partida → | Processada depois de R5.8.28, mapa validado | Processada antes de R5.8.28 | Mapa não validado (Overpass, Train, Vertigo) | Round pulado (janela desconhecida, round longo, limite) | Partida com L04 (sem time) | Extração parcial |
| Posição no tick do evento (kill, morte) | sim | sim | dado sim, desenho não | sim | sim | só rounds extraídos |
| Mapa de calor de mortes e kills (frequência, ≥ 10 eventos) | sim | sim | não (sem radar validado) | sim | sim | parcial, com cobertura |
| Trajetória amostrada no Replay | sim, se Q-03 aprovar | não: NOT_RECORDED (nada reprocessado) | não: MAP_NOT_VALIDATED | não, só naquele round | sim (usa lado por round, não time) | só rounds com trajetória |
| Ponto interpolado no desenho | só entre duas leituras, marcado como interpolado; nunca em métrica | — | — | nunca atravessa lacuna | idem | idem |
| Presença, rotas, tempo exposto, distância | proibido (L02) | proibido | proibido | proibido | proibido | proibido |
| Exposição e isolamento nas regras de morte | NOT_SUPPORTED enquanto L02 valer | idem | idem | idem | idem | idem | Confiabilidade: o Replay foi validado em produção numa demo FACEIT de Nuke (2.500 de 2.500 amostras no round 3) e em teste numa GamersClub de Mirage (`PM2_FINAL_REPORT.md` L65, L82). Quantas partidas atuais estão em cada coluna é NÃO VALIDADO (leitura L-2). Os textos que dizem "só existem posições no tick da morte" (D-08) ficam errados para a primeira coluna e certos para a segunda: a correção deve depender do tipo de partida, não ser uma troca global.
### 12.2 L04: lado não é time
- Time é a identidade de um grupo de jogadores ao longo da partida (`winner_team`, placar, resultado). Lado é CT ou T num round (`winner_side`). Os dois têm colunas separadas, e o mapeamento canônico registra que um não é o outro (D-22).
- L04 dispara só com ausência total de time: nenhum participante com time, nenhum round com time vencedor e placar e vencedor nulos (`admissionV3.ts` L702–711). O lado vencedor de cada round não entra nessa condição.
- A origem do lado vencedor depende do caminho do parser (D-10b): evento `round_end` (uma observação do jogo), estado do jogo (duas observações que concordam) ou nenhum vencedor. Condições para mostrar "Seu lado venceu X de Y rounds" (aprovado só conceitualmente):
- Y conta só rounds com `winner_side` gravado e lado do jogador único em `round_players` (`roundContext.ts` L120–127).
- Rounds fora de Y aparecem como "Z rounds sem vencedor ou sem lado registrado", nunca como derrota.
- Lado do jogador não identificável em: round em que ele não aparece (desconectado ou ainda não entrou), duas linhas com lados diferentes, demo do caminho 3. Nesses rounds a faixa mostra "?".
- Nunca vira resultado da partida, porcentagem do jogador ou "vitória".
- O painel de método diz a origem (evento do jogo ou estado do jogo) e a versão `round-context-v1`.
- Liberação só depois de L-1 e L-2: a contagem confere com o placar real em pelo menos 3 demos conhecidas, sem L04, com os dois caminhos representados. Redação documental proposta (só proposta; o contrato não foi alterado): L04 — Resultado por time não determinado. Nenhum participante tem time atribuído, nenhum round tem time vencedor (`winner_team`), e o placar e o vencedor da partida são nulos. O lado vencedor de cada round (`winner_side`, CT ou T) pode existir e não é afetado por L04. Ele não identifica times e não permite derivar placar nem resultado. Para `roundContext.ts` L5–6, a redação proposta é: "`match_rounds.winner_side`, gravado a partir do evento `round_end` do jogo, ou, sem esse evento, só quando duas observações independentes do estado do jogo concordam".
## 13. Mobile e acessibilidade: critérios mensuráveis Os valores "hoje" foram medidos no app a 375×812 em 2026-11-23 (Documento 1, seção 4). Todos os critérios valem a 375, 390, 430 e 768 px. Nenhuma correção pode esconder uma função: o que não cabe vira expansível, aba ou folha, e continua acessível.
| ID | Correção | Hoje | Critério de aceitação |
| M-1 | Lista de duelos | termina em 434 px; 0 de 82 controles inteiros; botão Replay 72×15 px | 82 de 82 controles inteiros na tela; área de toque do Replay ≥ 44×44 px; abaixo de 640 px, um cartão por duelo com o Replay visível |
| M-2 | Página Mortes | 33,4 telas; 151 controles < 24 px; 17 rounds × 6 subseções | ≤ 5 telas no estado inicial; um bloco recolhido por round, com as 6 subseções ao expandir; filtro por round; 0 controles < 24 px |
| M-3 | Barra inferior | 4 itens de 94×55 px; rótulo cortado na última palavra | 5 itens ≥ 44×44 px (cerca de 75×55 a 375 px); rótulo inteiro, sem corte, em fonte ≥ 11 px nos 5 idiomas; item ativo com `aria-current` |
| M-4 | Menu e navegação | sem Esc e sem foco preso (`AppShell.tsx` L136–158) | Esc fecha; foco preso enquanto aberto; foco volta ao botão; 0 violações críticas ou sérias de navegação em teste automatizado de acessibilidade |
| M-5 | Tamanho dos controles | < 24 px: 41 em Confrontos, 151 em Mortes, 24 em Treinamento | 0 controles < 24×24 px em qualquer tela (WCAG 2.2, critério 2.5.8); ações principais ≥ 44×44 px |
| M-6 | Tabelas | 9 sem contêiner; a de duelos ultrapassa a tela | 0 tabelas mais largas que a tela sem contêiner de rolagem próprio; coluna de ação sempre visível ou fixa |
| M-7 | Rolagem | Mortes 33,4; Treinamento 7,7; Confrontos 7,6 telas | nenhuma tela principal acima de 8 telas no estado inicial; índice ou "voltar ao topo" acima de 4 telas |
| M-8 | Replay | radar 317×317 px; rótulos de jogador mudam na troca de lado (D-33) | radar ≥ 90% da largura útil; play, pausa e troca de round ≥ 44×44 px; rótulo de cada jogador igual em todos os rounds da partida |
| M-9 | Player DNA | 9 eixos; "Trabalho em equipe" começa em −14 px | 10 eixos sempre presentes; 0 rótulos fora da tela; nome completo ao tocar no eixo; folha inferior abre por toque e por teclado |
| M-10 | Coach | campo de texto 5 px sob a barra inferior; botão flutuante some abaixo de 1024 px | campo inteiro visível acima da barra, também com o teclado virtual aberto; Coach acessível em qualquer largura |
## 14. Player DNA: as sete questões do proprietário
- Por que Economia desaparece. Os dois sinais que dão valor à dimensão são sempre NULL no código, e o terceiro é neutro (D-29). Proposta para o DNA v3: manter o eixo visível como "Não medido" (NOT_MEASURED), distinto de "sem amostra". Tirar valor das categorias de compra da página Rounds exige um sinal novo, especificado e versionado.
- Quais dimensões têm dados suficientes. Depende do jogador, mas a estrutura é conhecida. Mira, Duelos, Sobrevivência, Posicionamento, Decisão e Equipe usam eventos que toda demo admitida traz. Consistência depende de rating por lado. Utilitários depende de `throwsRecorded`/`blindsRecorded`; demos HLTV não trazem cegueira. Clutch só tem valor legítimo com 10 ou mais tentativas. Economia nunca tem valor hoje. Regra proposta: a dimensão só tem valor quando pelo menos metade dos seus sinais não neutros tem valor e cada sinal de evento passa no mínimo do Documento 4.
- Quais escalas são comparáveis. Algumas são proporções naturais de 0 a 1: HS por kill, KAST, K/(K+D), sobrevivência, taxas de trade e de primeira morte. Outras são frações de uma referência de projeto com teto: ADR/100, razão de dano/2, dano tomado/120 e os quatro sinais de utilitário. A Mira mistura os dois tipos. Por isso "68 em Mira e 45 em Utilitários" não significa que o jogador mira melhor do que usa utilitários. O radar mostra um perfil diante de referências fixas, não uma classificação. Nenhuma normalização nova foi inventada; separar os dois tipos seria decisão metodológica do DNA v3 (Q-23).
- Dimensões sem amostra. O eixo continua presente, tracejado e sem vértice. O preenchimento lima cobre só os setores entre dois eixos com valor; através de um eixo vazio, a borda fica tracejada e o setor sem preenchimento. Com menos de 3 eixos com valor, o radar mostra "Em formação" e o progresso (como hoje, `RealDna.tsx` L63–68).
- Sincronização com as barras. Um único estado de seleção (a dimensão) liga os dois. Tocar ou passar o cursor no eixo destaca o grupo de barras; tocar numa barra destaca o eixo e o vértice. Setas do teclado percorrem as dimensões, e uma região `aria-live` anuncia "Mira, 68 de 100, 4 sinais".
- Evidências e histórico. Cada sinal abre até 5 evidências (`EvidenceRef`) com link para o Replay. O histórico existe como snapshots cumulativos (D-31): mostrar "desde o snapshot anterior (+N partidas)", com variação por dimensão, só entre snapshots da mesma `dna_version`. Uma janela por período (últimos 30 dias) exigiria cálculo novo.
- Evitar comparação estatística indevida pela área. Sem polígono de média ou de população (hoje `showAverage={false}`). Nenhum número derivado da área. Ordem dos eixos fixa e documentada, porque a área muda com a ordem. Linhas de grade em 25, 50 e 75 sem a palavra "média". Sem cores de bom ou ruim. Legenda: "Índice CS2 PRO com referências fixas. Não é percentil nem comparação com outros jogadores." DNA v3 (proposta, não implementar): Clutch só com `clutch_win_rate` por evento; multi-kill como sinal próprio, fora de Clutch; HS ponderado por kills; sinais repetidos entre dimensões resolvidos (D-30); Economia como NOT_MEASURED. `dna-weighted-v2` continua intacto e os snapshots antigos continuam válidos.
