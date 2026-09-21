# F.2.10-L/M/N — fechamento do harness de paridade

## Objetivo
Fechar os contratos e a preparação do harness para receber futuramente um DEM real autorizado, sem executar DEM, alterar produção, Railway, histórico, Canonical, secrets ou a flag de produção.

## Implementação
- Consolidar uma fonte única e versionada para catálogo, contrato e respectivos digests, consumida de forma idêntica pelos caminhos Python e WASM.
- Substituir o catálogo heurístico por inventários explícitos e auditáveis de APIs, campos e eventos do demoparser2 v0.42.0, com proveniência por item e estados independentes desde suporte upstream até elegibilidade Canonical.
- Tornar cada request de evento explicitamente event-by-event e registrar no resultado os digests/versões do catálogo, parser e DEM que vinculam a chamada aos bytes processados.
- Evoluir o PythonReferenceArtifact com autorização formal, identidade única por execução, seções/evidências field-level e digest semântico livre de timestamp e runId.
- Fechar o comparador Python×WASM com referências individuais, estados informativos, tolerâncias somente documentadas e rejeição prévia de incompatibilidades de catálogo, contrato, parser, revisão e SHA.
- Endurecer determinismo para exatamente 2 execuções Python + 2 WASM, runIds distintos, mesmas identidades e igualdade intra-runtime antes da paridade entre runtimes.
- Separar grenade RAW/normalizado sem inferir lifecycle, declarar rounds derivados como amostra limitada e ticks como probe não autoritativo.
- Manter autorização de DEM fail-closed e Canonical permanentemente bloqueado para resultados do cliente.

## Validação e documentação
- Ampliar testes negativos para mismatches de identidade/digest, null/zero/false, ordem/duplicatas, campos ausentes/extras, não-finitos, chaves proibidas, grenades, rounds, autorização, limites e tentativa de admissão Canonical.
- Gerar o manifest de superfície e métricas objetivas diretamente dos catálogos executáveis.
- Atualizar os relatórios F.2.10, documentação do navegador/POC e roadmap com o CURRENT GATE real.
- Executar formatter, typecheck, Vitest, lint, compileall, testes Python disponíveis, diff check e aguardar o build automático.

## Estado esperado
- `HARNESS_CLOSURE_STATUS = PASS_FOR_AUTHORIZED_REAL_DEM` somente se todos os contratos estruturais fecharem; caso contrário, `PARTIAL`.
- `REAL_DEM_EXECUTION = NOT_RUN / BLOCKED`, `PYTHON_WASM_PARITY = NOT_RUN`, `DETERMINISM_REAL = NOT_RUN`, `CANONICAL = BLOCKED`, `AI_DATA_READINESS = BLOCKED`.
