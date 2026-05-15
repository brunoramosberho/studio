import type Anthropic from "@anthropic-ai/sdk";

// Tool surface for the schedule planner. Intentionally narrow: the planner
// only needs to (a) inspect availability/history when useful and (b) emit a
// proposal. Applying the plan is a separate, explicit HTTP action from the
// review modal — Spark never creates classes directly in this mode.

export const plannerTools: Anthropic.Tool[] = [
  {
    name: "get_planner_resources",
    description:
      "Devuelve el catálogo del studio que necesitas para construir la propuesta: estudios, salas (con capacidad y disciplinas permitidas), disciplinas (con duración), coaches (con disciplinas asignadas) y, opcionalmente, datos históricos de fill rate por slot de los últimos 28 días.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_history: {
          type: "boolean",
          description: "Si true, incluye fill rate histórico por día/hora/disciplina (más tokens, úsalo solo si vas a optimizar por demanda)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_coach_availability_window",
    description:
      "Devuelve los bloques de no-disponibilidad aprobados de los coaches dentro de un rango. Úsalo antes de proponer para evitar agendar a un coach en un día que pidió libre.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "propose_schedule_plan",
    description:
      "Genera y guarda una propuesta de horario completa basada en las restricciones recolectadas. El objeto constraints debe contener TODAS las preferencias del admin (no solo lo nuevo). El tool guarda la propuesta en la conversación y la muestra en una tabla revisable al admin. NO crea las clases.",
    input_schema: {
      type: "object" as const,
      properties: {
        constraints: {
          type: "object",
          description: "Restricciones estructuradas recolectadas hasta ahora",
          properties: {
            studio_ids: {
              description: "IDs de estudios a usar, o 'all' para todos",
              oneOf: [
                { type: "array", items: { type: "string" } },
                { type: "string", enum: ["all"] },
              ],
            },
            horizon_days: {
              type: "number",
              description: "Cuántos días planear desde start_date (default 14)",
            },
            start_date: {
              type: "string",
              description: "Fecha de inicio YYYY-MM-DD (default: próximo lunes)",
            },
            excluded_windows: {
              type: "array",
              description: "Ventanas horarias en las que NO debe haber clases",
              items: {
                type: "object",
                properties: {
                  days_of_week: {
                    type: "array",
                    items: { type: "number" },
                    description: "0=domingo..6=sábado. Vacío = todos los días.",
                  },
                  start_time: { type: "string", description: "HH:mm" },
                  end_time: { type: "string", description: "HH:mm" },
                  label: { type: "string" },
                },
                required: ["start_time", "end_time"],
              },
            },
            discipline_mix: {
              type: "array",
              description: "Cuántas clases por disciplina por semana",
              items: {
                type: "object",
                properties: {
                  class_type_id: { type: "string" },
                  name: { type: "string" },
                  classes_per_week: { type: "number" },
                },
                required: ["class_type_id", "classes_per_week"],
              },
            },
            allowed_class_type_ids: {
              description: "IDs de disciplinas permitidas o 'all'",
              oneOf: [
                { type: "array", items: { type: "string" } },
                { type: "string", enum: ["all"] },
              ],
            },
            instructor: {
              type: "object",
              properties: {
                max_classes_per_day: { type: "number" },
                max_classes_per_week: { type: "number" },
                max_consecutive_classes: { type: "number" },
              },
            },
            cross_studio: {
              type: "object",
              properties: {
                prevent_same_discipline_parallel: { type: "boolean" },
                coach_commute_minutes: { type: "number" },
              },
            },
            notes: { type: "string", description: "Notas en texto libre del admin" },
          },
        },
        proposal: {
          type: "array",
          description: "Array de clases propuestas. CADA elemento DEBE usar ids reales del catálogo.",
          items: {
            type: "object",
            properties: {
              class_type_id: { type: "string" },
              coach_id: { type: "string" },
              room_id: { type: "string" },
              starts_at: { type: "string", description: "ISO 8601 completo con timezone" },
              ends_at: { type: "string", description: "ISO 8601 completo con timezone" },
              rationale: { type: "string", description: "Breve por qué de este slot (opcional)" },
            },
            required: ["class_type_id", "coach_id", "room_id", "starts_at", "ends_at"],
          },
        },
        warnings: {
          type: "array",
          items: { type: "string" },
          description: "Avisos al admin: restricciones que no pudiste cumplir o trade-offs hechos",
        },
      },
      required: ["constraints", "proposal"],
    },
  },
];
