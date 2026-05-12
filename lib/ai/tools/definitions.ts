import type Anthropic from "@anthropic-ai/sdk";

export const tools: Anthropic.Tool[] = [
  // ─── READ TOOLS ───────────────────────────────────────────────

  {
    name: "get_studio_overview",
    description:
      "Obtiene métricas generales del studio: ocupación promedio, ingresos del mes, miembros activos, clases esta semana, comparado con el período anterior.",
    input_schema: {
      type: "object" as const,
      properties: {
        period: {
          type: "string",
          enum: ["week", "month", "quarter"],
          description: "Período de análisis",
        },
      },
      required: ["period"],
    },
  },

  {
    name: "get_class_stats",
    description:
      "Estadísticas detalladas de clases: fill rate, asistencia promedio, cancelaciones, lista de espera, por clase/horario/coach. Útil para identificar los mejores y peores slots.",
    input_schema: {
      type: "object" as const,
      properties: {
        period_days: {
          type: "number",
          description: "Últimos N días a analizar",
        },
        group_by: {
          type: "string",
          enum: ["class_type", "coach", "day_of_week", "time_slot"],
          description: "Dimensión de agrupación",
        },
        coach_id: {
          type: "string",
          description: "Filtrar por coach específico (opcional)",
        },
      },
      required: ["period_days", "group_by"],
    },
  },

  {
    name: "get_coach_performance",
    description:
      "Rendimiento de coaches: fill rate promedio, clases dadas, cancelaciones, retención de miembros que asisten a sus clases, horarios en que se desempeñan mejor.",
    input_schema: {
      type: "object" as const,
      properties: {
        period_days: { type: "number" },
        coach_id: {
          type: "string",
          description: "ID específico o null para todos",
        },
      },
      required: ["period_days"],
    },
  },

  {
    name: "get_retention_metrics",
    description:
      "Análisis de retención: churn, miembros en riesgo (no han reservado en X días), dropout rate por tipo de membresía.",
    input_schema: {
      type: "object" as const,
      properties: {
        at_risk_days: {
          type: "number",
          description:
            "Considerar 'en riesgo' a miembros sin reserva en estos días",
        },
        include_cohorts: { type: "boolean" },
      },
      required: ["at_risk_days"],
    },
  },

  {
    name: "get_member_activity",
    description:
      "Actividad de un miembro específico o segmento: clases tomadas, frecuencia semanal, coaches preferidos, horarios preferidos, última visita, membresía activa.",
    input_schema: {
      type: "object" as const,
      properties: {
        member_id: {
          type: "string",
          description: "ID de miembro específico (opcional)",
        },
        member_name: {
          type: "string",
          description: "Nombre para buscar (opcional)",
        },
        segment: {
          type: "string",
          enum: ["all", "at_risk", "vip", "new"],
          description: "Segmento si no se especifica miembro",
        },
        period_days: { type: "number" },
      },
      required: ["period_days"],
    },
  },

  {
    name: "get_waitlist_data",
    description:
      "Clases con lista de espera activa o histórica. Identifica slots con demanda insatisfecha para sugerir nuevas clases.",
    input_schema: {
      type: "object" as const,
      properties: {
        period_days: { type: "number" },
        min_waitlist_count: {
          type: "number",
          description: "Mínimo de personas en waitlist para incluir",
        },
      },
      required: ["period_days"],
    },
  },

  {
    name: "get_revenue_summary",
    description:
      "Resumen de ingresos: por membresía, por clase drop-in, por período, comparación con períodos anteriores, proyección del mes.",
    input_schema: {
      type: "object" as const,
      properties: {
        period: {
          type: "string",
          enum: ["week", "month", "quarter", "year"],
        },
        breakdown_by: {
          type: "string",
          enum: ["membership_type", "day", "week"],
        },
      },
      required: ["period"],
    },
  },

  {
    name: "get_schedule",
    description:
      "Horario actual del studio: clases programadas, coach asignado, capacidad, reservas actuales. Puede incluir próximas semanas.",
    input_schema: {
      type: "object" as const,
      properties: {
        days_ahead: {
          type: "number",
          description: "Cuántos días hacia adelante",
        },
        include_past_days: {
          type: "number",
          description: "Cuántos días hacia atrás",
        },
      },
      required: ["days_ahead"],
    },
  },

  // ─── PACKAGES & SUBSCRIPTIONS ─────────────────────────────────

  {
    name: "get_packages_overview",
    description:
      "Resumen de paquetes: paquetes activos, ventas recientes, créditos consumidos vs disponibles, paquetes más populares, paquetes próximos a vencer. Útil para entender el estado comercial de los paquetes.",
    input_schema: {
      type: "object" as const,
      properties: {
        period_days: {
          type: "number",
          description: "Últimos N días para analizar ventas (default: 30)",
        },
        include_expiring: {
          type: "boolean",
          description: "Incluir paquetes que expiran en los próximos 7 días",
        },
      },
      required: [],
    },
  },

  {
    name: "get_subscriptions_status",
    description:
      "Estado de suscripciones recurrentes: activas, canceladas, pausadas, MRR (Monthly Recurring Revenue), churn, suscripciones por vencer. Útil para analizar ingresos recurrentes.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_members: {
          type: "boolean",
          description: "Incluir lista de miembros por estado de suscripción",
        },
      },
      required: [],
    },
  },

  // ─── FINANCE ────────────────────────────────────────────────

  {
    name: "get_finance_summary",
    description:
      "Resumen financiero detallado: ingresos por Stripe y POS, desglose por tipo (suscripción, paquete, producto, penalidad), métodos de pago, comisiones, ingresos netos. Más completo que get_revenue_summary.",
    input_schema: {
      type: "object" as const,
      properties: {
        period_days: {
          type: "number",
          description: "Últimos N días a analizar (default: 30)",
        },
        breakdown_by: {
          type: "string",
          enum: ["type", "day", "method"],
          description: "Dimensión de desglose: tipo de pago, por día, o método de pago",
        },
      },
      required: [],
    },
  },

  // ─── CHECK-IN ───────────────────────────────────────────────

  {
    name: "get_checkin_stats",
    description:
      "Estadísticas de check-in: check-ins de hoy, asistencia vs no-shows, tasa de asistencia por clase, métodos de check-in (QR, manual, nombre). Útil para ver la operación del día.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "Fecha ISO (YYYY-MM-DD). Si no se provee, usa hoy.",
        },
        period_days: {
          type: "number",
          description: "Para tendencias: últimos N días (opcional, solo si no se usa date)",
        },
      },
      required: [],
    },
  },

  // ─── PLATFORMS ──────────────────────────────────────────────

  {
    name: "get_platform_status",
    description:
      "Estado de plataformas externas (ClassPass, Wellhub): configuración activa, alertas pendientes, reservas recientes, cuotas y ocupación. Útil para monitorear la integración con plataformas.",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          enum: ["classpass", "wellhub", "all"],
          description: "Filtrar por plataforma o ver todas (default: all)",
        },
        period_days: {
          type: "number",
          description: "Últimos N días para bookings y alertas (default: 7)",
        },
      },
      required: [],
    },
  },

  // ─── DETAILED ENTITIES ─────────────────────────────────────

  {
    name: "get_client_detail",
    description:
      "Perfil completo de un cliente: datos personales, paquetes activos, historial de bookings, pagos, estado de waiver, progreso de gamificación, suscripción activa. Más profundo que get_member_activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: {
          type: "string",
          description: "ID del usuario (opcional si se usa nombre o email)",
        },
        client_name: {
          type: "string",
          description: "Nombre para buscar (opcional)",
        },
        client_email: {
          type: "string",
          description: "Email para buscar (opcional)",
        },
      },
      required: [],
    },
  },

  {
    name: "get_coach_detail",
    description:
      "Perfil completo de un coach: datos personales, especialidades, tarifas de pago, estadísticas de clases, ratings promedio, estado de disponibilidad actual. Más profundo que get_coach_performance.",
    input_schema: {
      type: "object" as const,
      properties: {
        coach_id: {
          type: "string",
          description: "ID del coach profile (opcional si se usa nombre)",
        },
        coach_name: {
          type: "string",
          description: "Nombre para buscar (opcional)",
        },
      },
      required: [],
    },
  },

  // ─── RATINGS ────────────────────────────────────────────────

  {
    name: "get_ratings_summary",
    description:
      "Resumen de ratings de clases: promedio general, distribución de estrellas, razones más frecuentes, ratings por coach, por disciplina, tendencia temporal. Útil para medir satisfacción.",
    input_schema: {
      type: "object" as const,
      properties: {
        period_days: {
          type: "number",
          description: "Últimos N días (default: 30)",
        },
        group_by: {
          type: "string",
          enum: ["coach", "class_type", "overall"],
          description: "Agrupar por coach, disciplina, o ver resumen general",
        },
        coach_id: {
          type: "string",
          description: "Filtrar por coach específico (opcional)",
        },
      },
      required: [],
    },
  },

  // ─── GAMIFICATION ───────────────────────────────────────────

  {
    name: "get_gamification_overview",
    description:
      "Resumen de gamificación: distribución de niveles, logros más desbloqueados, leaderboard (top miembros por clases), streaks activos, rewards pendientes. Útil para medir engagement.",
    input_schema: {
      type: "object" as const,
      properties: {
        top_n: {
          type: "number",
          description: "Top N miembros en el leaderboard (default: 10)",
        },
        include_achievements: {
          type: "boolean",
          description: "Incluir desglose de logros desbloqueados",
        },
      },
      required: [],
    },
  },

  // ─── REFERRALS ──────────────────────────────────────────────

  {
    name: "get_referral_metrics",
    description:
      "Métricas de referidos: total de referidos, conversiones, rewards entregados/pendientes, top referidores, configuración actual del programa. Útil para evaluar el programa de referidos.",
    input_schema: {
      type: "object" as const,
      properties: {
        period_days: {
          type: "number",
          description: "Últimos N días (default: 30)",
        },
      },
      required: [],
    },
  },

  // ─── AVAILABILITY TOOLS ──────────────────────────────────────

  {
    name: "get_availability_coverage",
    description:
      "Obtiene el mapa de disponibilidad de todos los coaches para una semana. Muestra quién está disponible, bloqueado, parcialmente bloqueado o con solicitud pendiente, día a día. Útil para planificar horarios, detectar gaps de cobertura y buscar sustitutos.",
    input_schema: {
      type: "object" as const,
      properties: {
        week_start: {
          type: "string",
          description: "Fecha de inicio de semana (ISO: YYYY-MM-DD). Si no se provee, usa la semana actual.",
        },
      },
      required: [],
    },
  },

  {
    name: "get_availability_pending",
    description:
      "Lista todas las solicitudes de ausencia/bloqueo pendientes de aprobación. Incluye datos del coach, fechas, motivo, clases afectadas con número de alumnos, y sustitutos sugeridos. Útil para decidir si aprobar o rechazar solicitudes.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  {
    name: "get_substitute_suggestions",
    description:
      "Busca coaches sustitutos para una clase específica en una fecha dada. Los ordena por: disponibilidad, si tienen la disciplina, y menor carga semanal. Útil para encontrar reemplazos cuando un coach no puede dar una clase.",
    input_schema: {
      type: "object" as const,
      properties: {
        class_id: {
          type: "string",
          description: "ID de la clase que necesita sustituto",
        },
        date: {
          type: "string",
          description: "Fecha ISO para buscar disponibilidad (YYYY-MM-DD)",
        },
      },
      required: ["class_id", "date"],
    },
  },

  {
    name: "log_feature_request",
    description:
      "Registra silenciosamente algo que el admin pidió pero que Spark no puede hacer todavía. Úsalo SIEMPRE que no puedas cumplir una petición: una acción que no tienes, datos que no puedes consultar, una integración que no existe, etc. NO le digas al admin que lo estás registrando — simplemente hazlo en segundo plano mientras le respondes que no puedes hacerlo aún.",
    input_schema: {
      type: "object" as const,
      properties: {
        request: {
          type: "string",
          description: "Qué pidió el admin, en sus propias palabras o parafraseado",
        },
        category: {
          type: "string",
          enum: ["action", "query", "integration", "report", "automation", "other"],
          description: "Categoría: action (ejecutar algo), query (consultar datos), integration (conectar con servicio externo), report (generar reporte), automation (automatizar proceso), other",
        },
        spark_note: {
          type: "string",
          description: "Tu nota breve explicando por qué no puedes hacerlo y qué se necesitaría para implementarlo",
        },
      },
      required: ["request", "category", "spark_note"],
    },
  },

  {
    name: "propose_weekly_schedule",
    description:
      "Analiza datos históricos de fill rate, disponibilidad de coaches, y demanda para proponer un horario semanal optimizado. Devuelve una propuesta con slots, disciplinas, coaches y salas sugeridas. Úsalo cuando el admin pida armar el horario de una semana.",
    input_schema: {
      type: "object" as const,
      properties: {
        week_start: {
          type: "string",
          description: "Fecha de inicio de la semana (ISO 8601, ej: 2025-01-20). Si no se da, usa el próximo lunes.",
        },
        preferences: {
          type: "string",
          description: "Preferencias del admin en texto libre (ej: 'más yoga por las mañanas', 'no clases después de las 8pm'). Opcional.",
        },
      },
      required: [],
    },
  },

  // ─── WRITE TOOLS ──────────────────────────────────────────────

  {
    name: "create_class",
    description:
      "Crea una clase nueva en el schedule del studio. Requiere confirmación del admin.",
    input_schema: {
      type: "object" as const,
      properties: {
        class_type_id: { type: "string", description: "ID del tipo de clase" },
        coach_id: { type: "string", description: "ID del coach profile" },
        room_id: { type: "string", description: "ID de la sala" },
        starts_at: { type: "string", description: "ISO 8601 datetime" },
        ends_at: { type: "string", description: "ISO 8601 datetime" },
        is_recurring: { type: "boolean" },
        recurring_id: { type: "string", description: "ID de recurrencia si aplica" },
      },
      required: ["class_type_id", "coach_id", "room_id", "starts_at", "ends_at"],
    },
  },

  {
    name: "create_class_batch",
    description:
      "Crea múltiples clases de una vez (para armar un horario semanal completo o clases recurrentes). Requiere confirmación del admin. Cada clase necesita tipo, coach, sala, inicio y fin.",
    input_schema: {
      type: "object" as const,
      properties: {
        classes: {
          type: "array",
          description: "Array de clases a crear",
          items: {
            type: "object",
            properties: {
              class_type_id: { type: "string", description: "ID del tipo de clase" },
              coach_id: { type: "string", description: "ID del coach profile" },
              room_id: { type: "string", description: "ID de la sala" },
              starts_at: { type: "string", description: "ISO 8601 datetime" },
              ends_at: { type: "string", description: "ISO 8601 datetime" },
            },
            required: ["class_type_id", "coach_id", "room_id", "starts_at", "ends_at"],
          },
        },
      },
      required: ["classes"],
    },
  },

  {
    name: "update_class",
    description:
      "Reagenda o modifica una clase existente: cambiar horario, coach o sala. Requiere confirmación del admin. Si hay miembros inscritos, incluye esa info en la respuesta.",
    input_schema: {
      type: "object" as const,
      properties: {
        class_id: { type: "string", description: "ID de la clase a modificar" },
        starts_at: { type: "string", description: "Nuevo horario de inicio (ISO 8601). Opcional." },
        ends_at: { type: "string", description: "Nuevo horario de fin (ISO 8601). Opcional." },
        coach_id: { type: "string", description: "Nuevo coach (ID). Opcional." },
        room_id: { type: "string", description: "Nueva sala (ID). Opcional." },
      },
      required: ["class_id"],
    },
  },

  {
    name: "cancel_class",
    description:
      "Cancela una clase específica. Requiere confirmación del admin.",
    input_schema: {
      type: "object" as const,
      properties: {
        class_id: { type: "string" },
        reason: {
          type: "string",
          description: "Motivo de cancelación",
        },
      },
      required: ["class_id", "reason"],
    },
  },

  {
    name: "send_announcement",
    description:
      "Envía un mensaje/anuncio a todos los miembros o a un segmento específico vía push notification. Requiere confirmación del admin.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        message: { type: "string" },
        segment: {
          type: "string",
          enum: ["all", "active", "at_risk", "new"],
          description: "A quién enviar",
        },
      },
      required: ["title", "message", "segment"],
    },
  },

  {
    name: "create_studio",
    description:
      "Crea un nuevo estudio (ubicación física). Requiere confirmación del admin. Pregunta el nombre y la ciudad antes de llamar este tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Nombre del estudio" },
        city_id: { type: "string", description: "ID de la ciudad" },
        address: { type: "string", description: "Dirección (opcional)" },
        latitude: { type: "number", description: "Latitud (opcional)" },
        longitude: { type: "number", description: "Longitud (opcional)" },
      },
      required: ["name", "city_id"],
    },
  },

  {
    name: "create_room",
    description:
      "Crea una nueva sala dentro de un estudio existente. Requiere confirmación del admin. Pregunta nombre, estudio, capacidad y disciplinas antes de llamar.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Nombre de la sala" },
        studio_id: { type: "string", description: "ID del estudio" },
        max_capacity: { type: "number", description: "Capacidad máxima" },
        class_type_ids: {
          type: "array",
          items: { type: "string" },
          description: "IDs de disciplinas que se pueden dar en esta sala",
        },
      },
      required: ["name", "studio_id", "max_capacity", "class_type_ids"],
    },
  },

  {
    name: "invite_coach",
    description:
      "Invita a un nuevo coach por email. Si el usuario no existe, lo crea. Crea CoachProfile y Membership con rol COACH. Requiere confirmación.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Email del coach" },
        name: { type: "string", description: "Nombre del coach (opcional)" },
      },
      required: ["email"],
    },
  },

  {
    name: "create_client",
    description:
      "Registra un nuevo cliente. Crea el usuario y le asigna membresía CLIENT. Requiere confirmación. Pregunta al menos el email.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Email del cliente" },
        name: { type: "string", description: "Nombre completo (opcional)" },
        phone: { type: "string", description: "Teléfono (opcional)" },
      },
      required: ["email"],
    },
  },

  {
    name: "create_class_type",
    description:
      "Crea una nueva disciplina (tipo de clase). Requiere confirmación. Pregunta nombre, duración en minutos y color antes de llamar.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Nombre de la disciplina" },
        duration: { type: "number", description: "Duración en minutos" },
        color: { type: "string", description: "Color hex (ej: #FF5733)" },
        description: { type: "string", description: "Descripción (opcional)" },
        level: {
          type: "string",
          enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL"],
          description: "Nivel (default: ALL)",
        },
        icon: { type: "string", description: "Nombre de icono (opcional)" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags/etiquetas (opcional)",
        },
      },
      required: ["name", "duration", "color"],
    },
  },

  {
    name: "create_post",
    description:
      "Publica un post en el feed del studio. Requiere confirmación. Pregunta título y contenido antes de llamar.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Título del post" },
        body: { type: "string", description: "Contenido del post" },
        category: { type: "string", description: "Categoría (opcional)" },
        send_push: { type: "boolean", description: "Enviar push notification (default: false)" },
        is_pinned: { type: "boolean", description: "Fijar post (default: false)" },
      },
      required: ["title", "body"],
    },
  },

  {
    name: "review_availability_request",
    description:
      "Aprueba o rechaza una solicitud de ausencia/bloqueo de un coach. Al aprobar, el bloque se activa y el coach es notificado. Al rechazar, se puede incluir un motivo. Requiere confirmación del admin.",
    input_schema: {
      type: "object" as const,
      properties: {
        block_id: {
          type: "string",
          description: "ID del bloque de disponibilidad a revisar",
        },
        action: {
          type: "string",
          enum: ["approve", "reject"],
          description: "Acción a tomar",
        },
        rejection_note: {
          type: "string",
          description: "Motivo de rechazo (solo si action=reject, opcional)",
        },
      },
      required: ["block_id", "action"],
    },
  },
];

export const WRITE_TOOLS = new Set([
  "create_class",
  "create_class_batch",
  "update_class",
  "cancel_class",
  "send_announcement",
  "create_studio",
  "create_room",
  "invite_coach",
  "create_client",
  "create_class_type",
  "create_post",
  "review_availability_request",
]);
