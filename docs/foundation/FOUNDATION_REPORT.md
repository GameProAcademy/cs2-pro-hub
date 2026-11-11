# CS2 PRO HUB — Relatório de Fundação (pré-Fase 4.2)

Data: 2026-11-10 · Repositório: `GameProAcademy/cs2-pro-hub` · Aplicação: https://gamepro.network

Convenção deste relatório: **Fato** = verificado em código, teste, CI, banco (consulta somente
leitura) ou navegador. **Hipótese** = plausível, não demonstrado. **Falta evidência** = não
foi possível provar. Nada aqui foi estimado.

---

## A. Resumo executivo

| Item                                                    | Estado                                                                                                                                                      | Evidência                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| CS2 PRO Score                                           | **Não existia** como sistema; agora existe `pro-score-v1` (real, somente leitura, versionado)                                                               | PR #257, `docs/reference/PRO_SCORE.md`, 27 testes + 6 mutantes |
| Player DNA                                              | Fórmula `dna-mean-v1` tinha defeitos demonstráveis; corrigida para `dna-weighted-v2`; GET deixou de escrever; quarentena passou a ser respeitada na leitura | PR #256 (merge `0ebfedf2`), 25 testes + 4 mutantes             |
| Snapshots de DNA                                        | Digest, idempotência e versão corretos; 9 snapshots v1 preservados (nenhum apagado)                                                                         | consulta somente leitura; PR #256                              |
| Navegação                                               | Estrutura atual é adequada; **nenhuma mudança de menu é justificada agora**; falta uma rota de detalhe de partida, que a Fase 4.2 vai exigir                | seção D                                                        |
| Fase 4.2 (módulos A–J)                                  | 2 parcialmente prontos, 5 bloqueados por dados que o pipeline ainda não persiste, 3 sem nenhuma base                                                        | seção E                                                        |
| Proteções (RLS, admin master, gates, Coach, OpenRouter) | Inalteradas                                                                                                                                                 | seção F                                                        |
| Produção                                                | Publicado e validado nos dois navegadores no build `f1276859` (PRs #256, #257, #258)                                                                        | seção I                                                        |

O que **não** foi resolvido e exige decisão de produto está na seção J — em especial: os
índices por dimensão do DNA não são calibrados contra nenhuma referência, e os pesos do Score
são decisão de projeto, não ajuste estatístico.

---

## B. CS2 PRO Score

### B.1 Auditoria (o que existia)

**Fatos**

- Nenhum motor, fórmula, peso, amostra mínima ou versão no código. O Dashboard e a
  Performance mostravam um painel "ainda não disponível" (`NotAvailablePanel`).
- A tabela `player_score_snapshots` (colunas `score`, `percentile`, `tier`, `analysis_id`)
  existe, tem **0 linhas** em produção e **nenhum produtor** no código.
- O componente de demonstração `ProScoreCard` só é alcançável com `DEMO_DATA = true`
  (produção: `false`).
- O AI Coach recebia "CS2 PRO Score (not computed)" na lista de itens indisponíveis.
- O `rating` por partida é outra coisa (mistura de abates, mortes e dano por rodada) e a
  documentação já dizia que ele não é o PRO Score.

### B.2 Especificação implementada — `pro-score-v1`

Fonte: `src/lib/proScore.ts` (função pura). Documento: `docs/reference/PRO_SCORE.md`.

```
score = 100 × Σ(wᵢ · vᵢ) / Σ(wᵢ)              sobre os componentes DISPONÍVEIS
vᵢ    = Σ(valorᵢₘ · amostraᵢₘ) / Σ(amostraᵢₘ)   sobre as partidas elegíveis
```

| Componente              | Sinal do catálogo                  | Peso | Amostra                    |
| ----------------------- | ---------------------------------- | ---: | -------------------------- |
| Contribuição por rodada | `decision_making.kast`             | 0,25 | rodadas                    |
| Dano                    | `aim.damage_per_round` (ADR ÷ 100) | 0,20 | rodadas                    |
| Abates                  | `aim.kills_per_round`              | 0,15 | rodadas                    |
| Saldo de duelos         | `dueling.kd_balance`               | 0,15 | rodadas                    |
| Sobrevivência           | `survivability.survival_rate`      | 0,10 | rodadas                    |
| Duelos de abertura      | `dueling.opening_success`          | 0,10 | duelos de abertura (≥ 10)  |
| Clutches                | `clutch.clutch_win_rate`           | 0,05 | situações de clutch (≥ 10) |

- **Separação desempenho / estilo / contexto:** só entram sinais de desempenho com direção
  "maior é melhor" e intervalo `[0,1]` no catálogo (há teste para isso). Sinais de estilo
  (neutros) ficam no DNA. Contexto (mapa, lado, força do adversário) **não** é ajustado na v1.
- **Pesos:** decisão de projeto documentada, **não** ajuste estatístico — não existe população
  para ajustar. Racional: sinais observados em toda rodada somam 0,85; os dois sinais
  amostrados por evento (mais raros e ruidosos) somam 0,15. Só mudam com nova versão.
- **Amostra mínima:** 3 partidas completas; componentes por evento exigem 10 eventos somados.
- **Valores ausentes:** nunca viram zero. Componente não observado ou com amostra fina sai do
  cálculo **e do denominador**; a cobertura (parcela do peso usada) é exibida; abaixo de 75%
  não há número. Zero observado continua sendo zero.
- **Estados:** `EMPTY`, `INSUFFICIENT_SAMPLE`, `INSUFFICIENT_COVERAGE`, `READY`.
- **Confiança:** só pelo número de rodadas (erro-padrão do pior caso √(0,25/n)):
  provisória < 150, moderada 150–299, alta ≥ 300. Não diz nada sobre habilidade.
- **Sem percentil, tier, ranking ou benchmark:** sempre `null`; a interface diz que 50 não
  significa "média".
- **Persistência / histórico:** nenhum na v1. É recalculado na leitura a partir de
  `match_features`, então não pode divergir dos dados de origem e não exigiu migration. A
  tabela antiga não foi usada porque seu formato pressupõe percentil e tier.
- **Onde aparece:** cartão no Dashboard, seção em Performance, fatos do AI Coach (mesma
  função, mesmas linhas — há teste de coerência).

### B.3 Caso real

Conta de teste, 3 partidas completas, 63 rodadas (consulta somente leitura): KAST 0,762 ·
dano 0,825 · abates 0,603 · saldo de duelos 0,524 · sobrevivência 0,460; duelos de abertura
(8) e clutches (4) abaixo de 10 → fora. **Score 67,1 · cobertura 85% · confiança
provisória.** Fixado como teste. Em produção, a conta de teste vê exatamente esse valor no Dashboard e na
Performance (seção I).

### B.4 Limitações conhecidas

1. Pesos não calibrados.
2. `damage_per_round` e `kills_per_round` são limitados a 1 **por partida** pelo pipeline de
   features antes da agregação: uma partida excepcional é subcontada.
3. `kd_balance` e `survival_rate` agregados por rodadas são aproximação (os totais de abates e
   mortes por partida não estão em `match_features`).
4. Sem contexto de mapa, lado ou adversário.
5. Sem histórico: o valor muda quando entram novas partidas.

---

## C. Player DNA

### C.1 Auditoria

**Fatos** (demonstrados na página real da conta de teste e por teste):

| Defeito em `dna-mean-v1`                                                                                                          | Demonstração                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dupla contagem por complemento: `early_death_avoidance` e `early_death_rate` (e o par `first_death_*`) entravam na mesma dimensão | Sobrevivência 57 em v1, 47 em v2; Posicionamento 69 em v1, 56 em v2 (valores das páginas reais) |
| Média de razões por partida, sem peso da amostra                                                                                  | Partida de 16 rodadas pesava igual à de 24                                                      |
| Amostras finas tratadas como precisas                                                                                             | Índice de clutch 16 a partir de 6 situações                                                     |
| `getRealPlayerDna` (GET) gravava snapshot                                                                                         | leitura com efeito colateral; o Dashboard a chamava                                             |
| Partidas em quarentena (H.3-E) não eram excluídas na leitura do jogador                                                           | risco latente: 1 partida em quarentena em produção, sem features                                |

As dez dimensões: Mira, Duelos, Sobrevivência, Posicionamento, Utilitários, Tomada de
decisão, Jogo em equipe, Economia, Clutch, Consistência.

### C.2 Correção — `dna-weighted-v2` (PR #256, em `main`)

- Média agregada ponderada pela amostra do próprio sinal (rodadas, duelos de abertura,
  situações de clutch); sem amostra positiva em alguma linha → volta à média simples.
- Complementos não entram duas vezes (`COMPLEMENT`); sinais por evento com menos de 10
  eventos não entram no índice (`THIN_SAMPLE`); os dois motivos aparecem na interface.
- `getRealPlayerDna` é somente leitura; o snapshot é gravado por um POST próprio
  (`refreshOwnDnaSnapshot`), chamado uma vez pela página do DNA. O Dashboard não escreve.
- Leitura exclui partidas em quarentena por um auxiliar de servidor que devolve só ids e
  falha fechado (`QUARANTINE_READ_FAILED`).
- A fórmula não foi alterada por preferência estética: cada mudança corresponde a um defeito
  da tabela acima.

### C.3 Snapshots

**Fatos:** 9 snapshots em produção, todos `dna-mean-v1`, digests distintos (reprocessamentos
reais). Digest cobre as entradas (agora incluindo as amostras por evento), idempotência por
`input_digest`, versão do método gravada e exibida no histórico. Nenhum snapshot foi apagado
ou reescrito; os de v2 são linhas novas. Em produção há agora um snapshot
`dna-weighted-v2` (10/11/2026 22:49) acima dos `dna-mean-v1` preservados.

### C.4 Limitação não resolvida (importante)

Os índices por dimensão **não são calibrados** contra referência alguma: cada um é a média de
sinais com escalas naturais diferentes. Comparar dimensões entre si ("a mais fraca",
"abaixo de 60") compara escalas não comparáveis. A regra do Raio-X "dimensão mais fraca
abaixo de 60" e a prioridade do plano de treino dependem dessa comparação. Não alterei isso:
corrigir exige ou escalas de referência declaradas ou uma população (módulo J), e é decisão
de produto. Ver seção J.

---

## D. Arquitetura visual e navegação

### D.1 Inventário (navegador, conta de teste e conta administradora)

Menu lateral (`src/config/navigation.ts`): Dashboard · Minhas Partidas · Performance ·
Player DNA · Meu Raio-X · Meu Treinamento · Objetivos · AI Coach · Perfil; ação primária
"Analisar demo" (`/upload`); `/notifications`; `/admin/*` (usuários, catálogo, pipeline,
auditoria, notificações e ferramentas forenses). Navegação móvel inferior: Dashboard,
Raio-X, Treinamento, Coach.

**Fatos:** jogador que abre `/admin` é redirecionado a `/dashboard`. `/matches` é só uma
lista — **não existe rota de detalhe de partida**. O Raio-X declara o que não é medido
(posições/heatmaps, classificação de compra, abates e dano por lado, inimigos cegados).

### D.2 Decisão

| Pergunta                                                                               | Decisão                                                                                                                                                                   | Motivo                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Novo item de menu para o Score?                                                        | **Não**                                                                                                                                                                   | É um número com explicação: cartão no Dashboard + seção em Performance (feito) |
| Um item por métrica/módulo da 4.2?                                                     | **Não**                                                                                                                                                                   | Nove itens já é o limite útil; a regra do prompt proíbe                        |
| Onde entram heatmaps, mortes, duelos, utilitários, economia, impacto por rodada (A–F)? | **Abas dentro de uma nova rota `/matches/$matchId`** (Resumo · Rodadas · Mapa · Duelos · Utilitários · Economia) e, para a visão agregada, **seções/abas em Performance** | São análises de uma partida ou de um período, não destinos de navegação        |
| Evolução e consistência (G)?                                                           | Aba "Evolução" em Performance                                                                                                                                             | Já existe a série de desempenho ali                                            |
| Treino adaptativo (H)?                                                                 | Dentro de Meu Treinamento                                                                                                                                                 | Já é a casa do plano                                                           |
| Biblioteca de momentos (I)?                                                            | Aba do detalhe da partida; item de menu próprio só se virar acervo entre partidas                                                                                         | Evita item vazio                                                               |
| Comparativos com profissionais (J)?                                                    | Seção em Performance / Player DNA, só quando houver população real                                                                                                        | Sem dados não há tela                                                          |
| Redesenho?                                                                             | **Não**                                                                                                                                                                   | Nada observado o justifica                                                     |

**Mudança implementada nesta missão:** apenas a troca dos painéis "não disponível" pelo Score
real. A rota de detalhe de partida **não** foi criada: sem os dados dos módulos A–F ela seria
uma casca vazia; deve nascer junto com o primeiro módulo da 4.2 que a preencher.

---

## E. Matriz de conexão com a Fase 4.2 (módulos A–J)

Evidência de dados: consulta somente leitura em produção (6 partidas, 122 rodadas).
`round_events`: 759 abates (todos com `distance`; arma e as marcas `blind` / `noscope` /
`wallbang` / `penetration` presentes), 3.183 danos, 793 flashes, 829 smokes, 415 HEs, 16.892
`weapon_fire`. **Nenhum evento persistido tem posição.** `weapon_fire` não tem autor nem arma
(0 de 16.892). Não há eventos de molotov/incendiária nem `weapon_purchase` persistidos.
`round_players`: `money_start`, `equipment_value` e `side` em 969 de 970 linhas;
`buy_context` nunca preenchido (0); `survived` nunca preenchido (0).

| Funcionalidade                            | Existe | Parcial | Real | Mock | Dependências                                                                                                                                                        | Ação                                                                                                                               |
| ----------------------------------------- | ------ | ------- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A. Heatmaps                               | Não    | Não     | Não  | Não  | Posições por evento (o parser as produz — `position_snapshots`, `victim_position` — mas a persistência não as grava); imagens/calibração dos mapas; rota de detalhe | Bloqueado até persistir posições (migration aditiva + projeção)                                                                    |
| B. Diagnóstico de mortes / posicionamento | Não    | Sim     | Sim  | Não  | Taxas de morte cedo/sem troca/primeira morte existem em `match_features`; **onde** morreu depende de posições (A)                                                   | Parte temporal viável já; parte espacial bloqueada por A                                                                           |
| C. Mira, duelos e movimento               | Não    | Sim     | Sim  | Não  | Abates têm distância, arma, HS, flags; `weapon_fire` sem autor impede precisão/spray por jogador; velocidade não persistida                                         | Duelos por arma/distância viável; mira fina e movimento bloqueados                                                                 |
| D. Utilitários                            | Não    | Sim     | Sim  | Não  | Contagens por tipo e autor existem (≈80% dos eventos com autor); sem posição, sem molotov, sem "quem foi cegado" (inimigos cegados não medido)                      | Uso por rodada viável; eficácia bloqueada                                                                                          |
| E. Economia                               | Não    | Sim     | Sim  | Não  | `money_start` e `equipment_value` por rodada existem; `buy_context` nunca classificado; sem compras                                                                 | Classificador de compra é derivável dos dados existentes (precisa de especificação de faixas) — melhor candidato a primeiro módulo |
| F. Impacto por rodada                     | Não    | Sim     | Sim  | Não  | Por rodada há abates, dano, abertura, troca, lado; `survived` vazio em `round_players`; sem modelo de probabilidade de vitória (exigiria população)                 | Impacto descritivo viável; "win probability added" não                                                                             |
| G. Evolução e consistência                | Não    | Sim     | Sim  | Não  | Série de desempenho e dimensão Consistência existem; histórico do Score não; amostra atual pequena (3 e 2 partidas por jogador)                                     | Persistir histórico do Score (tabela nova, versionada) quando o módulo começar                                                     |
| H. Treino adaptativo                      | Sim    | Sim     | Sim  | Não  | Plano de treino real guiado pelas dimensões mais baixas do DNA; catálogo de aulas real                                                                              | Depende da calibração das dimensões (seção J) para ser defensável                                                                  |
| I. Biblioteca de momentos                 | Não    | Não     | Não  | Não  | Eventos com tick e rodada existem; não há reprodução, clipes nem critérios de "momento"                                                                             | Especificar critérios; só lista textual é viável hoje                                                                              |
| J. Comparativos com profissionais         | Não    | Não     | Não  | Não  | Nenhuma população de referência, nenhuma demo profissional ingerida, nenhuma tabela                                                                                 | Não iniciar sem fonte de dados real e licenciada                                                                                   |

"Mock": com `DEMO_DATA = false` em produção, nenhum dado de demonstração chega às páginas
reais (há teste). Os componentes de demonstração continuam no código, inalcançáveis.

### Diferenciais competitivos — prontidão

**Fato:** o que o produto já tem e é verificável: nunca transformar ausência em zero, estados
explícitos de indisponibilidade, versão do método visível, Coach limitado aos fatos do
jogador. **Falta evidência** para qualquer afirmação de superioridade sobre concorrentes: não
fiz comparação com outros produtos e não a declaro.

---

## F. Segurança e integridade

Inalterados nesta missão (**fato**, por inspeção dos diffs dos PRs #256 e #257): RLS,
ownership, autenticação, admin master (`protect_primary_admin_roles`), autorização no
servidor, limites de taxa, idempotência, leases, fencing tokens, locks, reservas, guards de
resposta do Coach, contratos canônicos, identidade do parser, H.3-E e gates de
ativação/publicação. Provedor do Coach: OpenRouter `openai/gpt-oss-20b`, sem fallback.

- Nenhuma migration nesta missão. Nenhuma coluna, tabela, demo, partida ou snapshot removido.
- Nenhuma demo reprocessada. Nenhuma campanha criada, nenhum envio externo.
- Único uso novo de service role: leitura dos **ids** em quarentena, no servidor, falhando
  fechado — fortalece a H.3-E na leitura do jogador.
- `getProScore` e `getRealPlayerDna`: GET, autenticados, sob RLS, sem escrita.
- Conta de teste não foi elevada; conta administradora não foi alterada.
- Nenhuma mensagem foi enviada ao agente do Lovable.

---

## G. Testes

| Conjunto                                                          | Resultado                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Suíte completa local (com PostgreSQL descartável), após o PR #258 | 2311 aprovados, 1 ignorado, 0 falhas (170 arquivos)                                                                |
| `proScore.test.tsx`                                               | 28 testes (inclui o guard do Coach com os fatos reais)                                                             |
| Mutantes do Score                                                 | 6 de 6 detectados (peso, mínimo de partidas, cobertura, amostra de eventos, parcial não excluída, nulo como valor) |
| Mutante dos fatos do Coach (`score: null`)                        | detectado                                                                                                          |
| `playerDnaV2.test.ts`                                             | 25 testes; 4 de 4 mutantes detectados                                                                              |
| `tsc --noEmit`                                                    | 0 erros                                                                                                            |
| ESLint                                                            | 0 erros (14 avisos pré-existentes)                                                                                 |

Testes alterados de propósito (não enfraquecidos): `coachPresentation.test.ts` (fixture
passou a declarar `sample_clutches`), `uxPhase1.test.tsx` (o link para a explicação do Score
agora está no componente do cartão). **Não executado:** teste E2E automatizado de navegador
no CI para as telas novas — a validação de interface foi manual, nos dois navegadores
(seção I).

---

## H. GitHub

| PR      | Conteúdo                                                                           | Merge      | Checks                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| #256    | Player DNA `dna-weighted-v2`, GET somente leitura, quarentena na leitura           | `0ebfedf2` | 5/5 verdes no PR; gates de `main`: todos verdes (H.3-E: 1ª execução falhou, 2ª passou — corrida de ordenação conhecida) |
| #257    | CS2 PRO Score `pro-score-v1`                                                       | `975c7d11` | 5/5 verdes no PR (`73b6ad7c`); gates de `main` todos verdes (H.3-E: 1ª falhou, 2ª passou)                               |
| #258    | Coach: fatos do Score com valor numérico (defeito achado na validação em produção) | `f1276859` | 5/5 verdes no PR (`fd984b07`); gates de `main` todos verdes (H.3-E: 1ª falhou, 2ª passou)                               |
| este PR | Este relatório (somente documentação)                                              | —          | —                                                                                                                       |

Sem force-push; merges por merge commit.

---

## I. Produção

Publicação pelo `deploy_project` do Lovable (nenhuma mensagem ao agente do Lovable), só depois
dos gates de `main` verdes. O status `pending` não foi tratado como confirmação: a publicação
foi confirmada pelo comportamento servido em https://gamepro.network.

| Verificação                               | Conta                              | Resultado (fato observado)                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard — cartão do Score               | teste (Chrome)                     | 67,1 / 100 · confiança provisória · 3 partidas, 63 rounds · `pro-score-v1` · cobertura 85% · aviso "não é percentil"                                                               |
| Performance — detalhe do Score            | teste                              | Tabela com os 7 componentes; pontos 22,4 + 19,4 + 10,6 + 9,2 + 5,4; duelos de abertura (8) e clutches (4) "fora do cálculo"; texto diz que os pesos são decisão de projeto         |
| Player DNA                                | teste                              | Método `dna-weighted-v2`; Sobrevivência 47, Posicionamento 56, Clutch 14; complementos e amostras finas marcados como fora do índice; histórico com 1 linha v2 e as v1 preservadas |
| AI Coach — 1ª pergunta (build `975c7d11`) | teste                              | **Defeito:** seção Dados vazia; o guard removeu o Score porque ele só existia como texto nos fatos → PR #258                                                                       |
| AI Coach — repetição (build `f1276859`)   | teste                              | Responde 67,1 / 100 e os sete componentes com os mesmos valores e pesos da página; nenhum número removido                                                                          |
| Isolamento                                | administradora (navegador interno) | Score: "Ainda não há partidas processadas"; DNA: sem perfil; nenhum dado da conta de teste; a demo retida pela auditoria continua fora dos números                                 |
| Celular (375 px)                          | administradora                     | Seção do Score legível, sem corte, navegação inferior intacta — **apenas o estado vazio**                                                                                          |
| Console do navegador                      | teste                              | Sem erros na página de Performance                                                                                                                                                 |

**Hipótese (não demonstrada):** o snapshot v2 das 22:49 foi gravado na primeira visita à
página do DNA após a publicação do PR #256; não rastreei qual visita o gerou.

**Não verificado:** logs do servidor de produção para as novas funções (não há acesso de
leitura a eles por esta sessão além do comportamento observado); idiomas diferentes de pt-BR
em produção (cobertos só por teste automatizado).

---

## J. Pendências (em ordem de importância)

1. **Índices do DNA não calibrados** — a regra "dimensão mais fraca < 60" do Raio-X e a
   prioridade do treino comparam escalas não comparáveis. Decisão necessária: (a) declarar
   escalas de referência por sinal, com fonte; ou (b) esperar uma população real; até lá,
   considerar rebaixar essas regras a "observação", não "diagnóstico".
2. **Pesos do Score** são decisão de projeto da v1. Validar com quem define o produto; trocar
   exige `pro-score-v2`.
3. **Sinais limitados por partida** (`damage_per_round`, `kills_per_round` cortados em 1) —
   corrigir no pipeline de features muda `match_features` e os digests; fazer junto com uma
   nova versão de features, não isoladamente.
4. **Posições não persistidas** — bloqueia heatmaps e toda análise espacial (módulos A, B, D).
5. **`buy_context` e `survived` vazios em `round_players`; `weapon_fire` sem autor** — bloqueiam
   partes dos módulos C, E, F.
6. **Histórico do Score** inexistente (módulo G).
7. **Rota de detalhe de partida** inexistente (pré-requisito de A–F).
8. **Amostra de produção muito pequena** (3 perfis, 5 linhas de features): nenhuma conclusão
   estatística sobre a qualidade do Score ou do DNA é possível hoje.
9. **Sem E2E automatizado** das telas novas no CI.
10. Tabela `player_score_snapshots` permanece vazia e sem uso; não foi removida (regra de não
    remover tabelas). Decidir no módulo G se será substituída.
11. **Tabela de componentes do Score em tela de celular com dados reais não foi verificada**
    (a captura de tela do Chrome travou na largura de celular); só o estado vazio foi visto
    em 375 px.
12. **H.3-E Activation Gate falha na primeira execução de todo merge** e passa na segunda
    (depende da atestação F553, que termina depois). Observado nos três merges desta missão;
    não alterei o gate. Vale corrigir a ordenação do workflow para não normalizar um vermelho.
13. O Coach ainda pode perder uma frase se o modelo juntar o Score e a palavra "percentil"; o
    guard a remove (seguro, mas a resposta fica menos útil).
