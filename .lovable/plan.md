# FASE 2.7.2D-C — UX de duplicidade e seleção do jogador

## Objetivo
Ajustar somente a interface para representar cada resultado real de envio por SHA-256 e tornar explícita a escolha do jogador detectado na demo.

## Alterações
1. Fazer o painel de envio interpretar `duplicate` e `duplicateStatus`, exibindo mensagens distintas para demo nova, processada, em fila, falha reenfileirada e cancelada reenfileirada.
2. Preservar a atualização do histórico após todo envio, sem criar entradas visuais artificiais.
3. Refinar a seleção do jogador com opções inteiramente clicáveis, seleção visual clara, confirmação bloqueada até uma escolha e mensagem honesta quando não houver participantes.
4. Manter o campo de nickname manual e exibir candidatos reais quando houver ambiguidade, sem seleção automática.
5. Registrar todas as novas mensagens em pt-BR, pt-PT, inglês, espanhol e francês.
6. Adicionar testes de interface cobrindo os cinco resultados de envio, habilitação da confirmação e lista vazia.

## Limites técnicos
- Nenhuma mudança em banco, migrations, RPCs, scheduler, parser, storage, funções server-side ou processamento.
- O contrato atual de `submitDemo()` será preservado.
- A fase 2.7.2D continuará sem ser marcada como concluída.

## Validação
- Executar os testes novos e os testes frontend relacionados.
- Confirmar tipos, lint e resultado de compilação do preview.
