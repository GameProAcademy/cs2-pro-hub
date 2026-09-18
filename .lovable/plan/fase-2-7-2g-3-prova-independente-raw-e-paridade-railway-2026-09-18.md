# Fase 2.7.2G.3 — Prova independente RAW e paridade Railway

## Objetivo
Provar, sem mutar o pipeline, que os 178 campos do manifest RAW físico correspondem exatamente ao corpus local, que a admissão canônica continua fail-closed e que a branch Railway pode ser sincronizada cirurgicamente.

## Execução
1. Criar um auditor reutilizável e estrito para validar identidade, digest, estrutura, duplicatas, enumerações e reconciliação exata dos mappings extraídos do manifest real.
2. Ler novamente o artifact Cache preservado por caminho server-only/master-admin e gerar evidência derivada em memória, sem alterar banco, Storage, manifest, chunks ou status.
3. Confrontar campo a campo manifest, fixture e `mapping_inventory()`, incluindo provas dos 4 `MAPPED` e razões explícitas dos 174 `RAW_ONLY_INTENTIONAL`.
4. Auditar eventos e campos internos, players, rounds, ticks amostrados, bombas, combate, granadas, times/score, usercmd e todos os inventários forenses, mantendo `UNKNOWN`/`NULL` quando não comprovados.
5. Recalcular independentemente os três gates históricos e exercitar cópias em memória adulteradas para confirmar bloqueio por gate, digest, status, mapping desconhecido, parse failure e razão ausente.
6. Rastrear e testar o caminho RAW → auditoria → aprovação → Canonical para impedir qualquer bypass, sem persistência real.
7. Comparar por hash e semântica a main com `infra/cs2-parser-worker-v8`; se a referência não estiver disponível localmente/remotamente, registrar a paridade como bloqueada em vez de inferi-la.
8. Criar o relatório `cache-g3-independent-raw-audit.md` com a matriz completa, 20 gates, identidades, diferenças, testes, bloqueadores e recomendações.
9. Executar testes RAW/parser/pipeline/Canonical, typecheck, compileall, diff check e build; atualizar o roadmap com resultados honestos.

## Restrições preservadas
- Cache Run 1 e Run 2 não serão executados; nenhum job será reenfileirado e nenhuma tentativa será criada.
- Artifact, chunks, manifest, digests, aprovação, Canonical, banco, Storage e secrets permanecerão imutáveis.
- Railway não receberá deploy, merge, mudança de branch ou configuração.
- Contract 1, RAW integral, amostragem declarada de ticks e comportamento fail-closed permanecem inalterados.
- O máximo resultado operacional será `G3 PASS — READY FOR CONTROLLED RAILWAY PARITY SYNC`.
