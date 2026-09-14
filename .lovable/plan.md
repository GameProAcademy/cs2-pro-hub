# FASE 2.7.2D.1 — Diagnóstico APP → parser

## Objetivo
Identificar com segurança a causa exata da falha de transporte entre a aplicação publicada e os dois endereços do parser, sem processar demos nem alterar infraestrutura.

## Alterações
- Ampliar o probe existente para registrar um diagnóstico sanitizado e limitado, mantendo `PARSER_UNAVAILABLE` como erro público de transporte.
- Adicionar uma rotina server-side que consulta `/health` e `/version`, separadamente, nos domínios customizado e Railway, sem autenticação ou dados de demo.
- Incluir os resultados seguros apenas na resposta autenticada do scheduler existente.
- Preservar integralmente o gate fail-closed: sem identidade saudável, nenhum job será reivindicado ou processado.
- Adicionar testes focados em sanitização, timeout, falhas de transporte e independência das quatro sondagens.
- Registrar a fase como diagnóstico em andamento, sem fechar a 2.7.2D nem iniciar a 2.7.2D.2.

## Validação
- Executar testes relevantes e verificar a compilação automática.
- Confirmar que não houve alteração no banco, Railway, DNS, scheduler ou dados de negócio.
- Publicar a versão atual em produção.
- Aguardar uma execução real do scheduler e consultar seu resultado para informar status e diagnóstico dos dois domínios, além de `parserGate`, `processed` e qualquer job reivindicado.

## Limites técnicos
- Nenhuma nova rota pública, migration, RPC, segredo, proxy ou contorno de rede.
- Nenhuma chamada ao endpoint de parsing e nenhum reenvio/processamento de demo.
- Diagnósticos sem cabeçalhos, URLs assinadas, identificadores, hashes, conteúdo, PII ou stack trace; limite aproximado de 300 caracteres.
