# G.6-R.4 + F.2.10 — fechamento pré-release fail-closed

## Objetivo
Endurecer os gates de provenance, CI e governança de campos para deixar o replay real tecnicamente preparado, sem criar Attempt 9, alterar Railway, executar cleanup ou promover dados para Canonical.

## Implementação
- Corrigir incrementalmente o vínculo do provenance ao branch real `infra/cs2-parser-worker-v8`, preservando a tabela existente, digest canônico, freshness, imutabilidade, ACLs e auditoria.
- Criar um release gate único `assert_real_demo_release_ready()` que exija evidence explícita para provenance, CI, testes críticos, matriz, tick authority, paridade, determinismo, Canonical e integridade do Storage/fonte.
- Consolidar catálogo de capabilities e mappings numa matriz machine-readable com classificação, permissões RAW/derived/Canonical, normalização, identidade, tick/round, parity, determinism, evidence, reason e review status.
- Adicionar testes fail-closed para mappings órfãos, Canonical sem evidência, parity/determinism insuficientes, tick amostral e bypasses do replay.
- Reconciliar a taxonomia do harness Python e os testes de rounds sem remover os bomb flags; auditar o workflow existente sem duplicar a estratégia do PR.
- Atualizar roadmap e relatório com estados separados: IMPLEMENTED, TESTED, EXECUTED, VERIFIED, NOT RUN, BLOCKED e FAILED.

## Validação
- Executar testes focados e completos disponíveis, typecheck, lint, build, compileall, pytest e diff check.
- Repetir preflight read-only de banco, Storage, runtime e GitHub; observar CI real apenas se acessível.
- Confirmar Attempt 8/RAW histórico preservados e Attempts 9/10 ausentes.

## Release gate
- Qualquer prova externa ausente, CI não observado, parity/determinism real não executados, tick authority insuficiente ou inconsistência da matriz mantém `G.6-R.4 BLOCKED`.
- Esta rodada não cria Attempt 9, provenance VERIFIED, deploy, cleanup, Canonical, métricas, features ou dados de AI Coach.
