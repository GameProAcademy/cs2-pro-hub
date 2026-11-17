import type { nadePtBR } from "./pt-BR";

export const nadeEn: Record<keyof typeof nadePtBR, string> = {
  "nav.utility": "Utility",
  "nade.eyebrow": "Grenades",
  "nade.title": "Your utility",
  "nade.description":
    "Grenades thrown, detonations, blindness caused, HE and fire damage, and when in the round you used each one — all measured from the demo. A grenade does more than the demo records: a flash that blinded no enemy may still have forced someone back.",
  "nade.empty.description": "Upload a demo to see your utility.",
  "nade.noParticipant.description":
    "You could not be linked to a single player in this match, so no grenade is attributed to you.",
  "nade.note.noThrower":
    "This match did not record who threw each grenade. Detonations and flash effect stay not observed.",
  "nade.note.noBlinds":
    "This demo does not record who each flash blinded (HLTV demos do not carry that event). Blindness, enemies and teammates blinded stay not observed — never zero.",
  "nade.note.legacy":
    "This match was processed before the demo recorded each throw and each fire start. Throws and molotov/incendiary stay not observed; upload a new demo to measure them.",
  "nade.section.grenades": "Grenades",
  "nade.section.grenades.subtitle":
    "Your throws (when recorded) and detonations, by type and by moment of the round.",
  "nade.col.grenade": "Grenade",
  "nade.col.throws": "Throws",
  "nade.col.detonations": "Detonations",
  "nade.col.phase": "Moment",
  "nade.col.enemies": "Enemies blinded",
  "nade.col.teammates": "Teammates blinded",
  "nade.col.blindSeconds": "Enemy blindness",
  "nade.grenade.flash": "Flash",
  "nade.grenade.he": "HE",
  "nade.grenade.smoke": "Smoke",
  "nade.grenade.fire": "Molotov / incendiary",
  "nade.grenade.decoy": "Decoy",
  "nade.phase.before_first_kill": "Before 1st kill",
  "nade.phase.after_first_kill": "After 1st kill",
  "nade.phase.after_plant": "After plant",
  "nade.phaseNote":
    "Moment of detonation: before the round's first kill (set-up/entry), after it and before the plant, or after the plant. Decoys have no recorded detonation.",
  "nade.section.flash": "Flashes",
  "nade.section.flash.subtitle":
    "Each blinded player is tied to your flash by the detonation's own tick, as the game records it.",
  "nade.section.damage": "HE and fire damage",
  "nade.section.damage.subtitle":
    "Damage your HE grenades and fire dealt, split between enemies and teammates.",
  "nade.section.list": "Your flashes",
  "nade.section.list.subtitle": "Open each flash in the 2D replay, on its detonation tick.",
  "nade.list.notObserved":
    "The flash effect list is not available for this match: the demo did not record who was blinded.",
  "nade.list.none": "No flash of yours recorded in this match.",
  "nade.noEffect": "no measured effect",
  "nade.self": "you",
  "nade.unit.flashes": "flashes",
  "nade.unit.grenades": "grenades",
  "nade.metric.flashes_detonated": "Flashes detonated",
  "nade.metric.flash_effective_rate": "Flashes that blinded an enemy",
  "nade.metric.enemies_blinded_per_flash": "Enemies blinded per flash",
  "nade.metric.enemy_blind_seconds_per_flash": "Enemy blindness per flash",
  "nade.metric.teammates_blinded": "Teammates blinded",
  "nade.metric.self_blinded": "Flashes that blinded you",
  "nade.metric.flash_assist": "Flash assists",
  "nade.metric.he_damage_per_grenade": "Damage per HE",
  "nade.metric.fire_damage_per_grenade": "Damage per molotov/incendiary",
  "nade.metric.team_damage": "Grenade damage to teammates",
  "nade.metric.kills": "Kills with HE or fire",
  "nade.methodText.flashes_detonated":
    "Count of your flashes that detonated (the game records who threw each one).",
  "nade.methodText.flash_effective_rate":
    "Flashes that blinded at least one enemy ÷ your flashes. A flash that blinded no enemy is 'no measured effect': the game recorded no blindness, but it may have forced a retreat the demo does not show. Minimum: 5 flashes.",
  "nade.methodText.enemies_blinded_per_flash":
    "Enemies blinded (game event on the detonation tick) ÷ your flashes. Minimum: 5 flashes.",
  "nade.methodText.enemy_blind_seconds_per_flash":
    "Sum of enemy blind durations, as the game records them, ÷ your flashes. Minimum: 5 flashes.",
  "nade.methodText.teammates_blinded": "Teammates blinded by your flashes (same detonation tick).",
  "nade.methodText.self_blinded": "Your flashes that blinded you.",
  "nade.methodText.flash_assist":
    "The match's stored count. Observed when it comes from the game's flag; inferred when from timed attribution (a teammate's kill within 3 s of an enemy you blinded).",
  "nade.methodText.he_damage_per_grenade":
    "Damage of your HE grenades to enemies ÷ your HE detonations. Minimum: 5 grenades.",
  "nade.methodText.fire_damage_per_grenade":
    "Damage of your fire to enemies ÷ your molotovs/incendiaries. Minimum: 5 grenades.",
  "nade.methodText.team_damage": "Damage your HE grenades and fire dealt to teammates.",
  "nade.methodText.kills": "Enemies you killed with HE or fire.",
};
