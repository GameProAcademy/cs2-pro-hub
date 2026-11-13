CS2 PRO HUB

# FASE 4.2
ESPECIFICAÇÃO TÉCNICA E FUNCIONAL MESTRE

Analytics avançado • Inteligência de mapa • Diagnóstico • Treinamento • Evolução

| Controle | Valor |

| --- | --- |

| Projeto | CS2 PRO Hub / CS2 PRO AI Coach |

| Repositório | GameProAcademy/cs2-pro-hub |

| Aplicação | https://gamepro.network |

| Versão | 1.1 — 12/11/2026 |

| Idiomas | pt-BR, pt-PT, en, es, fr |

| Status | Especificação revisada; execução depende de auditoria read-only, dos prompts de execução correspondentes e dos gates de cada etapa |

| Limite | Este documento, isoladamente, não autoriza alterações. A execução depende do prompt de execução correspondente e dos limites nele concedidos. É proibido enviar prompts/instruções automaticamente ao Lovable ou operar sua interface para solicitar alterações. |

PRINCÍPIO CENTRAL: preservar integralmente o que já funciona; ampliar por contratos compatíveis e dados comprováveis.

# Como utilizar este documento

Este documento é a referência técnica e funcional proposta para orientar toda a Fase 4.2. É um plano de execução incremental, não uma autorização automática. Antes de qualquer código, o responsável deverá confirmar o estado real da main, da Fase 4.1, do parser, das migrations, do banco Lovable Cloud, dos gates e dos dados disponíveis.

- Os nomes das dez entregas 4.2.1–4.2.10 são identificadores oficiais e devem ser preservados em PRs, issues e checkpoints.

- Os Módulos A–J agrupam funcionalidades; as dez entregas representam a ordem de execução e validação.

- Os oito diferenciais são requisitos transversais, entregues nos módulos correspondentes.

- Quando o estado real divergir deste documento, registrar a divergência e decidir explicitamente; nunca alterar comportamento existente silenciosamente.

- Uma métrica só é liberada se parser, modelo de dados, amostra e proveniência sustentarem seu cálculo.

# Sumário executivo

A Fase 4.2 transforma estatísticas de partidas em respostas práticas: onde o jogador perde rounds, quais padrões repete, que decisão poderia considerar, o que deve treinar e se melhorou. A experiência liga fatos extraídos da demo, contexto espacial/temporal, diagnóstico explicável e plano de ação.

A ordem reduz retrabalho: primeiro contratos e cobertura; depois heatmaps, diagnóstico e replay; em seguida mira/movimentação, utilitários, economia/impacto, evolução, treino e biblioteca/comparativos.

## Resultado esperado

- Heatmaps filtráveis por mapa, lado, evento e período, com drill-down até round/tick.

- Análise de mortes que distingue fato, hipótese, decisão justificável e causa desconhecida.

- Replay 2D por round, sincronizado com eventos.

- Diagnósticos sustentados por evidências e cobertura visível.

- Planos de treino ligados a problemas observados e reavaliados em partidas posteriores.

- Histórico de evolução com amostras comparáveis e sem pontuações artificiais.

# 1. Contexto e baseline conhecido

O fluxo-alvo permanece: upload de demo → identificação do jogador pelo nickname presente na demo → parsing → persistência → dashboard/stats → AI Coach. O parser e a infraestrutura atuais são ativos críticos; não devem ser substituídos sem causa demonstrada.

| Área | Baseline informado no histórico | Regra de preservação |

| --- | --- | --- |

| Parser | R5.8.24 foi reportado como publicado e atestado em novembro de 2026; parser/worker, build e deploy atuais precisam ser confirmados read-only. | Não alterar build pin, identidade, attestation ou contrato sem causa demonstrada, plano compatível e gates. |

| H.3-E | Gates de identidade, attestation e activation gate. | Nunca contornar ou relaxar gates. |

| AI Coach | OpenRouter, modelo openai/gpt-oss-20b; fallback OpenAI desligado. | Manter provider/modelo e controles de custo. |

| Banco | Banco real gerenciado por Lovable Cloud; Supabase pessoal conectado está vazio. | Confirmar ambiente correto antes de qualquer migration. |

| Segurança | RLS, ownership, idempotência, reservas e limites de custo. | Preservar e testar isolamento entre usuários. |

| Tutor LMS | Plataforma externa acessada por links. | Sem APIs, login compartilhado ou sincronização nesta fase. |

| PR #254 | Humanização integrada à main no commit ebe4f68c2fa790c6446c33ec30fb89ff484d6419; preferred_name migration aplicada conforme histórico. | Preservar preferências, voz, labels e traduções. |

| Fase 4.1 | Claude continuará a fase separadamente ao retomar. | Não concorrer com branches/arquivos; iniciar 4.2 após baseline. |

| Fundação analítica | PRs #256–#258 estabeleceram Player DNA v2, CS2 PRO Score v1 e inclusão do Score nos fatos do Coach; PR #262 consolidou documentação/metodologia. | Reutilizar contratos e métodos existentes; não duplicar catálogo, agregadores ou snapshots. DNA/Score são heurísticos internos, não escalas profissionais calibradas nem percentis populacionais. |
| Fase 4.2 / marcos prévios | PR #263 (Marco 0/documentação) e PR #264 (Marco 1/semântica CT/T e resultado por round) foram reportados como implementados; estado final de merge, deploy e integração deve ser verificado. | Não presumir que estão integrados. Reutilizar se confirmados; não duplicar nem criar fonte paralela. |
| Dados espaciais | R5.8.24 foi reportado como produtor de `position` do atacante e `victim_position` no tick da morte. | Isso não prova persistência ponta a ponta e não equivale a trajetória, presença contínua ou tempo de exposição. Confirmar parser → bridge → transporte → persistência → API/UI. |

Nota: este baseline vem do histórico e de relatos de execução disponíveis até 12/11/2026; não representa auditoria independente nem substitui a verificação read-only do estado real.

## 1.1.1 Restrições atuais de dados espaciais e semântica CT/T

- `position` e `victim_position` do R5.8.24, quando persistidos e validados, representam posições associadas ao tick de uma morte. Não representam amostragem contínua.
- Uma posição do atacante no tick da morte pode alimentar uma camada chamada precisamente “posição do atacante no tick da eliminação”; a posição da vítima pode alimentar “posição da vítima no tick da morte”. Não usar o rótulo genérico “local da kill” sem declarar a semântica.
- Posições esparsas de eventos não sustentam heatmap de presença, rota, trajetória, ocupação, tempo de exposição ou replay contínuo. Não interpolar entre eventos para fabricar presença.
- As limitações contratuais L02 (movimento/tempo de exposição) e L03 (mira/spray/counter-strafe) permanecem vigentes até alteração formal, versionada, testada e aprovada do contrato de admissão. Não contornar guards nem inferir campos proibidos.
- Lado deve ser contextualizado por jogador e round, considerando troca de lados. Não inferir CT/T por nickname, ordem dos jogadores ou lado global da partida.
- Diferenciar sempre identidade da equipe, lado do jogador naquele round, vencedor do round e motivo de encerramento. Um campo não substitui o outro.
- O estado de PR #264 deve ser confirmado antes de implementar filtros/segmentações CT/T ou resultados por round; se integrado, reutilizar sua fonte de verdade e seus testes.

## 1.1 Condições de entrada

1. Concluir a Fase 4.1 ou isolar formalmente suas pendências, responsáveis e arquivos em alteração.

1. Auditar read-only main, PRs, migrations, deploy, CI, gates e estado de produção.

1. Confirmar parser/worker ativo, contratos de ingestão, tabelas e campos disponíveis.

1. Inventariar métricas persistidas, nulos, derivados, ignorados e não medidos.

1. Registrar baseline de performance, tamanho de demos, eventos, payloads, consultas e custos.

1. Definir branches/PRs e migrations sem sobreposição com a Fase 4.1.

1. Definir rollback e responsável operacional por entrega.

# 2. Objetivos, não-objetivos e princípios invioláveis

## 2.1 Objetivos

- Dar contexto espacial e temporal aos dados.

- Identificar padrões comprováveis de desempenho.

- Explicar erros sem confundir correlação com causalidade.

- Conectar diagnóstico a exercícios e evolução mensurável.

- Entregar visualizações responsivas, com carregamento progressivo.

- Permitir auditoria até partida, round, tick e método.

- Manter custo previsível, segurança e compatibilidade.

## 2.2 Não-objetivos

- Não substituir o parser atual sem necessidade comprovada.

- Não criar anti-cheat, detector de fraude ou julgamento absoluto de habilidade.

- Não afirmar visão, comunicação ou intenção humana que a demo não registra.

- Não declarar decisão errada apenas porque o round foi perdido.

- Não criar ranking/perfil público como dependência.

- Não integrar Tutor LMS além de links.

- Não fazer scraping ou usar dataset sem licença/termos permitidos.

## 2.3 Princípios invioláveis

| Princípio | Regra verificável |

| --- | --- |

| Null ≠ zero | Ausente, null, não medido, não observado ou indisponível nunca vira zero. |

| Proveniência | Cada métrica tem status, método, unidade e versão. |

| Evidência | Diagnóstico aponta para partida/round/tick quando disponível. |

| Ownership | Leituras/escritas limitadas ao usuário autorizado por RLS. |

| Idempotência | Repetição não duplica métricas, snapshots, treino ou eventos. |

| Compatibilidade | Contratos novos são aditivos/versionados. |

| Segurança | Não expor secrets, tokens ou dados de terceiros. |

| Gates | CI, H.3-E, attestation e testes continuam obrigatórios. |

| Custo | Sem chamadas OpenRouter automáticas não autorizadas. |

| Reprocessamento | Demos reais não são reprocessadas sem autorização explícita. |

# 3. Arquitetura-alvo e fluxo de dados

1. Demo entra pelo fluxo atual, com validação de ownership, tamanho, tipo e idempotência.

1. Parser atual extrai eventos, posições, ticks, jogadores, armas, utilitários e estados suportados.

1. Normalização mapeia campos para contratos canônicos com provenance e versão.

1. Agregadores determinísticos constroem fatos por jogador, round, mapa, lado e partida.

1. Camada analítica gera bins de heatmap, relações de eventos, diagnósticos e snapshots.

1. API de leitura aplica ownership/RLS, paginação, filtros e limites.

1. Frontend apresenta mapas, timeline, fichas de diagnóstico e histórico.

1. AI Coach recebe contexto compacto, autorizado e acompanhado de limitações.

1. Treino e biblioteca guardam decisões/referências, sem duplicar demos brutas.

| Camada | Responsabilidade | Não deve fazer |

| --- | --- | --- |

| Parser/worker | Decodificar demo e produzir fatos. | Gerar recomendações subjetivas. |

| Canonical data | Normalizar tipos, ids, ticks e provenance. | Esconder lacunas. |

| Analytics jobs | Agregações determinísticas/idempotentes. | Reinterpretar fatos silenciosamente. |

| API/read model | Entregar dados filtrados por owner. | Expor dados brutos/terceiros. |

| Frontend | Visualizar e navegar evidências. | Calcular métricas críticas divergentemente. |

| AI Coach | Explicar evidências. | Inventar números ou causas. |

| Training | Organizar exercícios e reavaliação. | Afirmar melhoria sem amostra. |

## 3.1 Custo e desempenho

- Preferir agregações determinísticas em jobs/views controladas.

- Persistir derivados úteis e reconstruíveis; não duplicar demos brutas.

- Aplicar paginação, filtros e payloads compactos.

- Heatmap envia bins agregados, não todos os ticks.

- Replay carrega um round/janela temporal por vez.

- Coach recebe resumo e evidências selecionadas, nunca a demo inteira.

# 4. Contratos, proveniência e qualidade

| Estado | Significado | Comportamento |

| --- | --- | --- |

| OBSERVED | Diretamente observado na demo. | Exibir como medido. |

| DERIVED | Calculado deterministicamente de fatos observados. | Mostrar método e origem. |

| INFERRED | Interpretação heurística/probabilística. | Rotular como inferência e ressalvar. |

| NOT_OBSERVED | Evento/atributo não apareceu nos dados. | Não exibir como zero. |

| NOT_MEASURED | Pipeline não mede o atributo. | Não incluir em score. |

| INSUFFICIENT_SAMPLE | Amostra insuficiente. | Mostrar limiar/amostra. |

| UNAVAILABLE | Fonte/versão/falha indisponível. | Não imputar valor. |
| PARTIAL | Parte da população elegível foi medida, com cobertura incompleta conhecida. | Exibir somente o que foi medido, N/denominador e limitações; nunca apresentar como total completo. |

Manter compatibilidade com coach-context-v1 e xray-v1 quando aplicável. Ampliações devem ser versionadas.

| Campo de métrica recomendado | Finalidade |

| --- | --- |

| metric_key | Identificador estável, ex. combat.opening_death_rate. |

| value | Valor tipado ou null. |

| unit | %, count, damage, seconds, ticks etc. |

| status | Estado da taxonomia acima. |

| provenance_method | Fonte, regra e versão do cálculo. |

| sample_size | Denominador e unidade da amostra. |

| coverage | Eventos/rounds elegíveis efetivamente medidos. |

| confidence | Opcional; somente se calibrada. |

| evidence_refs | Partida, round, tick. |

| computed_at/schema_version | Momento do cálculo e versão do contrato. |

## 4.1 Regras

- Percentual exige numerador e denominador; denominador ausente/zero resulta em null e status adequado.

- Dados parciais não são apresentados como total sem cobertura.

- Comparações exigem população, período, mapa, lado e condições comparáveis.

- Overtime, surrender, round incompleto e estados especiais precisam de regra.

- Testar null, duplicidade, eventos fora de ordem e limites de tick.

- Correção de algoritmo versiona métrica e não reescreve histórico silenciosamente.

| Domínio | Métrica | Dados mínimos | Fallback correto |

| --- | --- | --- | --- |

| Espacial | Heatmap morte | posição válida no tick, jogador, mapa | NOT_MEASURED/UNAVAILABLE |

| Espacial | Heatmap kill | posição e killer atribuídos | NOT_MEASURED |

| Espacial | Densidade/presença | amostras temporais contínuas de posição, com frequência e população elegível definidas | NOT_MEASURED enquanto a fonte contínua não existir e não for permitida |

| Combate | Duelos | dano/kill, atacante/vítima, janela | UNAVAILABLE |

| Mira | First bullet | disparo inicial, hit e estado arma | NOT_MEASURED |

| Movimento | Counter-strafe | velocidade/direção e timing | NOT_MEASURED |

| Mira | Crosshair placement | ângulo e posição alvo reconstruíveis | NOT_MEASURED |

| Utilitário | Flash affected | evento e atribuição confiável | NOT_MEASURED |

| Utilitário | Flash assist | regra validada de atribuição | NOT_MEASURED |

| Economia | Equipment value | estado financeiro/equipamento por round | UNAVAILABLE |

| Impacto | Trade | sequência temporal e janela documentadas | NOT_MEASURED |

| Evolução | Trend | snapshots compatíveis e amostra | INSUFFICIENT_SAMPLE |

| Pro | Benchmark | dataset permitido e coorte equivalente | UNAVAILABLE |

# 5. Segurança, privacidade e governança

- RLS e ownership em tabelas, views, RPCs e endpoints; testar usuário A contra dados de B.

- Service role somente em funções confiáveis; nunca no cliente.

- Validar match/player/round/library contra owner autenticado.

- Rate limit, paginação, tamanho máximo e limites de consulta.

- Logs sanitizados; sem secrets, tokens ou payloads sensíveis desnecessários.

- Retenção/exclusão cobre agregados, snapshots e biblioteca.

- Dados profissionais só com fonte/licença/termos permitidos; sem scraping indevido.

- Compartilhamento de heatmap/clipe privado por padrão e ação explícita.

- Exclusão de conta não pode deixar derivados órfãos.

# 6. UX e navegação

| Área | Conteúdo |

| --- | --- |

| Performance | Resumo, métricas válidas, evolução e cobertura. |

| Map Intelligence | Mapa, heatmaps, filtros, eventos e drill-down. |

| Match Analysis | Mortes, rounds-chave, timeline e replay. |

| AI Coach | Explicações, evidências, recomendações e histórico. |

| Training & Evolution | Planos, exercícios, metas e reavaliação. |

| Moment Library | Bookmarks, notas, tags e coleções. |

- Filtros por partida, mapa, lado do jogador naquele round, período, round, arma e evento. O lado deve vir de fonte canônica por jogador/round; não inferir por nickname ou lado global da partida.

- Legenda clara para fato, derivação, inferência, amostra insuficiente e indisponibilidade.

- Tooltip explica definição, unidade, numerador/denominador e coverage.

- Clicar no heatmap abre os eventos/rounds associados.

- Estado vazio explica o motivo e o que habilita a métrica.

- Cor nunca é o único canal; contraste e daltonismo considerados.

- Mobile utilizável; visualizações densas podem priorizar desktop.

- Localização completa pt-BR, pt-PT, en, es, fr.

# 7. Oito diferenciais competitivos — especificação completa

## 7.1 Onde estou perdendo rounds?

Objetivo: Identificar contextos recorrentes associados a rounds perdidos sem declarar causalidade automática.

- Listar rounds e contextos mensuráveis: primeira morte, desvantagem numérica, ausência de trade, retake, clutch, economia e utilitários.

- Filtros por mapa, lado, período e tipo de round.

- Contagem, denominador, cobertura, amostra e links para round/tick.

- Separar fato ('morreu primeiro') de hipótese ('pode ter aberto espaço').

- Ordenar por frequência/relevância explicada; não dizer 'causou derrota' sem modelo validado.

Critérios de aceite: Aceite: toda afirmação tem evidência; usuário abre cada round; amostra/cobertura visíveis; causa não demonstrada é apresentada como associação.

## 7.2 Meu posicionamento versus jogadores profissionais

Objetivo: Comparar padrões espaciais com coortes profissionais válidas, sem posição universalmente correta.

- Dataset de origem/licença/termos/data/mapa/versão documentados.

- Coortes por mapa, lado, role, situação, arma e fase do round.

- Coordenadas normalizadas por mapa/versionamento.

- Painéis lado a lado com tamanho da amostra e incerteza quando calculável.

- Role selecionada pelo usuário ou inferida com rótulo; não presumir.

- Coorte incompatível ou pequena resulta em benchmark indisponível.

Critérios de aceite: Aceite: fonte permitida, filtros visíveis, comparação incompatível bloqueada e nenhuma coleta que viole termos.

## 7.3 Meu pior hábito

Objetivo: Detectar comportamento recorrente potencialmente prejudicial, com exemplos rastreáveis.

- Catálogo versionado: re-peek, isolamento, exposição, rotação tardia, utilitário prematuro e repetição previsível, se mensuráveis.

- Cada padrão tem regra, dados necessários e falsos positivos.

- Exigir recorrência/amostra mínima.

- Mostrar evidências de várias partidas e exceções.

- Feedback do usuário não altera fatos observados.

- Não rotular tilt, intenção ou personalidade como fato.

Critérios de aceite: Aceite: regra versionada, evidência e amostra; sem dados suficientes, 'ainda não identificado'.

## 7.4 Como eu deveria ter jogado?

Objetivo: Apresentar alternativas plausíveis para uma situação passada, explicando trade-offs.

- Reconstruir posição, jogadores vivos observáveis, bomba, arma e utilitários somente quando os dados correspondentes existirem e forem persistidos com cobertura suficiente; não presumir trajetória contínua.

- Apresentar opções como alternativas, não verdade contrafactual.

- Não afirmar que jogador conhecia posição inimiga se a informação não é observável.

- Separar opção tática de erro comprovado.

- Mostrar benefícios e riscos.

- Coach só responde mediante ação do usuário; sem chamada automática.

Critérios de aceite: Aceite: nenhuma afirmação de informação não observada; alternativas com evidências e incerteza.

## 7.5 Comparação entre versões de mim mesmo

Objetivo: Medir evolução pessoal em janelas comparáveis.

- Comparar períodos/antes-depois de treino, mostrando N e cobertura.

- Controlar mapa, lado, tipo de partida, role/rank quando disponível e versão da métrica.

- Mostrar variação absoluta/percentual e incerteza quando possível.

- Exigir amostra mínima por métrica.

- Permitir marcar início do plano de treino.

Critérios de aceite: Aceite: período, N, filtros e versão visíveis; métricas incompatíveis não comparadas; amostra insuficiente não gera afirmação de melhoria.

## 7.6 Mapa de oportunidades perdidas

Objetivo: Mostrar oportunidades espaciais, trades, utilitários ou rotações apenas quando reconstruíveis.

- Identificar aliado em confronto sem apoio, região sem presença, trade possível, rota alternativa ou utilitário disponível.

- Cada oportunidade é INFERRED com método/limitações.

- Não inferir visão, voz, intenção ou informação oculta.

- Filtros por mapa, round e tipo.

- Priorizar sem somar impacto fictício.

Critérios de aceite: Aceite: oportunidade rotulada como inferida, nunca como erro certo; evidência acessível.

## 7.7 AI Coach com evidências

Objetivo: Vincular explicações do Coach a fatos verificáveis.

- Evidence pack com ids, métricas, estados, coverage, método, partida/round/tick.

- Preservar contratos atuais; ampliar por versão compatível.

- Guard bloqueia números, benchmarks e comparações sem suporte.

- Coach diferencia observação, derivação, inferência e ausência.

- Manter OpenRouter/modelo atual e fallback OpenAI desligado.

- Sem envio automático ao provider; respeitar reserva, idempotência, rate limit e ação do usuário.

- Contexto mínimo, logs sanitizados e dados do próprio usuário.

Critérios de aceite: Aceite: afirmação quantitativa tem referência; testes adversariais bloqueiam números inventados; replay não cobra de novo.

## 7.8 Revisão mensal automática

Objetivo: Gerar resumo periódico determinístico, com IA opcional apenas mediante ação/configuração.

- Resumo de tendências, pontos fortes, melhorias e planos.

- Período, partidas, mapas, coverage e limitações visíveis.

- Texto IA opcional com custo explícito/controlado.

- Visualizar/exportar/descartar; retenção/exclusão respeitadas.

- Mês com pouca amostra gera relatório limitado.

- Sem e-mail/push nesta fase sem escopo aprovado.

Critérios de aceite: Aceite: execução idempotente; mês sem dados não cria relatório fictício; data de corte e partidas rastreáveis.

# 8. Dez entregas oficiais da Fase 4.2

## 4.2.1 Contratos e cobertura das métricas

Módulos: Módulo A e fundação transversal

Escopo: Inventariar schemas, campos brutos, adapter, provenance, coverage, nullability, unidades, amostras e versões. Criar catálogo de métricas e testes contratuais. Mapear MAPPED/DERIVED/IGNORED_APPROVED; unknown/unmapped bloqueiam conforme governança existente.

Entregáveis: Catálogo versionado, matriz de cobertura, testes de null, exemplos válidos/inválidos e documentação de origem.

Critério de saída: Toda métrica exposta tem status/unidade/denominador; ausência nunca vira zero; contratos antigos e H.3-E passam.

## 4.2.2 Heatmaps por mapa, lado e evento

Módulos: Módulo A — Inteligência visual do mapa

Escopo: Read model espacial por mapa, lado, evento, arma e período; transformação de coordenadas, regiões, bins e normalização. Eventos: mortes, kills e dano somente quando posição/autoria forem comprovadas; presença e utilitários somente se houver fonte temporal/espacial específica, permitida e validada. Posições esparsas de eventos de morte não sustentam presença, rota ou trajetória.

Entregáveis: API compacta, camada visual, filtros, legenda e drill-down round/tick.

Critério de saída: Posições válidas, T/CT correto, dados sem posição excluídos/rotulados, RLS testado e sem carregar todos ticks.

## 4.2.3 Diagnóstico de mortes e posicionamento

Módulos: Módulo B — Diagnóstico de mortes e decisões

Escopo: Contexto pré/pós-evento: posição, vivos, aliados, arma, utilitários, bomba, lado e janela temporal. Regras determinísticas separadas de inferências.

Entregáveis: Lista/filtros/ficha de morte, tags explicáveis e catálogo de regras/falsos positivos.

Critério de saída: Toda morte tem evidência; causa desconhecida permanece desconhecida; duelo perdido não vira automaticamente erro.

## 4.2.4 Replay 2D e navegação por eventos

Módulos: Módulos B/I — Replay e momentos

Escopo: Replay por round com posições, eventos, bomba e utilitários disponíveis; timeline, pause, velocidade, seleção de jogador e atalhos.

Entregáveis: Visualização 2D, carregamento por round, sincronização de tick e navegação cruzada.

Critério de saída: Ticks sincronizados, eventos sem duplicidade, isolamento por usuário, mobile e memória controlados.

## 4.2.5 Mira, confrontos e movimentação

Módulos: Módulo C — Aim e confrontos

Escopo: Formalizar duelos, opening, first bullet, spray, crosshair placement e counter-strafe. Implementar só métricas suportadas ou cuja extração seja aprovada.

Entregáveis: Painel por arma/distância/mapa/side, metodologia e coverage.

Critério de saída: Fórmula validada; sem precisão/latência inventada; não suportada fica NOT_MEASURED.

## 4.2.6 Inteligência de utilitários

Módulos: Módulo D — Utilitários

Escopo: Consolidar autoria, trajetória, destino, dano, cegamento, duração, assist, timing e impacto; corrigir proveniência antes de criar indicadores.

Entregáveis: Painel por tipo/mapa/side, trajetória quando disponível e ligação com replay.

Critério de saída: Autoria/assist comprovados; flash assist não é heurística apresentada como fato; ausência não é zero.

## 4.2.7 Economia e impacto por round

Módulos: Módulos E/F — Economia e round

Escopo: Inventariar economia/equipamento; calcular opening, trades, conversão de vantagem, retake, clutch, save e impacto com regras explícitas.

Entregáveis: Timeline, breakdown eco/force/full buy, clutch/trade com evidências.

Critério de saída: Compra e trade documentados; rounds incompletos rotulados; sem causalidade automática.

## 4.2.8 Evolução e consistência

Módulos: Módulo G e responsabilidade histórica/DNA do Módulo J.

Escopo: Agregações históricas por jogador, mapa, lado, arma e métrica; snapshots e comparação de janelas; Player DNA só READY e amostra mínima. Nesta entrega, o Módulo J cobre DNA, snapshots e evolução; não implementar comparativos profissionais/coortes.

Entregáveis: Tendências 5/10/20/50 quando possível; radar só com dimensões READY.

Critério de saída: N/período/coverage visíveis; mesma definição; snapshots idempotentes.

## 4.2.9 Treinamento adaptativo

Módulos: Módulo H — Training Engine

Escopo: Mapear diagnóstico a exercícios com dificuldade, duração, objetivo, evidência e métrica de reavaliação; planos 7/30/90 dias.

Entregáveis: Plano, tarefas, progresso, feedback, reavaliação e histórico.

Critério de saída: Recomendação ligada a diagnóstico real; usuário aceita/edita/dispensa; progresso exige nova amostra.

## 4.2.10 Biblioteca de momentos e comparativos Pro

Módulos: Módulos I/J e diferenciais Pro.

Escopo: Bookmarks round/tick, tags, notas, coleções e comparação Pro com datasets permitidos. Nesta entrega, o Módulo I recebe a biblioteca pessoal completa; o Módulo J cobre exclusivamente comparativos profissionais, coortes e benchmarks licenciados. Não duplicar snapshots/DNA já tratados em 4.2.8.

Entregáveis: Biblioteca privada, filtros, playlist de segmentos e benchmark se licenciado.

Critério de saída: Ownership/RLS; privado por padrão; dataset com licença/coorte; sem scraping.

# 9. Módulos funcionais A–J

## Módulo A — Inteligência visual do mapa

Heatmaps por mapa/lado/evento, densidade, filtros, drill-down e benchmark permitido.

## Módulo B — Diagnóstico de mortes e decisões

Death review, contexto do round, padrões recorrentes e incerteza.

## Módulo C — Mira, confrontos e movimentação

Duelos, opening, precisão, spray, crosshair e movimento apenas com dados suportados.

## Módulo D — Inteligência de utilitários

HE, molotov, smoke, flash, autoria, trajetória, timing, dano e assists.

## Módulo E — Economia e compra

Economia por round, equipamento, pistol/eco/force/full buy e preservação.

## Módulo F — Impacto e situações de round

Trades, vantagem numérica, retakes, clutches, opening e participação.

## Módulo G — Evolução e consistência

Histórico, tendências, comparação pessoal e evolução por dimensão.

## Módulo H — Treinamento adaptativo

Catálogo de exercícios, planos, metas e reavaliação.

## Módulo I — Biblioteca de momentos

Na 4.2.4, preparar a navegação/referências de replay por evento; na 4.2.10, entregar a biblioteca pessoal completa: bookmarks, highlights/lowlights, timeline, notas, tags e coleções. Não criar duas bibliotecas nem duplicar referências de eventos.

## Módulo J — Player DNA e comparativos Pro

Na 4.2.8, responsabilidade de Player DNA, snapshots, histórico e evolução. Na 4.2.10, responsabilidade distinta de comparativos Pro, coortes e benchmarks licenciados. É um único módulo com entregas faseadas; não duplicar entidades, pipelines ou telas.

# 10. Especificação de dados por domínio

## 10.1 Espacial

Coordenadas, mapa, tick, round, side por jogador/round, orientação, evento associado, entidade a que a posição pertence, fonte e qualidade. Transformação versionada por mapa. Bins agregados com contagem e coverage. Distinguir posições pontuais de eventos de amostras contínuas; não derivar presença/rota/tempo de exposição de posições esparsas nem guardar trajetórias completas desnecessárias.

## 10.2 Combate

Killer, victim, assister quando comprovado, arma, dano, hitgroup se suportado, tick, posição, round, estado de vivos e provenance. Diferenciar kill, assist, flash assist e trade.

## 10.3 Utilitários

Thrower, tipo, tick, origem, trajetória/destino quando disponível, detonação/efeito, dano, jogadores afetados, duração e atribuição. Ausência de efeito registrado não prova inutilidade.

## 10.4 Round/economia

Side do jogador por round, identidade da equipe, vencedor do round, motivo de encerramento, fase, bomba, vivos, dinheiro/equipamento se disponível, categoria de compra com regra explícita e estado especial. Não inferir economia por K/D nem confundir side com vencedor.

## 10.5 Histórico

metric_key, valor, status, método, versão, amostra, período, mapa, side, arma, partidas de origem e data. Snapshot reprodutível/versionado.

## 10.6 Treinamento

Plano, exercício, objetivo, status, prazo, evidência, feedback, métrica-alvo e reavaliação; evitar duplicar dados da partida.

## 10.7 Biblioteca

Owner, match/round/tick range, título, tags, nota, visibilidade, data e referências. Compartilhamento desligado por padrão.

# 11. Regras de cálculo e exemplos

## 11.1 Trade

Definir trade kill/death pela eliminação subsequente do adversário responsável dentro de janela temporal formalizada. A janela deve ser validada; registrar elegibilidade, round boundary, denominador e versão.

## 11.2 Opening

Ordenar primeiro kill por tick; tratar eventos simultâneos/duplicados sem desempate arbitrário. Opening win rate usa rounds elegíveis.

## 11.3 Vantagem numérica

Reconstruir vivos após cada kill e resultado. Descrever taxa de vitória em rounds com vantagem, não causalidade individual.

## 11.4 Heatmap

Definir posição (ator/vítima/origem/destino), tick, resolução, orientação, normalização, posições inválidas e denominador. Contagens devem usar o denominador compatível com a camada. Não usar exposição/tempo como denominador se essa dimensão não for medida e permitida; não apresentar densidade temporal com base em eventos esparsos.

## 11.5 Aim/movement

Formalizar first bullet, spray, crosshair e counter-strafe e demonstrar fonte de ângulo/velocidade/timing. Não inferir ângulo pela posição.

## 11.6 Utilitários

Flash assist e inimigos cegados só são números quando evento/autoria forem confiáveis. Dano de HE/molotov exige atribuição. Ausência não é zero.

## 11.7 Benchmark

Documentar fonte, licença, data, versão e coorte. Sem dataset permitido, benchmark fica UNAVAILABLE.

# 12. AI Coach: integração e guardrails

- Reutilizar reserva/idempotência e ownership antes do provider.

- Manter OpenRouter e modelo atual; fallback OpenAI desligado.

- Facts determinísticos no backend; LLM explica, não calcula estatística crítica a partir de texto livre.

- Evidence pack inclui metric_key, value, unit, status, sample_size, coverage, method/version e references.

- Guard bloqueia números sem suporte, benchmarks não disponíveis e causalidade indevida.

- Resposta declara dado insuficiente/não medido.

- Sem relatório/coach em background com custo não aprovado.

- Limitar contexto/tokens/frequência; logs sem API keys.

- Replay idempotente não gera cobrança adicional.

## 12.1 Exemplo de evidência

Envelope conceitual, sujeito aos schemas reais: metric_key='combat.opening_death_rate', value=null, unit='%', status='INSUFFICIENT_SAMPLE', sample_size=2, coverage='2/8 rounds elegíveis', method_version='opening-v1', evidence_refs=[match_id, round_id, tick]. O Coach deve declarar insuficiência, sem inventar percentual.

## 12.2 Resposta aceitável

“Há dois rounds elegíveis com morte inicial atribuída a você. A amostra ainda não permite concluir que existe um padrão. Podemos revisar esses rounds e reavaliar com mais partidas.”

## 12.3 Resposta proibida

“Você perde 70% dos rounds porque sempre morre primeiro” quando percentual, denominador ou causalidade não estão comprovados.

# 13. Testes e critérios de qualidade

| Tipo | Cobertura |

| --- | --- |

| Unitários | Cálculos, arredondamento, null, coordenadas, ticks, trade windows e regras. |

| Contratos | Schemas, versões, enums, campos obrigatórios/desconhecidos e provenance. |

| Integração | Parser→canonical→aggregates→API, ownership, RLS, jobs e cache. |

| E2E | Demo de teste autorizada, nickname, dashboard, heatmap, drill-down, replay e Coach. |

| Segurança | Cross-tenant, IDOR, RLS, rate limit, sanitização e biblioteca. |

| Performance | Payload, consulta, agregação, replay por round, mobile e concorrência. |

| Regressão | Dashboards, DNA, X-Ray, notificações, goals, achievements, Coach e parser gates. |

- Testar null, ausente, zero legítimo e não medido como casos distintos.

- Testar eventos duplicados/fora de ordem, mesmo tick, tick inválido e fronteira de round.

- Testar world/self kill, reconexão, pause/freeze e situações especiais.

- Testar flash sem autoria, cegamento sem assist e assist sem atribuição segura.

- Testar posição ausente/fora do mapa, mapa espelhado e amostra insuficiente.

- Testar demo parcial, nickname ambíguo e seleção correta.

- Testar usuário A tentando acessar match de B; deve ser negado.

- Testar jobs duplicados e requests concorrentes sem duplicar agregados.

- Testar versões de algoritmo sem reescrever histórico silenciosamente.

- Testar benchmark sem licença; deve ficar indisponível.

- Testar Coach tentando inventar número ou transformar NOT_MEASURED em zero.

- Testar conta com poucas partidas; sem radar/nota enganosa.

## 13.1 Release gates

- Required checks verdes no commit exato.

- Parser tests, contract-sensitive tests, H.3-E e attestation sem exceção.

- Migration aditiva, testada e com rollback.

- RLS/ownership e testes negativos aprovados.

- F553 e demais gates do projeto verdes.

- Deploy com SHA/build esperado, health/version e runtime identity confirmados.

- Smoke/E2E autorizado; sem reprocessar demos reais sem aprovação.

- Observabilidade e rollback prontos.

# 14. Observabilidade e suporte

- Duração/resultado de agregações, eventos elegíveis/ignorados e motivos.

- Versão do parser, adapter, schema e algoritmo em cada agregado.

- Latência, payload, cache, falhas de leitura e negações RLS esperadas.

- Custos/latência OpenRouter e bloqueios do response guard.

- Logs sanitizados, sem conteúdo sensível desnecessário.

- Alertas para build identity, migration, schema ou queda de coverage.

- Runbook para recomputação de dados de teste; produção exige aprovação.

# 15. Rollout, compatibilidade e rollback

1. Auditar baseline e registrar commit/schema/deploy/gates.

1. Implementar contratos/agregados aditivos sem ativar UI inicialmente.

1. Backfill só em sandbox/teste; produção exige autorização expressa.

1. Ativar feature flags por módulo/coorte.

1. Validar amostras e rounds manualmente.

1. Ativar para grupo de teste, monitorar qualidade/custo.

1. Ampliar após aceite funcional e de segurança.

- Desativar UI por feature flag sem apagar dados canônicos.

- Rollback de frontend não deve exigir remoção destrutiva de tabelas.

- Migrations aditivas; remoção exige depreciação.

- Manter compatibilidade durante migração.

- Não apagar histórico durante rollback sem aprovação.

- Rollback parser segue runbook de identidade/attestation; nunca repinar arbitrariamente.

# 16. Riscos e mitigação

| Risco | Impacto | Mitigação |

| --- | --- | --- |

| Posições incompletas | Heatmap enganoso. | 4.2.1 mede coverage; liberar só eventos válidos. |

| Parser sem ângulo/velocidade | Aim/counter-strafe inviável. | NOT_MEASURED; avaliar extração separada. |

| Atribuição errada de flash/kill | Estatística falsa. | Provenance e casos edge. |

| Dataset Pro indisponível | Benchmark bloqueado. | Lançar comparação pessoal primeiro. |

| Consulta pesada | App lento/custo. | Agregados, cache, paginação, replay por round. |

| Conflito com 4.1 | Regressão/merge conflict. | Esperar conclusão ou isolar arquivos. |

| Coach inventa conclusão | Perda de confiança. | Evidence pack, guard e testes adversariais. |

| Reprocessamento | Custo/duplicidade. | Proibir automático; autorização específica. |

| RLS insuficiente | Vazamento entre contas. | Testes cross-tenant em cada módulo. |

| Métrica incompatível | Comparação inválida. | Versionar e bloquear incompatibilidade. |

# 17. Instruções operacionais para Claude

1. Recuperar estado Fase 4.1: PRs, branches, migrations, deploy, pendências e arquivos.

1. Confirmar main e produção; capturar SHA, parser identity, schema e migration ledger.

1. Comparar baseline real com este documento e registrar divergências.

1. Mapear schemas/campos para matriz 4.2.1.

1. Propor PRs pequenos com arquivos, APIs, tabelas, dependências e rollback.

1. Solicitar autorização antes de código, banco, deploy ou reprocessamento.

1. Executar uma etapa por vez, gates verdes antes de avançar.

1. Após merge, verificar deploy e runtime identity; CI verde não prova produção.

1. Fazer E2E em conta/dados de teste autorizados.

1. Atualizar checkpoint com decisões, métricas suportadas, bloqueios e evidências.

## 17.1 Relatório obrigatório por etapa

| Campo | Evidência exigida |

| --- | --- |

| Etapa/PR | Número, branch, commit e escopo. |

| Baseline | SHA anterior, parser/worker, migrations e deploy. |

| Alterações | Arquivos, schemas, endpoints, UI e migrations. |

| Testes | Workflows/runs, resultados e evidências. |

| Dados | Métricas liberadas, status, coverage e limitações. |

| Segurança | RLS, ownership, rate limit, sanitização e testes. |

| Deploy | Ambiente, SHA publicado, identity e health. |

| Rollback | Procedimento de desativação/restauração. |

| Pendências | Bloqueios, decisões e próximos passos. |

# 18. Critérios globais de conclusão

- Dez entregas concluídas ou bloqueios formalmente justificados/aprovados.

- Módulos A–J implementados conforme cobertura real.

- Oito diferenciais disponíveis conforme dependências, com evidências e ressalvas.

- Toda métrica tem unidade, status, amostra, coverage e método.

- Heatmap/replay navegam até eventos de origem com sincronização validada.

- Diagnósticos não confundem derrota/correlação com erro/causalidade.

- Coach usa facts suportados, provider/custo controlados e não inventa números.

- Treino ligado a diagnóstico e evolução comprovada por nova amostra.

- Biblioteca privada por padrão, com ownership e exclusão corretos.

- CI, H.3-E, attestation, F553, segurança e runtime identity verdes.

- Produção validada por SHA/deploy e E2E autorizado.

# 19. Decisões pendentes antes de implementar

| Decisão | Recomendação inicial | Etapa |

| --- | --- | --- |

| Transformação coordenadas | Versionada por mapa e validada com pontos conhecidos. | 4.2.1/4.2.2 |

| Resolução heatmap | Grid agregado ajustável, validado por legibilidade/performance. | 4.2.2 |

| Janela trade | Formalizar e testar; sem assumir padrão universal. | 4.2.7 |

| Amostra mínima | Definir por métrica e variância; sem limiar global único. | 4.2.1/4.2.8 |

| Benchmark Pro | Não lançar sem dataset e licença confirmados. | 4.2.10 |

| Replay 2D | Verificar se dados persistidos bastam ou exige extração. | 4.2.4 |

| Clipes/exportação | Começar por bookmark round/tick; vídeo depende de fonte permitida. | 4.2.10 |

| Relatório mensal | Resumo determinístico; IA opcional por ação/configuração. | 4.2.8/4.2.9 |

| Feature flags | Reutilizar mecanismo já existente. | Pré-rollout |

| Backfill | Sandbox primeiro; produção exige autorização. | Cada etapa |

# 20. Glossário

| Termo | Definição |

| --- | --- |

| Demo | Arquivo de replay CS2. |

| Tick | Unidade temporal indexada na demo. |

| Heatmap | Distribuição espacial agregada de eventos. |

| Trade | Eliminação em resposta a morte aliada conforme janela documentada. |

| Opening | Primeiro abate/morte relevante conforme ordenação definida. |

| Coverage | Proporção de eventos/rounds elegíveis efetivamente medidos. |

| Provenance | Origem e método de obtenção da métrica. |

| Read model | Estrutura otimizada para consulta derivada dos fatos. |

| Cohort | Grupo comparável definido por critérios explícitos. |

| RLS | Row Level Security, controle de acesso por linha. |

# 21. Referências de mercado e pesquisa comunitária

Referências de categoria discutidas no levantamento: Leetify, SCOPE.GG, CS2d.app, Refrag, Noesis, CS Demo Manager, cs2demo.gg, JumpThrow.gg, CStrike.gg e MapSense. São inspirações de produto, não evidência de que todo recurso esteja disponível, seja equivalente ou possa ser copiado.

- Leetify — https://leetify.com/

- SCOPE.GG — https://scope.gg/

- CS2d.app — https://cs2d.app/

- Refrag — https://refrag.gg/

- Noesis — https://noesis.gg/

- CS Demo Manager — https://github.com/akiver/CS-Demo-Manager

- CS2Demo — https://cs2demo.gg/pt/

- JumpThrow — https://jumpthrow.gg/pt

- CStrike — https://cstrike.gg/

- MapSense — https://mapsense.gg/

As discussões comunitárias analisadas são sinais qualitativos sobre revisão de demos, posicionamento, trades, utilitários, rotinas de treino, navegação por kills/deaths e privacidade; não são pesquisa estatística representativa. Recomenda-se validar hipóteses com usuários do CS2 PRO.

# 22. Registro de versão e aprovação

| Versão | Data | Descrição | Status |

| --- | --- | --- | --- |

| 1.0 | 05/11/2026 | Especificação mestre: 10 entregas, Módulos A–J, oito diferenciais, requisitos, testes e rollout. | Proposta inicial |
| 1.1 | 12/11/2026 | Atualização do baseline R5.8.24, posições pontuais de morte, limites L02/L03, semântica CT/T, verificação dos PRs #263/#264, fundação DNA/Score e divisão faseada dos Módulos I/J; alinhamento da autorização operacional. | Revisada; requer auditoria read-only antes da execução |

Antes de executar: confirmar baseline da Fase 4.1, validar cobertura real, revisar impactos no parser/banco e aprovar sequência de PRs e qualquer alteração em produção.

FIM DO DOCUMENTO. Nenhuma alteração técnica foi executada durante a elaboração.

# PARTE II — GUIA EXECUTÁVEL DETALHADO PARA O CLAUDE

Esta parte complementa e operacionaliza a especificação anterior. Foi escrita para reduzir ambiguidades de implementação. Ela não substitui a inspeção do repositório, dos schemas reais, dos contratos e dos dados de produção. Sempre que o documento disser 'considerar', o Claude deve primeiro localizar a estrutura existente e adaptar-se a ela, em vez de criar uma segunda arquitetura paralela.

# 23. Protocolo obrigatório antes de tocar em qualquer etapa

A Fase 4.2 não começa com código. Começa com descoberta e registro do estado real. O objetivo é impedir que uma implementação nova sobrescreva trabalho recente, duplique funcionalidades, crie tabelas desnecessárias ou quebre o que já está funcionando.

1. Esperar a conclusão da Fase 4.1 pelo Claude, ou receber uma delimitação explícita e documentada das pendências e dos arquivos que não podem ser tocados.

1. Fazer auditoria read-only da main e do ambiente publicado: SHA da main, PRs merged/open, workflows, deploys, migrations aplicadas, parser/worker ativo, runtime identity e gates.

1. Inspecionar a estrutura real do frontend, APIs/Edge Functions, tabelas, views, RPCs, jobs, policies RLS, contratos TypeScript/Python e testes. Não presumir nomes de tabelas ou endpoints deste documento.

1. Pesquisar no código onde cada métrica atual é produzida, transformada, persistida e exibida. Seguir o dado da origem até a UI.

1. Montar uma matriz 'já existe / existe parcialmente / não existe / não é possível medir / precisa de prova' para cada requisito.

1. Verificar especificamente PRs #256–#264 e seus SHAs, checks, merges e deploys. Confirmar se #263/#264 estão integrados; não duplicar o catálogo/metodologia da fundação, a semântica CT/T ou os resultados por round já implementados.

1. Executar os testes existentes sem alterar código e registrar o baseline. Se algum teste já falhar, registrar como preexistente e não mascarar.

1. Propor um plano de PRs pequenos, cada um com objetivo, arquivos previstos, migrations, riscos, testes, rollback e critérios de saída.

1. Parar e pedir aprovação antes de mudanças em produção, migrations produtivas, secrets, deploy, reprocessamento de demos reais ou ampliação de escopo.

## 23.1 Proibições absolutas

- Não substituir o parser atual, não remover/adulterar o contrato R5.8.24 e não modificar a identidade do worker ou H.3-E para fazer testes passarem.

- Não alterar provider/modelo do AI Coach; manter OpenRouter com openai/gpt-oss-20b e fallback OpenAI desligado.

- Não remover, contornar ou enfraquecer RLS, ownership, autenticação, rate limits, idempotência, reservas de request, response guard ou gates.

- Não converter null, ausente, não observado, não medido, insuficiente ou indisponível em zero, falso, nota mínima ou inferência silenciosa.

- Não executar reprocessamento/backfill em demos reais sem autorização explícita, estimativa de custo e plano idempotente.

- Não criar dependência funcional com Tutor LMS: ele permanece externo e acessado por links.

- Não copiar dados de plataformas concorrentes, nem coletar demos profissionais sem autorização/licença/termos adequados.

- Merge, migrations e deploys só podem ocorrer quando expressamente cobertos pela autorização operacional do prompt de execução ativo e após todos os gates; esta especificação, isoladamente, não concede autorização.
- Alterações de secrets, billing, operações destrutivas/irreversíveis e reprocessamento de demos reais exigem autorização específica.

- Não enviar automaticamente prompts/instruções nem alterações pela interface do Lovable. O usuário decide quando autoriza qualquer interação com o agente/interface Lovable; o acesso técnico autorizado ao banco gerenciado, quando previsto no prompt de execução, não equivale a autorização para operar o agente Lovable.

## 23.2 Modelo de checkpoint por etapa

| Checkpoint | Conteúdo obrigatório |

| --- | --- |

| C0 — Entrada | Fase 4.1 status, SHA main, deploy, parser identity, migrations, gates, testes baseline. |

| C1 — Descoberta | Arquivos/tabelas/endpoints existentes, campos disponíveis, lacunas, duplicidades e riscos. |

| C2 — Plano | PRs propostos, escopo, dependências, migrações, custos, rollout e rollback. |

| C3 — Implementação | Commits/PRs, alterações por arquivo, contratos, migrations e decisões. |

| C4 — Validação | Testes unitários/contratuais/E2E, segurança, performance, resultados e evidências. |

| C5 — Release | SHA, ambiente, deploy, runtime identity, smoke test autorizado e rollback pronto. |

| C6 — Fechamento | Métricas liberadas/bloqueadas, dívida técnica, limitações e próximo passo. |

Uma etapa não pode ser marcada como concluída apenas porque o código compila ou a UI renderiza. É necessário provar o dado, o cálculo, o isolamento por usuário, a experiência e o comportamento de falha.

# 24. Execução detalhada — 4.2.1 Contratos e cobertura das métricas

## Objetivo técnico e resultado esperado

Criar a fundação semântica de todas as métricas da Fase 4.2. Esta etapa responde: quais dados o CS2 PRO realmente possui, como foram obtidos, quão completos são e quais conclusões podem ser mostradas com segurança? Nenhuma funcionalidade visual deve antecipar essa resposta.

## Dor do jogador que esta entrega resolve

O jogador hoje pode ver um zero sem saber se realmente teve zero eventos ou se a demo/parser não mediu aquela informação. A etapa elimina essa ambiguidade.

## Sequência de implementação obrigatória

1. Inventariar todas as métricas atuais em Dashboard, X-Ray, Player DNA, AI Coach, notificações e relatórios. Para cada uma, identificar produtor, transformação, tabela/campo, endpoint, consumidor e testes.

1. Inspecionar o contrato real do parser e o adapter de evidências. Classificar cada campo como mapeado, derivado aprovado, ignorado aprovado, desconhecido ou não suportado. Campo desconhecido não pode ser consumido silenciosamente.

1. Definir catálogo central de métricas: chave estável, descrição, unidade, fórmula, origem, status permitido, amostra mínima, coverage, dimensões de segmentação e versão.

1. Definir envelopes tipados compatíveis com os contratos atuais. Preferir extensão aditiva e manter adaptadores de compatibilidade; não renomear campos consumidos sem plano de migração.

1. Definir como se calcula coverage. Exemplo conceitual: rounds elegíveis com dado válido / rounds elegíveis totais. Não misturar coverage de evento com quantidade de partidas.

1. Adicionar testes de contrato para null, zero legítimo, ausência de campo, status não medido, campo desconhecido, denominador zero, duplicidade e mudança de versão.

1. Produzir matriz de liberação: SUPPORTED, PARTIAL, NOT_MEASURED, INSUFFICIENT_SAMPLE, UNAVAILABLE ou bloqueado por falta de proveniência. Usar os estados já existentes se o projeto tiver enum equivalente.

1. Documentar todas as divergências encontradas e submeter decisões de schema antes de criar migrations.

## Comportamento esperado na interface

Nesta etapa, a UI recebe estados coerentes. Componentes devem distinguir valor medido, amostra insuficiente, não medido e indisponível. Um zero real deve continuar sendo mostrado como zero, mas acompanhado de unidade e amostra. Não medido deve ser texto/estado, nunca um gráfico com barra zero.

## Critérios objetivos de aceite

- Catálogo cobre 100% das métricas que a UI atual já apresenta e as novas métricas propostas.

- Cada métrica tem unidade, origem, status, fórmula/método, denominador, amostra e versão ou justificativa de ausência.

- Testes provam que null e NOT_MEASURED não viram zero em API, frontend, exportação e prompt do Coach.

- Contratos atuais continuam compatíveis; nenhum campo desconhecido é aceito silenciosamente.

- CI, parser tests, H.3-E, attestation e gates preexistentes continuam verdes.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 25. Execução detalhada — 4.2.2 Heatmaps por mapa, lado e evento

## Objetivo técnico e resultado esperado

Construir uma leitura espacial confiável da demo. O heatmap deve responder onde eventos acontecem e permitir chegar ao round/tick original. Ele não é apenas uma imagem decorativa.

## Dor do jogador que esta entrega resolve

O jogador quer identificar regiões onde morre, consegue eliminações, recebe/causa dano, permanece e utiliza granadas, separando T e CT.

## Sequência de implementação obrigatória

1. Confirmar no parser quais coordenadas existem, em que unidade, para quais entidades e em quais ticks. Verificar se a posição é do atacante, vítima, jogador observado, granada ou destino do efeito. Para R5.8.24, verificar especificamente `position` e `victim_position`; a presença no output do parser não basta: provar parser → bridge → transporte → persistência → API/read model, com autoria, tick, round, mapa, cobertura e ausência de duplicidade.

1. Localizar metadados de mapa e qualquer transformação já usada no produto. Criar ou reutilizar transformação versionada por mapa; validar orientação, escala, espelhamento e pontos de referência.

1. Definir semântica de cada camada. Ex.: death heatmap usa posição da vítima no tick da morte; kill heatmap usa posição do killer ou local do evento, explicitamente nomeado. Não misturar semânticas.

1. Definir bins espaciais, resolução e normalização. Contagem bruta pode favorecer partidas mais longas; quando apropriado, mostrar por round, por minuto elegível ou densidade normalizada.

1. Construir agregação/read model idempotente, com origem de cada bin e contagem de eventos elegíveis/descartados. Não enviar centenas de milhares de ticks ao navegador.

1. Implementar API filtrada por match/map/side/event/weapon/time. Validar owner no servidor e limitar payload, range e paginação.

1. Construir mapa com camadas alternáveis, escala/legenda, opacidade, filtros T/CT, seleção de partida e drill-down. A seleção de célula deve abrir lista de eventos/rounds.

1. Implementar estados sem dados, cobertura parcial, mapa não suportado, posição inválida e erro de carregamento.

1. Comparar visualmente amostras conhecidas com replay/manual review antes de liberar.

1. Se a única fonte comprovada forem posições pontuais de mortes, limitar o heatmap às camadas semanticamente sustentadas por esses eventos. Marcar presença, rota, trajetória, ocupação e exposição como NOT_MEASURED/UNAVAILABLE; não simular esses dados.

## Comportamento esperado na interface

O usuário escolhe partida ou período, mapa, lado e camada. A legenda explica o que o ponto/célula representa. Clicar numa região mostra eventos; clicar no evento abre replay/ficha de morte. Heatmaps de kills, deaths e presença devem ser visualmente distintos e não compartilhar semântica.

## Critérios objetivos de aceite

- Transformação validada em mapas suportados e versionada.

- Cada camada declara posição usada, entidade, tick, evento, unidade, normalização e coverage.
- Posições pontuais de morte não são aceitas como prova de presença contínua, rota, trajetória ou exposição temporal.

- Eventos sem posição não são plotados como (0,0); aparecem na cobertura/diagnóstico de descarte.

- Filtros T/CT e evento retornam conjuntos coerentes; RLS bloqueia outro owner.

- Payload é agregado e limitado; UI continua responsiva em partida grande.

- Drill-down abre o round/tick correto.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 26. Execução detalhada — 4.2.3 Diagnóstico de mortes e posicionamento

## Objetivo técnico e resultado esperado

Transformar cada morte em uma revisão contextual, sem presumir que toda morte foi erro. A meta é ajudar o jogador a compreender circunstâncias e padrões repetidos.

## Dor do jogador que esta entrega resolve

Em vez de olhar apenas K/D, o jogador quer saber por que morreu: exposição, falta de trade, isolamento, re-peek, timing, rotação ou simplesmente um duelo perdido.

## Sequência de implementação obrigatória

1. Definir o contexto temporal da morte: janela anterior e posterior em ticks/segundos, estado do round, bomba, side, jogadores vivos, arma, posição e eventos próximos.

1. Identificar quais fatos são observados e quais exigem inferência. Ex.: posição e killer podem ser observados; 'isolado' pode exigir regra espacial/temporal; 'deveria recuar' é recomendação.

1. Criar catálogo versionado de classificadores com nome, regra, dados exigidos, threshold, falsos positivos, severidade e status de proveniência.

1. Começar por classificações de alta confiança e simples de explicar. Não implementar todos os rótulos se a demo não sustentar.

1. Para cada morte, guardar referência à origem e resultado da regra, inclusive 'sem classificação' e motivo.

1. Agregar padrões por partida e período, exigindo recorrência e amostra mínima antes de afirmar hábito.

1. Exibir ficha com timeline, mapa, participantes, contexto e explicação da regra. Permitir feedback do jogador sem modificar evento bruto.

1. Testar mortes especiais: world/self kill, pause/freeze, reconexão, tick boundary, trade imediato e dados incompletos.

## Comportamento esperado na interface

A lista de mortes oferece filtros e resumo. A ficha apresenta fatos primeiro, depois análise inferida em seção separada. Rótulos devem usar linguagem cuidadosa: 'possível exposição', 'sem trade observado na janela', 'causa não determinada'.

## Critérios objetivos de aceite

- Toda classificação tem regra e versão rastreável.

- Death review não chama automaticamente todo duelo perdido de erro.

- Contexto inclui amostra e dados ausentes; causa desconhecida permanece desconhecida.

- Feedback do usuário é armazenado separadamente dos fatos.

- Casos especiais não geram falsos positivos silenciosos.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 27. Execução detalhada — 4.2.4 Replay 2D e navegação por eventos

## Objetivo técnico e resultado esperado

Oferecer uma representação tática 2D de um round, sincronizada com ticks e eventos. O replay deve permitir investigar uma ocorrência, não simular informação que a demo não contém.

## Dor do jogador que esta entrega resolve

O jogador quer clicar em uma morte, kill, flash ou momento-chave e entender a sequência sem procurar manualmente na demo inteira.

## Sequência de implementação obrigatória

1. Auditar os dados persistidos para determinar se há posições por jogador/tick, eventos, bomba, granadas e metadados de mapa. Definir lacunas antes de qualquer alteração no parser.

1. Definir contrato de replay por round: mapa, tick inicial/final, participantes, amostras de posição, eventos e status de cada tipo de dado.

1. Definir estratégia de amostragem temporal e interpolação. Interpolar apenas para visualização entre pontos válidos; não criar evento ou posição factual. Marcar lacunas.

1. Implementar carregamento por round/janela e paginação temporal. Evitar carregar demo inteira ou todos os ticks na primeira renderização.

1. Construir timeline de kills/deaths/damage/utilities/objective com sincronização ao tick. Eventos devem ser ordenados deterministicamente e deduplicados.

1. Implementar controles: play/pause, avanço, velocidade, seleção de jogador, camada de eventos e pulo para evento.

1. Integrar links do heatmap e death review ao tick correspondente.

1. Validar sincronização contra amostras de demo de teste e replay original. Em caso de tick ausente, exibir lacuna em vez de inventar movimento.

## Comportamento esperado na interface

O mapa ocupa a área principal; timeline abaixo; lista de eventos lateral ou inferior. O clique em evento reposiciona o cursor temporal. Mobile pode usar layout empilhado. O jogador deve sempre saber qual round e tick está vendo.

## Critérios objetivos de aceite

- Ticks e eventos sincronizam em casos de teste.

- Não há jogadores teleportando por interpolação através de lacunas sem indicação.

- Eventos não duplicam e respeitam ordenação.

- Carregamento é por round/janela e respeita ownership.

- Heatmap/death review abre o evento correto.

- Se dados insuficientes, replay informa claramente o que não pode mostrar.
- Replay contínuo de jogadores só é habilitado se houver amostras temporais persistidas e permitidas; posições pontuais em eventos não podem ser interpoladas como trajetória factual.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 28. Execução detalhada — 4.2.5 Mira, confrontos e movimentação

## Objetivo técnico e resultado esperado

Oferecer métricas úteis de aim e movement sem prometer medições que a demo não permite. A etapa começa com viabilidade, não com gráficos.

## Dor do jogador que esta entrega resolve

O jogador quer saber se perde duelos por posicionamento de mira, primeiro tiro, spray, distância, arma ou movimento.

## Sequência de implementação obrigatória

1. Inventariar campos reais disponíveis: shots, impacts, weapon_fire, player_hurt, angles/view direction, velocity, buttons, tick, recoil e hitgroup. Registrar disponibilidade por parser build.

1. Para cada métrica proposta, escrever definição matemática, população elegível, exclusões, unidade, amostra e exemplos de cálculo antes de codificar.

1. Separar duelos observados de 'aim quality'. Um duelo pode ser identificado por sequência de dano/kill; qualidade de mira requer dados adicionais.

1. First bullet accuracy: formalizar o que conta como primeira bala, janela de aquisição, tiro válido, hit e exclusões de spray/reload. Se dados não sustentarem, deixar NOT_MEASURED.

1. Spray: definir tiros elegíveis, padrão/arma, sequência e métrica; não comparar armas ou distâncias sem normalização.

1. Crosshair placement: só calcular se houver ângulo de visão e posição do adversário com sincronização adequada; não usar posição do jogador como substituto de ângulo.

1. Counter-strafe: exige velocidade/direção antes do disparo e regra de estabilização. Não estimar a partir de kills.

1. Construir painel de duelos por arma, distância, mapa, side e situação, com N e coverage. Separar opening duels e duelos gerais.

1. Validar métricas contra amostras revisadas manualmente e comparar versões do algoritmo.

## Comportamento esperado na interface

Cada card deve explicar 'o que mede', 'como calcula', 'quantos eventos foram elegíveis' e 'o que não foi medido'. O usuário pode abrir duelos individuais. Métricas não suportadas não aparecem como zero nem recebem score.

## Critérios objetivos de aceite

- Cada métrica possui definição, fórmula e testes antes de ser exibida.

- Campos de origem existem e têm sincronização comprovada.

- Sem ângulo/velocidade confiáveis, crosshair/counter-strafe permanecem não medidos.

- Comparações controlam arma, distância e situação quando necessário.

- Não há ranking ou score de aim sem validação.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 29. Execução detalhada — 4.2.6 Inteligência de utilitários

## Objetivo técnico e resultado esperado

Explicar uso e resultado dos utilitários com autoria e efeitos confiáveis. O módulo deve corrigir lacunas de proveniência antes de criar indicadores de eficiência.

## Dor do jogador que esta entrega resolve

O jogador quer saber se usa flashes, smokes, HE e molotov no momento certo, se ajuda o time e se desperdiça recursos.

## Sequência de implementação obrigatória

1. Inventariar eventos atuais por tipo de granada e a cadeia de autoria: thrower, projectile, detonation, damage, blind, assist. Mapear campos sem autor ou com atribuição ambígua.

1. Separar métricas de uso (lançada), efeito observado (dano/cegamento), resultado contextual (entrada/retake facilitado) e inferência (utilitário desperdiçado).

1. Definir flash enemies affected apenas quando evento de cegamento e jogador afetado forem rastreáveis. Definir flash assist conforme método já validado no projeto; não substituir por heurística não comprovada.

1. Para HE/molotov, atribuir dano apenas quando a origem do dano estiver comprovada. Smokes podem ter cobertura/posição somente se trajetória/destino e duração estiverem disponíveis.

1. Definir timing em relação a evento de equipe: entrada, contato, plant, retake; classificar como DERIVED/INFERRED conforme regra.

1. Definir desperdício com cautela: falta de dano/flash não prova desperdício. Exigir contexto e rotular inferência.

1. Construir painéis por granada/mapa/side, lista de eventos e acesso ao replay.

1. Adicionar casos edge: autoria ausente, world damage, suicídio, flash team/self, efeito tardio, round pause e granada sem detonation.

## Comportamento esperado na interface

Separar 'lançadas', 'efeitos observados' e 'impacto estimado'. Mostrar explicitamente quando inimigos cegados/assists não são medidos. Exibir trajetória só quando houver dados suficientes.

## Critérios objetivos de aceite

- Autoria é validada antes de contar como lançamento por jogador.

- Flash assists seguem contrato/metodologia existente e testes de atribuição.

- Ausência de evento não vira zero quando o campo não é medido.

- HE/molotov damage têm atribuição confiável.

- Desperdício é inferência contextual, não fato automático.

- Casos edge cobertos.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 30. Execução detalhada — 4.2.7 Economia e impacto por round

## Objetivo técnico e resultado esperado

Adicionar contexto de compra e impacto tático, com regras explícitas para rounds, trades, clutches, retakes e conversão de vantagem.

## Dor do jogador que esta entrega resolve

O jogador quer entender seu desempenho em pistol, eco, force e full buy e como contribui para vencer rounds, não apenas acumular kills.

## Sequência de implementação obrigatória

1. Auditar disponibilidade de dinheiro, equipamento, armas, armor, kits, utilitários, side, round result e estado de bomba por tick/round.

1. Definir categorias econômicas com regra versionada e dados suficientes. Se dinheiro/equipamento não existem, não classificar compra a partir de K/D ou resultado.

1. Definir trade kill/death com janela temporal, relação killer/vítima e exclusões em boundary. A janela deve ser testada e documentada.

1. Definir opening event e handling de eventos simultâneos. Separar opening individual e da equipe.

1. Definir conversão de vantagem numérica reconstruindo vivos após eventos; separar resultado da equipe do impacto individual.

1. Definir clutch elegível: jogador vivo contra N adversários, situação objetiva e resultado; tratar 1v1, 1v2 etc. separadamente.

1. Definir retake por estado da bomba, lado e sequência; se estado de bomba não estiver disponível, não classificar.

1. Construir timeline por round e filtros de buy type, mapa, side, weapon e situação.

1. Validar casos com rounds incompletos, overtime, surrender, disconnect, world kill e múltiplos eventos no mesmo tick.

## Comportamento esperado na interface

Mostrar o round como unidade central: buy context, eventos-chave, vantagem numérica, trade, clutch/retake e resultado. Cada card mostra fórmula e rounds elegíveis. Não apresentar compra 'errada' apenas porque perdeu.

## Critérios objetivos de aceite

- Economia só é mostrada com estado financeiro/equipamento confiável.

- Trade/opening/clutch/retake têm definições versionadas e testes.

- Vantagem numérica é atribuída à equipe e não indevidamente a um jogador.

- Rounds incompletos/ambíguos são excluídos ou rotulados.

- Drill-down permite auditar os eventos.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 31. Execução detalhada — 4.2.8 Evolução e consistência

## Objetivo técnico e resultado esperado

Construir comparações históricas justas e transparentes. O sistema deve medir evolução do próprio jogador sem confundir variação aleatória com melhoria real.

## Dor do jogador que esta entrega resolve

O jogador quer saber se melhorou nos últimos jogos, quais mapas/lados são consistentes e se o treino produziu resultado.

## Sequência de implementação obrigatória

1. Inventariar snapshots e agregações existentes, inclusive Player DNA. Reutilizar os mecanismos atuais se forem corretos e não duplicar pipelines.

1. Definir chave de compatibilidade por métrica: metric_key, method_version, unidade, parser/schema version e dimensões de segmentação.

1. Definir janelas de 5/10/20/50 partidas apenas quando houver quantidade elegível; exibir quantidade real e não preencher janela incompleta.

1. Definir comparabilidade por mapa, side, arma, role e tipo de partida quando disponíveis. Exibir filtros e limitações.

1. Definir baseline pessoal e período de comparação; não usar média profissional como substituto.

1. Calcular variação absoluta e relativa somente quando denominador e amostra permitem; não declarar tendência estatística sem método.

1. Player DNA permanece com status READY/INSUFFICIENT_SAMPLE conforme regra existente; não exibir radar parcial como completo. A versão DNA v2 e CS2 PRO Score v1 são métodos heurísticos internos: não apresentá-los como escala profissional calibrada, percentil populacional ou benchmark competitivo sem validação independente.

1. Snapshots são idempotentes e vinculados a versão; alterações no algoritmo geram nova versão, sem reescrever silenciosamente.

1. Conectar planos de treino à data inicial e janela posterior para avaliação.

## Comportamento esperado na interface

Exibir gráfico temporal com pontos por partida, média móvel somente se definida, filtros e amostra. Mostrar 'dados insuficientes' quando necessário. Comparações pré/pós treino devem mostrar período, N, mapa e side.

## Critérios objetivos de aceite

- Só compara métricas com mesma definição/versão ou transformação documentada.

- Janelas mostram N real e não inventam partidas.

- DNA/radar só READY e com amostra exigida.

- Snapshot idempotente e rastreável.

- Melhoria só é afirmada com evidência e ressalvas.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 32. Execução detalhada — 4.2.9 Treinamento adaptativo

## Objetivo técnico e resultado esperado

Converter diagnósticos em ações concretas e mensuráveis. O sistema recomenda exercícios, mas o jogador mantém controle sobre o plano.

## Dor do jogador que esta entrega resolve

O jogador quer saber o que praticar hoje, por quanto tempo e como verificar se está melhorando.

## Sequência de implementação obrigatória

1. Criar catálogo de exercícios com id, habilidade-alvo, descrição, duração, nível, frequência, equipamento/modo necessário, objetivo e métrica de reavaliação.

1. Mapear cada diagnóstico a um ou mais exercícios aprovados. Ex.: counter-strafe apenas se métrica suportada; falta de trade pode sugerir treino de posicionamento em dupla, não aim map.

1. Definir regra de recomendação: prioridade, frequência, amostra e recência. Não gerar plano baseado em uma única morte isolada.

1. Gerar plano inicial de 7 dias; permitir expansão para 30/90 dias sem criar obrigação artificial.

1. Permitir aceitar, editar, pausar, concluir e dispensar. Guardar feedback e motivo.

1. Definir progresso: tarefa concluída é atividade declarada; melhoria de habilidade só é confirmada por novas partidas e métricas comparáveis.

1. Conectar metas/notifications existentes sem duplicar sistema. Reutilizar tabelas e componentes quando apropriado.

1. Implementar lembretes in-app apenas se o sistema atual suportar e se preferências permitirem; sem email/push nesta etapa.

1. Testar plano sem diagnóstico, usuário sem partidas, tarefa repetida, plano expirado e usuário que pausa.

## Comportamento esperado na interface

Plano apresenta objetivo, razão da recomendação, evidência que originou, exercício, duração, frequência e como medir sucesso. O usuário controla o plano e pode rejeitar recomendações.

## Critérios objetivos de aceite

- Todo exercício tem habilidade e métrica-alvo claras.

- Recomendação aponta para evidência e regra.

- Usuário controla status e pode dispensar.

- Conclusão de exercício não é confundida com melhora de performance.

- Reavaliação usa partidas novas e comparáveis.

- Não cria canal externo nem integração não aprovada.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 33. Execução detalhada — 4.2.10 Biblioteca de momentos e comparativos Pro

## Objetivo técnico e resultado esperado

Dar ao jogador uma biblioteca pessoal para rever momentos importantes e, quando houver base legal e técnica, comparar padrões com jogadores profissionais.

## Dor do jogador que esta entrega resolve

O jogador quer salvar uma morte, clutch, round ou jogada, adicionar nota, rever depois e eventualmente comparar com referências profissionais.

## Sequência de implementação obrigatória

1. Começar por bookmarks que referenciam match_id, round_id, tick inicial/final e owner; evitar duplicar demo ou vídeo.

1. Definir tipos: kill, death, clutch, utility, opening, round swing, coach highlight e manual bookmark. Tipos automáticos exigem evidência.

1. Implementar título, nota, tags, coleção, data e visibilidade privada por padrão.

1. Permitir abrir bookmark diretamente no replay 2D e na ficha de diagnóstico.

1. Implementar playlists/coleções com paginação e filtros. Garantir que cada referência continue acessível e pertencente ao usuário.

1. Definir política de exclusão: ao apagar partida/conta, bookmark deve ser removido ou marcado indisponível conforme política; nunca reter dados pessoais órfãos.

1. Para comparativos Pro, fazer inventário de fontes e licenças antes de obter qualquer dado. Documentar origem, permissão, versão, período e coorte.

1. Definir coortes equivalentes por mapa, lado, role, fase, arma e cenário; comparar distribuições, não um único ponto ideal.

1. Se fonte/licença/coorte não estiver disponível, lançar biblioteca pessoal e deixar comparativo profissional explicitamente indisponível.

1. Compartilhamento/exportação fica fora do default; exige controles e aprovação de escopo.

## Comportamento esperado na interface

Biblioteca lista momentos com mapa, partida, round, tipo e nota. Abrir item restaura replay no tick. Comparativo Pro só aparece quando dataset e coorte válidos; caso contrário, informar indisponibilidade sem placeholder enganoso.

## Critérios objetivos de aceite

- Bookmark é referência, não cópia desnecessária de demo.

- RLS/ownership impede leitura cruzada.

- Exclusão de partida/conta trata bookmarks corretamente.

- Replay abre no tick salvo.

- Benchmark tem fonte/licença/coorte e amostra visíveis ou permanece indisponível.

- Compartilhamento privado por padrão.

## Evidências obrigatórias no PR

- Descrição do que já existia e o que foi acrescentado, com links para arquivos e contratos.

- Antes/depois da cobertura das métricas, incluindo campos ainda não suportados.

- Testes executados e resultados dos workflows no commit exato.

- Evidência de ownership/RLS e testes negativos entre usuários.

- Screenshots ou gravação de teste com dados sintéticos/autorizados e estados loading/empty/error/partial.

- Plano de rollout, feature flag, migration e rollback, ou justificativa de que não houve mudança de schema.

## Dependências e bloqueios

Se a fonte de dados, contrato, licença, amostra ou método não existir, não improvisar. Registrar o bloqueio, manter a funcionalidade desativada ou em estado indisponível e propor uma decisão técnica separada. Não expandir parser nem reprocessar demos reais sem autorização.

# 34. Matriz de rastreabilidade — módulos, diferenciais e etapas

| Módulo | Etapas principais | Diferenciais atendidos |

| --- | --- | --- |

| A — Inteligência visual do mapa | 4.2.1, 4.2.2, 4.2.10 | Posicionamento versus Pro; Mapa de oportunidades perdidas |

| B — Diagnóstico de mortes e decisões | 4.2.3, 4.2.4, 4.2.7 | Onde estou perdendo rounds; Meu pior hábito; Como eu deveria ter jogado? |

| C — Mira, confrontos e movimentação | 4.2.1, 4.2.5, 4.2.8 | Meu pior hábito; Comparação entre versões de mim mesmo |

| D — Inteligência de utilitários | 4.2.1, 4.2.6, 4.2.7 | Onde estou perdendo rounds; Mapa de oportunidades perdidas |

| E — Economia e compra | 4.2.1, 4.2.7, 4.2.8 | Onde estou perdendo rounds; Comparação entre versões de mim mesmo |

| F — Impacto e situações de round | 4.2.3, 4.2.7, 4.2.8 | Onde estou perdendo rounds; Meu pior hábito |

| G — Evolução e consistência | 4.2.8 | Comparação entre versões de mim mesmo; Revisão mensal automática |

| H — Treinamento adaptativo | 4.2.9 | Meu pior hábito; Como eu deveria ter jogado?; Comparação entre versões |

| I — Biblioteca de momentos | 4.2.4 (preparação/navegação por eventos), 4.2.10 (biblioteca pessoal completa) | AI Coach com evidências; Como eu deveria ter jogado? |

| J — Player DNA e comparativos Pro | 4.2.8 (DNA, snapshots e evolução), 4.2.10 (comparativos Pro/coortes licenciadas) | Posicionamento versus Pro; Revisão mensal automática |

# 35. Contratos de API e persistência — orientação sem impor schema

Os nomes a seguir são categorias conceituais, não nomes obrigatórios de tabelas/rotas. Claude deve primeiro procurar entidades equivalentes existentes e reutilizá-las. Só propor novo schema se houver lacuna demonstrada.

| Categoria lógica | Campos/conceitos necessários | Regras |

| --- | --- | --- |

| Metric catalog | key, description, unit, method, version, support status, sample rules | Fonte única para semântica; evitar duplicar enums. |

| Metric aggregate | owner/player, match scope, dimensions, value/null, status, sample, coverage, version | RLS/ownership; idempotência; origem rastreável. |

| Spatial aggregate | map, transform version, bin, side, event type, count, eligible count, coverage | Não armazenar coordenada inválida como bin zero. |

| Event reference | match, round, tick, actor/victim, event type, provenance | Referenciar fatos canônicos, sem duplicar raw data. |

| Diagnostic result | rule id/version, classification, status, evidence refs, confidence if calibrated | INFERRED quando heurístico; guardar explicação. |

| Replay segment | round, tick range, sampled positions, events, data coverage | Paginado e limitado; sem demo inteira. |

| Training plan | owner, objective, evidence refs, exercise, schedule, status, re-evaluation | Usuário controla; idempotência. |

| Bookmark | owner, match/round/ticks, tags, note, visibility | Privado por padrão; exclusão correta. |

| Benchmark cohort | source/license, game/map version, role, side, scenario, sample | Sem licença/metadata, não habilitar. |

Toda API deve validar autenticação e ownership no servidor, impor filtros/limites, devolver estado de cobertura e evitar confiar em owner_id enviado pelo cliente. Para cada endpoint, documentar método, schema, autorização, paginação, rate limit, erros e versão.

# 36. Estados obrigatórios de UI e comportamento de erro

| Estado | O que mostrar | O que nunca fazer |

| --- | --- | --- |

| Loading | Skeleton/indicador contextual; preservar filtros. | Mostrar zeros temporários como resultado. |

| Empty | Explicar que não há partidas/eventos elegíveis e como gerar dados. | Mostrar painel vazio sem explicação. |

| Partial | Exibir o que foi medido, coverage e limitações. | Apresentar total como completo. |

| Insufficient sample | Mostrar N e limiar/razão. | Criar nota/ranking provisório. |

| Not measured | Texto explícito de não medido. | Renderizar barra/valor zero. |

| Unavailable | Motivo conhecido e possibilidade de tentar novamente quando apropriado. | Tratar falha como ausência real de evento. |

| Error | Mensagem segura, retry controlado e referência de suporte. | Expor stack trace, secrets ou dados internos. |

# 37. Requisitos de internacionalização e acessibilidade

- Todas as strings novas entram no mecanismo i18n existente; não inserir texto visível hardcoded em componentes.

- Idiomas obrigatórios: pt-BR, pt-PT, en, es, fr. Preservar diferenças de termos e pluralização.

- Unidades, datas, percentuais e números seguem locale, sem alterar valor canônico.

- Termos técnicos devem ter glossário consistente; 'não medido' não pode ser traduzido como zero.

- Heatmap oferece legenda textual/lista alternativa para usuários que não distinguem cores.

- Replay tem controles acessíveis por teclado, foco visível e labels para leitores de tela.

- Contraste, tamanho de alvo e responsividade seguem padrões já usados no produto.

- Testar textos longos em francês/português e telas estreitas para evitar overflow.

# 38. Política de dados de teste e validação de produção

Para desenvolver, usar fixtures sintéticas, demos públicas cuja utilização seja permitida ou dados de teste já autorizados. Uma demo pública não deve ser considerada automaticamente livre para qualquer uso comercial. Não usar contas de outros usuários como laboratório.

- E2E deve identificar conta de teste e dataset usado, sem expor credenciais.

- Qualquer reprocessamento de demo real exige autorização específica, estimativa de custo, plano de idempotência e janela.

- Deploy em produção exige autorização do usuário; CI verde não equivale a deploy nem validação funcional.

- Após deploy autorizado, conferir SHA servido, migrations, health/version, runtime identity e smoke test.

- Não declarar uma métrica validada apenas por screenshot: confirmar origem, cálculo e amostra no backend.

# 39. Definição de pronto — checklist final do Claude

- [ ] Fase 4.1 finalizada ou isolada formalmente; baseline read-only registrado.

- [ ] Cada uma das dez etapas tem PR(s), commits e critérios de aceite documentados.

- [ ] Matriz de cobertura atualizada com métricas suportadas, parciais e não medidas.

- [ ] Módulos A–J e oito diferenciais têm rastreabilidade para código e testes.

- [ ] Nenhum null/ausente foi convertido em zero.

- [ ] Proveniência, unidade, denominador, amostra e coverage aparecem nos contratos/UI.

- [ ] RLS/ownership, idempotência, rate limits e guardrails preservados.

- [ ] Parser R5.8.24/versão efetivamente vigente, runtime identity, attestation, H.3-E e gates preservados.
- [ ] Persistência ponta a ponta de `position` e `victim_position` comprovada antes de habilitar camadas espaciais correspondentes.
- [ ] Heatmaps não confundem posições pontuais de morte com presença, trajetória ou exposição contínua.
- [ ] CT/T usa side por jogador/round validado; PR #264 foi reutilizado se já integrado.
- [ ] Módulos I/J respeitam a divisão faseada: I preparação no replay e biblioteca completa em 4.2.10; J DNA/evolução em 4.2.8 e comparativos Pro em 4.2.10.

- [ ] OpenRouter/modelo atual mantidos; fallback OpenAI continua desligado.

- [ ] Tutor LMS permanece externo por links.

- [ ] Nenhuma demo real foi reprocessada sem autorização.

- [ ] Benchmark profissional só usa dataset permitido e coorte comparável.

- [ ] i18n pt-BR/pt-PT/en/es/fr concluída.

- [ ] Testes unitários, contratos, integração, E2E, segurança e performance aprovados.

- [ ] Rollout/feature flags/rollback e observabilidade documentados.

- [ ] Deploy/produção só declarado validado com evidências do SHA e E2E autorizado.

# 40. Regra de encerramento e comunicação

Ao concluir cada etapa, Claude deve entregar um relatório objetivo com: o que foi feito; o que já existia e foi reutilizado; arquivos alterados; schemas/migrations; métricas efetivamente liberadas; métricas ainda não medidas; testes e links dos workflows; segurança/RLS; deploy (se autorizado); riscos; rollback; e próximo passo recomendado. Não usar expressões como 'tudo funcionando' sem indicar exatamente o que foi testado e em qual ambiente.

Se encontrar erro, investigar a causa raiz e propor/corrigir de forma compatível com a autorização recebida. Se a correção exigir ação manual, documentar o procedimento sem enfraquecer segurança ou gates. Não interromper silenciosamente a sequência: registrar bloqueio, causa, alternativas e dependência.

FIM DA PARTE EXPANDIDA — documento mestre atualizado para orientar a implementação fase por fase.
