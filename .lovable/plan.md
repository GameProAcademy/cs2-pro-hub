# FASE 2.7.2G.5-R — Validação forense DEM no browser

## Objetivo
Consolidar e validar o POC existente de processamento local de DEM com demoparser2 0.42.0/WASM em Web Worker, produzindo evidência limitada e auditável sem liberar dados para o Canonical.

## Execução
1. Auditar os contratos existentes do Worker, runtime WASM, hash, manifesto, inventários, comparador Python×WASM, determinismo e validação server-side.
2. Corrigir somente lacunas comprovadas em validação de arquivo, estados/cancelamento, identidade do parser, limites de memória/saída, valores não finitos, integridade de rounds/ticks/identidades e falha fechada.
3. Completar a tela isolada de auditoria com identidade do arquivo/parser, medições reais e seções de metadata, fields, players, teams, rounds, events, ticks, bombs, deaths, damage, parity, determinism, validation e Canonical Admission.
4. Reforçar testes unitários, negativos, de Worker, schema, manifesto, parity, determinismo e segurança, preservando todos os gates e flags desligados por padrão.
5. Procurar um DEM real autorizado já disponível. Se não existir, não baixar nem fabricar: executar apenas validações sem DEM e marcar runtime, parity e determinismo como `NOT_RUN`.
6. Gerar relatório A–X e matriz final `Gate | Status | Evidence | Blocking?`, distinguindo implementação de execução real.

## Limites
- Nenhuma alteração no parser Railway, versão 0.42.0, revisão congelada, deployment, staged change, secrets, RLS ou modelo Canonical.
- Nenhum upload permanente do DEM, dado mock como evidência, admissão automática no Canonical ou avanço para métricas/AI.
- `FEATURES.realDemoParser` e o POC permanecem desligados por padrão.

## Validação
Executar TypeScript, build, lint aplicável, testes existentes e focados, harnesses de parity/determinismo e verificações de segurança. Sem DEM autorizado, o resultado final será `POC_BLOCKED_PENDING_REAL_DEM` / `POC_BLOCKED_WITH_FORENSIC_EVIDENCE`, nunca PASS.
