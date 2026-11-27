# VGL 2.0 — continuação formal e aprofundamento visual (2026-11-27)

Continua a VGL 2.0 (#413 e #414) sem reiniciar nem reverter nada. A fundação (pacote `public/cs2/`,
`Cs2Art`, `MatchVisuals`, motion) foi reaproveitada. Só apresentação: o motor ficou intacto.

## PRs

| PR   | Tela                                      | Commit de merge |
| ---- | ----------------------------------------- | --------------- |
| #415 | Player DNA                                | `57c642a7`      |
| #416 | Sala da Partida                           | `a419f789`      |
| #417 | AI Coach                                  | `12b92a2d`      |
| #418 | Performance e Evolução                    | `b03d81b5`      |
| #419 | Metas, Perfil e Notificações              | `41417bde`      |
| este | correções vistas em produção + fechamento | —               |

- Commit inicial (`main` antes da continuação): `fe9cd9d1` (#414).
- Publicado: deploy Lovable `2c9ead87` de `41417bde`. O PR de fechamento ganha deploy próprio (ver checkpoint).

## O que mudou por tela

| Tela            | Mudança                                                                                                                                   | Regra de integridade                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player DNA      | Assinatura técnica: 3 maiores e 2 menores índices medidos, barras de todas as dimensões ordenadas; tendência por dimensão entre snapshots | Não medida = tracejado com "—"; tendência só com snapshots da mesma versão do método e estado READY; com menos de 2, estado vazio; linha só entre pontos consecutivos medidos |
| Sala da Partida | Painel CT/T de rounds vencidos; rounds como cartões táticos (lado, resultado, K/D, ícones de evento, arma real); arma da morte na revisão | Contagem dos rounds existentes; lado desconhecido fica à parte; resultado nulo não vira derrota; nome de arma ambíguo não ganha arte                                          |
| AI Coach        | Resposta sem títulos lê bem: 1º parágrafo em destaque, números em mono, mapa com emblema, arma com arte, CT/TR com logo                   | O texto exibido é idêntico ao recebido (teste caractere a caractere); provider, modelo, prompts, contexto e streaming não foram tocados                                       |
| Performance     | Faixa das partidas lidas (emblema, data, resultado), painel HUD de eventos de combate, ícone por gráfico                                  | Mesmos totais de `performanceTotals`; null = "—"; resultado desconhecido = "—"                                                                                                |
| Evolução        | Painel "antes → agora"                                                                                                                    | Só para comparações que o relatório marca OK; seta neutra (indica direção, não "melhor"); sem comparação válida → estado vazio                                                |
| Metas           | Seções ativas/alcançadas, cartão com atual × alvo, conquistas como medalhas                                                               | Agrupamento pelo status do servidor; valor do servidor; nenhum progresso calculado no cliente                                                                                 |
| Perfil          | Herói de identidade competitiva                                                                                                           | Só dados salvos (sem e-mail, sem SteamID); "mapa mais jogado" só quando um mapa lidera sozinho; sem overview, sem contagem                                                    |
| Notificações    | Agrupadas por dia, não lidas com ponto e faixa, faixa de atenção em falhas, filtros em pílulas, pictograma também no celular              | Mesmos itens, mesma ordem, mesmas ações                                                                                                                                       |

Início, Partidas, Mapas, Raio-X e Treino: revisão de consistência; nada a mudar além do que a fundação já aplica.

### Mudança de expectativa da VGL 1

`vglAccount.test.ts` exigia o pictograma das notificações oculto no celular. A continuação pediu Notificações no
celular, então o pictograma passou a aparecer com tamanho fixo e as ações vão para uma linha própria. A
expectativa foi atualizada para o novo comportamento; não esconde regressão.

## Correções vistas em produção (PR de fechamento)

1. `public/cs2/weapons/flashbang.svg` não declarava o namespace SVG; como máscara CSS, não aparecia (quadrado vazio
   no HUD de Performance e no hero da última partida). Adicionado `xmlns` (o desenho não mudou). Novo teste
   `vgl2Assets.test.ts` exige o namespace em todos os SVG do pacote.
2. Notificações: o cabeçalho do dia usava UTC e a hora do item usava o fuso do leitor; um item das 22:21 aparecia
   sob o dia seguinte. O agrupamento passou a usar o mesmo fuso da hora exibida.

## Admin (9 rotas)

A conta de teste não é administradora: as 9 rotas (`/admin`, `/admin/users`, `/admin/catalog`, `/admin/audit`,
`/admin/pipeline`, `/admin/notifications`, `/admin/demo-e2e`, `/admin/memory-lab`, `/admin/r5-forensic`)
redirecionam para `/dashboard` em produção (verificado uma a uma). Nenhuma senha foi pedida nem usada.

Decisão: preservar. São telas operacionais e densas em dados, já com o cabeçalho tático e os tokens da VGL 1
(`vglAccount.test.ts` trava isso); trocar por arte de jogo não ajuda quem opera. **Pendente:** inspeção visual em
produção com uma sessão de administrador, feita pelo dono ou com ele logado no navegador.

## Validação

- Local: tsc, eslint e build OK. Vitest: 3222 testes passaram; 1 falha só de ambiente
  (`uploadLifecycleConcurrency.integration.test.ts` precisa de Postgres descartável, ausente aqui).
- Gates: "Main required gates" verde nos PRs #415–#419.
- Produção, VGL smoke `45959040337` (coach_send=1): 14 rotas × 7 larguras com 0 overflow e 0 texto < 12 px;
  7 abas da Sala sem falhas; 717 assets sem falha; 0 erro de página; Coach respondeu (0 seções, 12 números).
- Produção, upload smoke `45959042907`: passou; CTA nas mesmas posições (741/699/656/684/727/684/684), nenhuma escrita.
- Produção, Chrome (conta de teste): DNA (assinatura igual aos índices do radar; Economia e Clutch "—"; tendência
  com 8 snapshots, último = índice atual), Sala (CT 7/12 e T 6/7 = 19 rounds, conferido com a faixa), mortes com arma
  real, Coach com resposta real sem títulos (emblema da Mirage, logo CT, números em mono).
- Celular: largura de 390 px validada pelo smoke (overflow e texto) e por captura local; o navegador do dono não
  reduziu a janela, então não há captura de celular de produção.

## Evidências

Capturas antes/depois (produção, desktop) e capturas locais de 390 px e 1440 px foram entregues ao dono na
conversa da missão. Metas não tem objetivo cadastrado na conta de teste; os cartões aparecem só na captura local.
