// Wellhub "Classes" resource (templates: Yoga / Cycling / …).
// Maps to our `ClassType`. A Wellhub `slot` cannot exist without its parent
// `class`, so callers must ensure the class is created before pushing a slot.

import { bookingApi } from "./client";
import type {
  WellhubClass,
  WellhubClassCreatePayload,
  WellhubClassCreateResponse,
  WellhubClassListResponse,
  WellhubClassUpdatePayload,
} from "./types";

/**
 * POST /booking/v1/gyms/:gym_id/classes
 *
 * Wellhub accepts a list; we always send one and unwrap the response.
 */
export async function createWellhubClass(
  gymId: number,
  payload: WellhubClassCreatePayload,
): Promise<{ id: number; name: string; reference?: string | null }> {
  const res = await bookingApi<WellhubClassCreateResponse>(
    `/booking/v1/gyms/${gymId}/classes`,
    { method: "POST", body: { classes: [payload] } },
  );
  const created = res.classes?.[0];
  if (!created) {
    throw new Error("Wellhub returned no classes in the create response");
  }
  return created;
}

/** PUT /booking/v1/gyms/:gym_id/classes/:class_id */
export function updateWellhubClass(
  gymId: number,
  classId: number,
  payload: WellhubClassUpdatePayload,
): Promise<void> {
  return bookingApi<void>(`/booking/v1/gyms/${gymId}/classes/${classId}`, {
    method: "PUT",
    body: payload,
  });
}

/** GET /booking/v1/gyms/:gym_id/classes */
export async function listWellhubClasses(gymId: number): Promise<WellhubClass[]> {
  const res = await bookingApi<WellhubClassListResponse>(
    `/booking/v1/gyms/${gymId}/classes`,
  );
  return res.classes ?? [];
}

/** GET /booking/v1/gyms/:gym_id/classes/:class_id */
export function getWellhubClass(
  gymId: number,
  classId: number,
  opts: { showDeleted?: boolean } = {},
): Promise<WellhubClass> {
  return bookingApi<WellhubClass>(`/booking/v1/gyms/${gymId}/classes/${classId}`, {
    query: { "show-deleted": opts.showDeleted ? "true" : "false" },
  });
}

/**
 * Wellhub does NOT expose DELETE for classes. To hide a class (and all its
 * slots), the spec instructs partners to PUT visible=false. This helper makes
 * the intent explicit at the call site.
 */
export function hideWellhubClass(
  gymId: number,
  classId: number,
  base: WellhubClassUpdatePayload,
): Promise<void> {
  return updateWellhubClass(gymId, classId, { ...base, visible: false });
}
