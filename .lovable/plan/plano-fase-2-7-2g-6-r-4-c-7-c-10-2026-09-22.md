# Plano — FASE 2.7.2G.6-R.4-C.7 → C.10

## Objetivo
Concluir a infraestrutura pré-Attempt 9 para attestation, paridade Python/WASM, determinismo, autoridade de ticks e auditoria forense, mantendo a release bloqueada até existirem provas externas reais.

## Implementação
- Consolidar a release versionada de 105 campos como autoridade operacional, preservando o inventário legado apenas como histórico.
- Formalizar os quatro estados de autoridade de ticks e impedir que fixtures sejam tratadas como evidência real.
- Criar harnesses offline explícitos para paridade e determinismo Python/WASM sobre o mesmo DEM autorizado; sem DEM, produzir somente `NOT_RUN`.
- Fortalecer attestation com freshness, nonce anti-replay, OIDC, HMAC e vínculos exatos Git/Railway/runtime/release.
- Reforçar os gates contra fontes genéricas, Attempt 9/10+, Canonical e cleanup, expondo diagnóstico estritamente `BLOCKED` ou `READY_TO_EXECUTE_ATTEMPT_9`.
- Documentar as matrizes, checklist do DEM real e relatórios C.7–C.10 sem fabricar prova externa.

## Validação
- Adicionar testes negativos e de contrato para ticks, attestation, release, paridade, determinismo e bloqueios operacionais.
- Executar testes Python e TypeScript focados, typecheck, lint e `git diff --check`.
- Confirmar em modo somente leitura: Attempt 8 preservado, Attempts 9/10+ ausentes, zero provenance `VERIFIED` e zero promoção Canonical.

## Restrições preservadas
- Nenhum DEM real será copiado, processado, baixado ou excluído.
- Nenhum replay, Attempt 9/10+, cleanup, promoção Canonical, mutação Railway ou alteração de secrets será executado.
- A release `canonical-demo-v2` e seus 105 mappings não serão alterados nem artificialmente verificados.
