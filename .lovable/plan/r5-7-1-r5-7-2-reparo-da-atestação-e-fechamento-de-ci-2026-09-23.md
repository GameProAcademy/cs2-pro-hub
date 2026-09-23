# R5.7.1 + R5.7.2 — reparo da atestação e fechamento de CI

## Objetivo
Alinhar integralmente a atestação ao GitHub `main`, manter o runtime Railway congelado como alvo independente e deixar a primeira atestação pronta para disparo manual, sem executar o DEM nem criar Attempt 9.

## Implementação
- Atualizar a identidade aprovada do workflow para o Git blob `13ce10e95a508e62d832bb9dc432e1496499676c`, branch `main`, `workflow_ref` e subject OIDC imutável de `main`.
- Manter separados no payload o attestor source (`main`, workflow commit/path/content SHA) e o runtime target (`infra/cs2-parser-worker-v8`, commit/deployment congelados).
- Vincular `release_gate_evidence` criptograficamente ao payload assinado e rejeitar qualquer bloco adulterado.
- Preservar validação OIDC RS256/JWKS, claims obrigatórios, freshness de 300s/60s, transport secret e HMAC em tempo constante e fail-closed.
- Tratar `job_workflow_ref` explicitamente conforme o contrato de workflow normal, sem wildcard e mantendo todos os demais vínculos imutáveis.
- Criar migration somente aditiva para substituir as definições efetivas do recorder/trigger com a identidade `main`, o novo workflow content SHA e o binding de release gate; não editar migrations históricas nem armazenar segredo.
- Ampliar os testes negativos para identidade, token, payload, HMAC, release gate adulterado, nonce/replay e evidências ausentes.

## Verificação
- Executar suíte Python do parser, contratos de atestação, testes web, TypeScript, lint, build e `git diff --check`.
- Auditar em modo somente leitura banco, staging, Storage, provenance, nonces, Canonical e Attempt 9/10+.
- Consultar Railway apenas em leitura se houver credencial segura disponível; não alterar deployment, branch, variáveis ou EnvironmentPatch.
- Produzir relatório R5.7.1/R5.7.2 distinguindo `IMPLEMENTED`, `TESTED`, `VERIFIED`, `NOT_RUN`, `BLOCKED` e `REQUIRES_OPERATOR_ACTION`.

## Travas
- Não executar parser Python/WASM real, parity, determinism, tick authority, Canonical, cleanup, upload, job ou Attempt 9/10+.
- Não disparar automaticamente o workflow da primeira atestação.
- Não expor, registrar ou versionar secrets; configuração externa pendente permanece blocker explícito.
