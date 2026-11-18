import type { adaptivePtBR } from "./pt-BR";

export const adaptivePtPT: Record<keyof typeof adaptivePtBR, string> = {
  "training.adaptive.catalogHeading": "Aulas recomendadas do catálogo",
  "training.adaptive.noPromise":
    "O plano organiza o seu treino a partir dos seus dados; não garante melhoria de desempenho. Faça pausas e ajuste o volume ao seu tempo.",
  "training.adaptive.state.NO_EVIDENCE.title": "Ainda não há evidência para um plano",
  "training.adaptive.state.NO_EVIDENCE.body":
    "Nenhuma área mostra um ponto a trabalhar com os dados atuais. Envie mais demos; nenhum exercício é recomendado sem evidência.",
  "training.adaptive.state.INSUFFICIENT_SAMPLE.title": "Amostra insuficiente para um plano",
  "training.adaptive.state.INSUFFICIENT_SAMPLE.body":
    "{n} jogo(s) analisado(s); o plano personalizado precisa de pelo menos {min}.",
  "training.adaptive.history": "Planos anteriores",
  "training.adaptive.history.subtitle": "Histórico preservado; nenhum plano é apagado.",
  "training.adaptive.history.item": "Plano de {h} dias iniciado em {start}",
  "training.adaptive.score":
    "prioridade {s} = confiança {c} × (0,6·lacuna {gap} + 0,25·tendência {trend}) + objetivo {g}",
  "training.adaptive.why": "Porquê esta área: as evidências abaixo, com amostra e método.",
  "training.adaptive.evidence.dna": "Player DNA: índice {v}/100 (abaixo de 60) em {n} jogos.",
  "training.adaptive.evidence.trend":
    "{metric}: {v} (medido em {n} de {w} jogos); variação vs período anterior: {d}.",
  "training.adaptive.noComparison": "sem comparação válida",
  "training.adaptive.openEvidence": "ver evidência",
  "training.adaptive.create.title": "Criar plano de treino",
  "training.adaptive.create.subtitle":
    "Prioridades calculadas a partir dos seus jogos. Escolha o horizonte e a disponibilidade.",
  "training.adaptive.excluded": "Áreas de fora:",
  "training.adaptive.exclusion.NOT_MEASURED": "não medida",
  "training.adaptive.exclusion.NO_SIGNAL": "sem ponto a trabalhar",
  "training.adaptive.exclusion.NO_EXERCISE": "sem exercício disponível",
  "training.adaptive.exclusion.LOW_SAMPLE": "amostra baixa",
  "training.adaptive.horizon": "Horizonte",
  "training.adaptive.horizonN": "{n} dias",
  "training.adaptive.sessionsPerWeek": "Sessões por semana",
  "training.adaptive.minutes": "Minutos por sessão",
  "training.adaptive.dropAreas": "Deixar de fora do plano:",
  "training.adaptive.create": "Criar plano",
  "training.adaptive.method":
    "Método cs2.training-priority.v1: só áreas com evidência (DNA observado abaixo de 60 ou piora numa comparação válida), amostra mínima de 3 jogos e exercício disponível. 7 dias = 1 prioridade, 30 = 2, 90 = 3.",
  "training.adaptive.result.OPEN_PLAN_EXISTS": "Já existe um plano aberto.",
  "training.adaptive.result.NO_EVIDENCE": "Sem evidência suficiente para o plano.",
  "training.adaptive.result.INSUFFICIENT_SAMPLE": "Amostra insuficiente.",
  "training.adaptive.result.NOT_FOUND": "Plano não encontrado.",
  "training.adaptive.result.STALE": "O plano mudou desde que abriu a página; recarregue.",
  "training.adaptive.result.CLOSED": "Este plano está encerrado.",
  "training.adaptive.plan.title": "Plano de {n} dias",
  "training.adaptive.plan.subtitle": "{start} – {end} · versão {v}",
  "training.adaptive.status.ACTIVE": "ativo",
  "training.adaptive.status.PAUSED": "em pausa",
  "training.adaptive.status.COMPLETED": "concluído",
  "training.adaptive.status.CANCELLED": "cancelado",
  "training.adaptive.adherence": "Adesão: {done} de {due} sessões já previstas ({p}%)",
  "training.adaptive.adherence.none": "Adesão: nenhuma sessão prevista ainda",
  "training.adaptive.nextReview": "Próxima revisão: {d}",
  "training.adaptive.pause": "Pausar",
  "training.adaptive.resume": "Retomar",
  "training.adaptive.review": "Rever plano",
  "training.adaptive.complete": "Concluir",
  "training.adaptive.cancel": "Cancelar plano",
  "training.adaptive.diff.title": "Revisão proposta",
  "training.adaptive.diff.explain":
    "Calculada com os seus jogos atuais. Nada muda até aceitar; sessões já feitas e passadas ficam como estão.",
  "training.adaptive.diff.accept": "Aceitar nova versão",
  "training.adaptive.diff.keep": "Manter plano atual",
  "training.adaptive.diff.none": "sem alterações",
  "training.adaptive.diff.reordered": "ordem das prioridades mudou",
  "training.adaptive.diff.evidence": "evidências atualizadas",
  "training.adaptive.priorities": "Prioridades e evidências",
  "training.adaptive.priorities.subtitle":
    "Cada prioridade mostra a evidência e a conta que a ordenou.",
  "training.adaptive.goals": "Metas",
  "training.adaptive.goals.subtitle":
    "Metas de processo e métricas acompanhadas com a linha de base; nenhum número é prometido.",
  "training.adaptive.goal.PROCESS_SESSIONS": "Concluir pelo menos {n} sessões do plano.",
  "training.adaptive.goal.PROCESS_REVIEW_MOMENTS":
    "Guardar e rever pelo menos {n} momentos na biblioteca.",
  "training.adaptive.goal.TRACK_METRIC":
    "Acompanhar {metric}: linha de base {v} ({n} jogos). Será comparada na revisão, sem meta numérica.",
  "training.adaptive.sessions": "Sessões",
  "training.adaptive.sessions.subtitle":
    "Marque cada sessão quando concluir ou saltar; abrir a página não conta como feito.",
  "training.adaptive.week": "Semana {n}",
  "training.adaptive.versions": "Versões do plano",
  "training.adaptive.versions.subtitle":
    "Toda a mudança cria uma versão nova; as anteriores ficam guardadas.",
  "training.adaptive.versionItem": "Versão {v} · {d}",
  "training.adaptive.reason.CREATED": "criação",
  "training.adaptive.reason.REVISION": "revisão aceite",
  "training.adaptive.reason.USER_EDIT": "edição do jogador",
  "training.adaptive.session.PLANNED": "prevista",
  "training.adaptive.session.DONE": "concluída",
  "training.adaptive.session.SKIPPED": "saltada",
  "training.adaptive.session.SUPERSEDED": "substituída",
  "training.adaptive.exerciseUnavailable": "Exercício indisponível",
  "training.adaptive.minutesN": "{n} min",
  "training.adaptive.howTo": "Como fazer",
  "training.adaptive.commands": "Comandos da consola (servidor de treino offline)",
  "training.adaptive.done": "Concluído quando:",
  "training.adaptive.tracks": "Métrica revista na revisão: {m}",
  "training.adaptive.openPage": "Abrir no CS2 PRO",
  "training.adaptive.reference": "Referência externa",
  "training.adaptive.referenceNote": "Conteúdo de terceiros; a disponibilidade pode mudar.",
  "training.adaptive.durationDone": "Duração (min)",
  "training.adaptive.markDone": "Concluí",
  "training.adaptive.markSkipped": "Saltei",
  "training.adaptive.undo": "Desfazer",
  "training.area.aim": "Mira",
  "training.area.dueling": "Duelos",
  "training.area.positioning": "Posicionamento",
  "training.area.survivability": "Sobrevivência",
  "training.area.utility": "Utilitários",
  "training.area.teamplay": "Jogo em equipa (trocas)",
  "training.area.clutch": "Clutch",
  "training.area.decision_making": "Decisões",
  "training.area.economy": "Economia",
  "training.area.consistency": "Consistência",
  "training.track.hsPercent": "Headshot %",
  "training.track.openingWinRate": "aberturas ganhas",
  "training.track.deathsPerRound": "mortes por ronda",
  "training.track.tradeKillsPerRound": "abates de troca por ronda",
  "training.track.flashAssistsPerRound": "flash assists por ronda",
  "training.track.clutchWinRate": "clutches ganhos",
  "training.track.moments.saved": "momentos guardados para revisão",
  "training.track.sessions.done": "sessões concluídas",
  "exercise.first_bullet_headshots.name": "Primeira bala na cabeça (Aim Botz)",
  "exercise.first_bullet_headshots.goal": "Treinar a primeira bala precisa, parado, sem spray.",
  "exercise.first_bullet_headshots.step1":
    "Abra o mapa Aim Botz da Steam Workshop pelo CS2 (Jogar → Mapas da Workshop).",
  "exercise.first_bullet_headshots.step2":
    "Com AK-47 ou M4, mire na cabeça e dê um tiro por vez, parado; espere a mira estabilizar.",
  "exercise.first_bullet_headshots.step3":
    "Faça 3 séries de 100 abates, descansando 1 minuto entre as séries.",
  "exercise.first_bullet_headshots.criteria": "3 séries de 100 abates com um tiro de cada vez.",
  "exercise.spray_wall.name": "Controle de spray na parede",
  "exercise.spray_wall.goal": "Repetir o padrão de recuo da arma principal.",
  "exercise.spray_wall.step1":
    "Crie um servidor local (Jogar → Praticar com bots desligados) e cole os comandos no console.",
  "exercise.spray_wall.step2":
    "A cerca de 15 m de uma parede, atire o pente inteiro puxando a mira contra o recuo; os impactos ficam marcados.",
  "exercise.spray_wall.step3":
    "Repita 10 pentes com AK-47 e 10 com M4, comparando a dispersão dos impactos.",
  "exercise.spray_wall.criteria":
    "20 pentes com os impactos cada vez mais agrupados na sua avaliação.",
  "exercise.crosshair_placement_walk.name": "Caminhada de posicionamento de mira",
  "exercise.crosshair_placement_walk.goal":
    "Manter a mira na altura da cabeça e nos ângulos onde um inimigo pode aparecer.",
  "exercise.crosshair_placement_walk.step1":
    "Em servidor local sem bots, percorra as rotas do mapa que você mais joga.",
  "exercise.crosshair_placement_walk.step2":
    "Ande devagar e mantenha a mira na altura da cabeça, encostada na quina de cada ângulo antes de passar.",
  "exercise.crosshair_placement_walk.step3":
    "Faça o percurso das duas equipas (T e CT); repita 3 vezes.",
  "exercise.crosshair_placement_walk.criteria":
    "Três percursos completos sem a mira apontar para o chão ou para paredes sem ângulo.",
  "exercise.counter_strafe.name": "Counter-strafe",
  "exercise.counter_strafe.goal":
    "Parar o movimento antes do tiro para a primeira bala ser precisa.",
  "exercise.counter_strafe.step1":
    "Em servidor local com os comandos, fique de frente para uma parede.",
  "exercise.counter_strafe.step2":
    "Mova-se para um lado (A ou D), toque a tecla oposta para parar e atire uma vez; os impactos mostram se você parou.",
  "exercise.counter_strafe.step3": "Faça 3 séries de 50 repetições, alternando os lados.",
  "exercise.counter_strafe.criteria":
    "150 repetições com os impactos agrupados (sem rastros de tiro em movimento).",
  "exercise.prefire_angles.name": "Pré-mira de ângulos comuns",
  "exercise.prefire_angles.goal": "Chegar aos ângulos com a mira já posicionada e eliminar rápido.",
  "exercise.prefire_angles.step1":
    "Em servidor local com os comandos, use bot_place para colocar bots parados nos ângulos comuns de um bombsite.",
  "exercise.prefire_angles.step2":
    "Saia do spawn e entre no bombsite limpando os ângulos na ordem, já mirando onde cada bot está.",
  "exercise.prefire_angles.step3":
    "Repita a entrada 10 vezes por bombsite, mudando a ordem dos ângulos.",
  "exercise.prefire_angles.step4":
    "Faça 4 séries; conte quantas vezes limpou todos os bots sem tomar dano (bots parados não atiram com bot_stop 1, então anote o tempo).",
  "exercise.prefire_angles.criteria": "20 entradas completas registrando o tempo de cada uma.",
  "exercise.death_review.name": "Revisão de mortes",
  "exercise.death_review.goal": "Entender onde e por que você morre com mais frequência.",
  "exercise.death_review.step1": "Abra Mortes no CS2 PRO e escolha uma partida recente.",
  "exercise.death_review.step2":
    "Revise 5 mortes: veja o contexto, abra o replay no instante e responda se foi falta de informação, de posicionamento ou de mira.",
  "exercise.death_review.step3":
    "Guarde como momento as mortes que você quer revisitar, com uma nota do que faria diferente.",
  "exercise.death_review.criteria":
    "5 mortes revistas com pelo menos 3 momentos guardados com nota.",
  "exercise.first_death_replay.name": "Replay das mortes de abertura",
  "exercise.first_death_replay.goal": "Rever as rodadas em que você foi o primeiro a morrer.",
  "exercise.first_death_replay.step1":
    'Abra Rounds no CS2 PRO e procure os rounds marcados como "morreu na abertura".',
  "exercise.first_death_replay.step2":
    "Abra o replay 2D alguns segundos antes e observe por onde o adversário veio e onde estavam seus aliados.",
  "exercise.first_death_replay.step3":
    "Escreva em uma nota o que mudaria (posição, timing ou utilitário) e guarde o momento.",
  "exercise.first_death_replay.criteria":
    "Todos os rounds de abertura de uma partida revistos, com nota.",
  "exercise.trade_spacing_review.name": "Revisão de trocas e distância",
  "exercise.trade_spacing_review.goal":
    "Ficar a uma distância em que um aliado consiga trocar sua morte (e você a dele).",
  "exercise.trade_spacing_review.step1":
    "Em Rounds, veja suas mortes não trocadas e as trocas dos aliados.",
  "exercise.trade_spacing_review.step2":
    "No replay, observe a distância e a linha de visão entre você e o aliado mais próximo no momento da morte.",
  "exercise.trade_spacing_review.step3":
    "Guarde 3 momentos de mortes não trocadas com uma nota sobre onde ficar.",
  "exercise.trade_spacing_review.criteria":
    "3 momentos guardados com nota sobre posicionamento para troca.",
  "exercise.utility_lineups.name": "Lineups de utilitários",
  "exercise.utility_lineups.goal": "Aprender lançamentos fixos de smoke e flash para o seu mapa.",
  "exercise.utility_lineups.step1":
    "Em servidor local com os comandos, escolha 2 smokes e 2 flashes úteis do mapa que você mais joga.",
  "exercise.utility_lineups.step2":
    "Use a pré-visualização da trajetória para acertar cada lançamento e anote a referência de mira e de posição.",
  "exercise.utility_lineups.step3":
    "Use sv_rethrow_last_grenade para repetir e confirmar o resultado; repita cada um 10 vezes.",
  "exercise.utility_lineups.step4":
    "Teste cada lançamento numa partida contra bots, partindo do spawn.",
  "exercise.utility_lineups.criteria": "4 lançamentos acertados 10 vezes seguidas cada.",
  "exercise.utility_review.name": "Revisão de utilitários",
  "exercise.utility_review.goal":
    "Ver se suas granadas cegaram, causaram dano ou foram desperdiçadas.",
  "exercise.utility_review.step1": "Abra Utilitários no CS2 PRO numa partida recente.",
  "exercise.utility_review.step2":
    "Observe flashes que cegaram aliados ou ninguém e granadas sem dano; abra o replay de 3 delas.",
  "exercise.utility_review.step3": "Guarde como momento 2 lançamentos a corrigir, com nota.",
  "exercise.utility_review.criteria": "3 lançamentos revistos e 2 momentos guardados com nota.",
  "exercise.clutch_review.name": "Revisão de clutches",
  "exercise.clutch_review.goal": "Rever decisões quando você ficou sozinho contra adversários.",
  "exercise.clutch_review.step1":
    "Em Rounds, abra os rounds com clutch (1vN) das últimas partidas.",
  "exercise.clutch_review.step2":
    "No replay, anote o tempo restante, a situação da bomba e por onde você decidiu jogar.",
  "exercise.clutch_review.step3":
    "Escreva uma alternativa como hipótese (não como certeza) e guarde o momento.",
  "exercise.clutch_review.criteria": "Todos os clutches de 2 partidas revistos com nota.",
  "exercise.economy_review.name": "Revisão de economia",
  "exercise.economy_review.goal": "Entender as compras da equipa e a sua em cada round.",
  "exercise.economy_review.step1":
    "Em Rounds, numa partida com compra medida, veja a compra da equipa e a sua por round.",
  "exercise.economy_review.step2":
    "Marque os rounds em que sua compra foi diferente da equipa (compra mista) e o resultado.",
  "exercise.economy_review.step3":
    "Guarde 2 momentos de decisões de compra para discutir com a equipa.",
  "exercise.economy_review.criteria":
    "1 partida revista e 2 momentos guardados (só em partidas com gasto registrado).",
  "exercise.warmup_routine.name": "Rotina de aquecimento",
  "exercise.warmup_routine.goal": "Começar cada sessão de jogo com a mesma rotina curta.",
  "exercise.warmup_routine.step1": "5 minutos no Aim Botz (primeira bala na cabeça).",
  "exercise.warmup_routine.step2":
    "10 minutos de Deathmatch focando posicionamento de mira e counter-strafe.",
  "exercise.warmup_routine.step3": "Anote como se sentiu antes da primeira partida do dia.",
  "exercise.warmup_routine.criteria": "Rotina feita antes de jogar, nos dias marcados.",
};
