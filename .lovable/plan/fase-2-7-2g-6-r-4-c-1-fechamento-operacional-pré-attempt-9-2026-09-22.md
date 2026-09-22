# Fase 2.7.2G.6-R.4-C.1 — fechamento operacional pré-Attempt 9

## Objetivo
Fechar a infraestrutura de prova de attestation, reconciliação completa do output Canonical, evidência de CI e semântica do adapter, mantendo o sistema fail-closed e sem executar replay, Attempt 9, cleanup, deploy, Canonical, métricas, features ou AI.

## Implementação
- Separar no workflow e no payload a identidade da execução GitHub da identidade do runtime alvo; verificar commit, pertencimento à branch, tree e blobs críticos pelo banco de objetos Git, sem executar o attestor a partir do commit alvo.
- Tornar a prova operacional: payload canônico determinístico, digest e assinatura verificáveis, artifact attestation complementar e entrega autenticada a um endpoint server-side idempotente; manter criação de provenance `VERIFIED` inacessível a browser/anon/authenticated e bloqueada quando falta prova independente Railway ou segredo forte.
- Endurecer migrations incrementalmente para workflow SHA diferente do runtime SHA, freshness por `verification_timestamp`, imutabilidade terminal, comparação de assinatura em tempo constante, evidência confiável e release gate restrito a provas persistidas.
- Remover o bypass `authorize=True` do caminho de produção e substituir testes por fixtures artificiais isoladas. Expandir o inventário para 100% dos campos efetivamente escritos pelo Demo Adapter, por observation, match, participants, rounds, roundPlayers, events, coverage, quality, identity e metadata.
- Criar verificação automática bidirecional Adapter/manifest ↔ inventory ↔ tipos ↔ persistência, bloqueando output não inventariado e mappings para campos inexistentes, sem promover nenhum campo sem parity, determinism, normalização e evidência reais.
- Corrigir o Demo Adapter para não afirmar `finished`/`terminal` sem evidência, manter `winReason = unknown` sem regra formal, propagar qualidade parcial para rounds/eventos e preservar identidade fraca e `null != false != zero`.
- Alinhar os workflows de CI à branch real e família derivada, incluindo compileall, pytest, contratos, RAW, adapter, mapping, attestation, segurança/no-bypass e aplicação SQL verificável quando suportada pelo ambiente.
- Adicionar estado recuperável e idempotente para destino copiado cuja finalização falhou, sem apagar a origem ou executar reconciliação destrutiva.
- Atualizar documentação, relatório e roadmap distinguindo IMPLEMENTED, TESTED, EXECUTED, VERIFIED, NOT RUN, BLOCKED e FAILED.

## Validação
- Executar testes TypeScript/Python focados e completos, typecheck, lint, build automático, compileall, matriz `--check`, testes de segurança/contrato e diff check.
- Fazer assertions read-only no banco para ACLs, provenance, attempts, métricas, features e ausência de nova admissão Canonical; preservar exatamente o Attempt 8.
- Registrar CI remoto e provas GitHub/Railway como `NOT VERIFIED`/`BLOCKED` quando não observáveis; jamais converter implementação ou fixture em evidência executada.

## Estado de saída
`IMPLEMENTATION COMPLETE / RELEASE BLOCKED / BLOCKED_BEFORE_ATTEMPT_9` enquanto provenance `VERIFIED=0`, parity/determinism/tick reais não executados e CI/prova externa não verificados. Nenhum Attempt 9 ou 10+ será criado.
