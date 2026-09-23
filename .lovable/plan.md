# Fase 2.7.2G.6-R.5.1 — Real DEM Evidence Closure

## Objetivo
Fechar a infraestrutura e os gates necessários para disponibilizar, validar e posteriormente executar o DEM real autorizado, sem criar Attempt 9, promover Canonical, executar cleanup ou alterar Railway.

## Implementação
- Criar uma migration incremental para `R5_FORENSIC_STAGING`: registro temporário append-only, bucket privado dedicado, identidade fixa por SHA/tamanho/nome/release, expiração explícita, RLS e privilégios mínimos.
- Criar o gate read-only `R5_REAL_DEM_ACCESS_GATE`, com estados `NOT_READY / STAGED / IDENTITY_VERIFIED / ACCESSIBLE / READY_FOR_EXECUTION / BLOCKED`, mantendo Attempt 9 e Canonical obrigatoriamente bloqueados.
- Adicionar funções protegidas para o administrador principal solicitar upload temporário e verificar os bytes por streaming, sem expor credenciais, sem fila produtiva e sem criar `uploads` ou `demo_jobs`.
- Endurecer o Python reference para validar arquivo vazio, limite exato de 1,5 GiB, identidade Cache autorizada, extensão e metadados, preservando `canonicalEligible=false`.
- Adicionar testes de contrato para staging, ACL/RLS, ausência de efeitos no lifecycle, SHA/tamanho exatos, CI com PostgreSQL e identidades do parser.
- Gerar os 12 relatórios machine-readable R5.1 e atualizar o roadmap, separando `IMPLEMENTED`, `EXECUTED`, `VERIFIED`, `NOT_RUN`, `NOT_VERIFIED` e `BLOCKED`.

## Validação
- Aplicar a migration no banco real e validar schema, grants, RLS, triggers e gates em modo read-only.
- Executar testes TypeScript/Python aplicáveis, contratos do parser, inventário de 40 eventos, security checks, lint, typecheck e verificações de diff.
- Auditar o estado final: Attempt 9/10+ ausentes, Canonical 105/0/0, provenance/nonce vazios, Railway e EnvironmentPatch intactos, nenhum cleanup.
- Registrar CI e Railway como verificados somente quando houver evidência externa real; caso contrário, manter status explícito de bloqueio.

## Resultado máximo desta fase
`READY_FOR_REAL_DEM_STAGING` ou `READY_FOR_REAL_DEM_EXECUTION`. Esta fase nunca retorna `READY_FOR_ATTEMPT_9` apenas por implementação.
