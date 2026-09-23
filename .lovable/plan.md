# R5.7 — fechamento seguro do execution gate

## Objetivo
Validar e, somente com evidência operacional real, fechar HMAC, GitHub OIDC, Railway API e runtime provenance sem executar parser ou criar Attempt 9.

## Implementação e hardening
- Preservar a arquitetura existente e corrigir apenas gaps comprovados no endpoint, workflow, attestor, recorder e gates.
- Manter autenticação por transport secret, HMAC independente no servidor e no banco, OIDC RS256 contra JWKS oficial, freshness e nonce anti-replay.
- Vincular a prova ao workflow aprovado, commit/runtime congelados, deployment Railway, dois endpoints de runtime, cinco Git blobs críticos e release Canonical 105/0/0/0.
- Expor na tela administrativa somente estados seguros e booleanos; nunca tokens, secrets, JWTs ou assinaturas completas.
- Ampliar testes negativos e invariantes para todos os blockers exigidos, sem fabricar provenance.

## Configuração operacional
- Verificar nomes de secrets sem ler valores.
- Solicitar configuração segura dos quatro valores ausentes: `RAILWAY_API_TOKEN`, `PARSER_ATTESTATION_ENDPOINT`, `PARSER_ATTESTATION_TRANSPORT_SECRET` e `PARSER_ATTESTATION_HMAC_SECRET`.
- Configurar o HMAC do banco apenas se houver mecanismo protegido suportado; caso contrário registrar `DATABASE_HMAC_SECRET_CONFIGURATION_REQUIRES_OPERATOR_ACTION` e parar.
- Executar `Parser Runtime Attestation` via `workflow_dispatch` somente após todos os prerequisites estarem realmente configurados.

## Verificação e relatório
- Confirmar a execução real do workflow, artifact atual, OIDC, Railway API, identidade runtime, hashes, digest, HMAC, nonce e freshness.
- Consultar a nova linha específica de provenance e os gates read-only; não contar evidência histórica.
- Executar testes focados, typecheck, lint, build, parser contracts e security invariants.
- Produzir relatório R5.7 separando `IMPLEMENTED`, `CONFIGURED`, `TESTED`, `EXECUTED`, `VERIFIED`, `BLOCKED`, `FAILED` e `NOT RUN`.

## Travas
- Preservar o staging real e seu objeto; nenhum novo upload, hash, staging ou delete.
- Nenhum parser Python/WASM, replay, cópia, enqueue, RAW, Canonical, métricas, features, cleanup ou Attempt 9/10+.
- Nenhuma alteração de Railway, deployment, runtime, variáveis ou EnvironmentPatch.
- Se secrets, banco ou GitHub exigirem ação externa, parar no primeiro bloqueador real sem workaround.