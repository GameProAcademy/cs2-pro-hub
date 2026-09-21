# F.2.10-I/J/K — hardening completo do harness de DEM real

## Objetivo
Preparar o harness para receber futuramente um único DEM real autorizado e produzir evidência auditável Python × WASM, sem executar DEM, liberar Canonical, alterar Railway/produção ou inventar resultados.

## Implementação
- Versionar uma superfície demoparser2 0.42.0 que separe suporte upstream, catálogo do projeto, export disponível, requestabilidade, execução, validação, normalização, paridade e elegibilidade canônica.
- Tornar o catálogo de eventos específico por evento e registrar cada chamada `parseEvent` com os campos efetivamente enviados, campos retornados, ausências, extras e digests.
- Preservar inventário de eventos bruto, ordem e duplicatas; manter o inventário normalizado apenas como derivação.
- Completar evidências independentes de grenades, rounds e domínio de ticks, mantendo amostras limitadas e sem inferências canônicas.
- Criar o contrato e o produtor Python de reference artifact, acionado somente por caminho explícito de DEM autorizado e retornando o bloqueio oficial quando ausente.
- Endurecer manifests de execução, vínculo SHA por run, comparador field-by-field, contagens automáticas de cobertura, determinismo 2×Python + 2×WASM e validação recursiva de números não finitos.
- Adicionar testes negativos para limites, semântica null/zero/false, eventos, grenades, rounds, digests, identidades, determinismo e bloqueio canônico.
- Atualizar os relatórios técnicos e o roadmap com o estado honesto `HARNESS READY FOR AUTHORIZED REAL DEM`, mantendo todas as provas reais como `NOT_RUN/BLOCKED`.

## Detalhes técnicos
- Limites preservados: DEM 128 MiB, resultado 2 MiB, 1.000 amostras de evento, 1.024 nomes, 128 players e probe de 4.096 ticks.
- Digests excluem duração, timestamps, nomes/caminhos locais e metadados de máquina.
- `parsePlayerInfo` continua `UNAVAILABLE` quando ausente da superfície observada.
- Nenhuma migration, CI, dado produtivo, Storage, secret, deploy, Cache Run ou mutação Canonical.

## Validação
- Testes TypeScript completos e focados, lint, typecheck, build automático e testes Python existentes.
- Confirmar ausência de `.dem`, payload/binário falso e qualquer `canonicalEligible=true`.
- Registrar contagens calculadas de campos, eventos, grenades e dimensões de paridade no relatório final.
