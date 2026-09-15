# FASE 2.7.2D.3-I.1 — Final forensic integrity hardening

## Objetivo
Fechar os cinco pontos P0/P1 da cadeia de custódia RAW sem processar demos reais, alterar o Railway, tocar no job Cache ou avançar funcionalidades posteriores.

## Implementação
1. **Digest verificável e único**
   - Definir a projeção exata de evidência incluída no digest e canonicalização JSON estável compatível entre Python e TypeScript.
   - Recalcular o SHA-256 no auditor sobre o conteúdo efetivamente recebido/persistido, excluindo digest e decisão de auditoria.
   - Bloquear digest ausente, inválido, impossível de recalcular ou divergente.

2. **Inventários semânticos completos**
   - Separar campos de evento retornados, não nulos, somente nulos, preservados e ausentes.
   - Separar game state em capability, requested, returned, preserved, observed no sample e mapping.
   - Manter ticks como `SAMPLE` com `full_extraction=false`; campos desconhecidos continuam preservados e bloqueantes.

3. **Auditor independente fail-closed**
   - Recalcular identidade, contagens, preservação, mappings, falhas de parse, cobertura, samples e completude sem usar gates upstream como autoridade.
   - Usar gates apenas como evidência adicional; qualquer inconsistência crítica impede `APPROVED`.

4. **Imutabilidade e Canonical admission**
   - Criar migration incremental para vincular a decisão ao digest e tornar RAW, decisão, razões e versão de auditoria imutáveis no banco.
   - Preservar `job_id + attempt + evidence_version` e impedir overwrite silencioso.
   - Reforçar as duas barreiras Canonical para conferir aprovação, versão e digest recalculado do registro persistido.

5. **Provas e documentação**
   - Adicionar testes sintéticos dos 40 cenários obrigatórios, incluindo digest, null-only, sample, unknown, retry/versionamento e Canonical.
   - Executar testes TypeScript/Python focados, checks de tipos, compilação Python, diff e build automático.
   - Atualizar documentação e roadmap para `IMPLEMENTED / HARDENED / TESTED IN CODE — NOT CLOSED UNTIL FINAL REVIEW` somente se todas as provas passarem.

## Restrições
- Nenhuma demo real, chamada `/v1/parse`, alteração no Railway ou no job Cache.
- Nenhuma mudança semântica no Canonical Engine, FACEIT, Gamers Club, Identity, Metrics, Features, DNA, Diagnosis ou AI Coach.
- Migration apenas incremental, sem apagar histórico e mantendo RLS, grants mínimos e funções protegidas.
