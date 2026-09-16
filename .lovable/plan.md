# Auditoria forense da conclusão da demo Cache

## Objetivo
Produzir um diagnóstico somente leitura do `complete` do job `a31f5c25-b0d8-41ac-8225-27814cd1732a`, sem alterar arquivos, banco, fila, configurações ou deploy.

## Evidência já confirmada
- O job existe e permanece `processing`, na etapa `raw_audit`, com mensagem `14`, `dispatch_attempt = 0`, worker `railway-parser-1` e sem erro terminal.
- Não existe registro em `raw_demo_evidence_reports` para o job, upload ou SHA informado.
- Não existe match, observação Canonical, métricas ou features ligados ao upload.
- Portanto, ainda não há prova de que o RAW tenha sido persistido antes do 502; a execução alcançou a marcação da etapa `raw_audit`, mas não deixou a inserção RAW concluída.

## Etapas da auditoria
1. Reconstruir, com referências exatas de código, o caminho síncrono:
   - leitura e validação do corpo em `/api/public/pipeline-worker/complete`;
   - renovação do lease em `completeDurableDemo()`;
   - validação do claim em `processJob()`;
   - auditoria e inserção RAW;
   - segunda validação independente antes da escrita Canonical;
   - persistência Canonical, projeções e finalizações do job/fila.
2. Delimitar os pontos de persistência parcial e provar quais etapas não ocorreram usando o estado real do banco.
3. Comparar `RawParserOutput` e `RawDemoEvidence` com a montagem Python e enumerar exatamente o JSON enviado no `result`.
4. Quantificar limites e amplificação do payload:
   - `events` normalizados;
   - `raw_events` com cópia integral de cada linha em `raw_fields`;
   - `tick_samples` limitado a 4.096 linhas;
   - `grenade_samples`, eventos e demais coleções sem limite explícito observado;
   - inventários, coberturas, mappings, rounds e dados de jogadores.
5. Confrontar os timestamps disponíveis do worker com o comportamento HTTP do endpoint e separar:
   - timeout do proxy/plataforma durante processamento síncrono;
   - rejeição por tamanho;
   - exceção interna do APP;
   - falha ou latência da inserção RAW.
6. Entregar uma lista priorizada de causas, indicando para cada uma: evidência favorável, evidência contrária e grau de certeza.

## Restrições
- Nenhuma escrita, recuperação, reenvio, reenfileiramento ou nova tentativa.
- Nenhuma alteração de código, migration, RPC, Railway, parser, RAW ou Canonical.
- O relatório não recomendará nem aplicará correções nesta etapa.

## Saída esperada
Relatório com estado final observado, tabela das dez etapas solicitadas, anatomia e estimativa do payload, cronologia do 502, conclusão sobre timeout versus erro interno e lacunas que os logs disponíveis não permitem provar.
