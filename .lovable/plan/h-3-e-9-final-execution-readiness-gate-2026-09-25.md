# H.3-E.9 — Final Execution Readiness Gate

## Objetivo
Implementar um preflight determinístico e somente diagnóstico que produza `READY` ou `BLOCKED` para a futura primeira attestation, sem autorizar ou executar qualquer ação real.

## Implementação
- Criar um contrato TypeScript machine-readable com identidades congeladas, estado do banco, segurança, transporte, secrets por presença, workflow/OIDC, Railway, retenção, autorização do operador e invariantes de não-execução.
- Criar um avaliador puro, fail-closed e sem efeitos colaterais, com blocker codes estáveis; qualquer valor ausente, desconhecido, contraditório ou expirado produz `BLOCKED`.
- Separar explicitamente technical readiness, autorização de attestation, autorização de execução, execução e provenance verificada. `READY` nunca dispara workflow, parser, DEM, gravação, Canonical, cleanup, Railway ou secrets.
- Representar retenção e autorização do operador como evidências explícitas, datadas, escopadas e opcionais; não fabricar nenhuma. No estado atual, a ausência delas manterá o gate `BLOCKED / NOT EXECUTED`.

## Verificação somente leitura
- Confirmar contagens zero, migration H.3-E.8.1, RLS, privilégios, `SECURITY DEFINER`, `search_path`, bridge HMAC e pins exatos por consultas somente leitura.
- Confirmar APP = WORKFLOW = DATABASE, hash real do workflow, configuração estrutural OIDC e presença nominal dos secrets, sem ler valores.
- Consultar somente `/version` e `/health` nos dois domínios Railway e validar a identidade congelada, sem mutação.
- Fazer somente `POST {}` não autenticado no endpoint público, exigir `401`, e reconfirmar contagens zero.

## Testes e documentação
- Cobrir READY sintético, cada blocker obrigatório, expiração, mismatches, migration única, paridade e um teste explícito de não-ação.
- Executar testes focados e completos web/Python, typecheck, lint, build e diff-check.
- Criar/atualizar o relatório H.3-E.9 e o roadmap com o estado factual final; nenhuma migration será criada ou alterada.

## Travas
- Nenhuma attestation válida ou workflow dispatch.
- Nenhum DEM, Cache DEM, Attempt 9+, RAW final, Canonical admission ou cleanup.
- Nenhuma alteração de Railway, EnvironmentPatch, secrets, limites, feature flags ou banco.
- Resultado final permitido: `READY / NOT EXECUTED` ou `BLOCKED / NOT EXECUTED`.
