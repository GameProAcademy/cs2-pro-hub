# FASE 2.7.2D.7 — E2E Cache e handoff sem perda

## Objetivo
Preservar AIM, posição e economia do HOT até a observação canônica persistida, endurecer medições e testes comportamentais, e então comprovar o mesmo job Cache no ambiente real sem criar ou apagar dados.

## Implementação
- Estender o contrato intermediário `RawParserOutput` e o objeto normalizado com as três seções semânticas bounded, mantendo-as separadas de eventos canônicos.
- Reutilizar `match_sources.metadata` para persistir uma cópia versionada das seções HOT e de sua qualidade; o RAW completo continua exclusivamente no artifact privado.
- Validar estruturalmente cada observação semântica e impedir perda silenciosa no caminho HOT → normalizer → canonical bundle → payload de persistência.
- Corrigir os testes Python de limite para realmente executar AIM, posição e economia em `limit` e `limit + 1`, incluindo valores concretos e não finitos.
- Substituir a prova textual prioritária por testes comportamentais do handoff, integridade/digest, claim e idempotência que possam ser exercitados sem banco.
- Alterar a leitura bounded de `/complete` para devolver os bytes físicos realmente lidos e usar esse valor nos logs, sem reserializar o payload.
- Extrair um handler testável com dependências injetáveis e provar por request real que payload acima de 8 MiB retorna 413 e não chama a conclusão.

## Validação e execução real
- Rodar testes Python focados e completos, testes TypeScript focados e completos, typecheck, compileall, diff check e lint apenas dos arquivos alterados.
- Aplicar somente migration incremental se a implementação revelar necessidade real; não criar tabela duplicada nem mudança destrutiva.
- Verificar Railway `/health` e `/version`, revisão/contrato e disponibilidade do worker sincronizado.
- Inspecionar o job `a31f5c25-b0d8-41ac-8225-27814cd1732a`, upload `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043`, mensagem existente e artifact antes de qualquer recovery.
- Continuar exclusivamente pelo recovery/reconciliation oficial quando elegível; não criar upload, job, tentativa lógica ou mensagem.
- Observar até estado terminal e coletar HOT, RAW, granadas, ticks, memória, `/complete`, Canonical, métricas, features, ACK e idempotência.

## Gates e bloqueios
- Não reduzir ticks, trajetórias, granadas, AIM, posição ou economia; não otimizar volume nesta fase.
- Não declarar E2E PASS sem o Cache real atravessar o Railway sincronizado e atingir estado terminal.
- Se Railway não puder ser sincronizado/deployado neste ambiente, concluir código/testes como PASS e marcar E2E como BLOCKED com a dependência exata.
- Preservar os textos mobile existentes e não redesenhar a interface.
