# FASE 2.7.2D.4-B.0 — RAW streaming / hot payload boundary

## Objetivo
Retirar todo RAW volumoso do callback `/complete`. O parser persistirá a evidência completa em chunks JSONL gzip no bucket privado existente; o APP receberá apenas um payload HOT limitado e uma referência verificável ao artifact READY.

## Implementação
1. **Contratos compartilhados e limites**
   - Introduzir `HotDemoPayloadV1` com parser/demo identity, header, players, rounds, eventos semânticos limitados, quality e provenance.
   - Definir limites explícitos por coleção e sinalização de overflow/coverage; proibir campos RAW e arrays ilimitados no HOT.
   - Introduzir `RawArtifactReferenceV1` com artifact, manifest, root digest, identity e status READY.

2. **Writer RAW incremental no parser**
   - Criar writer server-side que serializa uma linha por vez, fecha chunks gzip perto de 4 MiB e recusa qualquer chunk acima de 8 MiB.
   - Calcular SHA-256 físico, cadeia `previous_chunk_sha256`, digest por seção e root digest sem remontar o RAW completo.
   - Persistir lifecycle nas tabelas existentes `raw_evidence_artifacts`/`raw_evidence_chunks` e objetos no bucket privado `cs2-raw-evidence`.
   - Garantir idempotência por `job_id + attempt_number`: reutilizar READY compatível, rejeitar conflito e separar novas tentativas.

3. **Extração e memória do parser**
   - Encaminhar cada seção RAW ao writer sem incluí-la na resposta final.
   - Tratar as linhas de granadas incrementalmente assim que a API atual as devolver e liberar a referência após a escrita.
   - Gerar somente projeções semânticas limitadas para o HOT; overflow será explícito, nunca silencioso.

4. **Worker e `/complete`**
   - Fazer o worker enviar somente identidade do claim, HOT e referência RAW.
   - Reduzir o limite do callback e validar estritamente que nenhum campo RAW legado chegou.
   - No APP, conferir artifact READY, bucket/path, job, upload, usuário, SHA, tentativa, parser identity, manifest e root digest antes do Canonical.
   - Substituir a auditoria integral em memória por admissão baseada em manifest/chunks verificados; manter a aprovação fail-closed e a defesa antes do Canonical.

5. **Compatibilidade e documentação**
   - Preservar normalização, persistência Canonical, métricas e projeções; adaptar apenas as interfaces necessárias ao novo HOT.
   - Documentar as variáveis server-side esperadas no Railway sem valores e registrar o drift histórico da migration RAW sem tentar corrigi-lo.
   - Não alterar UI, autenticação, integrações, dados, uploads, demos, Railway ou schema.

6. **Validação**
   - Adicionar testes Python e TypeScript para limites/overflow, chunking, hard max, hash chain, root digest, lifecycle, idempotência e rejeição do contrato legado.
   - Medir o tamanho do HOT em fixture de alto volume e provar que 340.885 linhas de granadas não atravessam `/complete`.
   - Executar testes focados, testes backend existentes, checagem TypeScript e validação automática do build.

## Critérios de conclusão
- HOT limitado e sem RAW completo.
- Artifact completo em chunks verificáveis, manifest pequeno e root digest determinístico.
- `/complete` pequeno e fail-closed, sem canonicalização ou persistência de RAW gigante.
- Retry técnico idempotente e nova tentativa isolada.
- Nenhuma UI ou secret alterada.
- O E2E com a demo real permanece **PENDENTE** até Railway receber as variáveis/deploy e a demo comprovar ausência de OOM em produção.
