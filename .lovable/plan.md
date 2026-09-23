# R5.8 — Configuração operacional e gate de memória

## Objetivo
Fechar os diagnósticos seguros da primeira attestation independente e preparar a avaliação de DEMs grandes, sem processar a DEM, criar Attempt 9, alterar Canonical, staging, Railway ou secrets.

## Implementação
1. Consolidar um diagnóstico server-side, restrito ao Master Admin, que exponha apenas estados seguros para endpoint, secrets, HMAC do banco, GitHub/OIDC, workflow aprovado, identidade Railway, hashes, release mapping e locks.
2. Implementar um preflight R5.8 idempotente e somente leitura, com estados fail-closed; nunca declarar prontidão sem HMAC do banco, configuração necessária e provas externas.
3. Criar o `LARGE_DEM_FEASIBILITY_GATE` separado do parser real, com preflight de capacidades, classificação explícita, medição de memória apenas quando suportada e estratégia de entrada WASM registrada como buffer contíguo quando aplicável.
4. Adicionar hashing SHA-256 incremental, cancelável, em Worker e com memória limitada para o laboratório de arquivos grandes, sem persistir ou enviar a DEM.
5. Manter o limite conservador de 128 MiB para parsing; adicionar a flag experimental desligada por padrão e testes metadata-only nos limites solicitados, sem apresentar isso como suporte do parser.
6. Corrigir apenas o harness de PostgreSQL descartável se a falha conhecida ainda existir e houver uma correção mínima de CI já compatível com o projeto.
7. Atualizar os relatórios R5.8 e Large DEM, além do roadmap, com resultados reais e sem valores de secrets.

## Validação
Executar testes focados de attestation/configuração, parser, large-file/hash/cancelamento/Worker/locks, TypeScript, lint, suíte completa e checagem final do preview. Registrar qualquer bloqueio externo como `BLOCKED` ou `NOT_VERIFIED`.

## Locks preservados
- Railway e EnvironmentPatch inalterados; zero migrations.
- Staging existente intacto; nenhum novo upload ou cleanup.
- DEM, Python×WASM, determinismo e primeira attestation não executados.
- Attempt 9 permanece 0; Canonical permanece bloqueado; `realDemoParser=false`; `DEMO_DATA=true`.
