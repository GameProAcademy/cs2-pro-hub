# FASE 2.7.2D.6 — Fechamento HOT/RAW, Railway e E2E Cache

## Objetivo
Fechar a arquitetura de ingestão real preservando o RAW completo e privado, produzindo um HOT compacto com os sinais essenciais de AIM, posição e economia, sincronizando o worker Railway e comprovando o mesmo job Cache até estado terminal.

## Implementação
- Auditar os campos reais expostos pelo parser e projetar somente evidência comprovada em `aim_observations`, `position_snapshots` e `economy_snapshots`; indisponibilidade permanece explícita e nenhuma métrica ou identidade é inventada.
- Derivar snapshots HOT determinísticos em pontos semanticamente relevantes, com limites e contagens de qualidade explícitos; manter combat, utility, objective, jogadores e rounds.
- Preservar integralmente o RAW atual: todas as seções, trajetórias de granadas, JSONL gzip, normalização NaN apenas na serialização, chunks 4/8 MiB, SHA físico, chain, manifest, root digest e reutilização idempotente.
- Endurecer o consumidor APP para aceitar as seções implementadas sem relaxar identidade, revision lock, limite HOT de 8 MiB, audit server-owned ou admissão Canonical.
- Atualizar testes Python e TypeScript para campos, semântica, determinismo, limites, overflow, idempotência, claim e separação entre `attempt` e `attempt_number`.

## Railway e execução real
- Comparar e sincronizar somente os arquivos do worker, preservando `parser_child.py`, parser isolado, bounded ticks, `parse_grenades(grenades=False)`, RSS, timeout e crash handling.
- Executar testes, build e deploy controlado; comprovar `/health`, `/version`, revision real, contract version 1 e atividade do worker sem expor credenciais.
- Inspecionar o estado real antes de qualquer ação e continuar exclusivamente o job `a31f5c25-b0d8-41ac-8225-27814cd1732a`, upload existente e mensagem 14 pelo recovery/reconciliation oficial quando elegível.
- Acompanhar e medir claim, download, parser, HOT, RAW, chunks, verificação, READY, auditoria, `/complete`, Canonical, match, rounds, eventos, métricas, features, fila, job e upload. Não declarar PASS antes dos 20 gates.

## Ajuste mobile
- Alterar somente as traduções portuguesas solicitadas para “Enviar dados” e “Envie seus prints ou relatórios aqui”, sem mudar upload ou layout.
- Validar visualmente e funcionalmente `/upload` em viewport mobile.

## Restrições e fechamento
- Não criar upload, demo, job ou mensagem; não resetar tentativa, apagar histórico/dados, reduzir RAW ou aumentar limites.
- Não avançar de fase se qualquer gate falhar. Registrar o último PASS, primeiro FAIL, estado recuperável e todas as medições reais exigidas.
- Entregar o relatório final completo com arquitetura, dados preservados, granadas, HOT, RAW, NaN, claim, Railway, timeline Cache, Canonical, métricas, features, fila, job, upload, mobile e gates.