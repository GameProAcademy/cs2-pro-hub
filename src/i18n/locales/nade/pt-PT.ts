import type { nadePtBR } from "./pt-BR";

export const nadePtPT: Record<keyof typeof nadePtBR, string> = {
  "nav.utility": "Utilitários",
  "nade.eyebrow": "Granadas",
  "nade.title": "Seus utilitários",
  "nade.description":
    "Granadas lançadas, detonações, cegueira causada, dano de HE e fogo, e em que momento da ronda usou cada uma — tudo medido a partir da demo. O efeito de uma granada vai além do que a demo regista: uma flash sem inimigo cegado pode ainda ter forçado um recuo.",
  "nade.empty.description": "Envie uma demo para ver os seus utilitários.",
  "nade.noParticipant.description":
    "Não foi possível ligá-lo a um único jogador desta partida; por isso nenhuma granada lhe é atribuída.",
  "nade.note.noThrower":
    "Esta partida não registou quem lançou cada granada. Detonações e efeito das flashes ficam por observar.",
  "nade.note.noBlinds":
    "Esta demo não regista quem foi cegado por cada flash (as demos HLTV não trazem esse evento). Cegueira, inimigos e colegas cegados ficam por observar — nunca zero.",
  "nade.note.legacy":
    "Esta partida foi processada antes de a demo registar cada lançamento e cada início de fogo. Lançamentos e molotov/incendiária ficam por observar; envie uma demo nova para os medir.",
  "nade.section.grenades": "Granadas",
  "nade.section.grenades.subtitle":
    "Lançamentos (quando registados) e detonações suas, por tipo e por momento da ronda.",
  "nade.col.grenade": "Granada",
  "nade.col.throws": "Lançamentos",
  "nade.col.detonations": "Detonações",
  "nade.col.phase": "Momento",
  "nade.col.enemies": "Inimigos cegados",
  "nade.col.teammates": "Colegas cegados",
  "nade.col.blindSeconds": "Cegueira inimiga",
  "nade.grenade.flash": "Flash",
  "nade.grenade.he": "HE",
  "nade.grenade.smoke": "Smoke",
  "nade.grenade.fire": "Molotov / incendiária",
  "nade.grenade.decoy": "Decoy",
  "nade.phase.before_first_kill": "Antes do 1º abate",
  "nade.phase.after_first_kill": "Após o 1º abate",
  "nade.phase.after_plant": "Após o plant",
  "nade.phaseNote":
    "Momento da detonação: antes do primeiro abate da ronda (preparação/entrada), depois dele e antes do plant, ou depois do plant. Decoys não têm detonação registrada.",
  "nade.section.flash": "Flashes",
  "nade.section.flash.subtitle":
    "Cada jogador cegado é ligado à sua flash pelo mesmo tick da detonação, tal como o jogo regista.",
  "nade.section.damage": "Dano de HE e fogo",
  "nade.section.damage.subtitle":
    "Dano que as suas HE e o seu fogo causaram, separado entre inimigos e colegas.",
  "nade.section.list": "As suas flashes",
  "nade.section.list.subtitle": "Abra cada flash no replay 2D, no tick da detonação.",
  "nade.list.notObserved":
    "A lista de flashes com efeito não está disponível para esta partida: a demo não registou quem foi cegado.",
  "nade.list.none": "Nenhuma flash sua registada nesta partida.",
  "nade.noEffect": "sem efeito medido",
  "nade.self": "você",
  "nade.unit.flashes": "flashes",
  "nade.unit.grenades": "granadas",
  "nade.metric.flashes_detonated": "Flashes detonadas",
  "nade.metric.flash_effective_rate": "Flashes que cegaram inimigo",
  "nade.metric.enemies_blinded_per_flash": "Inimigos cegados por flash",
  "nade.metric.enemy_blind_seconds_per_flash": "Cegueira inimiga por flash",
  "nade.metric.teammates_blinded": "Colegas cegados",
  "nade.metric.self_blinded": "Flashes que o cegaram",
  "nade.metric.flash_assist": "Assistências de flash",
  "nade.metric.he_damage_per_grenade": "Dano por HE",
  "nade.metric.fire_damage_per_grenade": "Dano por molotov/incendiária",
  "nade.metric.team_damage": "Dano de granada em colegas",
  "nade.metric.kills": "Abates com HE ou fogo",
  "nade.methodText.flashes_detonated":
    "Contagem das suas flashes que detonaram (o jogo regista quem lançou cada uma).",
  "nade.methodText.flash_effective_rate":
    "Flashes que cegaram pelo menos um inimigo ÷ as suas flashes. Uma flash sem inimigo cegado é 'sem efeito medido': o jogo não registou cegueira, mas pode ter forçado um recuo que a demo não mostra. Mínimo: 5 flashes.",
  "nade.methodText.enemies_blinded_per_flash":
    "Inimigos cegados (evento do jogo no tick da detonação) ÷ suas flashes. Mínimo: 5 flashes.",
  "nade.methodText.enemy_blind_seconds_per_flash":
    "Soma das durações de cegueira dos inimigos, tal como o jogo regista, ÷ as suas flashes. Mínimo: 5 flashes.",
  "nade.methodText.teammates_blinded":
    "Colegas cegados pelas suas flashes (mesmo tick da detonação).",
  "nade.methodText.self_blinded": "As suas flashes que o cegaram a si próprio.",
  "nade.methodText.flash_assist":
    "Contagem já registada da partida. Pela marcação do jogo, é observada; por atribuição temporal (abate de um colega até 3 s depois de um inimigo cegado por si), é inferida.",
  "nade.methodText.he_damage_per_grenade":
    "Dano das suas HE em inimigos ÷ as suas HE detonadas. Mínimo: 5 granadas.",
  "nade.methodText.fire_damage_per_grenade":
    "Dano do seu fogo em inimigos ÷ os seus molotovs/incendiárias. Mínimo: 5 granadas.",
  "nade.methodText.team_damage": "Dano das suas HE e do seu fogo em colegas.",
  "nade.methodText.kills": "Inimigos que abateu com HE ou fogo.",
};
