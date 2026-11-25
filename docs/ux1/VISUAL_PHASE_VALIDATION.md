# Fase UI/UX Visual — validação em produção (2026-11-25)

Escopo exclusivo: conclusão visual de Início, Treino, Raio-X e Coach com o sistema de #376. Nenhuma métrica, cálculo,
dado, contrato, integração, autenticação, banco ou parser mudou.

## PRs

| PR   | Área                                                                                                       | Merge      |
| ---- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| #389 | Início + extensões aditivas (`icon` em `ChartCard`/`MetricCard`; `alert` e `trend` no `GameIcon`)          | `49c59fae` |
| #390 | Treino                                                                                                     | `e5586111` |
| #391 | Raio-X                                                                                                     | `eb3429fc` |
| #392 | Coach                                                                                                      | `09bad919` |
| #393 | Correções achadas na inspeção em produção (barra do índice DNA; densidade do cabeçalho do Coach no mobile) | `3ff7bf69` |

Publicação das quatro áreas: deploy Lovable `6e21ab6d` de `09bad919`, bundle `index-Cx-6o5qv` em `gamepro.network`
(marcadores `data-card-icon` e `data-limited-note` conferidos no DOM). Correções do #393: deploy `ac6cde83` de
`3ff7bf69`, bundle `index-BGY-bdOx`. Conferido em produção:

- 8/8 barras do índice DNA decorativas, sem rótulo visível;
- lados "CT 60 ROUNDS" e "T 45 ROUNDS" sem repetição;
- cabeçalho do Coach a 390 px com a densidade anterior.

## Inspeção visual (desktop, Chrome autenticado, conta de teste)

- **Início:**
  - ícones nos 5 KPIs e nos painéis;
  - selo de atenção "Partidas limitadas 7/7";
  - selos `LIMITADO` com ícone;
  - envios com tom (processada → marca; retida pela auditoria → atenção).
- **Treino:**
  - prioridades numeradas com régua lima, selo da dimensão e medidor de referência;
  - "Em observação" com o estado "Calculado pelo CS2 PRO" e medidor em cada sinal medido;
  - plano com selo "ativo".
- **Raio-X:**
  - camadas 01 Observado → 02 Inferência → 03 Recomendação;
  - ícone por dimensão;
  - selos "Sem amostra" e "Não medido nesta versão";
  - CT/T com `SideBadge`;
  - recomendações com régua lima.
  - **Achado:** o rótulo do `ProgressBar` sobrepunha o número do índice DNA. Corrigido no #393 e conferido em produção.
- **Coach:** painel do Coach com régua lima, rótulo e hora; bolha compacta do jogador; títulos, marcadores e código no padrão.
- **Player DNA e Sala:** inalterados por esta fase e coerentes com o restante (KPIs, faixa de rounds com CT/T, mapa).

## Regressão nas larguras do projeto (360/390/430/768/1024/1440 px)

Protocolo do §2.9: iframes de largura exata, mesma origem, medições só de DOM.

**Telas:** Início, Player DNA, Partidas, Treino, Raio-X, Coach e as 7 abas da Sala, numa partida da conta de teste.

**Antes:** produção anterior, a mesma auditoria. **Depois:** bundle `index-Cx-6o5qv`.

| Tela          | Transbordo | Texto < 12 px | Selos antigos (antes → depois) | Ícones de painel | `ToneBadge` (antes → depois) |
| ------------- | ---------- | ------------- | ------------------------------ | ---------------- | ---------------------------- |
| Início        | nenhum     | 0             | 5 → 0                          | 0 → 4            | 0 → 15                       |
| Player DNA    | nenhum     | 0             | 0 → 0                          | —                | 0 → 0                        |
| Partidas      | nenhum     | 0             | 7 → 0                          | —                | 0 → 8                        |
| Treino        | nenhum     | 0             | 0 → 0                          | 0 → 1            | 0 → 24                       |
| Raio-X        | nenhum     | 0             | 0 → 0                          | 0 → 8            | 0 → 5                        |
| Coach         | nenhum     | 0             | 0 → 0                          | —                | —                            |
| Sala (7 abas) | nenhum     | 0             | 0 → 0                          | —                | iguais (resumo 2, rounds 27) |

- Em nenhuma largura há elemento além da largura da tela.
- O texto das 7 abas da Sala tem o mesmo tamanho antes e depois.

**Mobile, a 390 px** (iframe visível, capturado):

- navegação inferior intacta;
- KPIs em coluna;
- prioridade do Treino com medidor;
- lados CT/T do Raio-X;
- composição do Coach acima da navegação inferior.

A estrutura responsiva não mudou.

## Estados

| Estado                    | Onde foi visto                      | Comportamento                     |
| ------------------------- | ----------------------------------- | --------------------------------- |
| Carregando                | Raio-X                              | Estado compartilhado inalterado   |
| Parcial                   | ADR parcial no Início e no Raio-X   | Selo e aviso de atenção com ícone |
| Insuficiente              | "Sem amostra" no Raio-X             | Selo neutro tracejado             |
| Indisponível / não medido | "Não medido nesta versão" no Raio-X | Selo neutro tracejado             |
| Derivado                  | "Calculado pelo CS2 PRO" no Treino  | Selo de contexto                  |

**Vazio e erro.** Não são reproduzíveis na conta de teste sem alterar dados. Os componentes compartilhados (`EmptyState` e `ErrorState`) não mudaram nesta fase. Os testes cobrem:

- o selo "amostra insuficiente" sem valor;
- a ausência sem barra;
- o texto puro do Coach.

## Testes

| Arquivo                                                                             | Testes |
| ----------------------------------------------------------------------------------- | ------ |
| `visualInicio.test.tsx`                                                             | 4      |
| `visualTreino.test.tsx`                                                             | 3      |
| `visualCoach.test.tsx`                                                              | 2      |
| `phase2DataXray.test.tsx` (camadas, ícones, barra igual ao texto, barra decorativa) | —      |

- A asserção do selo limitado em `uxPhase1.test.tsx` agora prova o caminho completo até `text-warning`.
- Os testes existentes de Treino (46) e Coach (106) passam.
- "Main required gates" verde em cada PR.
