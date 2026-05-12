// Wellhub "Slots" resource — class occurrences with a specific date/time.
// Maps to our `Class` model. Each slot is owned by a Wellhub class (template).

import { bookingApi } from "./client";
import type {
  WellhubSlot,
  WellhubSlotCreatePayload,
  WellhubSlotEnvelope,
  WellhubSlotListResponse,
  WellhubSlotPatchPayload,
  WellhubSlotUpdatePayload,
} from "./types";

/** POST /booking/v1/gyms/:gym_id/classes/:class_id/slots */
export async function createWellhubSlot(
  gymId: number,
  wellhubClassId: number,
  payload: WellhubSlotCreatePayload,
): Promise<WellhubSlot> {
  const res = await bookingApi<WellhubSlotEnvelope<WellhubSlot>>(
    `/booking/v1/gyms/${gymId}/classes/${wellhubClassId}/slots`,
    { method: "POST", body: payload },
  );
  const slot = res.results?.[0];
  if (!slot) {
    throw new Error("Wellhub returned no slot in the create response");
  }
  return slot;
}

/** PUT /booking/v1/gyms/:gym_id/classes/:class_id/slots/:slot_id */
export async function updateWellhubSlot(
  gymId: number,
  wellhubClassId: number,
  slotId: number,
  payload: WellhubSlotUpdatePayload,
): Promise<WellhubSlot> {
  const res = await bookingApi<WellhubSlotEnvelope<WellhubSlot>>(
    `/booking/v1/gyms/${gymId}/classes/${wellhubClassId}/slots/${slotId}`,
    { method: "PUT", body: payload },
  );
  const slot = res.results?.[0];
  if (!slot) {
    throw new Error("Wellhub returned no slot in the update response");
  }
  return slot;
}

/**
 * PATCH /booking/v1/gyms/:gym_id/classes/:class_id/slots/:slot_id
 *
 * Used after every Magic booking create/cancel to keep Wellhub's view of the
 * availability in sync. Spec allows total_booked, total_capacity, and
 * virtual_class_url only.
 */
export function patchWellhubSlot(
  gymId: number,
  wellhubClassId: number,
  slotId: number,
  payload: WellhubSlotPatchPayload,
): Promise<void> {
  return bookingApi<void>(
    `/booking/v1/gyms/${gymId}/classes/${wellhubClassId}/slots/${slotId}`,
    { method: "PATCH", body: payload },
  );
}

/**
 * DELETE /booking/v1/gyms/:gym_id/classes/:class_id/slots/:slot_id
 *
 * Wellhub will automatically cancel every booking attached to the slot.
 */
export function deleteWellhubSlot(
  gymId: number,
  wellhubClassId: number,
  slotId: number,
): Promise<void> {
  return bookingApi<void>(
    `/booking/v1/gyms/${gymId}/classes/${wellhubClassId}/slots/${slotId}`,
    { method: "DELETE" },
  );
}

/** GET single slot. */
export function getWellhubSlot(
  gymId: number,
  wellhubClassId: number,
  slotId: number,
): Promise<WellhubSlot> {
  return bookingApi<WellhubSlot>(
    `/booking/v1/gyms/${gymId}/classes/${wellhubClassId}/slots/${slotId}`,
  );
}

/**
 * GET /booking/v1/gyms/:gym_id/classes/:class_id/slots?from=...&to=...
 *
 * `from`/`to` are ISO-8601 strings with timezone offsets (the Wellhub server
 * does URL-decoding of `+` characters; we let `URLSearchParams` handle the
 * encoding for us).
 */
export async function listWellhubSlots(
  gymId: number,
  wellhubClassId: number,
  range?: { from?: Date | string; to?: Date | string },
): Promise<WellhubSlot[]> {
  const res = await bookingApi<WellhubSlotListResponse>(
    `/booking/v1/gyms/${gymId}/classes/${wellhubClassId}/slots`,
    {
      query: {
        from: range?.from instanceof Date ? range.from.toISOString() : range?.from,
        to: range?.to instanceof Date ? range.to.toISOString() : range?.to,
      },
    },
  );
  return res.results ?? [];
}
