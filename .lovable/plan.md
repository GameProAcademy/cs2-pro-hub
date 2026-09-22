# Plano — FASE 2.7.2G.6-R.4-C.10-R5

## Objetivo
Produzir a evidência forense real máxima possível para o DEM Cache autorizado, sem criar Attempt 9 até que todos os gates oficiais retornem autorização explícita.

## Pré-flight fail-closed
- Registrar snapshots somente leitura do banco, Storage, Attempts 1–8, Canonical, provenance, nonce, cleanup e release de 105 mappings.
- Confirmar a identidade física do único DEM autorizado: filename, ownership, upload, path, tamanho de 473.748.061 bytes e SHA-256 `0caa7c...e3d` calculado sobre os bytes lidos.
- Confirmar de forma independente a identidade congelada do Railway, do GitHub, do workflow aprovado e das Actions pinadas, sem alterar deployment, configuração, secrets ou EnvironmentPatch.
- Executar invariantes de segurança e os gates oficiais; qualquer mismatch encerra a execução antes de Attempt 9.

## Execução forense
- Se os bytes reais estiverem acessíveis, processar cópias temporárias do mesmo DEM em duas execuções Python e duas WASM, preservando o original.
- Gerar manifests hashados de cada execução, paridade Python×WASM e determinismo, sem reordenar ou normalizar divergências.
- Validar identidade dos jogadores, ticks, 40 eventos, rounds, bomb, grenades, damage/deaths/weapons, economy e game state sem inferências não comprovadas.
- Validar RAW/HOT e persistência somente se o fluxo real as produzir; não promover Canonical e não executar cleanup.

## Integridade e decisão
- Criar envelope forense, comparação com Attempt 8, verificação de contaminação e revalidação byte-identical do DEM original.
- Consultar novamente o banco real e executar os cinco gates finais sem bypass.
- Manter Attempt 9 ausente quando qualquer evidência estiver `BLOCKED`, `NOT_RUN` ou `NOT_VERIFIED`; mesmo com `READY_TO_EXECUTE_ATTEMPT_9`, registrar a autorização e não criar Attempt 9 nesta etapa.

## Entregáveis
- Criar os nove relatórios R5 obrigatórios em `docs/release-gates/`, todos machine-readable quando solicitado e sem DEM, tokens, secrets ou HMAC.
- Reconciliar referências restantes para o catálogo oficial de 40 eventos e manter um teste automático de paridade documental.
- Atualizar o roadmap separando `IMPLEMENTATION`, `EXECUTION`, `VERIFICATION` e `AUTHORIZATION`.
- Executar testes TypeScript, Vitest, Python, compileall, lint, formatação, diff, migrations, segurança, events, attestation, workflow, parity, determinism, banco e release gates, classificando cada resultado sem converter `NOT_RUN` em `PASS`.

## Restrições preservadas
- Nenhum Attempt 9/10+, promoção Canonical, autorização dos 105 mappings, cleanup, alteração histórica ou mutação Railway.
- Nenhuma evidência, attestation, HMAC, provenance, identidade ou autoridade de ticks será fabricada.
- Ausência do binário, credenciais externas ou runtime verificável resulta em relatório parcial e gate final `BLOCKED`.
