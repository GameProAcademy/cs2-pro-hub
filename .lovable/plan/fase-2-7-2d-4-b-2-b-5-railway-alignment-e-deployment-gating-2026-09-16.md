# FASE 2.7.2D.4-B.2–B.5 — Railway alignment e deployment gating

## Objetivo
Deixar o projeto **READY FOR RAILWAY SYNC**, sem sincronizar ou implantar o Railway e sem executar a demo real. A sincronização futura será cirúrgica para a branch `infra/cs2-parser-worker-v8`, nunca um merge integral da `main`.

## Implementação
- Documentar o contrato do runtime Railway, separando claramente parser/worker de orquestração, banco, Storage, Canonical e estado do pipeline no APP.
- Criar a matriz `MUST SYNC`, `MUST PRESERVE FROM RAILWAY` e `TEST ONLY`, incluindo todos os módulos importados pelo worker e preservando as proteções de memória específicas de `parser_child.py`.
- Fixar os contratos existentes: parser `demoparser2 0.42.0`, contract version `1`, revision determinística em produção, HOT 4 MiB/8 MiB, RAW chunks 4 MiB/8 MiB, tentativa lógica separada da tentativa técnica e signed upload sem credencial privilegiada no Railway.
- Documentar o endpoint `/v1/parse` como legado/não durável, sem alterar o limite do caminho durável e sem quebrar seu comportamento nesta fase.
- Endurecer somente lacunas comprovadas por auditoria: observabilidade sanitizada, revision pin, autoridade final da auditoria no APP, imutabilidade READY, manifest/hash chain/root e gates anteriores ao Canonical.
- Adicionar testes de compatibilidade para tentativa lógica/técnica, eventos não classificados, seções `not_implemented`, quatro faixas de payload, retry parcial, hash chain, manifest e imutabilidade READY.
- Criar o runbook B.2–B.5: sincronização arquivo a arquivo, auditoria de ambiente, implantação controlada com rollback e smoke test posterior com medições de RSS/tempo/linhas.

## Validação
- Executar testes Python do parser/worker/HOT/RAW e testes TypeScript de bridge, jobs, lifecycle, gates, progresso e Canonical.
- Executar verificação de tipos, build e checagem de diff.
- Registrar aprovações, falhas preexistentes e bloqueios sem apagar ou enfraquecer testes.

## Limites
- Não processar a demo Cache nem acionar o consumer contra o job real reservado.
- Não fazer deploy, merge, sincronização de branch ou alteração de secrets Railway.
- Não alterar dados, forçar E2E, apagar histórico, recriar tabelas RAW ou fabricar histórico de migrations.
- Não enviar RAW pelo `/complete`, não elevar o hard maximum de 8 MiB e não alegar streaming completo do parser.

## Resultado esperado
Estado final **READY FOR RAILWAY SYNC**, aguardando auditoria externa. B.3 será apenas uma matriz de verificação; B.4 e B.5 permanecerão gates operacionais ainda não executados.