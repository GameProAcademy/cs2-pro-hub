# Fase 2.7.2G.6-R — fechamento seguro de retenção e paridade Railway

## Objetivo
Eliminar qualquer execução automática ou legada de deleção de DEM, tornar o mecanismo G.6 a única autoridade futura e provar — sem DEM real nem operação destrutiva — se o runtime Railway está exatamente alinhado ao candidato aprovado.

## Implementação

1. **Inventário e contenção de cleanup**
   - Catalogar todos os caminhos de deleção física e marcação de metadata em código, migrations, RPCs, cron e funções administrativas.
   - Definir `DEMO_CLEANUP_AUTHORITY = G6_VERIFIED_DELETE_ONLY` e um bloqueio interno fail-closed para execução física durante esta fase.
   - Remover a chamada destrutiva do cron e do acionamento administrativo/cancelamento; preservar recuperação, reconciliação e métricas não destrutivas.
   - Criar migration incremental que desative explicitamente qualquer função/RPC legada encontrada, sem apagar migrations ou histórico.

2. **Contrato G.6 único**
   - Manter o único fluxo futuro: seleção → gate central → claim transacional → ownership → retenção/estado/lease/RAW/Canonical → existência → remoção → verificação de ausência → metadata.
   - Endurecer retry × cleanup e expiração de claim, mantendo órfãos apenas reportados e mismatches em quarentena.
   - Preservar integralmente objetos remanescentes, uploads, jobs, SHA, RAW evidence e Canonical.

3. **Paridade do runtime Railway**
   - Fixar o candidato no SHA completo do código aprovado e gerar inventário SHA por arquivo do runtime.
   - Validar contrato de identidade: `demoparser2`, `0.42.0`, contrato `1`, revisions `git:<40-sha>`, sem fallback.
   - Comparar runtime publicado via `/health` e `/version` e, se houver acesso autorizado, sincronizar apenas os arquivos necessários do worker; nunca fazer merge amplo.
   - Se deploy/branch não estiver acessível, registrar blocker exato e manter o resultado final `BLOCKED`.

4. **Provas e regressões**
   - Completar matriz cleanup A–T, incluindo legacy cron/RPC desativados e rejeição de deleção direta fora do G.6.
   - Completar matriz Railway A–N com identidade, hashes, endpoints e ausência de revisions proibidas.
   - Consultar somente em modo leitura os três objetos em quarentena e registrar count/bytes/retenção/motivo, sem apagar ou reprocessar.

5. **Validação e documentação**
   - Executar formatação, tipos, Vitest completo e focado, lint, build, compileall e pytest quando disponível.
   - Atualizar os quatro relatórios exigidos e adicionar a nova seção no topo do roadmap, preservando todo o histórico.
   - Emitir somente `PASS_FOR_NEXT_CONTROLLED_GATE` se todos os gates estiverem comprovados; caso contrário, `BLOCKED` com blocker, arquivo/função e remediação exatos.

## Restrições preservadas
- Nenhum DEM real, parsing, retry, Cache Run 2, attempt 9, cleanup físico, deleção/restauração, Canonical, AI Coach, alteração de feature flag, segredo ou dado histórico.
- Fixtures não contam como prova real; full tick-domain e paridade Python × WASM permanecem `NOT_RUN`.
