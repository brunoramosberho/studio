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
];

export const WRITE_TOOLS = new Set([
  "create_class",
  "cancel_class",
  "send_announcement",
]);
