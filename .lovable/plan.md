# Fase 2.7.2G.5-R-F.2.7 — Auditoria RAW exaustiva e admissão canônica

## Objetivo
Estender o pipeline existente para provar, antes de qualquer escrita Canonical, quais capacidades do `demoparser2 0.42.0` existem, foram tentadas, apareceram no demo, falharam, ficaram somente no RAW ou possuem mapping/derivação semântica explícita.

Este marco é somente implementação, testes e auditoria. Não executará demo real, retry, Cache Run 1/2, attempt 9, escrita Canonical real, mutação dos attempts/artifacts 7 e 8, mudança de secrets, deploy Railway ou migration destrutiva.

## Implementação

1. **Catálogo de capabilities versionado**
   - Criar uma fonte única, determinística e vinculada ao `demoparser2==0.42.0`, com identidade, versão do catálogo, proveniência e digest.
   - Cobrir header, player info/properties, buttons, game state, weapons, usercommands, aggregates, eventos e campos extras, rounds, bombas, granadas, times e score.
   - Rejeitar catálogo ausente, duplicado, inconsistente ou incompatível com a identidade fixa do parser.

2. **Contrato forense v2 e classificação exaustiva**
   - Estender o evidence/manifest sem quebrar artifacts históricos.
   - Classificar cada capability exatamente como `CANONICAL`, `DERIVED`, `RAW_ONLY`, `NOT_PRESENT`, `UNAVAILABLE` ou `PARSE_FAILED`.
   - Exigir mapping para `CANONICAL`, regra determinística para `DERIVED` e motivo explícito para `RAW_ONLY`.
   - Manter ausência, indisponibilidade e falha de parse semanticamente distintas; nenhum estado desconhecido poderá aprovar o RAW.

3. **Auditoria integral de ticks com memória limitada**
   - Remover o limite de 4096 como prova de aprovação e distinguir `FULL_TICK_DOMAIN_AUDIT` de `SAMPLE_ONLY`.
   - Processar propriedades e/ou intervalos em batches determinísticos, acumulando estatísticas, cobertura, tipos, identidades, ranges e digests sem manter o corpus inteiro em memória.
   - Preservar amostras limitadas somente para diagnóstico; qualquer gap, overlap inválido ou cobertura parcial bloqueará admissão.

4. **Inventários semânticos especializados**
   - Produzir inventários auditáveis para eventos e campos, death/damage, rounds, times/score, bombas, granadas, weapons, usercommands, aggregates, header e player info.
   - Preservar as regras de round boundaries, ausência sem coerção para zero/false/null, distinção side/team e proveniência player-scoped.
   - Catalogar todos os eventos descobertos dinamicamente e registrar presença, tentativa, sucesso/falha, contagens, tipos e intervalo de ticks.

5. **Reauditoria independente do artifact persistido**
   - Estender o auditor independente para reler JSONL gzip em streaming, verificar SHA, ordem/cadeia dos chunks e reconstruir contagens, fields, eventos, players, ticks, rounds, granadas, header e categorias.
   - Comparar a reconstrução física com producer evidence/manifest, detectando linhas/campos extras ou ausentes, divergências de contagem/range/identidade e digest.
   - Manter bounded memory e não reutilizar o objeto em memória produzido pelo parser.

6. **Canonical Admission fail-closed**
   - Atualizar o contrato TypeScript e o gate de persistência para exigir audit v2 suportado, catálogo completo, inventários completos, cobertura FULL, auditoria independente e reconciliation PASS, digests válidos, identidade exata do parser e todos os mappings/classificações resolvidos.
   - Bloquear com `RAW_ADMISSION_REQUIRED` qualquer falha dos 22 gates, inclusive sampling, parse failure não tratado, campo sem classificação, mapping/derivação/motivo ausente ou invariantes de round/evento inválidas.
   - Preservar compatibilidade histórica apenas para leitura; artifacts antigos não ganham aprovação v2 retroativamente.

7. **Fixtures e testes**
   - Criar fixtures pequenas e determinísticas para presença/ausência/falha, cobertura completa/parcial, artifact malformado, digest/chunk divergente, rounds órfãos/gaps, granadas, usercmd indisponível e score/team.
   - Cobrir os 44 cenários novos e manter verdes os contratos existentes de parser, RAW, Canonical, rounds, artifact e persistence.
   - Executar APP completa, parser completa, contratos críticos, typecheck, ESLint, build e Python compileall sem enfraquecer asserts.

8. **Documentação e decisão final**
   - Criar o relatório técnico da fase e o catálogo documentado do `demoparser2 0.42.0`.
   - Atualizar o roadmap primeiro para `IN PROGRESS` e, ao final, para `PASS` somente se todos os critérios A–AM forem comprovados; caso contrário registrar `BLOCKED / INCOMPLETE` com a lacuna exata.
   - Relatar contagens por categoria/classificação, domínio de ticks, auditoria independente, reconciliation, resultados de testes e limitações, além de confirmar ausência de mutação em produção.

## Ordem de arquivos
- Criar primeiro catálogo, tipos/contratos e fixtures.
- Depois estender produtor/auditor Python.
- Em seguida adaptar contrato e admissão TypeScript.
- Por fim adicionar testes, documentação e roadmap.

## Critério de conclusão
A fase só será `PASS` com catálogo e inventários completos, domínio integral de ticks, reconstrução independente reconciliada, zero campos disponíveis sem classificação, todos os gates canônicos fail-closed e todos os quality gates aprovados. Qualquer prova ausente mantém `BLOCKED / INCOMPLETE` e impede o próximo Cache Run.
