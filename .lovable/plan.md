# G.6-R.4 — Fechamento da attestation do parser

## Objetivo
Endurecer a cadeia de confiança do parser publicado e manter o replay real bloqueado até GitHub, deployment, runtime e hashes críticos terem prova independente e consistente.

## Implementação
- Executar preflight estritamente read-only para GitHub, Railway/runtime, banco, Storage, attempts, RAW histórico, filas e cleanup.
- Evoluir incrementalmente `parser_runtime_provenance`, sem tabela paralela, adicionando repository, versão/digest da attestation, endpoint verificado, provas estruturadas e estados controlados.
- Definir serialização canônica determinística e SHA-256 da attestation; validar no banco todos os campos esperados, os cinco hashes críticos, freshness, método e vínculo ao runtime.
- Criar fluxo server-side de verificação que consulta fontes autoritativas e registra `VERIFIED` ou `REJECTED` com trilha auditável, sem aceitar prova montada pelo browser ou override manual.
- Preservar imutabilidade append-only e acesso exclusivo de service role; fortalecer reserva/finalização do Attempt 9 e a identificação auditável de cópia concluída sem cleanup automático.
- Auditar caminhos administrativos e lifecycle contra inserts diretos, bypass da RPC dedicada e criação de Attempt 10.
- Atualizar o CI e testes contratuais para provenance, digest, concorrência, storage, JSONB, RAW/Canonical e restrições A–AD.
- Documentar a matriz de preflight e o estado operacional no roadmap.

## Release gate
- Se qualquer prova externa não puder ser obtida ou divergir, registrar o bloqueio honestamente e não criar provenance `VERIFIED`, upload, job, cópia, RAW ou Canonical.
- Somente com provenance real aceita pelo gate repetir o preflight e executar uma única vez o fluxo oficial do Attempt 9, observando-o até terminal.
- Nunca criar Attempt 10, alterar Railway, aceitar o patch staged, executar cleanup destrutivo, reescrever RAW histórico ou liberar Canonical fora dos gates existentes.

## Validação
- Rodar testes focados e completos disponíveis, tipagem, lint, compilação Python, revision guard, diff check e conferir o build observado.
- Consultar o banco após cada gate relevante para comprovar contagens, ACLs, constraints, auditoria e ausência de mutações proibidas.
- Emitir relatório final separado em IMPLEMENTED, TESTED, EXECUTED, VERIFIED, BLOCKED, FAILED e NOT RUN, sem equiparar código/teste a prova operacional.
