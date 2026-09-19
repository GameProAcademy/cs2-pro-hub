# FASE 2.7.2G.5-R-F.1 — Concorrência descartável

## Auditoria e ambiente
- Revalidar o lifecycle reserve→upload→enqueue, contratos do cliente, constraints, locks e estado histórico somente por leitura.
- Criar um cluster PostgreSQL local temporário com `initdb`/`pg_ctl`, sem credenciais ou conexão de produção.
- Reproduzir o schema mínimo e aplicar as funções SQL reais das migrations, isolando apenas dependências externas como a fila.

## Prova concorrente
- Adicionar uma suíte de integração separada que abra duas conexões PostgreSQL reais e sincronize chamadas simultâneas.
- Cobrir blocked_raw_audit, janela reserve→enqueue, enqueue concorrente, interleavings, failed, cancelled, stale, processed aprovado, legacy unvalidated, fencing, ACL e unicidade de SHA ativo.
- Repetir o cenário principal em volume significativo, consultar o estado persistido e destruir o cluster ao final.

## Correção orientada por evidência
- Se o teste revelar falha, criar migration incremental e ajustar somente o contrato/orquestração necessários.
- Preservar o contrato público de `submitDemo`, o histórico, o parser, Railway, Storage, RAW e Canonical.
- Adicionar regressões sem substituir os testes estáticos existentes.

## Fechamento
- Executar suítes focadas e completas, parser, typecheck, compileall, build, lint de escopo/global e diff check.
- Revalidar o Cache histórico e Railway somente por leitura.
- Criar o relatório com a matriz exata G5-R-F.1-01..30 e sincronizar o relatório anterior e o roadmap.
- Não executar Cache Run 1 ou Run 2; readiness depende de todos os gates críticos comprovados.
