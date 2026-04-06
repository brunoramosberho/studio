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
