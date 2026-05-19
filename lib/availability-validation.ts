import { parseHhmm, SLOT_MINUTES, getMondayBasedDow } from "@/lib/availability";

export interface BlockPayload {
  kind?: "availability" | "time_off";
  type?: "recurring" | "one_time";
  dayOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isAllDay?: boolean;
  reasonType?: "vacation" | "personal" | "training" | "other" | null;
  reasonNote?: string | null;
  studioPreferences?: { studioId: string; preference: "preferred" | "ok_if_needed" }[];
}

export interface TenantWindow {
  studioOpenTime: string;  // "HH:MM"
  studioCloseTime: string; // "HH:MM"
  operatingDays: number[]; // Monday-based: 0=Mon..6=Sun
}

export interface ValidationOk {
  ok: true;
  data: {
    kind: "availability" | "time_off";
    type: "recurring" | "one_time";
    dayOfWeek: number[];
    startTime: string | null;
    endTime: string | null;
    startDate: Date | null;
    endDate: Date | null;
    isAllDay: boolean;
    reasonType: "vacation" | "personal" | "training" | "other" | null;
    reasonNote: string | null;
    studioPreferences: { studioId: string; preference: "preferred" | "ok_if_needed" }[];
  };
}

export interface ValidationError {
  ok: false;
  error: string;
}

/**
 * Validates an incoming block payload from either the coach or admin endpoint.
 *
 * Rules:
 * - kind defaults to "time_off" (back-compat with the old endpoint shape).
 * - type must be either "recurring" or "one_time".
 * - For kind=availability: studioPreferences must contain at least one row;
 *   times must be present and snapped to a 15-min boundary; for recurring
 *   dayOfWeek must be a subset of tenant.operatingDays; times must fall
 *   entirely within [studioOpenTime, studioCloseTime).
 * - For kind=time_off: reasonType is required; if not all-day, times must
 *   parse cleanly but we don't clamp to operating hours (a coach can take
 *   the morning off even if the studio opens late).
 */
export function validateBlockPayload(
  payload: BlockPayload,
  tenantWindow: TenantWindow,
  context: { validStudioIds: Set<string> },
): ValidationOk | ValidationError {
  const kind = payload.kind ?? "time_off";
  if (kind !== "availability" && kind !== "time_off") {
    return { ok: false, error: "kind must be 'availability' or 'time_off'" };
  }

  const type = payload.type;
  if (type !== "recurring" && type !== "one_time") {
    return { ok: false, error: "type must be 'recurring' or 'one_time'" };
  }

  // ── Recurring: dayOfWeek required ────────────────────────────────
  let dayOfWeek = payload.dayOfWeek ?? [];
  if (type === "recurring") {
    if (!Array.isArray(dayOfWeek) || dayOfWeek.length === 0) {
      return { ok: false, error: "dayOfWeek is required for recurring blocks" };
    }
    if (dayOfWeek.some((d) => d < 0 || d > 6 || !Number.isInteger(d))) {
      return { ok: false, error: "dayOfWeek values must be integers 0..6" };
    }
    if (kind === "availability") {
      const operating = new Set(tenantWindow.operatingDays);
      const out = dayOfWeek.filter((d) => !operating.has(d));
      if (out.length > 0) {
        return {
          ok: false,
          error: `Estos días no son operativos del estudio: ${out.join(", ")}`,
        };
      }
    }
  } else {
    // one_time: dayOfWeek is irrelevant
    dayOfWeek = [];
  }

  // ── one_time: startDate + endDate required ───────────────────────
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  if (type === "one_time") {
    if (!payload.startDate || !payload.endDate) {
      return {
        ok: false,
        error: "startDate y endDate son obligatorios para bloques puntuales",
      };
    }
    startDate = new Date(payload.startDate);
    endDate = new Date(payload.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { ok: false, error: "Fecha inválida" };
    }
    if (endDate < startDate) {
      return { ok: false, error: "endDate debe ser ≥ startDate" };
    }
  }

  // ── Times ────────────────────────────────────────────────────────
  const isAllDay = payload.isAllDay ?? (kind === "time_off");
  let startTime: string | null = payload.startTime ?? null;
  let endTime: string | null = payload.endTime ?? null;

  if (kind === "availability") {
    // Availability always needs explicit time bounds (the whole point is
    // expressing a specific window).
    if (!startTime || !endTime) {
      return { ok: false, error: "Las franjas horarias son obligatorias" };
    }
    const startMin = parseHhmm(startTime);
    const endMin = parseHhmm(endTime);
    if (startMin == null || endMin == null) {
      return { ok: false, error: "Horario inválido" };
    }
    if (endMin <= startMin) {
      return { ok: false, error: "La hora final debe ser mayor a la inicial" };
    }
    if (startMin % SLOT_MINUTES !== 0 || endMin % SLOT_MINUTES !== 0) {
      return {
        ok: false,
        error: `Los horarios deben estar en intervalos de ${SLOT_MINUTES} minutos`,
      };
    }
    const openMin = parseHhmm(tenantWindow.studioOpenTime);
    const closeMin = parseHhmm(tenantWindow.studioCloseTime);
    if (openMin != null && closeMin != null) {
      if (startMin < openMin || endMin > closeMin) {
        return {
          ok: false,
          error: `El horario debe estar dentro del horario del estudio (${tenantWindow.studioOpenTime}–${tenantWindow.studioCloseTime})`,
        };
      }
    }
  } else {
    // time_off: explicit times only if not all-day
    if (!isAllDay) {
      const startMin = parseHhmm(startTime ?? "");
      const endMin = parseHhmm(endTime ?? "");
      if (startMin == null || endMin == null) {
        return { ok: false, error: "Horario inválido para tiempo libre" };
      }
      if (endMin <= startMin) {
        return { ok: false, error: "La hora final debe ser mayor a la inicial" };
      }
      if (startMin % SLOT_MINUTES !== 0 || endMin % SLOT_MINUTES !== 0) {
        return {
          ok: false,
          error: `Los horarios deben estar en intervalos de ${SLOT_MINUTES} minutos`,
        };
      }
    } else {
      // null them out so the row is clean
      startTime = null;
      endTime = null;
    }
  }

  // ── Studio preferences (only for availability) ────────────────────
  const studioPreferences: { studioId: string; preference: "preferred" | "ok_if_needed" }[] = [];
  if (kind === "availability") {
    const raw = payload.studioPreferences ?? [];
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, error: "Debes elegir al menos un estudio" };
    }
    const seen = new Set<string>();
    for (const p of raw) {
      if (!p || typeof p.studioId !== "string") {
        return { ok: false, error: "studioPreferences mal formado" };
      }
      if (!context.validStudioIds.has(p.studioId)) {
        return { ok: false, error: "Estudio inválido" };
      }
      if (seen.has(p.studioId)) {
        return { ok: false, error: "Un estudio no puede aparecer dos veces" };
      }
      seen.add(p.studioId);
      if (p.preference !== "preferred" && p.preference !== "ok_if_needed") {
        return { ok: false, error: "Preferencia inválida" };
      }
      studioPreferences.push({ studioId: p.studioId, preference: p.preference });
    }
  }

  // ── reasonType ───────────────────────────────────────────────────
  let reasonType: "vacation" | "personal" | "training" | "other" | null = payload.reasonType ?? null;
  if (kind === "time_off") {
    if (!reasonType) {
      return { ok: false, error: "reasonType es obligatorio para tiempo libre" };
    }
    if (!["vacation", "personal", "training", "other"].includes(reasonType)) {
      return { ok: false, error: "reasonType inválido" };
    }
  } else {
    // availability blocks don't carry a reason
    reasonType = null;
  }

  return {
    ok: true,
    data: {
      kind,
      type,
      dayOfWeek,
      startTime,
      endTime,
      startDate,
      endDate,
      isAllDay,
      reasonType,
      reasonNote: payload.reasonNote ?? null,
      studioPreferences,
    },
  };
}

// Re-exported for callers that want to render the operating-day list nicely.
export { getMondayBasedDow };
