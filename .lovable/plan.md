# Fase 2.7.2G.5-R-F.2.8–2.9 — fechamento forense

## Objetivo
Endurecer exclusivamente código, contratos, testes e documentação do pipeline RAW Forensic V2, mantendo toda admissão canônica fail-closed e sem executar demos ou alterar produção.

## Implementação
1. **Proveniência e superfície do parser**
   - Separar catálogo declarado, inspeção independente do runtime instalado, observação por demo e mappings.
   - Registrar assinatura, presença, origem e digest determinístico por capability.
   - Reconciliar conjuntos independentes e bloquear quando a completude do runtime não puder ser provada.

2. **Classificação e autoridade de ticks**
   - Centralizar a taxonomia `NOT_PRESENT`, `UNAVAILABLE`, `PARSE_FAILED` e o atributo `null_only`, mantendo exatamente seis classificações V2.
   - Formalizar `TickDomainAuthority` com fontes permitidas; fixtures só autorizam testes e ausência de fonte real bloqueia admissão.
   - Validar intervalos e lotes com contagens, ausências, extras, duplicidades, overlaps e digests.

3. **Gates semânticos**
   - Substituir verificações de simples existência por validadores de header, jogadores, rounds/gaps, times/score, bomba, granadas, combate, armas/economia, usercmd, agregados e eventos.
   - Preservar evidência parcial e nunca inferir zero, identidade, score ou relacionamento ausente.

4. **Reconciliação física e digests**
   - Expandir projeções producer/physical para as 36 dimensões exigidas, com reconstrução por seção e comparação `missing/extra/different` mais subdigests.
   - Recalcular digest unsigned e digest final incluindo gates, reconciliação, catálogo, autoridade de ticks e root do artifact.
   - Exigir producer + physical + reconciliation + digests para Gate 22 e Canonical.

5. **Provas e documentação**
   - Adicionar os testes positivos e os 50 cenários negativos fail-closed aplicáveis.
   - Executar testes completos APP/parser, testes focados, typecheck, lint, build e compileall.
   - Atualizar relatório da fase e roadmap com resultados reais e blockers restantes.

## Limites operacionais
- Não executar Cache Run 1/2, retry, attempt 9, enqueue, job real ou artifact v2 real.
- Não escrever Canonical, alterar attempts/artifacts históricos, Storage, migrations, secrets, Railway ou produção.
- Fixtures provam somente comportamento de código, nunca a demo real.

## Critério de decisão
- `PASS_FOR_CODE_HARDENING` somente com todos os gates locais comprovados.
- `READY_FOR_CONTROLLED_V2_ARTIFACT` somente se houver fonte real independente para o domínio de ticks; caso contrário, permanecer `BLOCKED / INCOMPLETE` com esse blocker explícito.
