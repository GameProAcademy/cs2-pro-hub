/** PM3 / 4.2.6 — utility page (module D). */
export const nadePtBR = {
  "nav.utility": "Utilitários",
  "nade.eyebrow": "Granadas",
  "nade.title": "Seus utilitários",
  "nade.description":
    "Granadas lançadas, detonações, cegueira causada, dano de HE e fogo, e em que momento da ronda você usou cada uma — tudo medido a partir da demo. O efeito de uma granada vai além do que a demo registra: uma flash sem inimigo cegado ainda pode ter forçado um recuo.",
  "nade.empty.description": "Envie uma demo para ver seus utilitários.",
  "nade.noParticipant.description":
    "Não foi possível ligar você a um único jogador desta partida; por isso nenhuma granada é atribuída a você.",
  "nade.note.noThrower":
    "Esta partida não registrou quem lançou cada granada. Detonações e efeito das flashes ficam não observados.",
  "nade.note.noBlinds":
    "Esta demo não registra quem foi cegado por cada flash (demos de HLTV não trazem esse evento). Cegueira, inimigos e aliados cegados ficam não observados — nunca zero.",
  "nade.note.legacy":
    "Esta partida foi processada antes de a demo registrar cada arremesso e cada início de fogo. Arremessos e molotov/incendiária ficam não observados; envie uma demo nova para medi-los.",
  "nade.section.grenades": "Granadas",
  "nade.section.grenades.subtitle":
    "Arremessos (quando registrados) e detonações suas, por tipo e por momento da ronda.",
  "nade.col.grenade": "Granada",
  "nade.col.throws": "Arremessos",
  "nade.col.detonations": "Detonações",
  "nade.col.phase": "Momento",
  "nade.col.enemies": "Inimigos cegados",
  "nade.col.teammates": "Aliados cegados",
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
    "Cada jogador cegado é ligado à sua flash pelo mesmo tick da detonação, como o jogo registra.",
  "nade.section.damage": "Dano de HE e fogo",
  "nade.section.damage.subtitle":
    "Dano que suas HE e seu fogo causaram, separado por inimigos e aliados.",
  "nade.section.list": "Suas flashes",
  "nade.section.list.subtitle": "Abra cada flash no replay 2D, no tick da detonação.",
  "nade.list.notObserved":
    "A lista de flashes com efeito não está disponível para esta partida: a demo não registrou quem foi cegado.",
  "nade.list.none": "Nenhuma flash sua registrada nesta partida.",
  "nade.noEffect": "sem efeito medido",
  "nade.self": "você",
  "nade.unit.flashes": "flashes",
  "nade.unit.grenades": "granadas",
  "nade.metric.flashes_detonated": "Flashes detonadas",
  "nade.metric.flash_effective_rate": "Flashes que cegaram inimigo",
  "nade.metric.enemies_blinded_per_flash": "Inimigos cegados por flash",
  "nade.metric.enemy_blind_seconds_per_flash": "Cegueira inimiga por flash",
  "nade.metric.teammates_blinded": "Aliados cegados",
  "nade.metric.self_blinded": "Flashes que cegaram você",
  "nade.metric.flash_assist": "Assistências de flash",
  "nade.metric.he_damage_per_grenade": "Dano por HE",
  "nade.metric.fire_damage_per_grenade": "Dano por molotov/incendiária",
  "nade.metric.team_damage": "Dano de granada em aliados",
  "nade.metric.kills": "Abates com HE ou fogo",
  "nade.methodText.flashes_detonated":
    "Contagem das suas flashes que detonaram (o jogo registra quem lançou cada uma).",
  "nade.methodText.flash_effective_rate":
    "Flashes que cegaram ao menos um inimigo ÷ suas flashes. Uma flash sem inimigo cegado é 'sem efeito medido': o jogo não registrou cegueira, mas ela pode ter forçado um recuo que a demo não mostra. Mínimo: 5 flashes.",
  "nade.methodText.enemies_blinded_per_flash":
    "Inimigos cegados (evento do jogo no tick da detonação) ÷ suas flashes. Mínimo: 5 flashes.",
  "nade.methodText.enemy_blind_seconds_per_flash":
    "Soma das durações de cegueira dos inimigos, como o jogo registra, ÷ suas flashes. Mínimo: 5 flashes.",
  "nade.methodText.teammates_blinded":
    "Aliados cegados pelas suas flashes (mesmo tick da detonação).",
  "nade.methodText.self_blinded": "Suas flashes que cegaram você mesmo.",
  "nade.methodText.flash_assist":
    "Contagem já registrada da partida. Pela marcação do jogo, é observada; por atribuição temporal (abate de aliado até 3 s depois de um inimigo cegado por você), é inferida.",
  "nade.methodText.he_damage_per_grenade":
    "Dano das suas HE em inimigos ÷ suas HE detonadas. Mínimo: 5 granadas.",
  "nade.methodText.fire_damage_per_grenade":
    "Dano do seu fogo em inimigos ÷ seus molotovs/incendiárias. Mínimo: 5 granadas.",
  "nade.methodText.team_damage": "Dano das suas HE e do seu fogo em aliados.",
  "nade.methodText.kills": "Inimigos que você abateu com HE ou fogo.",
} as const;
