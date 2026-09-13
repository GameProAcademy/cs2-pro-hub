# FASE 2.7.2C — UX Hardening

## Objetivo
Melhorar a experiência mobile e a clareza do fluxo de demos sem alterar regras, estados, cálculos ou serviços existentes.

## Implementação
- Reorganizar os itens do histórico em cartões verticais no mobile, preservando a densidade atual no desktop; separar nome, status, detalhes, progresso, etapas e ações.
- Refinar `DemoProcessingStatus` com hierarquia clara, stepper de uma coluna no mobile, barra acessível e estados visuais distintos para fila, processamento, conclusão, falha e cancelamento.
- Melhorar somente a apresentação do cancelamento: botão confortável, largura total no mobile, bloqueio e feedback durante a solicitação, sem mudanças na operação existente.
- Transformar a seleção de jogador em opções visuais acessíveis, destacar a seleção e organizar o nickname manual em coluna no mobile; preservar confirmação explícita e todos os resultados atuais.
- Ajustar a área de upload para priorizar seleção de arquivo no mobile, mostrar arquivo/tamanho/estado claramente e manter upload e processamento como progressos separados.
- Reutilizar a infraestrutura do roteador para um carregamento inicial com marca e uma barra discreta durante navegações internas, sem atrasos artificiais ou novas consultas.
- Substituir mensagens genéricas por skeletons apenas onde já existe carregamento real: histórico e perfil.
- Endurecer o App Shell para telas estreitas, áreas de toque, safe areas e ausência de overflow horizontal.
- Atualizar as mensagens necessárias nos cinco idiomas suportados.

## Limites técnicos
- Nenhuma alteração em scheduler, backend, parser, Railway, banco, migrations, RLS, RPCs, pipeline, Canonical Match, métricas, features ou regras de identidade.
- O progresso continuará derivado exclusivamente do estado persistido; `pending/queued` continuará em 5%.
- O polling atual continuará inalterado e nenhum endpoint ou dependência será adicionado.

## Validação
- Verificar TypeScript, lint, testes focados e o build automático.
- Testar login e as páginas principais em desktop e larguras de 320, 360, 390 e 430 px.
- Confirmar os seis estados do job, upload, retry, cancelamento e identificação do jogador.
- Confirmar ausência de overflow, loaders não persistentes, navegação por teclado, anúncios acessíveis e redução de movimento.
