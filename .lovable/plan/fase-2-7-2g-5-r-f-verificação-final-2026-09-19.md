# FASE 2.7.2G.5-R-F — Verificação final

## Auditoria
- Validar migration, schema real, permissões, locks, índices, constraints e diff desde o baseline indicado.
- Confirmar por leitura que job, upload e artifact Cache históricos permanecem intactos.
- Auditar a arquitetura frontend atual sem recriar componentes antigos excluídos.

## Prova dinâmica
- Executar uma prova concorrente real somente se houver uma estratégia transacional segura e integralmente reversível.
- Usar identidades temporárias isoladas, medir uploads/jobs/attempts/supersessão/SHA e confirmar rollback.
- Se rollback concorrente seguro não for tecnicamente possível, registrar o gate como PARTIAL/BLOCKED sem simular a prova.

## Validação
- Executar regressões de lifecycle/idempotência, RAW, HOT, Canonical, identidade, parser e suíte completa.
- Executar typecheck, compileall, build, diff check e lint; separar falhas novas do baseline.
- Fazer smoke real das rotas públicas e, havendo sessão segura, das rotas autenticadas, observando console e rede.

## Fechamento
- Criar o relatório G.5-R-F com a matriz obrigatória de 35 gates e evidências.
- Atualizar o roadmap apenas com fatos comprovados.
- Não executar Cache Run 1/Run 2, requeue histórico, parser real, Railway deploy, alteração de secrets, RAW, artifact ou Canonical.
