# FASE 2.7.2D.1.1 — Correção do transporte APP → parser

## Objetivo
Trocar exclusivamente a política de redirecionamento incompatível do transporte do parser de `error` para `manual`, sem seguir redirects e sem alterar o gate fail-closed.

## Implementação
- Atualizar todos os fetches do parser em `remoteParser.server.ts`: POST real `/v1/parse`, preflight `/health` e `/version`, e os quatro probes dos domínios customizado e Railway.
- Manter respostas 3xx como não-OK e preservar integralmente identidade, timeout, autenticação do POST, diagnóstico sanitizado e decisão do scheduler.
- Ajustar os testes para provar `redirect: "manual"` no preflight, diagnóstico e POST real, além de manter cobertura de sanitização, ausência de autenticação/dados nos probes e fail-closed.
- Registrar a fase no roadmap sem fechar a FASE 2.7.2D.

## Validação
- Executar testes relevantes do parser, conectividade e gate, TypeScript e verificação de diferenças.
- Confirmar que não resta `redirect: "error"` no transporte do parser.
- Publicar a versão atual em produção.
- Aguardar uma execução real do scheduler e verificar a resposta completa: preflight, quatro probes, gate, job, processamento, recuperação, limpeza e FACEIT.
- Confirmar nos logs do Railway as chamadas `GET /health`, `GET /version` e, somente se ocorrer naturalmente, `POST /v1/parse`.

## Limites
Nenhuma alteração em banco, migrations, scheduler, Railway, DNS, parser worker, armazenamento, lifecycle, fontes externas ou arquitetura. Nenhum novo upload, reenvio ou processamento manual. Não avançar para 2.7.2D.2 ou 2.8.
