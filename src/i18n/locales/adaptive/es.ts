import type { adaptivePtBR } from "./pt-BR";

export const adaptiveEs: Record<keyof typeof adaptivePtBR, string> = {
  "training.adaptive.catalogHeading": "Clases recomendadas del catálogo",
  "training.adaptive.noPromise":
    "El plan organiza tu entrenamiento a partir de tus datos; no garantiza una mejora de rendimiento. Haz pausas y ajusta el volumen a tu tiempo.",
  "training.adaptive.state.NO_EVIDENCE.title": "Aún no hay evidencia para un plan",
  "training.adaptive.state.NO_EVIDENCE.body":
    "Ninguna área muestra un punto a trabajar con los datos actuales. Sube más demos; no se recomienda ningún ejercicio sin evidencia.",
  "training.adaptive.state.INSUFFICIENT_SAMPLE.title": "Muestra insuficiente para un plan",
  "training.adaptive.state.INSUFFICIENT_SAMPLE.body":
    "{n} partida(s) analizada(s); el plan personalizado necesita al menos {min}.",
  "training.adaptive.history": "Planes anteriores",
  "training.adaptive.history.subtitle": "Historial conservado; ningún plan se borra.",
  "training.adaptive.history.item": "Plan de {h} días iniciado el {start}",
  "training.adaptive.score":
    "prioridad {s} = confianza {c} × (0,6·brecha {gap} + 0,25·tendencia {trend}) + objetivo {g}",
  "training.adaptive.why": "Por qué esta área: la evidencia de abajo, con muestra y método.",
  "training.adaptive.evidence.dna":
    "Player DNA: índice {v}/100 (por debajo de 60) en {n} partidas.",
  "training.adaptive.evidence.trend":
    "{metric}: {v} (medido en {n} de {w} partidas); cambio vs período anterior: {d}.",
  "training.adaptive.noComparison": "sin comparación válida",
  "training.adaptive.openEvidence": "ver evidencia",
  "training.adaptive.create.title": "Crear plan de entrenamiento",
  "training.adaptive.create.subtitle":
    "Prioridades calculadas a partir de tus partidas. Tú eliges el horizonte y la disponibilidad.",
  "training.adaptive.excluded": "Áreas fuera:",
  "training.adaptive.exclusion.NOT_MEASURED": "no medida",
  "training.adaptive.exclusion.NO_SIGNAL": "nada que trabajar",
  "training.adaptive.exclusion.NO_EXERCISE": "sin ejercicio disponible",
  "training.adaptive.exclusion.LOW_SAMPLE": "muestra baja",
  "training.adaptive.horizon": "Horizonte",
  "training.adaptive.horizonN": "{n} días",
  "training.adaptive.sessionsPerWeek": "Sesiones por semana",
  "training.adaptive.minutes": "Minutos por sesión",
  "training.adaptive.dropAreas": "Dejar fuera del plan:",
  "training.adaptive.create": "Crear plan",
  "training.adaptive.method":
    "Método cs2.training-priority.v1: solo áreas con evidencia (DNA observado por debajo de 60 o empeoramiento en una comparación válida), muestra mínima de 3 partidas y ejercicio disponible. 7 días = 1 prioridad, 30 = 2, 90 = 3.",
  "training.adaptive.result.OPEN_PLAN_EXISTS": "Ya existe un plan abierto.",
  "training.adaptive.result.NO_EVIDENCE": "Sin evidencia suficiente para el plan.",
  "training.adaptive.result.INSUFFICIENT_SAMPLE": "Muestra insuficiente.",
  "training.adaptive.result.NOT_FOUND": "Plan no encontrado.",
  "training.adaptive.result.STALE": "El plan cambió desde que abriste la página; recarga.",
  "training.adaptive.result.CLOSED": "Este plan está cerrado.",
  "training.adaptive.plan.title": "Plan de {n} días",
  "training.adaptive.plan.subtitle": "{start} – {end} · versión {v}",
  "training.adaptive.status.ACTIVE": "activo",
  "training.adaptive.status.PAUSED": "pausado",
  "training.adaptive.status.COMPLETED": "completado",
  "training.adaptive.status.CANCELLED": "cancelado",
  "training.adaptive.adherence": "Adherencia: {done} de {due} sesiones previstas ({p}%)",
  "training.adaptive.adherence.none": "Adherencia: ninguna sesión prevista aún",
  "training.adaptive.nextReview": "Próxima revisión: {d}",
  "training.adaptive.pause": "Pausar",
  "training.adaptive.resume": "Reanudar",
  "training.adaptive.review": "Revisar plan",
  "training.adaptive.complete": "Completar",
  "training.adaptive.cancel": "Cancelar plan",
  "training.adaptive.diff.title": "Revisión propuesta",
  "training.adaptive.diff.explain":
    "Calculada con tus partidas actuales. Nada cambia hasta que aceptes; las sesiones hechas y pasadas quedan como están.",
  "training.adaptive.diff.accept": "Aceptar nueva versión",
  "training.adaptive.diff.keep": "Mantener plan actual",
  "training.adaptive.diff.none": "sin cambios",
  "training.adaptive.diff.reordered": "orden de prioridades cambió",
  "training.adaptive.diff.evidence": "evidencia actualizada",
  "training.adaptive.priorities": "Prioridades y evidencia",
  "training.adaptive.priorities.subtitle":
    "Cada prioridad muestra su evidencia y el cálculo que la ordenó.",
  "training.adaptive.goals": "Metas",
  "training.adaptive.goals.subtitle":
    "Metas de proceso y métricas seguidas con su línea base; no se promete ningún número.",
  "training.adaptive.goal.PROCESS_SESSIONS": "Completar al menos {n} sesiones del plan.",
  "training.adaptive.goal.PROCESS_REVIEW_MOMENTS":
    "Guardar y revisar al menos {n} momentos en la biblioteca.",
  "training.adaptive.goal.TRACK_METRIC":
    "Seguir {metric}: línea base {v} ({n} partidas). Se comparará en la revisión, sin meta numérica.",
  "training.adaptive.sessions": "Sesiones",
  "training.adaptive.sessions.subtitle":
    "Marca cada sesión al terminarla u omitirla; abrir la página no cuenta como hecha.",
  "training.adaptive.week": "Semana {n}",
  "training.adaptive.versions": "Versiones del plan",
  "training.adaptive.versions.subtitle":
    "Cada cambio crea una versión nueva; las anteriores se guardan.",
  "training.adaptive.versionItem": "Versión {v} · {d}",
  "training.adaptive.reason.CREATED": "creación",
  "training.adaptive.reason.REVISION": "revisión aceptada",
  "training.adaptive.reason.USER_EDIT": "edición del jugador",
  "training.adaptive.session.PLANNED": "prevista",
  "training.adaptive.session.DONE": "hecha",
  "training.adaptive.session.SKIPPED": "omitida",
  "training.adaptive.session.SUPERSEDED": "sustituida",
  "training.adaptive.exerciseUnavailable": "Ejercicio no disponible",
  "training.adaptive.minutesN": "{n} min",
  "training.adaptive.howTo": "Cómo hacerlo",
  "training.adaptive.commands": "Comandos de consola (servidor de práctica offline)",
  "training.adaptive.done": "Hecho cuando:",
  "training.adaptive.tracks": "Métrica revisada en la revisión: {m}",
  "training.adaptive.openPage": "Abrir en CS2 PRO",
  "training.adaptive.openMoments": "Abrir mis momentos guardados",
  "training.adaptive.reference": "Referencia externa",
  "training.adaptive.referenceNote": "Contenido de terceros; la disponibilidad puede cambiar.",
  "training.adaptive.durationDone": "Duración (min)",
  "training.adaptive.markDone": "Hecho",
  "training.adaptive.markSkipped": "Omitida",
  "training.adaptive.undo": "Deshacer",
  "training.area.aim": "Puntería",
  "training.area.dueling": "Duelos",
  "training.area.positioning": "Primeras muertes y tradeos",
  "training.area.survivability": "Supervivencia",
  "training.area.utility": "Utilidad",
  "training.area.teamplay": "Juego en equipo (intercambios)",
  "training.area.clutch": "Clutch",
  "training.area.decision_making": "Decisiones",
  "training.area.economy": "Economía",
  "training.area.consistency": "Consistencia",
  "training.track.hsPercent": "Headshot %",
  "training.track.openingWinRate": "aperturas ganadas",
  "training.track.deathsPerRound": "muertes por ronda",
  "training.track.tradeKillsPerRound": "bajas de intercambio por ronda",
  "training.track.flashAssistsPerRound": "flash assists por ronda",
  "training.track.clutchWinRate": "clutches ganados",
  "training.track.moments.saved": "momentos guardados para revisión",
  "training.track.sessions.done": "sesiones hechas",
  "exercise.first_bullet_headshots.name": "Primera bala a la cabeza (Aim Botz)",
  "exercise.first_bullet_headshots.goal": "Entrenar una primera bala precisa, quieto, sin spray.",
  "exercise.first_bullet_headshots.step1":
    "Abre el mapa Aim Botz de Steam Workshop en CS2 (Jugar → Mapas del Workshop).",
  "exercise.first_bullet_headshots.step2":
    "Con AK-47 o M4, apunta a la cabeza y dispara un tiro cada vez, quieto; deja que la mira se estabilice.",
  "exercise.first_bullet_headshots.step3":
    "Haz 3 series de 100 bajas con 1 minuto de descanso entre series.",
  "exercise.first_bullet_headshots.criteria": "3 series de 100 bajas, un tiro cada vez.",
  "exercise.spray_wall.name": "Control de spray en la pared",
  "exercise.spray_wall.goal": "Repetir el patrón de retroceso del arma principal.",
  "exercise.spray_wall.step1":
    "Crea un servidor local (Jugar → Práctica, sin bots) y pega los comandos en la consola.",
  "exercise.spray_wall.step2":
    "A unos 15 m de una pared, dispara el cargador entero tirando contra el retroceso; los impactos quedan marcados.",
  "exercise.spray_wall.step3":
    "Repite 10 cargadores con AK-47 y 10 con M4, comparando la dispersión.",
  "exercise.spray_wall.criteria":
    "20 cargadores, con los impactos cada vez más agrupados según tu valoración.",
  "exercise.crosshair_placement_walk.name": "Recorrido de colocación de mira",
  "exercise.crosshair_placement_walk.goal":
    "Mantener la mira a la altura de la cabeza en los ángulos donde puede aparecer un rival.",
  "exercise.crosshair_placement_walk.step1":
    "En un servidor local sin bots, recorre las rutas del mapa que más juegas.",
  "exercise.crosshair_placement_walk.step2":
    "Camina despacio con la mira a la altura de la cabeza, pegada al borde de cada ángulo antes de pasar.",
  "exercise.crosshair_placement_walk.step3":
    "Haz las rutas de ambos lados (T y CT); repite 3 veces.",
  "exercise.crosshair_placement_walk.criteria":
    "Tres recorridos completos sin apuntar al suelo ni a paredes sin ángulo.",
  "exercise.counter_strafe.name": "Counter-strafe",
  "exercise.counter_strafe.goal":
    "Detener el movimiento antes de disparar para que la primera bala sea precisa.",
  "exercise.counter_strafe.step1":
    "En un servidor local con los comandos, ponte frente a una pared.",
  "exercise.counter_strafe.step2":
    "Muévete a un lado (A o D), pulsa la tecla contraria para frenar y dispara una vez; los impactos muestran si frenaste.",
  "exercise.counter_strafe.step3": "Haz 3 series de 50 repeticiones alternando lados.",
  "exercise.counter_strafe.criteria":
    "150 repeticiones con impactos agrupados (sin dispersión de disparo en movimiento).",
  "exercise.prefire_angles.name": "Pre-apuntado de ángulos comunes",
  "exercise.prefire_angles.goal": "Llegar a los ángulos con la mira ya colocada y eliminar rápido.",
  "exercise.prefire_angles.step1":
    "En un servidor local con los comandos, usa bot_place para poner bots quietos en los ángulos comunes de un sitio.",
  "exercise.prefire_angles.step2":
    "Sal del spawn y entra al sitio limpiando los ángulos en orden, apuntando ya donde está cada bot.",
  "exercise.prefire_angles.step3":
    "Repite la entrada 10 veces por sitio, cambiando el orden de los ángulos.",
  "exercise.prefire_angles.step4":
    "Haz 4 series; anota el tiempo de cada limpieza (los bots no disparan con bot_stop 1).",
  "exercise.prefire_angles.criteria": "20 entradas completas con el tiempo de cada una anotado.",
  "exercise.death_review.name": "Revisión de muertes",
  "exercise.death_review.goal": "Entender dónde y por qué mueres más a menudo.",
  "exercise.death_review.step1": "Abre Muertes en CS2 PRO y elige una partida reciente.",
  "exercise.death_review.step2":
    "Revisa 5 muertes: mira el contexto, abre el replay en el instante y decide si fue información, posicionamiento o puntería.",
  "exercise.death_review.step3":
    "Guarda como momento las muertes que quieras revisar, con una nota de qué harías distinto.",
  "exercise.death_review.criteria":
    "5 muertes revisadas con al menos 3 momentos guardados con nota.",
  "exercise.first_death_replay.name": "Replay de muertes de apertura",
  "exercise.first_death_replay.goal": "Revisar las rondas en que moriste primero.",
  "exercise.first_death_replay.step1":
    'Abre Rondas en CS2 PRO y busca las rondas marcadas como "murió primero".',
  "exercise.first_death_replay.step2":
    "Abre el replay 2D unos segundos antes y observa por dónde vino el rival y dónde estaban tus compañeros.",
  "exercise.first_death_replay.step3":
    "Escribe una nota de qué cambiarías (posición, timing o utilidad) y guarda el momento.",
  "exercise.first_death_replay.criteria":
    "Todas las rondas de apertura de una partida revisadas, con nota.",
  "exercise.trade_spacing_review.name": "Revisión de intercambios y distancia",
  "exercise.trade_spacing_review.goal":
    "Estar a una distancia en la que un compañero pueda intercambiar tu muerte (y tú la suya).",
  "exercise.trade_spacing_review.step1":
    "En Rondas, mira tus muertes no intercambiadas y los intercambios de tus compañeros.",
  "exercise.trade_spacing_review.step2":
    "En el replay, observa la distancia y la línea de visión entre tú y el compañero más cercano al morir.",
  "exercise.trade_spacing_review.step3":
    "Guarda 3 momentos de muertes no intercambiadas con una nota de dónde ponerte.",
  "exercise.trade_spacing_review.criteria":
    "3 momentos guardados con nota sobre posicionamiento para intercambiar.",
  "exercise.utility_lineups.name": "Lineups de utilidad",
  "exercise.utility_lineups.goal": "Aprender lanzamientos fijos de humo y flash para tu mapa.",
  "exercise.utility_lineups.step1":
    "En un servidor local con los comandos, elige 2 humos y 2 flashes útiles del mapa que más juegas.",
  "exercise.utility_lineups.step2":
    "Usa la vista previa de trayectoria para acertar cada lanzamiento y anota la referencia de mira y posición.",
  "exercise.utility_lineups.step3":
    "Usa sv_rethrow_last_grenade para repetir y confirmar; repite cada lanzamiento 10 veces.",
  "exercise.utility_lineups.step4":
    "Prueba cada lanzamiento en una partida con bots, saliendo del spawn.",
  "exercise.utility_lineups.criteria": "4 lanzamientos acertados 10 veces seguidas cada uno.",
  "exercise.utility_review.name": "Revisión de utilidad",
  "exercise.utility_review.goal": "Ver si tus granadas cegaron, hicieron daño o se desperdiciaron.",
  "exercise.utility_review.step1": "Abre Utilidad en CS2 PRO en una partida reciente.",
  "exercise.utility_review.step2":
    "Mira flashes que cegaron a compañeros o a nadie y granadas sin daño; abre el replay de 3 de ellas.",
  "exercise.utility_review.step3": "Guarda 2 lanzamientos a corregir como momentos, con nota.",
  "exercise.utility_review.criteria": "3 lanzamientos revisados y 2 momentos guardados con nota.",
  "exercise.clutch_review.name": "Revisión de clutches",
  "exercise.clutch_review.goal": "Revisar decisiones cuando quedaste solo contra rivales.",
  "exercise.clutch_review.step1":
    "En Rondas, abre las rondas de clutch (1vN) de tus últimas partidas.",
  "exercise.clutch_review.step2":
    "En el replay, anota el tiempo restante, la situación de la bomba y por dónde decidiste jugar.",
  "exercise.clutch_review.step3":
    "Escribe una alternativa como hipótesis (no como certeza) y guarda el momento.",
  "exercise.clutch_review.criteria": "Todos los clutches de 2 partidas revisados con nota.",
  "exercise.economy_review.name": "Revisión de economía",
  "exercise.economy_review.goal": "Entender las compras del equipo y la tuya en cada ronda.",
  "exercise.economy_review.step1":
    "En Rondas, en una partida con compra medida, mira la compra del equipo y la tuya por ronda.",
  "exercise.economy_review.step2":
    "Marca las rondas en que tu compra fue distinta de la del equipo (compra mixta) y el resultado.",
  "exercise.economy_review.step3":
    "Guarda 2 momentos de decisiones de compra para hablar con tu equipo.",
  "exercise.economy_review.criteria":
    "1 partida revisada y 2 momentos guardados (solo en partidas con gasto registrado).",
  "exercise.warmup_routine.name": "Rutina de calentamiento",
  "exercise.warmup_routine.goal": "Empezar cada sesión de juego con la misma rutina corta.",
  "exercise.warmup_routine.step1": "5 minutos en Aim Botz (primera bala a la cabeza).",
  "exercise.warmup_routine.step2":
    "10 minutos de Deathmatch centrado en colocación de mira y counter-strafe.",
  "exercise.warmup_routine.step3": "Anota cómo te sentiste antes de la primera partida del día.",
  "exercise.warmup_routine.criteria": "Rutina hecha antes de jugar, en los días previstos.",
};
