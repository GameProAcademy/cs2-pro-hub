# Fase 2.7.2G.2 — Fechamento da cobertura RAW

## Objetivo
Ler e validar o manifest RAW imutável do Cache, classificar individualmente os 178 campos ainda desconhecidos, explicar os gates reais e corrigir somente lacunas comprovadas pela evidência.

## Execução
1. Validar o extrator administrativo existente, mantendo acesso exclusivo no servidor e para master admin.
2. Ler o manifest preservado, conferir identidade, inventários, gates e o digest de `audit_evidence` sem alterar artifact, chunks ou dados históricos.
3. Gerar um relatório versionado com a tabela completa, campo a campo, dos itens `UNMAPPED_BUT_AVAILABLE`, incluindo origem, presença real, destino semântico, classificação, ação e justificativa.
4. Classificar cada item apenas como `MAPPED`, `DERIVED`, `RAW_ONLY_INTENTIONAL`, `NOT_PRESENT_IN_DEMO`, `UNAVAILABLE` ou `PARSE_FAILED`; manter desconhecidos bloqueados.
5. Comparar cada decisão com o contrato atual. Alterar apenas mappings/derivações comprovados, com mudanças pequenas e compatíveis; não promover campos artificialmente para RAW-only.
6. Documentar nominalmente cada gate FAIL, sua evidência, causa, categoria, correção e teste.
7. Adicionar regressões para a contagem e inventário reais do corpus Cache, mappings, eventos, aliases, famílias críticas, digests e comportamento fail-closed.
8. Executar testes RAW do parser e APP, typecheck, verificação de diff e build automático; registrar resultados e qualquer teste não executado.
9. Atualizar o roadmap e o relatório final. Não executar Cache Run 1, Run 2, idempotência ou Fase 2.8.

## Restrições preservadas
- O artifact Cache, root digest, manifest e histórico permanecem imutáveis.
- Bucket privado, acesso administrativo server-only, contract 1, identidade do parser, hash chain e validações de digest permanecem fail-closed.
- Um campo preservado em RAW só entra no Canonical quando sua semântica e destino forem comprovados.
- O resultado só será marcado pronto para um futuro Run 1 se todos os gates estruturais locais estiverem demonstravelmente fechados; isso não equivale a E2E PASS.
