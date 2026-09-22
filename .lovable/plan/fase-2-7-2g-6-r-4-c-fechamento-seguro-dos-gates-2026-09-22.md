# Fase 2.7.2G.6-R.4-C — fechamento seguro dos gates

## Objetivo
Implementar a cadeia independente de attestation, um gate restrito aos mappings realmente usados pelo Canonical, evidência de CI verificável e o gate global fail-closed, sem criar Attempt 9 nem alterar dados históricos ou produção Railway.

## Implementação
1. **Provenance independente**
   - Criar payload canônico determinístico e verificador compartilhado para repositório, branch real, commit/tree, deployment, identidade do parser, endpoints, hashes críticos e identidade do workflow.
   - Adicionar workflow dedicado de attestation que coleta e valida GitHub, CI, domínio customizado e Railway; produzir evidência/digest sem secrets ou signed URLs.
   - Criar migration incremental com RPC service-role-only para registrar uma attestation após validação criptográfica/autenticada; manter `VERIFIED` terminal, imutável, fresco e impossível de selecionar pelo browser.
   - Quando credenciais ou prova externa não existirem, registrar estado bloqueado; nunca criar `VERIFIED`.

2. **Gate Canonical por escopo**
   - Formalizar o inventário de mappings Canonical com fonte, semântica de null/zero/false/missing, normalização, identidade, evidência, parity, determinismo, autorização e revisão.
   - Separar `MATRIX_HEALTH` de `CANONICAL_MAPPING_HEALTH`: campos bloqueados não usados pelo Canonical permanecem visíveis sem bloquear; qualquer mapping Canonical ausente, pendente ou inconsistente bloqueia.
   - Corrigir mappings históricos para os tipos Canonical atuais sem inventar campos nem promover dados.

3. **Release gate e recovery**
   - Fazer `assert_real_demo_release_ready()` validar provenance/attestation, CI, gate Canonical, tick-domain, paridade, determinismo, autorização da DEM, sequência de attempts, storage, cleanup e ausência de contaminação.
   - Preservar reserva e finalização fail-closed; representar cópia verificada pendente de finalização e recuperação idempotente sem cleanup destrutivo.

4. **CI, testes e documentação**
   - Corrigir os workflows para a branch `infra/cs2-parser-worker-v8`, Python 3.12, instalação reproduzível, compileall, pytest, revision guard, contratos e matriz.
   - Adicionar testes de attestation, freshness, imutabilidade, gate Canonical, bypass, concorrência, storage recovery e contratos históricos citados.
   - Aplicar migrations incrementais, validar funções/permissões/RLS/contagens no banco real e gerar relatório estruturado da fase.

## Validação e limites
- Executar testes TypeScript/Python, lint, build, matrix check, contratos, migrations e checks de segurança disponíveis.
- Confirmar Attempt 8 preservado, Attempt 9 = 0, Attempt 10+ = 0 e provenance VERIFIED = 0 salvo prova externa real completa.
- Não executar replay/DEM real, não copiar/apagar Storage, não promover Canonical, métricas, features ou AI, e não alterar/deployar Railway.
- Resultado final permanece `BLOCKED_BEFORE_ATTEMPT_9` quando CI/attestation/tick/paridade/determinismo externos não forem realmente verificados.
