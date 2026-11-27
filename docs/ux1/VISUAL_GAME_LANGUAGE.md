# CS2 PRO — Visual Game Language (2026-11-26)

Autorização do dono: "PROMPT MESTRE — Visual Game Language", com auditar, implementar, mergear e publicar.
Base: `CS2_PRO_Relatorio_Especificacao_Visual_e_Matriz_Rastreabilidade.md` e
`CS2_PRO_AI_Relatorio_UI_UX_Evolucao_Visual.md`. A implementação atual (`main` `57a9a8f8`) foi a fonte
da verdade.

**Escopo:** só apresentação. Nada mudou em parser, métricas, fórmulas, banco, Storage, RLS,
autenticação, integrações, identificação, nem em provider, modelo, prompts, contexto, memória ou
streaming do Coach. O diff da missão não toca nenhum arquivo `*.functions.ts`, `*.server.ts`,
`supabase/`, `scripts/`, nem `src/lib/{pipeline,metrics,combat,utility,dna,faceit,sources,spatial}`.

## Elementos de jogo (`components/common`)

| Elemento         | O que é                                                                                                               | Regra de dado                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GameIcon` (+13) | Pictogramas próprios: heavy, knife, flash, smoke, fire, decoy, kill, headshot, assist, trade, opening, clutch, defuse | Decorativos (`aria-hidden`); o texto sempre acompanha                                                                  |
| `WeaponLabel`    | Pictograma da classe + nome da arma                                                                                   | Classe vem do `weaponClass` existente; nomes ambíguos do parser (`m4a1`, `hkp2000`) ficam como vieram; sem arma → nada |
| `GrenadeLabel`   | Pictograma do tipo em roxo de utilidade + `nade.grenade.*`                                                            | Só para tipos reais de granada                                                                                         |
| `MapTile`        | Tile tático original (grade, cantos, sigla)                                                                           | Só para mapa real; mapa desconhecido → nada                                                                            |
| `MapPoolCard`    | "Seus mapas": tile + nº de partidas por mapa                                                                          | Contagem das partidas já listadas; sem mapa identificado fica numa nota à parte                                        |

## Assets

- **Ícones de mapa:** `MurkyYT/cs2-map-icons` não declara licença e diz que as imagens são da Valve.
  Não foi usado: os tiles são desenho próprio.
- **Radares oficiais:** os de `public/radars/cs2` (Valve, uso provisório aprovado em 2026-11-12) continuam
  só no heatmap. Usá-los como miniaturas depende de decisão do dono.
- **Assets externos:** nenhum asset externo, URL em tempo de execução ou dependência nova.

## Por tela

| Rota                     | Mudança                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`             | Tabela de partidas nova (abaixo) e card "Seus mapas"                                                                                                                                               |
| `/matches`               | `MapTile` por partida; resultado como selo com palavra (vitória lima, derrota crítica como na tabela de demonstração, empate contexto); placar em mono; resultado desconhecido mantém a explicação |
| `/matches/$matchId`      | `MapTile` grande; resultado resolvido como selo; ícone por aba; ícones nos 4 KPIs; divisor "troca de lado" na faixa de rounds, só entre dois rounds consecutivos com lados registrados diferentes  |
| Duelos                   | Pictograma por classe de arma; `WeaponLabel` nas armas reais                                                                                                                                       |
| Utilidade                | Ícones de granada nas seções; `GrenadeLabel` em cada tipo                                                                                                                                          |
| `/moments`               | Ícone por tipo de momento (utilidade em roxo); `MapTile` quando há mapa                                                                                                                            |
| `/evolution`             | `MapTile` com nome por partida                                                                                                                                                                     |
| `/maps`                  | Card do heatmap com ícone e tile do mapa selecionado; filtros iguais                                                                                                                               |
| `/performance`           | Barra segmentada decorativa da coluna "Pontos", só com score READY, só componentes disponíveis, sem redistribuição                                                                                 |
| `/player-dna`            | Ícone por dimensão (10)                                                                                                                                                                            |
| `/coach`                 | Detalhes na seção abaixo                                                                                                                                                                           |
| `/goals`                 | Ilustração própria no estado vazio, ícone por meta, status como selo; nenhuma fração de progresso calculada na interface                                                                           |
| `/profile`               | Ícone da identidade; "Seus mapas" só quando há mapa identificado                                                                                                                                   |
| `/notifications`         | Ícone por categoria real (falha de demo em atenção); oculto no celular                                                                                                                             |
| Gráficos                 | Eixos, legendas e tooltips de 10–11 px para 12 px (mínimo documentado)                                                                                                                             |
| `/analysis`, `/training` | Auditados: já tinham a linguagem da fase #389–#393; preservados                                                                                                                                    |
| `/upload`                | Preservado como aprovado (#397–#404)                                                                                                                                                               |
| `/admin/*` (9)           | Auditados no código: `PageHeader` e tokens, sem cores livres; preservados                                                                                                                          |

## AI Coach (apresentação)

- **Seções:** quando a resposta traz títulos de dados, interpretação, próxima ação, pontos fortes ou o
  que melhorar (5 idiomas), cada seção vira um painel tático com ícone e tom próprios
  (`lib/coach/coachSections.ts`, puro). Títulos não reconhecidos ficam como antes.
- **Texto preservado:** o texto continua idêntico em palavras e ordem (teste) e só em nós de texto.
- **Números:** em mono.
- **Identidade:** mira tática no avatar e no cabeçalho, alvo no estado vazio, perguntas sugeridas como
  chips de 44 px, indicador "pensando" com `prefers-reduced-motion`.
- **Motor intacto:** `sendCoachMessage`, `coach-context-v1`, provider e modelo inalterados.

## Validação

- **Testes:** `GameVisuals.test.tsx`, `vglMatches`, `vglAnalysis`, `vglCoach` (25), `vglGoals`,
  `vglAccount`, mais toda a suíte existente: 3.187 passaram. A única falha é o teste de integração que
  exige um Postgres descartável, ausente no ambiente local.
- **Upload:** a proteção do upload (`uploadProtectedFlows`) seguiu verde.
- **Produção:** smoke `VGL smoke E2E`, 14 rotas × 7 larguras.
  - Execução `45920147853` (antes da correção dos gráficos): 0 overflow em todas, 0 texto < 12 px em 12
    das 14 rotas; `/performance` e `/evolution` falhavam só nos ticks dos gráficos, corrigidos neste
    PR.
  - 10/10 partidas com tile, 7/7 abas da Sala com ícone e sem problemas, 0 erros de página.
