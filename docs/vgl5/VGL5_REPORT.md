# VGL 5.0 — Competitive Intelligence, Player Identity & Experience Evolution

Missão aberta em 2026-11-28 pelo Prompt Mestre VGL 5.0 (anexo do dono). Este arquivo é o relatório vivo da missão: baseline, decisões, fórmulas, PRs, deploys e limitações. Checkpoint operacional: `docs/checkpoints/VGL5_CHECKPOINT.md`.

## Fase 0 — Baseline (2026-11-28)

| Item               | Estado verificado                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `main`             | `6461ce65` (merge do #435, correções de UI de outra sessão)                                                 |
| PRs abertos        | Nenhum da linha VGL/UX; #403 (docs FACEIT) e PRs antigos de H.3-E fora de escopo                            |
| Checkpoint central | Desatualizado (aponta `d8ab7445`/UX-1.0); será reconciliado no fechamento desta missão                      |
| Parser             | Protegido: nenhuma frente toca `services/`, contratos, worker ou attestation                                |
| Score              | `pro-score-v1` (`src/lib/proScore.ts`): pesos, sinais, mínimos (3 partidas, 75 %) intocados                 |
| Coach              | OpenRouter `openai/gpt-oss-20b` sem fallback; só a interface muda (Frente 6)                                |
| i18n               | Dicionários por locale com namespaces (`src/i18n/locales/<ns>/<locale>.ts`); VGL 5.0 usa o namespace `vgl5` |

Mapa por frente (arquivos principais):

| Frente                 | Onde está hoje                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Melhor Mapa          | Overview (`src/lib/playerOverview.ts`), agregação canônica (`src/lib/metrics/canonicalAggregate.ts`), pool de mapas versionado (`src/lib/cs2/maps.ts`), Início (`dashboard.tsx`), Mapas (`RealHeatmap.tsx`, `cs2/MapIdentity.tsx`) |
| 2 Palavra do Treinador | Novo módulo determinístico (sem IA)                                                                                                                                                                                                |
| 3 Perfil público       | `profile.tsx`, `player_profiles` (RLS por dono)                                                                                                                                                                                    |
| 4 Score                | `real/RealProScore.tsx`, `performance.tsx`                                                                                                                                                                                         |
| 5 Menu                 | `layout/AppShell` / sidebar                                                                                                                                                                                                        |
| 6 Coach                | `coach.tsx`, `components/coach/*`                                                                                                                                                                                                  |
| 7 Treino               | `training.tsx`, `components/training/*`, catálogo (`catalog`)                                                                                                                                                                      |
| 8 FACEIT               | `src/lib/faceit/*`                                                                                                                                                                                                                 |
| 9 Player DNA           | `player-dna.tsx`, `real/RealDna.tsx`                                                                                                                                                                                               |
| 10 Dashboard           | `dashboard.tsx`                                                                                                                                                                                                                    |

## Frente 1 — Melhor Mapa (`map-rank-v1`)

Implementação: `src/lib/maps/mapRanking.ts` (pura, determinística), testes em `src/lib/maps/__tests__/mapRanking.test.ts`.

**Partida elegível:**

- o mapa pertence ao pool Active Duty atual (v6: Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke);
- o jogador jogou pelo menos 10 rounds (uma partida lida em parte ou abandonada cedo não conta como encerrada);
- a partida tem rating.

Entram as partidas do overview, que é construído só a partir de demos analisadas (`loadPlayerOverview` parte de `demo_jobs`). Partidas nativas da FACEIT não entram (ver Frente 8).

**Sinais e pesos.** Os sinais são agregados pela regra canônica (`metrics-catalog-v2.1`), com peso de recência de meia-vida de 120 dias, contada a partir da partida mais nova (o resultado não depende do relógio).

| Sinal                                   | Peso |
| --------------------------------------- | ---- |
| Rating                                  | 0,35 |
| ADR                                     | 0,20 |
| KAST                                    | 0,20 |
| K/D                                     | 0,15 |
| Taxa de vitória (suavizada por Laplace) | 0,10 |

- HS% é exibido, mas não classifica: descreve estilo, não produção.
- Um sinal ausente sai da conta e seu peso é redistribuído. Com menos de 60 % do peso medido, o mapa não é classificado.
- Nada ausente vira zero.

**Desempenho no mapa.** Cada sinal é comparado com a média do próprio jogador:

- `rₛ = mapaₛ ÷ médiaₛ − 1`, limitado a ±1;
- `D = Σ wₛ·rₛ ÷ Σ wₛ`.

É uma comparação do jogador consigo mesmo, nunca com outros jogadores.

**Amostra pequena** (desempenho ≠ confiança):

- `estimativa = D · n ÷ (n + 3)`: encolhimento em direção à própria média;
- `posição = estimativa − ½ · s ÷ √n`: limite inferior, que penaliza mapas inconsistentes (`s` é o desvio dos compostos por partida; prior 0,25 com n < 2);
- com menos de 3 partidas o mapa não é classificado (aparece como "Amostra insuficiente"), então uma partida excepcional nunca coloca um mapa de 2 partidas acima de um consistente;
- confiança pela amostra: 3–4 provisória, 5–9 moderada, 10 ou mais alta.

**Classes**, sobre os k mapas classificados:

| Posição               | Classe                   |
| --------------------- | ------------------------ |
| 1                     | Seu melhor mapa          |
| 2                     | Seu segundo melhor mapa  |
| 3                     | Seu terceiro melhor mapa |
| Última (só com k ≥ 4) | Mapa a desenvolver       |
| Demais                | Mapa mediano             |

Fora da classificação: "Amostra insuficiente" (1–2 partidas) ou "Aguardando partidas" (nenhuma).

**Onde aparece.** Uma única classificação, calculada uma vez por overview em memória (sem consulta extra), alimenta:

- o card do Início, que antes era "Última partida": mesma cena, emblema e botão, agora com o melhor mapa, o desempenho em relação à média, a confiança e os fatos;
- o painel "Mapa selecionado" de `/maps`, que passa a apresentar o melhor mapa;
- os rótulos de classificação nos cards da galeria de mapas.

Início e Mapas usam a mesma função, então mostram o mesmo melhor mapa. A classificação é recalculada sempre que o overview muda (nova demo analisada).

PRs: #436 (Frente 1, merged em `0e27ec9a`).

## Frente 4 — CS2 PRO Score (#437)

Fórmula `pro-score-v1` intocada; só a apresentação mudou.

- `ScoreHero` (`src/components/score/ScoreHero.tsx`): número grande só no estado READY (`score.state === "READY" && score.score !== null`), medidor de 20 segmentos, chips de confiança, partidas e cobertura.
- Os três textos explicativos viraram tooltips (`InfoTip`, Radix Popover, acessível por teclado).
- "Como o seu Score é formado" virou um accordion fechado por padrão (`data-score-formation`), com a barra de contribuição e a tabela de componentes.
- Removido o parágrafo `real.proScoreContext.instead` de `/performance`.

## Frente 10 — Início (#437)

Ordem: cabeçalho e pendências → estado do overview → destaque (Score e DNA lado a lado, `data-home-headline`) → Palavra do Treinador → Melhor Mapa (substitui "Última partida") → atalhos, agregados, últimas partidas, pool de mapas, uploads.

## Frente 5 — Menu lateral (#438)

`activeSectionOf(pathname)` (`src/config/navigation.ts`) decide uma única seção ativa. O item ativo tem fundo, barra lateral, peso de fonte e `aria-current="page"`, então nunca depende só da cor. No mobile há uma barra de seção. Upload, Admin e Perfil também ficam destacados.

## Frente 6 — Coach (#438)

- Desktop (`lg`): barra lateral de conversas (`ConversationSidebar`) com excluir no hover ou no foco. A exclusão pede confirmação em dois passos.
- Mobile: o dropdown foi mantido.
- No chat flutuante, "Conversas" leva a `/coach?conversation=<uuid>`.
- Provedor, modelo, prompts e lógica do Coach não mudaram.

## Frente 7 — Treino (#439)

- Barras de prioridade com lacuna e legenda (`data-priority-bar`, `data-priority-gap`, `data-priority-legend`).
- Os dois textos pedidos foram removidos (nota de acesso e contexto).
- O plano recomenda só **cursos inteiros** (`coursesOnly: true`), com URLs reais de `hub.gamepro.academy`. A produção tem 23–24 cursos ativos por idioma, todos com tópicos.
- Sem rastreamento de progresso (regra Tutor LMS).

## Frente 9 — Player DNA (#440)

- No desktop, um card de foco fica ao lado do radar. A seleção pode ser por eixo, tag ou especialidade: os chips são botões com `aria-pressed`, e a dimensão em foco sai da lista abaixo.
- O texto "Índice CS2 PRO com referências fixas…" virou tooltip (`id="dna-legend"`).

## Frente 2 — Palavra do Treinador (`coach-word-v1`, #441)

Texto pré-escrito e determinístico, **sem IA**: `src/lib/coachWord/coachWord.ts`, 36 mensagens em 5 idiomas.

Mínimo global para falar: 3 partidas e 60 rounds. Limiares:

| Sinal                  | Regra                                                         |
| ---------------------- | ------------------------------------------------------------- |
| ADR                    | < 65 baixo, ≥ 85 alto                                         |
| KAST                   | < 65 baixo, ≥ 75 alto                                         |
| K/D                    | < 0,85 baixo, ≥ 1,15 alto                                     |
| Mira sem sobrevivência | HS ≥ 45 e ADR ≥ 80, com KAST < 68 ou DPR > 0,75               |
| Tendência              | ± 10 %, últimas 3 contra as 3 anteriores (exige ≥ 6 partidas) |
| Inconsistência         | CV > 0,35 com ≥ 5 partidas                                    |
| Mapa                   | ± 10 %                                                        |
| DNA                    | ≥ 65 ponto forte, < 40 ponto fraco                            |

Por partida (aba Resumo da sala), por ordem de prioridade:

- partida curta: < 10 rounds;
- dano: ADR ≥ 95;
- sobrevivência: DPR ≥ 0,8 com KAST < 60;
- partida difícil: K/D < 0,7 com ADR < 60;
- derrota boa: K/D ≥ 1,2;
- vitória sólida: KAST ≥ 75.

Onde aparece: Início, Raio-X, DNA, Performance, Evolução, Mapas (oculto dentro da sala), Treino, Metas e o Resumo da partida.

O botão "Falar com o Treinador" abre o chat flutuante da página atual com um rascunho (`cs2pro:open-coach`), então o contexto de tela existente vai junto e os prompts não mudam.

## Frente 3 — Perfil público (#442)

- **Migration** `20261128120000_vgl5_public_profile.sql`:
  - `public_id` no formato `XXXXX-XXXXX`, com alfabeto de 32 símbolos sem 0/O/1/I (~50 bits), gerado de `gen_random_uuid()` com laço de colisão, índice único e CHECK;
  - `public_profile boolean NOT NULL DEFAULT false`.
- **Trigger:** um insert vindo do cliente sempre recebe um ID novo e fica privado; mudar o ID pelo cliente levanta `PUBLIC_ID_IMMUTABLE`.
- **RLS** inalterada, sem policy nova para `anon`.
- **Dry-run** em produção: 4 IDs válidos e distintos, todos privados, com rollback.
- **Leitura pública:** `getPublicProfile` usa a service role só dentro do handler. Seleciona colunas em whitelist e exige `public_profile = true`. Perfil privado e ID inexistente recebem a mesma resposta `NOT_FOUND`, então não há oráculo de enumeração.
- **Nunca expostos:** e-mail, auth, IDs internos, demos, nome de arquivo, histórico do Coach.
- **Números:** os mesmos loaders e as mesmas funções puras das páginas do dono.
- **Página `/p/$publicId`** (`noindex`): identidade, Score, melhor mapa, DNA, números e últimas 5 partidas.
- **Comparação `?vs=`:**
  - mesmas métricas e escalas para os dois lados;
  - ninguém fica "à frente" com menos de 3 partidas ou sem o dado dos dois lados;
  - HS% aparece só como contexto;
  - estados cobertos: ID inválido, inexistente/privado e dados insuficientes.
- **Perfil do dono:** card com switch (desligado por padrão), ID, copiar link e abrir.

## Frente 8 — FACEIT nativo (#443)

**Auditoria em produção (2026-11-28):**

- O adapter nativo já existia: sync → motor canônico → `data_source='faceit'`. Ele cobre sync incremental com janela sobreposta, orçamento de chamadas, backoff, recuperação de jobs travados e dedup pelo Match Identity Resolver.
- Há 4 jobs `completed`, todos com `matches_found = 0`, e `lifetime = null`. A conta conectada não tem histórico CS2 no FACEIT.
- Há 0 partidas `faceit` e 0 `match_sources` FACEIT.

**Defeito latente corrigido.** Quando o resolver ligava uma observação FACEIT a uma partida de demo, o worker sobrescrevia `source_*` e `match_metrics` da demo. Agora só linhas `data_source='faceit'` são gravadas (`faceitWritableMatchIds`, com `.eq("data_source","faceit")` como segunda trava). Uma ligação a uma demo vira só vínculo e é contada em `linked_to_demo`.

**Superfície nova.** O card "Partidas FACEIT" no Perfil fica rotulado como dado do FACEIT e separado do Score, do DNA e dos agregados, que continuam só de demos.

**Parser não tocado.**

**Pendente:** a validação end-to-end exige uma conta FACEIT com partidas de CS2.

## Relatório final (2026-11-28)

### A. Resumo

As 10 frentes estão implementadas, integradas em `main` (`ab1cb961`), publicadas (deploy Lovable `a28754af`, bundle `index-BYzvy3f2`) e validadas em produção, com as ressalvas de G.

### B. PRs

| PR   | Frente(s) |
| ---- | --------- |
| #436 | 1         |
| #437 | 4 e 10    |
| #438 | 5 e 6     |
| #439 | 7         |
| #440 | 9         |
| #441 | 2         |
| #442 | 3         |
| #443 | 8         |

Todos tiveram CI verde no head antes do merge. Nenhum PR vermelho foi integrado.

### C. Banco

Uma migration: `20261128120000_vgl5_public_profile`.

- **Dry-run em produção** (com rollback): 4 IDs válidos e distintos, 0 públicos.
- **Aplicação** a partir de `764ca825`, registrada em `schema_migrations` (`direct-lovable-cloud-apply`, `direct-main-764ca825-20261128120000`).
- **Verificação pós-aplicação**, em transação com rollback e papel `authenticated`:
  - o dono não consegue mudar o `public_id`;
  - o dono consegue alternar `public_profile`.
- RLS inalterada.

### D. Segurança e privacidade

- **Perfil público:**
  - privado por padrão em todas as camadas: default no banco, trigger e servidor;
  - perfil privado e ID inexistente têm resposta e tela idênticas, confirmadas em produção;
  - IDs aleatórios de ~50 bits, sem sequência;
  - whitelist de campos, sem e-mail, auth, IDs internos, demos ou Coach.
- **Segredos:** nenhum no frontend, em commits, logs ou relatórios. A service role é importada só dentro de handlers.
- **FACEIT:** corrigido um defeito latente. A FACEIT poderia sobrescrever métricas de demo ao convergir para uma partida de demo.

### E. O que não mudou

- Parser, worker, contratos, RAW e attestation.
- Fórmula do CS2 PRO Score.
- Provedor, modelo, prompts e lógica do Coach.
- Fluxo `/upload`.
- Railway.
- Nenhuma mensagem foi enviada ao agente do Lovable.

### F. Validação

- **Testes locais:** suíte completa verde, com uma exceção pré-existente: `uploadLifecycleConcurrency` precisa de `initdb`, que não existe neste ambiente.
- **Testes novos:** cobrem Melhor Mapa, Palavra do Treinador, Score, navegação e Coach, Treino, DNA, perfil público (12) e FACEIT (7).
- **Produção:** ver `docs/checkpoints/VGL5_CHECKPOINT.md`. As 10 frentes foram observadas no app publicado com sessão real.

### G. Limitações e pendências

1. O perfil público **ligado** não foi exibido em produção. Ligar exige a ação do dono, pelo switch em Perfil; tornar público um perfil real direto pelo banco não foi feito.
2. A importação FACEIT ponta a ponta continua sem prova: a conta conectada não tem partidas de CS2 no FACEIT.
3. O mapeamento prioridade → curso recomendou "Oratória e Comunicação" na conta testada. Precisa de revisão de conteúdo.
4. Responsividade: medidos 360, 768 e 1440 px, sem overflow horizontal. 390, 430, 1024, 1280 e 1920 px não foram medidos individualmente.
5. O hash do bundle não serve de prova de paridade: o build local (`index-BuqtCmTo`) difere do build do Lovable (`index-BYzvy3f2`). A paridade foi provada pela presença, em produção, de rotas e atributos que só existem em `ab1cb961` (`/p/$publicId`, `data-public-settings`, `data-faceit-matches`).

### H. Próximos passos

1. Dono: ligar o perfil público numa conta de teste, abrir `/p/<ID>`, comparar com outro ID e desligar.
2. Conectar uma conta FACEIT com partidas de CS2 para validar a importação nativa e o vínculo com demos (`linked_to_demo`).
3. Revisar o mapeamento de prioridades para cursos.
