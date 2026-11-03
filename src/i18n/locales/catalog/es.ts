import type { catalogPtBR } from "./pt-BR";

export const catalogEs: Record<keyof typeof catalogPtBR, string> = {
  "admin.nav.catalog": "Catálogo de cursos",
  "catalog.admin.title": "Catálogo de cursos y clases",
  "catalog.admin.subtitle":
    "Fuente única de los cursos y clases usados en Mi Entrenamiento y en el AI Coach. Solo se recomiendan elementos activos, con idioma confirmado y ruta clasificada.",
  "catalog.admin.tab.lessons": "Clases",
  "catalog.admin.tab.groups": "Rutas y grupos",
  "catalog.admin.tab.import": "Importar",
  "catalog.admin.search": "Buscar por título o URL",
  "catalog.admin.all": "Todos",
  "catalog.admin.col.title": "Título",
  "catalog.admin.col.locale": "Idioma",
  "catalog.admin.col.status": "Estado del idioma",
  "catalog.admin.col.track": "Ruta",
  "catalog.admin.col.topics": "Temas",
  "catalog.admin.col.lessons": "Clases",
  "catalog.admin.col.courses": "Cursos",
  "catalog.admin.col.source": "Origen de la clasificación",
  "catalog.admin.status.confirmed": "Confirmado",
  "catalog.admin.status.pending": "Pendiente de validación",
  "catalog.admin.active": "Activo",
  "catalog.admin.inactive": "Inactivo",
  "catalog.admin.edit": "Editar",
  "catalog.admin.save": "Guardar",
  "catalog.admin.cancel": "Cancelar",
  "catalog.admin.activate": "Activar",
  "catalog.admin.deactivate": "Desactivar",
  "catalog.admin.delete": "Eliminar",
  "catalog.admin.confirmDelete":
    "¿Eliminar esta clase definitivamente? Mejor desactivarla si puede volver.",
  "catalog.admin.field.url": "URL",
  "catalog.admin.field.topicsHint": "Códigos separados por coma (ej.: utility, aim, positioning)",
  "catalog.admin.saved": "Cambio guardado.",
  "catalog.admin.error":
    "No se pudo guardar. Revise la URL (solo hub.gamepro.academy, nunca sample-course) y si ya existe en el catálogo.",
  "catalog.admin.empty": "Ningún elemento coincide con estos filtros.",
  "catalog.track.counter_strike_in_game": "Entrenamiento Counter-Strike",
  "catalog.track.strategic_knowledge": "Conocimientos Estratégicos",
  "catalog.track.extra_skills": "Habilidades Extra",
  "catalog.track.unclassified": "Sin clasificar",
  "catalog.admin.import.help":
    "Envíe training_catalog.json o los CSV (cursos y/o clases). Simule primero: no se graba nada. Al aplicar se incluyen elementos nuevos y se actualizan cambios; nada ausente del archivo se elimina y se preservan las decisiones hechas aquí (idioma, ruta).",
  "catalog.admin.import.json": "Archivo JSON del catálogo",
  "catalog.admin.import.coursesCsv": "CSV de cursos (opcional)",
  "catalog.admin.import.lessonsCsv": "CSV de clases (opcional)",
  "catalog.admin.import.simulate": "Simular importación",
  "catalog.admin.import.apply": "Aplicar importación",
  "catalog.admin.import.report": "Informe",
  "catalog.admin.import.inserted": "nuevos",
  "catalog.admin.import.updated": "actualizados",
  "catalog.admin.import.unchanged": "sin cambios",
  "catalog.admin.import.notInFile": "en la base y fuera del archivo (se mantienen)",
  "catalog.admin.import.rejected": "rechazados",
  "catalog.admin.import.pending": "clases con idioma pendiente",
  "catalog.admin.import.simulated": "Simulación: no se grabó nada.",
  "catalog.admin.import.applied": "Importación aplicada.",
  "catalog.admin.import.failed":
    "Importación rechazada. El archivo no se pudo leer o es demasiado grande (máx. 5 MB).",
  "training.real.noPlayer":
    "Todavía no hay un jugador vinculado a tu cuenta. Sube una demo y confirma qué jugador eres para generar el plan.",
  "training.real.noData":
    "Aún no hay partidas procesadas. El plan solo usa tus datos reales; sube una demo para empezar.",
  "training.real.noPriority":
    "Ninguna dimensión de tu Player DNA está por debajo de 60 / 100 y no declaraste objetivos en el perfil: no hay prioridad que corregir. Mantén la rutina y define un objetivo en el perfil para recibir recomendaciones.",
  "training.real.provisional":
    "Muestra pequeña ({matches} partida(s)): las prioridades son provisionales y se revisarán con cada nueva demo.",
  "training.real.catalogUnavailable":
    "El catálogo de clases no está disponible ahora; el plan muestra solo las actividades prácticas.",
  "training.real.goals": "Tus objetivos",
  "training.real.noGoals": "Ningún objetivo declarado en el perfil.",
  "training.real.priorities": "Prioridades (dimensiones más bajas de tu Player DNA)",
  "training.real.week": "Semana",
  "training.real.focusConsolidation": "Consolidación y revisión",
  "training.real.practice": "Práctica en CS2",
  "training.real.lessons": "Clases recomendadas",
  "training.real.complementary": "Rutas complementarias",
  "training.real.complementaryHint":
    "Contenidos de otras rutas vinculados a tus prioridades. Sugerencia: una clase por semana.",
  "training.real.frequency": "Sugerencia: 3 a 4 sesiones por semana, en este orden.",
  "training.real.open": "Abrir clase",
  "training.real.openCourse": "Abrir curso",
  "training.real.why.dna": "Tu dimensión {dimension} está en {value}.",
  "training.real.why.goal": "Vinculada a tu objetivo: {goal}.",
  "training.real.why.map": "Posiciones del mapa {map}, que jugaste.",
  "training.real.noLesson": "No hay clase del catálogo para esta prioridad en tu idioma.",
  "training.practice.aim":
    "15 min de aim_botz con la mira a la altura de la cabeza + 10 min de deathmatch solo con one-taps.",
  "training.practice.dueling":
    "Práctica de peeks (wide y jiggle) en mapa de entrenamiento y revisión de tus duelos de apertura en la demo.",
  "training.practice.survivability":
    "En cada partida, anota las muertes sin intercambio y revisa la posición de cada una en la demo.",
  "training.practice.positioning":
    "Entrena las posiciones estándar de los mapas que juegas, de CT y de TR, en servidor local.",
  "training.practice.utility":
    "Aprende 3 smokes y 2 flashes de ejecución de tu mapa principal y úsalas en cada partida.",
  "training.practice.decision_making":
    "Después de cada ronda perdida, escribe en una línea qué decisión cambiaría el resultado.",
  "training.practice.teamplay":
    "Acuerda con el equipo trades y flashes para el compañero; revisa en la demo si el trade ocurrió.",
  "training.practice.economy":
    "Antes de cada ronda, decide en voz alta compra completa, force o eco con el equipo.",
  "training.practice.clutch":
    "Entrena situaciones de 1v1 y 1v2 en servidor de retake, priorizando información antes de disparar.",
  "training.practice.consistency":
    "Mismo calentamiento de 20 min antes de cada sesión (aim, spray, deathmatch) y como máximo 3 partidas seguidas.",
  "training.practice.demo_review":
    "Mira tu última demo y marca 3 rondas para corregir; compara con la semana 1.",
  "coach.catalog.label": "Clase recomendada",
};
