# FASE 2.7.2C — Recuperação, lifecycle e cancelamento do pipeline

## Estado confirmado

- O pipeline atual já preserva a arquitetura `upload → fila → claim → parser → RAW Evidence → Canonical Match → attachment → projeção`.
- `claim_next_demo_job` já usa lock transacional e `FOR UPDATE SKIP LOCKED`; ele será preservado como mecanismo único de claim.
- O endpoint protegido `/api/public/pipeline-cron` já executa recovery, cleanup, claim e processamento, mas não há scheduler de banco ativo e existem dois jobs reais parados em `pending/queued`.
- O job histórico com attachment confirmado conserva `match_id`, porém ainda tem timestamps da tentativa anterior e não possui metrics/features.
- A correção indicada pelo commit informado não está no histórico local; a intenção será incorporada sem criar uma segunda lógica.
- O progresso visual parte do estágio persistido, mas ainda avança por timer local e não reconhece cancelamento.
- Não existe hoje lifecycle persistido para `cancel_requested/cancelled` nem ação real de cancelamento.

## Implementação

1. **Lifecycle e operações atômicas no banco**
   - Ampliar os estados permitidos para `cancel_requested` e `cancelled` sem alterar os quatro estados existentes.
   - Criar rotinas transacionais protegidas para requeue após declaração, cancelamento pelo dono, checkpoint/finalização de cancelamento e recovery seguro.
   - Limpar `started_at`, `finished_at`, `duration_ms` e erros ao iniciar uma nova tentativa, preservando o `match_id` canônico.
   - Impedir que claim ou recovery selecione jobs cancelados ou com cancelamento solicitado.

2. **Processamento e finalização segura**
   - Adicionar checkpoints de cancelamento antes e depois das etapas caras, especialmente após o parser e antes de RAW/canônico/projeção/finalização.
   - Não interromper à força o parser nativo; concluir como `cancelled` no próximo checkpoint seguro.
   - Evitar que uma escrita tardia marque como `processed` um job já cancelado.
   - Manter `persist_demo_projection` como a única transação de metrics/features e preservar a persistência canônica source-neutral.
   - Ajustar retry/recovery para não ressuscitar cancelamentos e manter limites existentes.

3. **Cleanup seguro**
   - Excluir o arquivo temporário privado quando o cancelamento puder ser finalizado com segurança.
   - Registrar falha de cleanup sem apagar Canonical Match, sources, participantes, rounds ou eventos compartilháveis.

4. **Ações e interface**
   - Expor cancelamento autenticado somente ao dono, idempotente, por função server-side.
   - Mostrar `cancel_requested` e `cancelled`, parar polling em estados terminais e oferecer cancelar apenas em `pending/processing`.
   - Fazer o percentual derivar exclusivamente de `status/stage` persistidos; animação será apenas visual dentro da faixa e não reiniciará a verdade do processamento.
   - Atualizar textos nos cinco idiomas existentes.

5. **Scheduler**
   - Verificar a opção real de Jobs do ambiente e configurar uma única chamada por minuto ao endpoint com o segredo existente, se a plataforma permitir.
   - Se o ambiente não expuser criação de Jobs ao agente, não criar cron alternativo no Railway ou no banco; registrar o bloqueio e os parâmetros exatos para configuração manual.

6. **Validação**
   - Cobrir cancelamento pending/processing/repetido/sem ownership, claim/recovery, requeue com timestamps limpos, concorrência, finalização, idempotência e progresso persistido.
   - Preservar e testar `player_blind.blind_duration → CanonicalEvent.data.flash_duration`.
   - Processar o job real pendente pelo scheduler quando este estiver disponível; depois validar banco, RAW Evidence, canonical, participantes, rounds, eventos, attachment, metrics/features e ausência de duplicação.
   - Executar o E2E real completo e o teste de cancelamento somente quando o agendamento e o artefato privado estiverem acessíveis. Se algum elo não puder ser provado, manter a fase como `IMPLEMENTED / NOT CLOSED`, sem avançar para a FASE 2.8.

## Fora do escopo

- Nenhuma mudança em AI Coach, diagnóstico, score, DNA, treinamento, pagamentos ou integrações externas.
- Nenhuma reconstrução do parser Railway, scheduler no Railway, identidade inferida, dado fictício ou remoção de evidência histórica.
