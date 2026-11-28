# VGL 5.0 — Checkpoint

Missão: Prompt Mestre VGL 5.0 (2026-11-28). Relatório completo: `docs/vgl5/VGL5_REPORT.md`.
Estado: **CONCLUÍDA, PUBLICADA E VALIDADA EM PRODUÇÃO**, com as ressalvas da seção "Pendências".

## Estado exato (2026-11-28)

| Item             | Valor                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`           | `ab1cb961` (merge do #443) + o PR documental desta missão                                                                                                        |
| PRs da missão    | #436 F1 · #437 F4/F10 · #438 F5/F6 · #439 F7 · #440 F9 · #441 F2 · #442 F3 · #443 F8. Todos com CI verde e merged                                                |
| Migration        | `20261128120000_vgl5_public_profile` aplicada em produção a partir de `764ca825`. Registro: `direct-lovable-cloud-apply` / `direct-main-764ca825-20261128120000` |
| Deploy           | Lovable `a28754af` de `ab1cb961`. Bundle servido: `index-BYzvy3f2`                                                                                               |
| Parser / Railway | Não tocados. Sem deploy no Railway                                                                                                                               |
| Score / Coach    | Fórmula `pro-score-v1`, provedor, modelo e prompts do Coach intactos                                                                                             |

## Validação em produção (navegador integrado, 2026-11-28)

- **Início:** Score e DNA lado a lado (`data-home-headline`), Palavra do Treinador e Melhor Mapa no lugar de "Última partida".
- **/maps:** 7 rótulos de classificação; Palavra do Treinador presente.
- **/performance:** medidor, 3 tooltips, accordion "Como o seu Score é formado" fechado.
- **/player-dna:** layout de foco em duas colunas a 1440 px; tooltip da legenda.
- **/training:** 3 barras de prioridade, legenda, curso inteiro de `hub.gamepro.academy`.
- **/coach:** barra lateral visível a 1440 px e oculta a 768 px (dropdown no mobile).
- **/profile:**
  - card de perfil público com estado "Privado" e ID;
  - card "Partidas FACEIT" com estado vazio, coerente com o banco (0 partidas).
- **/p/ID-inexistente e /p/ID-de-perfil-privado:** a mesma tela "Perfil não encontrado".
- **Banco** (transação com rollback):
  - o dono não consegue mudar o `public_id` (`PUBLIC_ID_IMMUTABLE`);
  - o dono consegue alternar `public_profile`;
  - 4 perfis, 4 IDs distintos, 0 públicos.
- **Overflow horizontal:**
  - nenhum a 360 px (8 páginas), a 768 px (Início, Perfil, Coach) nem a 1440 px (Coach, DNA);
  - 390, 430, 1024, 1280 e 1920 px não foram medidos individualmente.

## Pendências (não bloqueiam)

1. **Perfil público no estado "público":** não foi validado de ponta a ponta em produção. Tornar público um perfil real precisa da ação do dono, pelo switch em Perfil. Para validar, ligar o switch numa conta de teste, abrir `/p/<ID>`, comparar com outro ID público e desligar de novo.
2. **FACEIT:** a validação ponta a ponta exige uma conta FACEIT com partidas de CS2. A conta conectada não tem nenhuma (`matches_found = 0`, `lifetime = null`).
3. **Treino:** o plano recomendou "Oratória e Comunicação" para a prioridade da conta testada. O mapeamento prioridade → curso do catálogo merece revisão de conteúdo pelo dono.
4. **PR #349** (reconciliação documental da Steam) segue aberto por decisão anterior.

## Não repetir

- Migration `20261128120000`.
- Merges #436–#443.
- Deploy `a28754af`.
