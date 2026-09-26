# H.3-E.9.1 — Live Evidence Collector & Machine-Readable Preflight

## Objetivo
Implementar um coletor real, protegido e somente leitura que reúna evidências atuais, alimente o avaliador puro H.3-E.9 e produza um artefato JSON determinístico, sem executar attestation, DEM ou qualquer mutação operacional.

## Implementação
- Manter `evaluateH3E9FinalExecutionReadiness` puro e criar módulos separados para schema estrito, serialização canônica, digest SHA-256, validação OIDC/JWKS e adaptação das evidências ao contrato existente.
- Criar endpoint interno server-side autenticado exclusivamente pelo OIDC do workflow H.3-E.9.1, vinculado ao repositório, `main`, `workflow_dispatch`, workflow exato e identidade temporal; respostas conterão apenas estados seguros.
- Coletar no servidor evidência read-only do banco: contagens, migration history, RLS, privilégios, funções protegidas, pins persistidos, bridge transaction-local e locks de execução/Canonical. Falhas e indisponibilidade bloquearão o resultado.
- Coletar no workflow manual evidência do blob real do workflow aprovado, configuração estrutural OIDC, presença nominal dos secrets do GitHub, Railway control-plane read-only, `/health` e `/version` nos dois domínios e o POST anônimo `{}` esperado em `401`.
- Enviar apenas evidência externa segura ao endpoint; o servidor combinará com evidência confiável local, repetirá as contagens após o teste negativo, avaliará H.3-E.9 e devolverá o artefato final com digest canônico.
- Manter retenção e autorização do operador como `NOT_AUTHORIZED` na ausência de evidência explícita; o coletor nunca fabricará autorização.

## Workflow e artefato
- Criar `.github/workflows/h3-e9-1-live-evidence-preflight.yml` somente com `workflow_dispatch`, `contents: read` e `id-token: write`.
- O workflow não terá dispatch encadeado e não chamará parser/DEM; fará apenas consultas GET, a fronteira POST negativa e upload de `h3-e9-live-preflight.json`.
- O artefato incluirá schema/versionamento, fontes e timestamps, identidades, evidências seguras, locks, resultado final e `evidenceDigest`, sem credenciais ou dados brutos sensíveis.

## Testes e documentação
- Adicionar testes positivos sintéticos, matriz negativa fail-closed, OIDC, digest reproduzível, schema estrito e garantias de ausência de operações mutáveis.
- Atualizar a documentação H.3-E.9.1, o roadmap e a regra arquitetural do projeto.
- Executar testes focados e completos web/Python, verificação TypeScript, lint e diff-check; o build será validado pelo ambiente.

## Travas
- Nenhuma migration, attestation válida, provenance, nonce, DEM, Cache DEM, Attempt 9+, RAW final, Canonical admission, cleanup, dispatch de execução, Railway/EnvironmentPatch mutation ou alteração de secrets.
- Resultado operacional desta fase: `IMPLEMENTED / FAIL-CLOSED / DIAGNOSTIC-ONLY`; qualquer evidência ausente, inválida ou indisponível resulta em `BLOCKED`.
