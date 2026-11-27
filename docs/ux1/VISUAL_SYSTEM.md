# CS2 PRO — sistema visual (fase UI/UX visual)

Autorizado pelo dono em 2026-11-25 ("aplicar o visual no projeto todo, fazer a migração em produção").
Referência visual: canvas "CS2 PRO — Fase UI/UX Visual: protótipos" (quadro Sistema visual).
Nada aqui altera métricas, contratos, metodologia, anonimização ou navegação.

## Paleta semântica (`src/styles.css`)

| Papel                   | Token                                       | Valor                  | Uso                                             |
| ----------------------- | ------------------------------------------- | ---------------------- | ----------------------------------------------- |
| Marca / dado do jogador | `--primary` (`brand`)                       | `oklch(0.90 0.19 131)` | radar DNA, valor principal, foco, ação primária |
| Contexto                | `--context` (= `accent`, `info`, `chart-2`) | `oklch(0.78 0.11 195)` | informação secundária e técnica                 |
| Atenção                 | `--warning` (`attention`)                   | `oklch(0.75 0.16 52)`  | alerta, amostra parcial; sempre com ícone       |
| Crítico                 | `--destructive` (`critical`)                | `oklch(0.65 0.19 25)`  | erro, falha; uso raro                           |
| Lado CT                 | `--side-ct`                                 | `oklch(0.71 0.14 245)` | sempre com o rótulo "CT"                        |
| Lado T                  | `--side-t`                                  | `oklch(0.83 0.14 92)`  | sempre com o rótulo "T"                         |
| Utilidade               | `--category-utility` (= `chart-4`)          | `oklch(0.72 0.14 295)` | só a categoria granadas                         |
| Neutro                  | `--neutral`                                 | `oklch(0.45 0.02 252)` | sem amostra / não medido; nunca zero            |

Mudanças de valor e motivo:

- T passou de âmbar (matiz 70) a dourado (92): o âmbar colidia com o alerta.
- O alerta passou de amarelo (85) a laranja (52), afastado do T.
- CT foi de 237 para 245 e o contexto para 195: antes CT (237) e info (235) eram a mesma cor.
- O roxo só aparece em Utilidade.

`src/lib/__tests__/visualTokens.test.ts` mede tudo isso:

- contraste WCAG ≥ 4,5:1 de cada cor de papel sobre `card` e `elevated`;
- preenchimento contra o texto dele;
- distância de matiz entre T e atenção, CT e contexto, lima e sucesso;
- os dois raios.

## Superfícies, profundidade, forma, tipografia

- **Superfícies:** `background` 0.16, `card` 0.205, `elevated` 0.25; `--border-strong` para controles elevados.
- **Sombras:** `--shadow-card` (painel) e `--shadow-elevated` (`surface-elevated`).
- **Raios:** 8 px nos controles (`sm` e `md`) e 12 px nos painéis (`lg` e `xl`), via `@theme`, sem tocar nas classes.
- **Tipografia:** menor texto 12 px. Os 153 usos de 9, 10 e 11 px viraram `text-xs`; os 5 `amber-*` viraram `warning`.

## Componentes compartilhados

| Componente                                                                                     | Arquivo                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GameIcon` (mira, armas por categoria, granada, mapa, rounds, tempo, escudo, bomba, DNA, alvo) | `components/common/GameIcon.tsx`                                                                                                                                               |
| `ToneBadge`, `SideBadge` (CT escudo, T bomba), `MapBadge` (sigla + nome, sem arte oficial)     | `components/common/VisualBadges.tsx`                                                                                                                                           |
| `DataStateBadge` (8 status → tom; sem valor = neutro tracejado)                                | `components/common/DataState.tsx`                                                                                                                                              |
| `ChartCard` (painel) e `MetricCard` (KPI)                                                      | restilizados: cabeçalho elevado, régua lima no KPI, borda tracejada quando ausente; `icon` opcional (ícone de jogo decorativo; no KPI fica neutro quando o valor está ausente) |

**Aplicado em:**

- Sala da Partida: cabeçalho com mapa e rounds; legenda CT/T na faixa.
- Rounds: lado, abertura, clutch e OT como badges.
- Partidas: mapa na lista.
- Evolução: mapa por partida.
- Utilidade: ícone roxo.
- Radar DNA: fundo e brilho lima.
- Navegação: item ativo com régua lima.

**Conclusão da fase (2026-11-25, #389–#392):**

- **Início (#389):**
  - ícones nos 5 KPIs e nos painéis;
  - admissão (limitado → atenção + ícone; certificado → contexto) e status de envio (falha → crítico; bloqueado → atenção; processado → marca) como `ToneBadge`;
  - aviso de partidas limitadas como selo de atenção.
- **Treino (#390):**
  - prioridades com posição numerada e régua lima;
  - medidor de referência decorativo posicionado com os mesmos números do texto;
  - estados "amostra insuficiente" e "derivado" com as palavras de estado do dado;
  - plano e sessões com tom;
  - catálogo com semanas numeradas.
- **Raio-X (#391):**
  - camadas numeradas (observado → inferência → recomendação);
  - ícone por dimensão;
  - índice DNA em barra com o mesmo número do texto;
  - estados sem valor como selo neutro tracejado ou de atenção;
  - CT/T com `SideBadge`.
- **Coach (#392):**
  - mensagem do Coach em painel com régua lima e coluna de leitura;
  - mensagem do jogador em bolha compacta;
  - Markdown leve com títulos, marcadores, tabelas e código no padrão, ainda só texto.
- **Ícones novos no `GameIcon`:** `alert` (o alerta nunca depende só da cor) e `trend`.

## Visual Game Language (2026-11-26)

Elementos de jogo próprios (`GameIcon` +13, `WeaponLabel`, `GrenadeLabel`, `MapTile`, `MapPoolCard`),
sempre ao lado de um dado real e com texto. Detalhes, decisões de assets e validação em
`docs/ux1/VISUAL_GAME_LANGUAGE.md`. Gráficos: texto de eixo e legenda com 12 px no mínimo.

## Fora do escopo

- Ranks, medalhas e comparações com outros jogadores.
- Arte oficial de mapa ou arma.
- Mudança de dados ou de métricas.
