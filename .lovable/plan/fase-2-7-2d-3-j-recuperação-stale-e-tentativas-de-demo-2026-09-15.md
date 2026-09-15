# FASE 2.7.2D.3-J — Recuperação stale e tentativas de demo

## Objetivo
Corrigir o lifecycle de uploads repetidos para separar a identidade dos bytes (SHA-256) da tentativa operacional, sem alterar o worker Railway nem enfraquecer RAW, auditoria forense ou admissão Canonical.

## Implementação

1. **Modelo e máquina de estados**
   - Adicionar aos jobs o número da tentativa, vínculo com a tentativa substituída e motivo terminal.
   - Representar uma tentativa abandonada como terminal e preservada no histórico; nunca resetá-la para `pending`.
   - Manter `retry_count` exclusivamente para retries internos do mesmo job.

2. **Reserva e replacement atômicos**
   - Reescrever `reserve_demo_upload` sob o lock já usado por usuário + SHA-256.
   - Priorizar qualquer tentativa `processed`; reutilizar apenas `pending/processing` saudável.
   - Considerar `processing` stale somente quando a lease real estiver expirada, alinhada ao durable worker.
   - Para stale, cancelled ou novo upload permitido após falha, criar novo `upload_id`, caminho privado e tentativa; marcar/vincular a anterior de forma terminal e auditável.
   - Garantir que dois uploads concorrentes elejam no máximo uma nova tentativa.

3. **Proteções do worker e fila**
   - Fazer claim, heartbeat, fail e finalize rejeitarem jobs substituídos ou claims antigos.
   - Enfileirar somente a nova tentativa após os bytes existirem no caminho novo.
   - Preservar retry interno, cancelamento e bloqueios permanentes existentes.

4. **Contrato APP e fluxo do upload**
   - Ampliar o retorno tipado de reserva/submit com `newAttempt`, número da tentativa, job anterior e motivo de replacement.
   - Manter os campos públicos existentes (`jobId`, `duplicate`, `duplicateStatus`) e garantir que `jobId` seja sempre o novo job quando houver replacement.
   - Fazer o polling ativo mudar imediatamente para o novo job.

5. **UX e histórico**
   - Mostrar “Nova tentativa criada” e explicar a substituição nos cinco idiomas.
   - Exibir tentativa atual/anterior, vínculo de substituição e estado terminal da tentativa antiga sem redesenhar a página.
   - Distinguir retry interno de nova tentativa e manter mensagens honestas para processed e processamento saudável.

6. **Testes e prova**
   - Cobrir processed, processing saudável, processing stale, cancelled, failed retryable/permanente, concorrência, stale completion/heartbeat, isolamento de storage, troca de polling e gate Canonical intacto.
   - Executar testes focados, typecheck e verificar o build observado.
   - Consultar o banco para confirmar schema/RPCs e invariantes; não processar demos reais nem alterar os registros históricos citados.
   - Atualizar documentação e roadmap com o status honesto; sem declarar E2E de produção.

## Limites
- Nenhum novo serviço, scheduler ou processamento síncrono.
- Nenhuma alteração no Railway sem evidência técnica nova.
- Nenhuma demo real será enviada ou processada.
- Nenhuma mudança no contrato RAW, digest, auditor independente, imutabilidade ou gate Canonical.
