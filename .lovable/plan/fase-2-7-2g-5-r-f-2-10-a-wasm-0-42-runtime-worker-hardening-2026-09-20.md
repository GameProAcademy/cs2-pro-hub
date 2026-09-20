# Fase 2.7.2G.5-R-F.2.10-A — WASM 0.42 Runtime & Worker Hardening

## Objetivo
Endurecer a POC isolada do parser local para que a arquitetura de Worker seja válida, a proveniência do runtime 0.42.0 seja auditável e todos os bloqueios restantes sejam explícitos, sem tocar na ingestão produtiva.

## Implementação
- Corrigir a incompatibilidade entre Module Worker e `importScripts`, escolhendo uma única arquitetura compatível com o binding real e mantendo cancelamento, isolamento de requests e transferência do `ArrayBuffer`.
- Fixar uma proveniência reproduzível do runtime browser 0.42.0 somente se fontes oficiais permitirem; separar digest da superfície carregada dos hashes reais do binding e do binário, usando `null/UNAVAILABLE` quando não houver prova.
- Descobrir exports em runtime e derivar capacidades observadas; tratar `parsePlayerInfo`, eventos preferenciais e tick probe com estados explícitos `AVAILABLE`, `UNAVAILABLE`, `NOT_PRESENT` e `PARSE_FAILED`.
- Separar descoberta de eventos do inventário realmente parseado, normalizar inventário de jogadores sem inferência pelo header e manter resultados/samples estritamente limitados.
- Reduzir o limite de arquivo da POC para um teto conservador ainda não associado a suporte de 400 MB.
- Endurecer o validator com travessia iterativa limitada por profundidade, nós e bytes, rejeitando chaves proibidas em qualquer nível, ciclos, funções, objetos exóticos, Blob/File, ArrayBuffer e typed arrays.
- Restringir URLs de runtime a configuração confiável e same-origin, sem entrada controlada pelo usuário.
- Adicionar infraestrutura de teste real Browser → Worker → WASM → DEM → validator, executável apenas quando runtime e fixture autorizados existirem; nunca simular sucesso real.

## Testes e evidência
- Ampliar testes unitários de Worker/protocolo, arquivo, hashing, jogadores, eventos, ticks, manifest, segurança, limites, determinismo, transferíveis e cancelamento.
- Executar testes focados e completos, typecheck, lint, build, verificações Python aplicáveis e diff check.
- Executar o teste real de navegador apenas se houver artifact 0.42.0 auditável e DEM fixture autorizado; caso contrário registrar `NOT_RUN`.
- Atualizar documentação e roadmap com relatório A–M, proveniência/hashes reais ou bloqueio preciso, limitações de memória e separação entre provas estáticas e runtime real.

## Restrições preservadas
- Feature flag permanece desligada por padrão e a rota continua isolada/autenticada.
- Nenhum upload/persistência de DEM, Cache Run, retry, attempt 9, enqueue/claim, Canonical, migration, Storage histórico, dado produtivo, secret, deploy Railway ou alteração do parser Python.
- O resultado final será exatamente `POC_NOT_READY` ou `POC_RUNTIME_READY_FOR_F.2.10-B`; sem claim de paridade ou suporte a 400 MB.
