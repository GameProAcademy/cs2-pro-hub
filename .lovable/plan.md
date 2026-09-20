# Fase F.2.10 A–D — fechamento técnico do parser WASM

## Objetivo
Concluir o máximo de infraestrutura auditável do parser local, provar somente o que puder ser executado com artifacts e demos reais, e manter todo resultado do navegador bloqueado para Canonical.

## Implementação
1. **Proveniência e build**
   - Registrar revisão upstream 0.42.0, receita reprodutível, toolchain, target, artifacts, hashes e superfície observada.
   - Manter o artifact como `UNAVAILABLE/BLOCKED` enquanto binding e binary reais não puderem ser reproduzidos e verificados.

2. **Worker, contrato HOT e segurança**
   - Endurecer o Worker classic, integridade pré-execução, cancelamento, descarte de buffers, erros estruturados e diagnóstico bounded.
   - Expandir catálogo, header, eventos, rounds, probes de ticks e inventários sem inferir dados ausentes.
   - Endurecer manifest, digests e validator recursivo contra todas as falsificações e vazamentos listados.

3. **Paridade e browser harness**
   - Criar comparação semântica Python × WASM nas 22 dimensões e relatórios field-level.
   - Preparar teste real Chromium → Worker → WASM → DEM, incluindo cancelamento e ausência de envio do DEM.
   - Executar apenas se houver artifact 0.42.0 verificado e fixture DEM real autorizada; caso contrário registrar `BLOCKED/NOT_RUN`.

4. **Provas e documentação**
   - Adicionar testes positivos/negativos, executar suíte completa, typecheck, lint, parser Python, diff check e build automático.
   - Criar os quatro documentos exigidos, atualizar o roadmap com fatos e emitir matriz final de capabilities, HOT e matéria-prima de AI.

## Limites
- Feature flag continua OFF por padrão.
- Nenhum Cache Run, retry, attempt 9, RAW/Canonical real, histórico, produção, Storage, migration, secret ou Railway será alterado.
- Nenhum WASM, DEM, hash, dado, parity ou benchmark será fabricado.

## Decisão final
Reportar separadamente F.2.10-A/B/C/D, Canonical, HOT e AI; qualquer prova não executada permanece `BLOCKED` ou `NOT_RUN`.
