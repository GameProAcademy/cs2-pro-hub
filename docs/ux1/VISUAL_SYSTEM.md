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

| Componente                                                                                     | Arquivo                                                                            |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GameIcon` (mira, armas por categoria, granada, mapa, rounds, tempo, escudo, bomba, DNA, alvo) | `components/common/GameIcon.tsx`                                                   |
| `ToneBadge`, `SideBadge` (CT escudo, T bomba), `MapBadge` (sigla + nome, sem arte oficial)     | `components/common/VisualBadges.tsx`                                               |
| `DataStateBadge` (8 status → tom; sem valor = neutro tracejado)                                | `components/common/DataState.tsx`                                                  |
| `ChartCard` (painel) e `MetricCard` (KPI)                                                      | restilizados: cabeçalho elevado, régua lima no KPI, borda tracejada quando ausente |

**Aplicado em:**

- Sala da Partida: cabeçalho com mapa e rounds; legenda CT/T na faixa.
- Rounds: lado, abertura, clutch e OT como badges.
- Partidas: mapa na lista.
- Evolução: mapa por partida.
- Utilidade: ícone roxo.
- Radar DNA: fundo e brilho lima.
- Navegação: item ativo com régua lima.

## Fora do escopo

- Ranks, medalhas e comparações com outros jogadores.
- Arte oficial de mapa ou arma.
- Mudança de dados ou de métricas.
