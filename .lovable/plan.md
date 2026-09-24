# Fase 2.7.2H.1-M0 — Exposição e isolamento do Browser Memory Lab

## Objetivo
Disponibilizar o laboratório sintético em uma página administrativa autenticada própria, controlada somente por `VITE_CLIENT_DEM_MEMORY_LAB`, sem habilitar ou depender do Parser POC e sem executar qualquer medição automaticamente.

## Implementação
1. Criar `/admin/memory-lab` dentro da área autenticada, reutilizando o `BrowserMemoryLab` existente e exibindo `FEATURE_DISABLED` sem criar fixture, Worker ou medição quando a flag estiver desligada.
2. Adicionar acesso apenas na navegação administrativa quando a flag estiver ligada; não expor o laboratório no menu principal do produto.
3. Remover o acoplamento visual do laboratório com `ClientParserPoc`, preservando o Parser POC como ferramenta independente.
4. Completar a tela com o cabeçalho H.1-M, estados diagnósticos de segurança/capacidade, matriz local das 15 execuções e todos os campos de resultado definidos pelo protocolo.
5. Manter execução exclusivamente manual, relatório metadata-only e limpeza restrita ao estado local da página.
6. Adicionar testes de rota, flags, isolamento, limites, ausência de Worker com flag desligada e invariantes do runner/Worker já endurecidos.
7. Atualizar os três documentos do gate e o roadmap, mantendo H.1-R como PASS e H.1-M como NOT RUN.

## Validação
Executar testes focados e completos, testes do serviço parser, TypeScript, lint e confirmar o build automático.

## Locks preservados
Flags continuam OFF por padrão, `realDemoParser` continua false, teto permanece 128 MiB e nenhum DEM real, parser/WASM, backend, persistência, Railway, R5.8, attestation, Canonical, banco, migration, secret ou analytics será executado ou alterado.
