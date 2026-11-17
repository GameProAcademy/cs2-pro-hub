import type { nadePtBR } from "./pt-BR";

export const nadeEs: Record<keyof typeof nadePtBR, string> = {
  "nav.utility": "Utilidades",
  "nade.eyebrow": "Granadas",
  "nade.title": "Tus utilidades",
  "nade.description":
    "Granadas lanzadas, detonaciones, ceguera causada, daño de HE y fuego, y en qué momento de la ronda usaste cada una — todo medido a partir de la demo. Una granada hace más de lo que la demo registra: una flash que no cegó a ningún rival aún pudo haber forzado un retroceso.",
  "nade.empty.description": "Sube una demo para ver tus utilidades.",
  "nade.noParticipant.description":
    "No fue posible vincularte a un único jugador de esta partida, así que no se te atribuye ninguna granada.",
  "nade.note.noThrower":
    "Esta partida no registró quién lanzó cada granada. Detonaciones y efecto de las flashes quedan sin observar.",
  "nade.note.noBlinds":
    "Esta demo no registra a quién cegó cada flash (las demos de HLTV no traen ese evento). Ceguera, rivales y compañeros cegados quedan sin observar — nunca cero.",
  "nade.note.legacy":
    "Esta partida se procesó antes de que la demo registrara cada lanzamiento y cada inicio de fuego. Lanzamientos y molotov/incendiaria quedan sin observar; sube una demo nueva para medirlos.",
  "nade.section.grenades": "Granadas",
  "nade.section.grenades.subtitle":
    "Tus lanzamientos (cuando se registran) y detonaciones, por tipo y por momento de la ronda.",
  "nade.col.grenade": "Granada",
  "nade.col.throws": "Lanzamientos",
  "nade.col.detonations": "Detonaciones",
  "nade.col.phase": "Momento",
  "nade.col.enemies": "Rivales cegados",
  "nade.col.teammates": "Compañeros cegados",
  "nade.col.blindSeconds": "Ceguera rival",
  "nade.grenade.flash": "Flash",
  "nade.grenade.he": "HE",
  "nade.grenade.smoke": "Smoke",
  "nade.grenade.fire": "Molotov / incendiaria",
  "nade.grenade.decoy": "Señuelo",
  "nade.phase.before_first_kill": "Antes de la 1.ª baja",
  "nade.phase.after_first_kill": "Tras la 1.ª baja",
  "nade.phase.after_plant": "Tras el plant",
  "nade.phaseNote":
    "Momento de la detonación: antes de la primera baja de la ronda (preparación/entrada), después de ella y antes del plant, o después del plant. Los señuelos no tienen detonación registrada.",
  "nade.section.flash": "Flashes",
  "nade.section.flash.subtitle":
    "Cada jugador cegado se vincula a tu flash por el mismo tick de la detonación, como lo registra el juego.",
  "nade.section.damage": "Daño de HE y fuego",
  "nade.section.damage.subtitle":
    "Daño que causaron tus HE y tu fuego, separado entre rivales y compañeros.",
  "nade.section.list": "Tus flashes",
  "nade.section.list.subtitle": "Abre cada flash en el replay 2D, en el tick de la detonación.",
  "nade.list.notObserved":
    "La lista de flashes con efecto no está disponible para esta partida: la demo no registró a quién cegó.",
  "nade.list.none": "No hay flashes tuyas registradas en esta partida.",
  "nade.noEffect": "sin efecto medido",
  "nade.self": "tú",
  "nade.unit.flashes": "flashes",
  "nade.unit.grenades": "granadas",
  "nade.metric.flashes_detonated": "Flashes detonadas",
  "nade.metric.flash_effective_rate": "Flashes que cegaron a un rival",
  "nade.metric.enemies_blinded_per_flash": "Rivales cegados por flash",
  "nade.metric.enemy_blind_seconds_per_flash": "Ceguera rival por flash",
  "nade.metric.teammates_blinded": "Compañeros cegados",
  "nade.metric.self_blinded": "Flashes que te cegaron",
  "nade.metric.flash_assist": "Asistencias de flash",
  "nade.metric.he_damage_per_grenade": "Daño por HE",
  "nade.metric.fire_damage_per_grenade": "Daño por molotov/incendiaria",
  "nade.metric.team_damage": "Daño de granada a compañeros",
  "nade.metric.kills": "Bajas con HE o fuego",
  "nade.methodText.flashes_detonated":
    "Recuento de tus flashes que detonaron (el juego registra quién lanzó cada una).",
  "nade.methodText.flash_effective_rate":
    "Flashes que cegaron al menos a un rival ÷ tus flashes. Una flash sin rival cegado es 'sin efecto medido': el juego no registró ceguera, pero pudo forzar un retroceso que la demo no muestra. Mínimo: 5 flashes.",
  "nade.methodText.enemies_blinded_per_flash":
    "Rivales cegados (evento del juego en el tick de la detonación) ÷ tus flashes. Mínimo: 5 flashes.",
  "nade.methodText.enemy_blind_seconds_per_flash":
    "Suma de las duraciones de ceguera de los rivales, como las registra el juego, ÷ tus flashes. Mínimo: 5 flashes.",
  "nade.methodText.teammates_blinded":
    "Compañeros cegados por tus flashes (mismo tick de detonación).",
  "nade.methodText.self_blinded": "Tus flashes que te cegaron a ti.",
  "nade.methodText.flash_assist":
    "Recuento ya guardado de la partida. Observado cuando viene de la marca del juego; inferido cuando viene de atribución temporal (baja de un compañero hasta 3 s después de un rival que cegaste).",
  "nade.methodText.he_damage_per_grenade":
    "Daño de tus HE a rivales ÷ tus HE detonadas. Mínimo: 5 granadas.",
  "nade.methodText.fire_damage_per_grenade":
    "Daño de tu fuego a rivales ÷ tus molotovs/incendiarias. Mínimo: 5 granadas.",
  "nade.methodText.team_damage": "Daño de tus HE y tu fuego a compañeros.",
  "nade.methodText.kills": "Rivales que eliminaste con HE o fuego.",
};
