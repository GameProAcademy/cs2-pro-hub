# H.3-E.8.1 — Database Persistence Identity Reconciliation

## Objetivo
Reconciliar exclusivamente os pins autoritativos de deployment e workflow no banco protegido, preservando todos os controles fail-closed e sem executar attestation válida, DEM, Canonical, secrets ou qualquer operação Railway.

## Implementação
1. Recuperar a migration canônica do PR #45 quando acessível e comparar sua lógica com as funções atualmente implantadas; se não estiver acessível, reproduzir estritamente os prechecks e substituições definidos.
2. Criar/aplicar uma migration aditiva que aborte antes de qualquer alteração se provenance ou nonce não estiverem vazios, se as três funções autoritativas não contiverem exatamente os pins antigos esperados, ou se suas propriedades de segurança divergirem.
3. Substituir somente o deployment `6330c8c4-a410-45db-a364-4eb47702c2fc` por `7a540da0-3a69-44c0-9c42-40209f903fa7` e o workflow blob `de6732f465cae08c96aece304558273242b7016d` por `fae651ed5174aa609e4b07d575105d80a00d0055` nas funções autoritativas indicadas.
4. Preservar `SECURITY DEFINER`, `search_path` vazio, HMAC transaction-local, OIDC, freshness, schema v3, release/mapping evidence, hashes críticos, RLS e privilégios atuais.
5. Adicionar testes sintéticos/read-only de paridade positiva e negativa entre aplicação, workflow e definição SQL, incluindo combinações mistas antigas/novas e o bug histórico de `payload.release_gate_evidence`.
6. Atualizar o relatório H.3-E.8.1 e o roadmap, deixando H.3-E.9 como `READY / NOT EXECUTED` somente se todos os gates passarem.

## Verificação
- Consultar em modo somente leitura as quatro funções, contagens, RLS, triggers imutáveis e privilégios após a migration.
- Exigir APP = WORKFLOW = DATABASE para deployment e workflow SHA; pins antigos ausentes das funções autoritativas.
- Executar testes focados e completos, testes Python, typecheck, lint, diff check e confirmar o build gerenciado.
- Enviar apenas `POST {}` sem autenticação ao endpoint público e exigir `401 UNAUTHORIZED`.
- Não executar attestation válida, DEM, ingestão, Canonical, mutation Railway ou alteração de secrets.
