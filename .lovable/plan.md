# Fase G.6-R.4-C.5/C.6 — autoridade real e gate final pré-Attempt-9

## Objetivo
Criar uma autoridade versionada, imutável e fail-closed para os 105 mappings Canonical; completar os contratos de OIDC, attestation, CI e readiness; preservar todo o histórico e manter `BLOCKED_BEFORE_ATTEMPT_9` enquanto faltar evidência externa real.

## Implementação
- Preservar `canonical_mapping_inventory` como histórico legado e criar releases append-only com metadados, 105 linhas únicas, digests Git/DB idênticos, taxonomia explícita, zero origem genérica e zero autorização.
- Restringir as novas tabelas a leitura controlada pelo service role, escrita exclusivamente por uma função validada e proibir alterações ou exclusões por triggers imutáveis.
- Atualizar `assert_canonical_mapping_gate()` e criar `assert_pre_attempt_9_ready()` para consumir somente a release autoritativa validada e exigir todos os 32 sinais definidos, sem transformar `NOT_RUN` ou `BLOCKED` em aprovação.
- Vincular o recorder de provenance à release autoritativa, à prova Railway independente, ao runtime congelado, aos hashes críticos, ao HMAC externo e ao OIDC GitHub com subject imutável, IDs de owner/repositório e claims completos.
- Tornar `workflow_dispatch` o caminho oficial de attestation, separar workflow SHA de runtime SHA, validar a branch congelada e manter CI/attestation sem deploy ou mutação Railway.
- Corrigir contratos históricos de testes e adicionar harnesses para paridade, determinismo e persistência; resultados de fixture permanecem `SIMULATED_TEST_ONLY` e não liberam produção.
- Atualizar manifest, roadmap e relatórios humano/machine-readable com identidades e estados separados.

## Segurança e dados
- Aplicar schema somente por migration incremental, com GRANTs explícitos, RLS, funções com `search_path` seguro e testes de acesso por papel.
- Manter retenção `G6_VERIFIED_DELETE_ONLY`, execução desabilitada e cleanup legado desabilitado.
- Não executar replay, Attempt 9/10+, processamento/cópia/exclusão de DEM, Canonical, métricas, features, AI Coach, deploy/restart/configuração Railway, staged patch ou merge de PR.

## Validação
- Rodar Python completo, Vitest, typecheck, lint, compileall, geradores/digests, testes de segurança, contratos SQL e verificações de formatação.
- Consultar o banco real após a migration para conferir releases, 105 linhas, zero autorização, provenance, attempts, contaminação e autoridade de cleanup.
- Executar attestation e CI remoto somente se os segredos e acessos reais estiverem configurados; caso contrário registrar cada item como `MISSING`, `NOT_RUN` ou `BLOCKED`.

## Resultado esperado
Entregar relatório técnico com commit, arquivos, migrations, tabelas, funções, políticas, grants, triggers, contagens, digests, IDs, testes e blockers. O estado permanece `BLOCKED_BEFORE_ATTEMPT_9` salvo comprovação real de todos os gates externos.
