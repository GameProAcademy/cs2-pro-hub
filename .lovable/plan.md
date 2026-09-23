# R5.8 — Preflight da primeira attestation

## Objetivo
Auditar os pré-requisitos operacionais e deixar um relatório seguro para a futura primeira attestation, sem executá-la e sem avançar para o Attempt 9.

## Etapas
1. Confirmar, somente por leitura, o estado do staging, objetos privados, jobs, provenance, nonces, inventário Canonical, funções V3 e gate pré-DEM.
2. Verificar a presença dos quatro itens operacionais sem revelar valores: segredo de transporte, segredo HMAC do servidor, endpoint e token Railway.
3. Validar o workflow aprovado em `main`, blob fixado, contrato dos três SHAs, OIDC, binding de release evidence e identidade Railway congelada.
4. Confirmar a configuração HMAC protegida do banco apenas por estado/comprimento e registrar se a consistência exige ação do operador.
5. Criar ou atualizar os relatórios R5.8 humano e legível por máquina, além do roadmap, sem migration ou alteração de infraestrutura.
6. Executar testes focados, TypeScript, lint, build, verificação de diff e repetir o snapshot read-only final.

## Limites
- Nenhum dispatch, token OIDC real, attestation, provenance/nonce, parser, DEM, Attempt 9+, RAW ou promoção Canonical.
- Nenhuma migration, rotação/exposição de segredo, deploy Railway ou aplicação de EnvironmentPatch.
- Se uma falha técnica exigir código ou migration, parar e reportar antes de implementar.

## Resultado esperado
Classificação final `BLOCKED_OPERATOR_CONFIGURATION`, `BLOCKED_TECHNICAL` ou `READY_FOR_FIRST_ATTESTATION_AUDIT`, com checklist explícito da próxima ação segura.
