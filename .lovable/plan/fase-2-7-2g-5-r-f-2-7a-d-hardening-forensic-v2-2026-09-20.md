# Fase 2.7.2G.5-R-F.2.7A–D — Hardening Forensic V2

## Objetivo
Fechar o mecanismo de auditoria forense v2 em código, fixtures e contratos, mantendo a admissão Canonical fail-closed e sem executar demo, retry, fila, produção, Storage, Railway ou mutation histórica.

## Implementação

1. **Prova autoritativa do domínio de ticks**
   - Inspecionar a superfície instalada do `demoparser2==0.42.0` e registrar a provenance da fonte esperada de ticks.
   - Substituir a inferência pelo primeiro batch por `EXPECTED_TICK_DOMAIN` explícito; quando a fonte não for comprovável, retornar `UNAVAILABLE/BLOCKED`.
   - Processar `PROPERTY_BATCH × TICK_INTERVAL`, com intervalos configuráveis, estatísticas incrementais, detecção de missing/unexpected/duplicates/gaps/overlaps e digest determinístico.
   - Manter a amostra de 4096 somente para diagnóstico/HOT, nunca como prova de admissão.

2. **Fechamento da superfície de capabilities**
   - Ampliar o catálogo versionado para as 24 categorias obrigatórias e APIs públicas verificáveis da versão 0.42.0.
   - Exigir identity, source kind, provenance, availability e classificação final para cada capability.
   - Implementar reconciliação exata catálogo ↔ runtime ↔ mappings, bloqueando duplicatas, órfãos, diferenças e qualquer `UNMAPPED_BUT_AVAILABLE` no contrato v2.

3. **Inventários e gates semânticos reais**
   - Produzir provas especializadas para header, player info, eventos/campos, rounds, team/score, bomb, grenades, combat/death/damage, weapons/inventory, usercommands e aggregates.
   - Aplicar invariantes de rounds e contenção de eventos, sem inventar identidade, score, Steam ID, zero, false ou ausência.
   - Distinguir `NOT_PRESENT`, `UNAVAILABLE` e `PARSE_FAILED` pela tentativa e disponibilidade reais.

4. **Reconciliação producer ↔ artifact**
   - Expandir o leitor físico streaming para reconstruir seções, linhas, campos, eventos, players, rounds, ticks, propriedades, classifications, mappings, identities e digests.
   - Comparar conjuntos e digests canônicos, registrando missing/extra/different e falhando em qualquer divergência.
   - Formalizar `producer_gate_status`, `physical_gate_status` e `final_gate_status`; Canonical só admite `final_gate_status=PASS`.

5. **Testes e validação**
   - Adicionar fixtures para domínio completo/incompleto, intervalos, API indisponível, parse failure, seis classificações, eventos, rounds, team/score, corruption e divergências físicas.
   - Provar bounded processing por chamadas/intervalos, sem depender de RSS exato e sem chamada global ilimitada quando o modo intervalado estiver disponível.
   - Executar testes focados e completos do APP/parser, contratos RAW/Canonical, typecheck, lint, build, compileall e diff check.

6. **Documentação e decisão**
   - Atualizar o relatório principal, criar relatórios 2.7A–D e registrar catálogo, tick source, batching, limites, gates, reconciliação e limitações.
   - Atualizar o roadmap para `PASS_FOR_CODE_HARDENING / READY_FOR_CONTROLLED_V2_ARTIFACT` somente se todos os gates de código passarem; caso contrário manter `BLOCKED / INCOMPLETE` com blockers explícitos.
   - Registrar que fixture não equivale a demo real e que Railway sync permanece pendente.

## Limites invioláveis
- Sem Cache Run 1/2, retry do attempt 8, attempt 9, enqueue, claim ou processamento real.
- Sem escrita Canonical real, migration destrutiva, mutation de attempts/artifacts 7/8, banco ou Storage histórico.
- Sem secrets, deploy/configuração Railway ou merge externo.
- Sem expansão automática do schema Canonical; novas capabilities ficam `RAW_ONLY` com motivo até revisão semântica explícita.

## Critério de conclusão
O código deve estar implementado e comprovado por fixtures, com domínio esperado autoritativo ou bloqueio explícito, catálogo reconciliado, gates semânticos reais, artifact físico integralmente reconciliado e admissão Canonical final fail-closed. A prova em demo real permanece para uma futura execução controlada.
