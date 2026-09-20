# Fase 2.7.2G.5-R-F.2.10 — POC híbrida de parser local

## Objetivo
Construir uma POC isolada para selecionar e processar uma demo CS2 local em Web Worker, sem upload do `.dem`, sem substituir o pipeline Python/Railway e sem permitir admissão Canonical.

## Implementação
- Confirmar a distribuição WASM oficial e fixar exatamente a versão disponível compatível com `0.42.0`; se o artefato npm oficial não existir nessa versão, manter a integração explicitamente bloqueada em vez de instalar o binding Node ou simular o parser.
- Criar contratos client-safe, protocolo do Worker, códigos de erro, SHA-256 dos bytes reais, normalização/digest determinístico, limites compactos e manifesto não confiável.
- Criar o Web Worker com estados explícitos, progresso, transferência de `ArrayBuffer`, cancelamento e chamadas somente às APIs WASM realmente exportadas.
- Criar um serviço browser para controlar o Worker e uma tela POC separada, atrás de feature flag pública desabilitada por padrão, sem alterar o fluxo de upload de produção.
- Criar validação server-side dry-run, limitada e fail-closed, que rejeita DEM/RAW/ticks completos, payloads profundos ou grandes, identidade/digests/contratos inválidos e nunca persiste dados.
- Endurecer o vínculo da prova RAW usada na admissão Canonical somente se os dados atuais permitirem verificação real; caso contrário, manter bloqueado e documentar a limitação sem falsa validação.
- Criar comparação client-versus-Python sem timestamps/performance e sem declarar paridade sem corpus real.

## Testes e evidência
- Adicionar fixtures sintéticas apenas para contrato e testes de determinismo, limites, mensagens do Worker, cancelamento, payloads forjados e conteúdo proibido.
- Testar o carregamento WASM real no navegador quando o pacote oficial puder ser instalado; separar claramente PASS, SKIPPED, UNAVAILABLE e NOT_RUN.
- Executar testes focados e completos, lint, typecheck, build, compilação Python e verificação de whitespace.
- Documentar arquitetura, trust boundary, limites de memória/400 MB, fallback Python/Railway, paridade futura e relatório final; atualizar o roadmap.

## Restrições preservadas
- Nenhum Cache Run, retry, attempt 9, enqueue/claim, escrita Canonical, migration, segredo, deploy Railway, alteração de Storage ou mutação dos attempts/artifacts históricos.
- O parser Python/Railway e o fluxo de upload atual permanecem intactos.
- O resultado final será apenas `POC_NOT_READY`, `POC_READY_FOR_REAL_BROWSER_TEST` ou `POC_VALIDATED_FOR_PARITY_PHASE`, nunca “production ready”.
