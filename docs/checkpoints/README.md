# Protocolo de continuidade do CS2 PRO (permanente)

Origem: "PROMPT MESTRE DE CONTINUIDADE PERSISTENTE" do dono do projeto (2026-11-11). Vale
para toda sessão de trabalho neste repositório. Não substitui nem apaga
`docs/A9_1_CONTINUITY_CHECKPOINT.md`.

## Arquivos

- `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md` — central, conciso, primeira leitura.
- `docs/checkpoints/PHASE_{1..5}_CHECKPOINT.md` — um por fase mestre (seções A–F).
- `docs/checkpoints/FOUNDATION_CHECKPOINT.md` — missão de fundação (anterior às fases).

## Quando atualizar (central + fase ativa)

Ao concluir etapa relevante; após auditoria importante, defeito relevante, correção, testes
importantes, falha de CI, correção de CI, criação/atualização de PR, merge, deploy, validação
em produção; antes de iniciar outra fase; antes de encerrar a sessão; sempre que houver risco
de interrupção. Não esperar o fim da fase.

## Como persistir

Na branch da implementação correspondente (ou branch documental), commit identificável, PR,
checks, merge. Só está persistido quando o arquivo foi **conferido no repositório remoto**.
Nunca incluir segredos, dados pessoais, dumps, demos privadas, temporários ou logs sensíveis.

## Como retomar ("continue", "retome de onde parou")

1. Ler o arquivo central; depois só o checkpoint da fase ativa.
2. Conferir o estado real: branch, commit, arquivos modificados, PRs, CI, commits posteriores,
   merge, deploy.
3. Comparar; se divergir, **prevalece o estado real** — corrigir o checkpoint antes de seguir.
4. Retomar na primeira etapa realmente pendente. Não repetir etapas comprovadas, não repetir
   testes sem motivo técnico, não reexecutar operações com efeito colateral sem verificar
   idempotência e estado, não reiniciar auditorias.

## Interrupção

Manter a seção `## ESTADO EXATO PARA RETOMADA` no arquivo central. Alterações não commitadas:
não descartar, não sobrescrever, sem reset destrutivo, sem checkout que perca trabalho;
registrar e preservar. Não declarar concluído o que ainda está em execução.

## Estados

CONFIRMADO · IMPLEMENTADO, MAS NÃO VALIDADO · VALIDADO EM TESTE · VALIDADO EM PRODUÇÃO ·
PENDENTE · BLOQUEADO · NÃO APLICÁVEL. Hipótese nunca vira fato.

## Fim de sessão

Gerar `## RESUMO PARA PRÓXIMA SESSÃO` (≤ 15 linhas, formato do arquivo central).

## Transição entre fases

Critérios de aceitação com evidência → testes → registrar → atualizar fase e central → PRs,
commits, deploys → riscos remanescentes → só então marcar concluída → dependências da próxima
→ preparar o próximo checkpoint. Não iniciar a fase seguinte com bloqueio crítico na anterior.

## Regras do projeto que continuam valendo

RLS, ownership, autenticação, autorização, rate limits, idempotência, leases, reservations,
response guards, parser identity, build pin, H.3-E, runtime attestation e gates de ativação
não são enfraquecidos. Ausência nunca vira zero. Nada inventado. Coach: OpenRouter
`openai/gpt-oss-20b`, sem fallback. Sem reprocessar demos reais sem autorização. Sem ações
destrutivas. Nenhuma mensagem ou comando ao agente do Lovable.
