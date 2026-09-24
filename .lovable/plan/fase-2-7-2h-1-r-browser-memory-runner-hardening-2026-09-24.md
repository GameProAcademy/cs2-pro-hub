# Fase 2.7.2H.1-R — Browser Memory Runner Hardening

## Objetivo
Reforçar a integridade científica do laboratório sintético antes de qualquer medição manual, mantendo todos os gates e limites existentes.

## Implementação
1. Remover a amostragem concorrente disparada por `MATERIALIZATION_STARTED` e tornar o ciclo determinístico: baseline, fixture, pré-materialização, conclusão do Worker, amostra pós-materialização, cleanup.
2. Renomear o contrato para `postMaterializationBytes`, eliminar campos semanticamente duplicados e calcular o pico apenas com amostras efetivamente observadas.
3. Neutralizar a classificação de cleanup para `CLEANUP_OBSERVED`, preservando somente o delta numérico sem inferir vazamento ou estabilidade.
4. Tornar eventos inválidos e erros de Worker fail-closed, garantindo encerramento do Worker, remoção de listeners e liberação de referências em todos os caminhos.
5. Expandir os testes de lifecycle, corrida, amostras atrasadas, eventos inválidos, cleanup, pico, limites, metadata-only e isolamento.
6. Atualizar a documentação de evidência, criar o gate de fechamento H.1-R e o protocolo manual H.1-M sem executar medições.
7. Atualizar o roadmap com H.1-R concluída somente após CI verde; H.1-M permanece pendente e H.2 bloqueada.

## Validação
Executar testes focados e completos, testes do serviço parser, TypeScript, lint e confirmar o build automático.

## Locks preservados
Nenhum DEM real, parser/WASM, backend, banco, migration, secret, Railway, R5.8, attestation ou Canonical será executado ou alterado. O teto permanece 128 MiB, a flag do laboratório permanece false por padrão e `realDemoParser` permanece false.
