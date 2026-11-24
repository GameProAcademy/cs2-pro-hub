> Cópia em texto do artefato UX-1 (https://claude.ai/artifact/YTeUHV1mKu37LoxbpN6WGS), Documento 6, rev 4, extraída em 2026-11-24 para consulta nas sessões de execução. A fonte é o artefato.


# Documento 6 — Matriz de aprovação Das 29 recomendações, 13 ficam como A, 9 como B, 1 como C, 2 como D e 4 como E. Toda recomendação que mexe em fórmula é B, porque exige versão nova e a passagem pelo gate de integridade. Nenhuma classificação e nenhum gate autoriza implementação: isso depende de autorização explícita do proprietário, item por item. A coluna Classificação é editável para a sua avaliação.
## 1. Os nove critérios
| # | Critério | Regra |
| C1 | Integridade dos dados | eliminatório: não pode inventar, zerar NULL, misturar denominadores nem alterar versão existente |
| C2 | Problema comprovado | evidência COMPROVADO ou PARCIALMENTE COMPROVADO com arquivo e linha |
| C3 | Benefício para o jogador | muda o que o jogador entende ou faz |
| C4 | Dados disponíveis | usa só tabelas, colunas e endpoints que existem |
| C5 | Viabilidade técnica | cabe na arquitetura atual (TanStack, Supabase com RLS, worker) |
| C6 | Consistência com o catálogo | não cria um terceiro valor para a mesma métrica |
| C7 | Acessibilidade e mobile | funciona de 375 a 1440 px, teclado e leitor de tela |
| C8 | Idiomas | viável nos 5 idiomas |
| C9 | Preserva arquitetura e versões | não altera pro-score-v1, dna-weighted-v2 e as demais versões |
## 2. Matriz (rodada 1, 2026-11-19)
| ID | Recomendação | Problema | Benefício | Evidência | Dados | Viabilidade técnica | Complexidade | Risco | Critérios | Condições | Classificação | Aceitação |
| R-01 | Catálogo canônico com agregação por soma (metrics-catalog-v2, proposta) | ADR 104,1 contra 106,7 | um valor por métrica | D-01; Doc. 3, linhas 1, 4, 5 | existem | alta | média | médio: valores mudam para quem já viu | 9/9 | versão nova lado a lado; troca em todas as telas e no Coach ao mesmo tempo; nota de mudança | B · Aprovada com condições | as 3 partidas de referência dão 106,7 / 76,6 / 58,1 em todas as telas |
| R-02 | Coach lê só o agregado canônico, sem recalcular | dois ADRs no contexto | Coach igual às telas | D-04 | existem | alta | baixa | baixo | 9/9 | depende de R-01; teste de contexto sem conversa real | B · Aprovada com condições | contexto montado contém um ADR, igual ao da tela |
| R-03 | Renomear "Dano por round" do Score para "Índice de dano (teto 100 de ADR)" e mostrar o ADR ao lado | 94,0 lido como ADR | fim da confusão | D-02 | existem | alta | baixa | baixo | 9/9 | só rótulo; pro-score-v1 intacto | A · Aprovada | nenhuma tela usa "por round" para índice |
| R-04 | Separar Clutch de Multi-kill no DNA | Clutch 13 = multi-kill | rótulo verdadeiro | D-05 | existem | alta | média | médio: radar muda | 9/9 | nova versão do DNA; dna-weighted-v2 intacto | B · Aprovada com condições | Clutch sem valor abaixo de 10 eventos |
| R-05 | HS no DNA ponderado por kills | denominador errado | HS igual ao catálogo | D-03 | existem | alta | baixa | baixo | 9/9 | mesma versão nova de R-04 | B · Aprovada com condições | DNA mostra 58,1 nas partidas de referência |
| R-06 | Rota /matches/$matchId com abas e redirecionamento das rotas antigas | partida sem lugar | navegação por partida | D-07 | existem | alta | média | médio: deep links | 9/9 | replay?matchId&round&tick continua válido; nenhuma tabela nova | B · Aprovada com condições | todo link antigo abre a aba certa |
| R-07 | "Seu lado venceu X de Y rounds" | L04 parece contradizer | contexto do round | D-10 | winner_side existe | média | baixa | alto se L04 estiver errado | 8/9 (C2 parcial) | ler migrations de match_rounds; checar dados persistidos em leitura; mostrar só rounds com vencedor; nunca porcentagem do jogador; doc L51 não é alterado sem decisão | B · Aprovada com condições | contagem bate com rounds do parser em 3 demos |
| R-08 | 5 áreas: Início, Partidas, Meu jogo, Treino, Coach | 17 itens | menos carga | D-16 | n/a | alta | média | baixo | 9/9 | nenhuma funcionalidade removida | A · Aprovada | todo item atual alcançável em até 2 toques |
| R-09 | Contêiner de rolagem nas 9 tabelas e cartões abaixo de 640 px | dados cortados | mobile utilizável | D-11, D-18 | n/a | alta | baixa | baixo | 9/9 | — | A · Aprovada | 82 de 82 controles alcançáveis a 375 px |
| R-10 | Componente por status do contrato (8) | 3 componentes | estados honestos | D-19 | existem | alta | média | baixo | 9/9 | NULL nunca vira zero | A · Aprovada | cada status com texto nos 5 idiomas |
| R-11 | Coach recebe referência da tela (matchId, aba, dimensão) | Coach sem contexto | respostas sobre a tela | D-17 | existem | média | média | médio: superfície de prompt injection | 8/9 (C5 depende) | só ids validados (UUID e listas fechadas); servidor carrega os dados; sem texto livre de terceiros | B · Aprovada com condições | teste de entrada inválida rejeitada |
| R-12 | Coach acessível em qualquer largura | some abaixo de 1024 px | acesso no mobile | CoachFab.tsx L28, L36 | n/a | alta | baixa | baixo | 9/9 | — | A · Aprovada | abre a 375 px |
| R-13 | Lista única de treino com regra de intervalo (cs2.training-priority.v2, proposta) | duas listas; confiança mistura unidades | prioridade confiável | D-06; Doc. 4 | existem | média | alta | médio | 9/9 | versão nova; v1 e plano intactos até a troca | B · Aprovada com condições | falso positivo ≤ 2,5% por sinal em simulação |
| R-14 | Radar aprimorado (alternativa A) | eixos somem, rótulos cortados | leitura completa | D-13, D-14 | existem | alta | média | baixo | 9/9 | radar grande lima continua protagonista | A · Aprovada | 10 eixos visíveis a 375 px |
| R-15 | Radar com traço por confiança (alternativa B) | amostra invisível | confiança no gráfico | Doc. 5 | existem | alta | média | médio: leitura da opacidade | 8/9 (C3 não provado) | teste com jogadores | C · Experimento | jogadores não confundem traço com valor |
| R-16 | Comparação de períodos no radar (alternativa C) | sem evolução no DNA | progresso visível | Doc. 5 | histórico NÃO VALIDADO | ? | alta | alto | 6/9 | confirmar snapshots do DNA | D · Investigação pendente | — |
| R-17 | Tirar economia da lista de "não suportados" | texto contradiz Rounds | coerência | Doc. 3, linha 12 | existem | alta | baixa | baixo | 9/9 | — | A · Aprovada | Raio-X e Rounds dizem o mesmo |
| R-18 | Corrigir textos sobre posições | textos dizem "só tick da morte" | coerência | D-08, D-09 | existem | alta | baixa | médio: L02 | 7/9 | decidir antes como L02 se aplica ao Replay | D · Investigação pendente | — |
| R-19 | Tirar o card "Não tenho uma demo" e esconder estados de engenharia | upload confuso | primeiro uso limpo | D-20 | n/a | alta | baixa | baixo | 9/9 | — | A · Aprovada | upload sem termos internos |
| R-20 | Menu mobile com Esc, foco preso e foco devolvido | acessibilidade | teclado e leitor de tela | AppShell.tsx L136–158 | n/a | alta | baixa | baixo | 9/9 | — | A · Aprovada | teste com teclado e leitor de tela |
| R-21 | Cores CT/T como tokens | cores fixas | tema único | D-21 | n/a | alta | baixa | baixo | 9/9 | contraste AA | A · Aprovada | nenhuma cor CT/T fora dos tokens |
| R-22 | Mortes agrupadas por round e paginadas | 27.158 px no mobile | leitura | D-12 | existem | alta | baixa | baixo | 9/9 | evidências mantidas | A · Aprovada | página abaixo de 5 telas por padrão |
| R-23 | Renomear dimensão Posicionamento | sinais são trades e primeiras mortes | rótulo verdadeiro | features.catalog.ts L259–305 | existem | alta | baixa | baixo | 9/9 | só rótulo, nos 5 idiomas | A · Aprovada | nome descreve os sinais |
| R-24 | Rotular a fonte da data (jogo ou processamento) | ordem temporal ambígua | leitura correta | Doc. 3, linha 17 | existem | alta | baixa | baixo | 9/9 | — | A · Aprovada | toda data mostra a fonte |
| R-25 | Trocar e-mails de teste por @example.com | possível PII | privacidade | Doc. 1, seção 2 | n/a | alta | baixa | baixo | 9/9 | confirmar se o endereço é real | B · Aprovada com condições | nenhum e-mail pessoal no repositório |
| R-26 | Trocar o radar por barras | — | — | decisão do proprietário | — | — | — | — | — | rejeitada: o radar é o protagonista | E · Rejeitada | — |
| R-27 | Matriz nominal 5×5 ou agregação de terceiros entre partidas | — | — | decisão de anonimato | — | — | — | alto | falha C1 | rejeitada | E · Rejeitada | — |
| R-28 | Calibrar referências por população nesta fase | — | — | sem base populacional | não existem | — | — | alto | falha C1 e C4 | rejeitada em UX-1 | E · Rejeitada | — |
| R-29 | Tornar o repositório privado | — | — | público por decisão do proprietário | — | — | — | — | — | rejeitada | E · Rejeitada | — |
## 3. Gates Cada gate só libera a passagem para o seguinte. Nenhum autoriza implementar.
| Gate | O que verifica | Evidência exigida | Responsável |
| G1 · Produto | o problema é real e a solução é desejada | C2 e C3 cumpridos; decisão registrada | proprietário |
| G2 · UX/UI | fluxos, estados, mobile e idiomas completos | wireframe aprovado; C7 e C8 | design |
| G3 · Técnica | cabe na arquitetura, sem tabela nem endpoint inventado | arquivos e linhas; C4, C5 e C9 | engenharia |
| G4 · Integridade | nenhuma regressão de dado: NULL, denominador, versão | cálculo reproduzido nas partidas de referência; C1 e C6 | engenharia + proprietário |
| G5 · Autorização | permissão explícita para implementar aquele item | mensagem do proprietário | proprietário |
## 4. Matriz revisada (rodada 2, 2026-11-23) Agora são 39 recomendações: as 29 da rodada 1 e 10 novas. A distribuição é 17 A, 12 B, 2 C, 4 D e 4 E. "Aprovado conceitualmente" registra só a decisão de direção tomada pelo proprietário. Nenhum item está autorizado para implementação, nem os classificados como A. A matriz da rodada 1 fica acima, sem alteração, como histórico.
| ID | Recomendação | Classificação (rodada 2) | Aprovado conceitualmente | Ainda depende de validação | Mudança desde a rodada 1 |
| R-01 | Catálogo canônico por soma (metrics-catalog-v2, proposta) | B · Aprovada com condições | sim: valor único e fonte canônica | V-1 a V-4 (Doc. 3, 5.1); tabela de impacto por jogador (L-3) | direção aprovada; protocolo de mudança (Doc. 3, 5.4) |
| R-02 | Coach lê só o agregado canônico | B · Aprovada com condições | sim | R-01 | — |
| R-03 | Separar ADR, índice de dano, Score e dimensão de dano | A · Aprovada | sim | — | ampliado para as 4 grandezas (Doc. 3, 5.3) |
| R-04 | Clutch sem multi-kill no DNA | B · Aprovada com condições | sim | especificação do DNA v3 | decisão tomada |
| R-05 | HS do DNA ponderado por kills | B · Aprovada com condições | sim | DNA v3 | decisão tomada |
| R-06 | Rota /matches/$matchId | B · Aprovada com condições | sim (Sala) | gate técnico dos redirecionamentos | reaproveitamento detalhado (Doc. 2, seção 11) |
| R-07 | "Seu lado venceu X de Y" | B · Aprovada com condições | sim, só com dado comprovado | L-1, L-2; 6 condições (Doc. 2, 12.2) | correção D-10b: dupla confirmação não é universal |
| R-08 | 5 áreas | A · Aprovada | sim | — | — |
| R-09 | Tabelas com rolagem e cartões | A · Aprovada | sim (mobile em paralelo) | — | critérios M-1 e M-6 |
| R-10 | Componentes de estado | A · Aprovada | sim | — | — |
| R-11 | Coach com contexto da tela | B · Aprovada com condições | não decidido | gate técnico e de segurança | — |
| R-12 | Coach em qualquer largura | A · Aprovada | sim | — | critério M-10 |
| R-13 | Lista única de treino | B · Aprovada com condições | sim | regras por categoria (Doc. 4, seção 5); ρ e variância reais (L-5) | sem intervalo universal |
| R-14 | Radar aprimorado (alternativa A) | A · Aprovada | sim, direção preferida | — | composição atualizada (Doc. 5) |
| R-15 | Traço por confiança (alternativa B) | C · Experimento | não | teste com jogadores | — |
| R-16 | Comparação com o snapshot anterior (alternativa C) | C · Experimento | não | mesma dna_version | de D para C: o histórico existe (D-31) |
| R-17 | Economia fora da lista de não suportados | A · Aprovada | sim | — | — |
| R-18 | Textos sobre posições | D · Investigação pendente | não (L02 em aberto) | Q-03; L-2 | a correção deve depender do tipo de partida (Doc. 2, 12.1) |
| R-19 | Upload sem "Não tenho uma demo" | A · Aprovada | sim | — | — |
| R-20 | Menu com Esc e foco | A · Aprovada | sim | — | critério M-4 |
| R-21 | Tokens CT/T | A · Aprovada | sim | — | — |
| R-22 | Mortes agrupadas e paginadas | A · Aprovada | sim | — | critério M-2 |
| R-23 | Renomear Posicionamento | A · Aprovada | sim | — | — |
| R-24 | Fonte da data | A · Aprovada | sim | — | — |
| R-25 | E-mails de teste | B · Aprovada com condições | — | confirmar se são reais (Q-15) | — |
| R-26 | Radar trocado por barras | E · Rejeitada | rejeitada | — | confirmada pelo proprietário |
| R-27 | Matriz nominal 5×5 | E · Rejeitada | rejeitada | — | — |
| R-28 | Calibração populacional | E · Rejeitada | rejeitada | — | — |
| R-29 | Repositório privado | E · Rejeitada | rejeitada | — | — |
| R-30 | Nova. Fechar o numerador de ADR e HS (dano e kills em aliados; dmg_health) | D · Investigação pendente | direção sim | V-1, V-2, V-4; L-4 | achados D-24, D-25 |
| R-31 | Nova. Um ADR só entre pipeline, roundContext e Rounds | B · Aprovada com condições | sim (valor único) | R-30; V-3 | achado D-23 |
| R-32 | Nova. Rótulos de jogador estáveis em toda a partida | A · Aprovada | sim (anonimato aprovado) | — | achado D-33 |
| R-33 | Nova. Controles ≥ 24 px e ações principais ≥ 44 px | A · Aprovada | sim | — | critério M-5 |
| R-34 | Nova. Campo do Coach acima da barra inferior | A · Aprovada | sim | — | critério M-10 |
| R-35 | Nova. Tirar sinais repetidos entre dimensões no DNA v3 | D · Investigação pendente | — | igualdade de opening_* | achado D-30 |
| R-36 | Nova. Economia como "não medido" no radar | A · Aprovada | sim | — | achado D-29 |
| R-37 | Nova. Rating agregado: recalcular dos componentes ou só por partida | D · Investigação pendente | — | decisão Q-21 | Doc. 3, 5.1 |
| R-38 | Nova. Intervalos calculados por partida no Treino | B · Aprovada com condições | sim (critério de confiança) | L-5 | Doc. 4, 5.1 |
| R-39 | Nova. Redação proposta para L04 e para o comentário de roundContext | B · Aprovada com condições | — | decisão do proprietário (Q-16) | Doc. 2, 12.2 |