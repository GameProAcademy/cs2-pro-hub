# Plano — FASE 2.7.2G.6-R.4-C.10-R1

## Objetivo
Eliminar os defeitos residuais de segurança, matriz de eventos e gates pré-forenses, mantendo o release bloqueado e sem executar o Attempt 9 ou qualquer DEM real.

## Implementação
- Aplicar uma migration incremental que restrinja as ACLs efetivas de `parser_attestation_nonces` e `parser_runtime_provenance` ao mínimo necessário, preservando RLS e imutabilidade.
- Auditar os privilégios reais por `information_schema` e catálogo PostgreSQL, incluindo regressão explícita contra `TRUNCATE`, e alinhar os testes de segurança ao estado live.
- Reconciliar a matriz de eventos declarada com catálogo, parser e superfície RAW/Canonical; adicionar auditoria automática de completude sem autorizar ou verificar mappings.
- Tornar o gate do Attempt 9 específico ao DEM Cache e fail-closed, sem bypass por frontend, argumentos livres ou chamadas genéricas; preservar HMAC, OIDC, nonce e provenance como provas externas obrigatórias.
- Revisar privilégios e `search_path` das funções de governança, mantendo somente os pontos internos necessários e sem expor dados ou segredos.
- Produzir o relatório pré-forense e atualizar o roadmap com distinção explícita entre infraestrutura implementada e evidência ainda não verificada.

## Validação
- Consultar o banco real após a migration para comprovar ACL, RLS, triggers, funções e estado bloqueado.
- Executar testes negativos e funcionais focados, auditoria da event matrix, caminhos sem DEM dos harnesses, testes Python/TypeScript, tipos, lint e integridade do diff.
- Confirmar em modo somente leitura: release com 105 mappings e zero autorizado/verificado; Attempt 8 preservado; Attempts 9/10+ ausentes; nenhuma promoção Canonical ou cleanup.

## Restrições preservadas
- Nenhum replay, DEM real, paridade/determinismo reais, Attempt 9/10+, cleanup ou exclusão histórica.
- Nenhuma alteração no Railway, runtime, domínio, configuração, staged patch ou secrets.
- Nenhuma evidência, HMAC, OIDC, provenance, autoridade de ticks ou estado `READY` será fabricado.
