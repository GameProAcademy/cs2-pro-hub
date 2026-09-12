# FASE UX — Processamento de demo com progresso e etapas

## Objetivo
Transformar o status atual da demo em uma experiência clara e premium, sem alterar processamento, dados ou regras do pipeline.

## Implementação
- Criar um mapeamento visual determinístico dos stages reais: `queued` 5%, `validating` 15%, `parsing` 40%, `normalizing` 60%, `metrics` 78%, `persisting` 90%, `cleanup` 96% e conclusão 100%.
- Manter o maior progresso visual já exibido por job, impedir regressão e congelar o valor em falhas.
- Permitir apenas uma animação visual limitada dentro da faixa da etapa atual; ela não será persistida, não representará trabalho real e nunca alcançará a próxima etapa ou 100% antes da conclusão.
- Substituir a linha simples de status dos jobs ativos por um painel de processamento com ícone discreto, título, mensagem, barra acessível, indicação de progresso estimado e lista das etapas concluída/atual/futura.
- Preservar a apresentação existente de resultados concluídos, identificação do jogador, erros e botões de nova tentativa.
- Manter exatamente o polling atual de 4 segundos, sem consulta paralela ou aumento de frequência.

## Idiomas e acessibilidade
- Adicionar todas as mensagens aos cinco idiomas existentes: pt-BR, pt-PT, inglês, espanhol e francês.
- Usar `aria-live` apenas para mudanças importantes de etapa.
- Expor a barra como `progressbar` com mínimo, máximo, valor atual e rótulo traduzido.
- Respeitar redução de movimento nas animações.

## Testes
- Cobrir o mapeamento de cada stage, fallback seguro, monotonicidade e congelamento em falha.
- Cobrir as traduções nos cinco idiomas.
- Cobrir a barra acessível, estados visuais e preservação da consulta periódica existente.
- Validar testes direcionados, checagem de tipos, lint e build.

## Fora de escopo
Nenhuma mudança em parser, worker, Canonical Engine, Raw Evidence, métricas, features, identidade, gates, persistência, status reais ou regras de negócio.
