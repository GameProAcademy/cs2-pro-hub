# PM6 B — Auditoria do alerta de segurança do Lovable (2026-11-13/14)

## Origem

Na publicação de 2026-11-13 (~22:50Z), o scanner rápido do Lovable apontou dois achados:

1. **Crítico**: "Some file storage rules don't tie files to their owner" (3 políticas).
2. **Aviso**: "Some access rules let everyone through" (5 tabelas).

O scanner não informa quais políticas são. O painel do Lovable não foi aberto nesta sessão, porque o acesso pelo navegador foi negado. A identificação abaixo vem do SQL real do banco gerenciado, lido com SELECT em `pg_policies`, `storage.buckets`, `storage.objects`, `information_schema` e `pg_proc`.

## Achado 1 — Storage (crítico)

**Fato.** Políticas de `storage.objects` em produção:

| Política                                                    | Papel         | Restrição                                                                 |
| ----------------------------------------------------------- | ------------- | ------------------------------------------------------------------------- |
| `demos_insert_own`/`demos_update_own`                       | authenticated | pasta = `auth.uid()`, `*.dem`                                             |
| `demos_select_own`                                          | authenticated | pasta = `auth.uid()` ou `is_staff` (suporte)                              |
| `avatars_*_own`                                             | authenticated | `<uid>/avatar.webp`; SELECT também para `is_admin_master`                 |
| `r5_forensic_staging_objects_master_{select,insert,update}` | authenticated | `is_admin_master` + bucket + **um** nome fixo. **Sem vínculo com o dono** |
| `r5_forensic_staging_objects_service_*`                     | service_role  | bucket + nome fixo                                                        |

- Os 4 buckets são privados.
- O bucket forense tem 1 objeto (2026-09-23), e o dono é o único admin master atual.
- `demos` e `avatars` restringem cada usuário à própria pasta. As políticas `master_*` são as únicas 3 do papel `authenticated` que permitem ler, criar e sobrescrever sem relação nenhuma com o dono do arquivo. Um segundo admin master poderia ler ou sobrescrever o fixture forense de outro.
- Isso coincide com "3 políticas" e com o texto do achado ("download, change … or add files without keeping each person to their own files").
- **Classificação**: problema real e de baixo impacto. O acesso é restrito a admin master e a um objeto, e nenhum dado de usuário é exposto, mas falta o vínculo de dono que o achado descreve.

**Correção.** As 3 políticas passam a exigir também `owner_id = auth.uid()::text`. O dono do fixture mantém o upload retomável (`src/lib/pipeline/r5ResumableUpload.ts`), e as políticas `service_role` (workflow A9.1 e operador de retenção) não mudam.

## Achado 2 — Catálogo público (aviso)

**Fato.** `lessons`, `skills`, `lesson_translations`, `skill_translations` e `lesson_skills` tinham `FOR SELECT USING (true)` para todos os papéis (`20260903012041`), com GRANT SELECT para `anon`.

- `lessons.active` e `skills.active` são `NOT NULL DEFAULT true`.
- Com `USING (true)`, uma aula ou skill desativada continuaria pública, junto com as traduções, o `lesson_url` e os vínculos.
- Estado atual: 0 aulas, 10 skills (todas ativas), 50 traduções de skill, 0 vínculos. **Não há exposição concreta hoje**; a política permitiria uma exposição no futuro.
- O app só lê `skills` pelo admin, no servidor (`src/lib/admin.functions.ts`).

**Correção.** O SELECT público passa a expor apenas linhas ativas. Traduções e vínculos seguem o estado do registro pai, e as políticas de escrita e leitura de staff e master ficam intactas. O catálogo continua público, conforme o produto pretende, mas só com conteúdo ativo.

**Limite conhecido.** O scanner pode continuar marcando leitura anônima como aviso, porque o catálogo publicado é público por desenho. Se isso acontecer, o aviso será registrado como intencional, com esta justificativa, e não tratado como corrigido.

## Migration e testes

- `supabase/migrations/20261114010000_pm6_security_catalog_active_forensic_owner.sql`: `DROP POLICY IF EXISTS` + `CREATE`, idempotente, sem tocar linhas, grants, funções ou buckets.
- `scripts/security/catalog_storage_rls_harness.py`: PostgreSQL descartável com as políticas de produção.
  - **Linha de base, que prova o problema**: anônimo lê aula inativa e as traduções dela; segundo admin master lê, atualiza e insere o fixture em nome de outro.
  - **Depois da migration (aplicada 2×)**: 29 checks cobrindo anônimo, usuário A, usuário B, staff, admin master dono e admin master não dono.
  - Os checks incluem isolamento A↔B em `demos`, nenhum objeto visível para anônimo, escrita na pasta alheia recusada, catálogo de staff completo, leitura do `service_role` preservada e leitura de suporte do staff inalterada.
- `src/lib/__tests__/securityCatalogStorageRls.integration.test.ts`: roda o harness e um teste de mutação, em que uma migration vazia é reprovada.

## Rollback

Recriar as políticas com as definições anteriores, que estão em `20260903012041` (catálogo) e `20260923015032` (forense). Não há dados a restaurar.

## Resultado em produção (2026-11-14)

- PR #284, merge `00e767fa`, com 7/7 checks verdes.
- Migration `20261114010000` aplicada no banco gerenciado, conferida em `pg_policies` e registrada em `schema_migrations` (md5 `068b0e90…`).
- Acesso real medido com os papéis do Supabase, numa transação desfeita com ROLLBACK, sem gravar nada:

| Perfil                    | Catálogo                          | Fixture forense | Demos                  |
| ------------------------- | --------------------------------- | --------------- | ---------------------- |
| anônimo                   | 10 skills / 50 traduções (ativas) | 0               | 0 objetos              |
| admin master dono         | 10 skills                         | 1               | —                      |
| usuário comum (não staff) | —                                 | 0               | só a própria pasta (1) |

- App publicado pelo conector: deployment `804fd0a3`, `pending`, a partir de `00e767fa`. O conector não recusou o publish por achados críticos.
- **Scanner do Lovable: NOT_VERIFIED.** A aceitação do publish não prova que o scanner está limpo, porque na publicação anterior o achado crítico só gerou aviso, sem bloquear. O painel de segurança não pôde ser aberto nesta sessão (acesso pelo navegador negado). O dono confirma o resultado em Security.
- Se o aviso do catálogo continuar, ele é intencional: só conteúdo ativo é público, e isso está documentado acima.
