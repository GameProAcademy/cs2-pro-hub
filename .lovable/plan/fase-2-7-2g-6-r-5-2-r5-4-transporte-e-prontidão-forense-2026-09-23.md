# Fase 2.7.2G.6-R.5.2 → R5.4 — Transporte e prontidão forense

## Objetivo
Disponibilizar um caminho master-only, privado, retomável e bounded-memory para o DEM autorizado no staging R5; preparar a execução forense e o fechamento posterior sem executar Attempt 9, parsing real, promoção Canonical, cleanup ou qualquer mutação Railway.

## Implementação
- Evoluir o staging existente sem duplicá-lo: identidade continua imutável; somente estado/evidência de transporte e verificação muda. Adicionar estados explícitos, progresso, tentativas, erros seguros, timestamps e auditoria administrativa sem tokens, URLs ou bytes.
- Implementar transporte TUS resumível para o único bucket/path fixado pelo servidor, com chunks, retry, retomada, cancelamento e progresso. O navegador valida nome/tamanho antes de iniciar, mas o servidor permanece autoridade final.
- Reconciliar a verificação atual para streaming incremental estrito: sem `storage.download()`, `arrayBuffer()` integral, buffer total ou confiança em `Content-Length`; somar bytes lidos, calcular SHA-256 incremental, persistir digest e falhar fechado.
- Criar a página master-only `/admin/r5-forensic` com identidade autorizada, estados não ambíguos, seleção local, progresso, retomada/cancelamento e ação separada de verificação.
- Fortalecer `r5_real_dem_execution_gate` e manter `assert_attempt_9_authorized` explicitamente bloqueado. O gate valida staging, objeto, identidade, baseline Canonical/attempts, runtime/pré-requisitos e ausência de fixture/evidência fabricada, sem efeitos colaterais.
- Preparar contratos R5.3/R5.4 para execução Python/WASM isolada, inventários, RAW evidence, paridade, quatro execuções de determinismo, tick authority, OIDC/HMAC/nonce/provenance e fechamento pós-execução; todos permanecem `NOT_RUN`, `NOT_VERIFIED` ou `BLOCKED` sem evidência real.
- Atualizar documentação, roadmap e os dez relatórios machine-readable R5.2/R5.3/R5.4, separando implementação, execução e verificação.

## Validação
- Cobrir identidade/path/bucket fixos, master-only, ACL/RLS, upload boundary, streaming, SHA/tamanho, idempotência, reentrância, concorrência, retry/cancelamento, expiração e falhas.
- Validar no banco real o schema/gates e a não-contaminação: Attempt 9/10+ zero, Canonical 105/0/0, provenance/nonce zero, bucket privado e Railway inalterado.
- Executar testes TypeScript/Python aplicáveis, security checks, lint/typecheck e inspeção de diff; CI externo e runtime só serão `VERIFIED` com prova externa real.

## Resultado máximo
- Sem bytes reais: `BLOCKED_REAL_DEM_NOT_STAGED` e R5.3 bloqueado.
- Com bytes reais recebidos e verificados: `READY_FOR_EXECUTION` / `READY_FOR_FORENSIC_EXECUTION`, ainda sem autorização ou execução de Attempt 9.
