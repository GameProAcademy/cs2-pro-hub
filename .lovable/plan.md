# Fase G.6-R.4-C.3/C.4 — reconciliação e fechamento fail-closed

## Objetivo
Transformar o inventário de 105 campos em uma reconciliação semântica verificável, fechar os gates executáveis de attestation e CI e manter o sistema bloqueado antes do Attempt 9 enquanto faltar qualquer prova externa ou execução real.

## Implementação
- Substituir os mappings genéricos por registros field-by-field derivados de uma única fonte versionada, com tipo/nullabilidade Canonical, origem real, consulta, semântica, normalização, identidade, tick, persistência, lossiness, confiança e requisitos de provenance.
- Preservar explicitamente os 18 campos upstream bloqueados, tick authority não comprovada, identidade fraca, parity e determinismo como não executados; nenhum campo será autorizado por existência, fixture ou declaração.
- Gerar deterministicamente inventário, matriz reconciliada e digests; adicionar comparação 105/105 entre saída do adapter, JSON e snapshot privado do banco, sem criar um segundo source of truth.
- Endurecer o gate para rejeitar capability/source field inexistente, mapping genérico, divergência de tipo sem normalização, evidência incompleta, dependência bloqueada e qualquer atalho de autorização em caminho de produção.
- Completar a validação executável de Railway API, hosts `/version` e `/health`, hashes Git, identidade workflow/runtime, GitHub OIDC, HMAC, evidence envelope e recorder imutável; ausência de secrets ou prova externa continuará `BLOCKED` sem gravar `VERIFIED`.
- Fortalecer o gate pré-Attempt-9 e os testes de contaminação zero, mantendo Attempt 8, retenção, cleanup desabilitado, Railway congelado e Canonical/métricas/features sem mutação.
- Atualizar workflows sem deploy, documentação de configuração externa sem valores secretos, roadmap e relatório C.3/C.4 com estados reais separados.

## Detalhes técnicos
- Aplicar eventual alteração de schema apenas por migration incremental, com ACL service-role-only, RLS/imutabilidade e `search_path` seguro.
- Manter o branch Railway `infra/cs2-parser-worker-v8`, deployment e commit congelados; separar rigorosamente `workflow_sha` de `runtime_commit_sha`.
- O workflow remoto somente valida e produz evidência; não faz merge, deploy, restart, mudança de variável, staged patch, replay ou enqueue.
- Fixtures positivas permanecem estritamente test-only e nunca alimentam provenance ou autorização de produção.

## Validação
- Rodar testes Python de parser/adapter/RAW/forense/mapping/attestation, testes TypeScript focados e completos, typecheck, lint, compileall, formatação/diff e build automático.
- Fazer auditorias read-only de schema, grants, triggers, inventário, provenance, Attempts 8/9/10+, métricas, features e nova Canonical.
- Consultar evidência externa e CI remoto somente quando credenciais/acesso reais existirem; caso contrário registrar `NOT_RUN/BLOCKED`, nunca `PASS`.

## Gate final
- Não executar Attempt 9/10+, replay, DEM real, cópia ou exclusão de Storage, cleanup, Canonical, métricas, features, AI Coach ou mutação Railway.
- Declarar `READY_FOR_ATTEMPT_9` somente se todos os gates reais forem comprovados; na ausência esperada de secrets, CI remoto, parity, determinismo ou tick authority, finalizar como `BLOCKED_BEFORE_ATTEMPT_9` com relatório técnico completo.
