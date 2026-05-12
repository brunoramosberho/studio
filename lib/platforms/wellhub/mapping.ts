// Pure conversions between Magic models and Wellhub payloads. No I/O.

import type {
  WellhubClassCreatePayload,
  WellhubClassUpdatePayload,
  WellhubSlotCreatePayload,
} from "./types";

// Wellhub hard caps `cancellable_until` to 24h before the slot.
const MIN_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// Slot lengths are constrained to 1..200 minutes per the API spec.
const MIN_SLOT_LENGTH_MIN = 1;
const MAX_SLOT_LENGTH_MIN = 200;

// Capacity / booked counters are constrained to 0..32000.
const MAX_SLOT_CAPACITY = 32000;
const MAX_INSTRUCTOR_NAME = 100;
const MAX_CLASS_NAME = 255;

// ─── Shape inputs (decoupled from Prisma to keep this file pure & testable) ──

export interface MagicClassTypeForSync {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  wellhubProductId: number | null;
  wellhubCategoryIds: number[];
}

export interface MagicInstructorForSync {
  name: string;
  isSubstitute?: boolean;
}

export interface MagicClassForSync {
  id: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  room: { name?: string | null } | null;
  /** Capacity made available to Wellhub (from SchedulePlatformQuota.quotaSpots). */
  capacity: number;
  /** Bookings already taken (direct + other platforms) — Wellhub uses this for availability. */
  bookedSpots: number;
  /** Primary instructor first, substitute second when applicable. */
  instructors: MagicInstructorForSync[];
}

// ─── ClassType ↔ Wellhub Class ────────────────────────────────────────────

export function classTypeToWellhubCreatePayload(
  classType: MagicClassTypeForSync,
): WellhubClassCreatePayload {
  if (!classType.wellhubProductId) {
    throw new Error(
      `ClassType ${classType.id} is missing wellhubProductId — map it before syncing.`,
    );
  }
  return {
    name: truncate(classType.name, MAX_CLASS_NAME),
    description: classType.description?.trim() || classType.name,
    bookable: true,
    visible: true,
    product_id: classType.wellhubProductId,
    reference: classType.id,
    categories: classType.wellhubCategoryIds.length > 0
      ? [...classType.wellhubCategoryIds]
      : undefined,
  };
}

export function classTypeToWellhubUpdatePayload(
  classType: MagicClassTypeForSync,
  options: { visible?: boolean; bookable?: boolean } = {},
): WellhubClassUpdatePayload {
  if (!classType.wellhubProductId) {
    throw new Error(
      `ClassType ${classType.id} is missing wellhubProductId — map it before syncing.`,
    );
  }
  return {
    name: truncate(classType.name, MAX_CLASS_NAME),
    description: classType.description?.trim() || classType.name,
    bookable: options.bookable ?? true,
    visible: options.visible ?? true,
    product_id: classType.wellhubProductId,
    reference: classType.id,
    categories: classType.wellhubCategoryIds.length > 0
      ? [...classType.wellhubCategoryIds]
      : undefined,
  };
}

// ─── Class ↔ Wellhub Slot ─────────────────────────────────────────────────

export function classToWellhubSlotPayload(
  cls: MagicClassForSync,
  classType: Pick<MagicClassTypeForSync, "id" | "wellhubProductId">,
): WellhubSlotCreatePayload {
  if (!classType.wellhubProductId) {
    throw new Error(
      `ClassType ${classType.id} is missing wellhubProductId — map it before syncing.`,
    );
  }

  const lengthMinutes = clampLength(
    Math.round((cls.endsAt.getTime() - cls.startsAt.getTime()) / 60_000),
  );

  const totalCapacity = clampCapacity(cls.capacity);
  const totalBooked = Math.max(0, Math.min(totalCapacity, Math.floor(cls.bookedSpots)));

  // Wellhub silently truncates cancellable_until to 24h before occur_date, so
  // we send exactly that value to keep behavior deterministic.
  const cancellableUntil = new Date(cls.startsAt.getTime() - MIN_CANCELLATION_WINDOW_MS);

  const instructors = cls.instructors.slice(0, 8).map((i) => ({
    name: truncate(i.name, MAX_INSTRUCTOR_NAME),
    substitute: !!i.isSubstitute,
  }));

  return {
    occur_date: cls.startsAt.toISOString(),
    room: normalizeRoomName(cls.room?.name),
    status: 1,
    length_in_minutes: lengthMinutes,
    total_capacity: totalCapacity,
    total_booked: totalBooked,
    product_id: classType.wellhubProductId,
    cancellable_until: cancellableUntil.toISOString(),
    instructors: instructors.length > 0 ? instructors : undefined,
    virtual: false,
  };
}

// ─── Capacity-only patch (used when occupancy changes) ────────────────────

export function capacityPatchPayload(opts: {
  totalCapacity?: number;
  totalBooked?: number;
}) {
  const payload: Record<string, number> = {};
  if (opts.totalCapacity !== undefined) {
    payload.total_capacity = clampCapacity(opts.totalCapacity);
  }
  if (opts.totalBooked !== undefined) {
    const cap = payload.total_capacity ?? MAX_SLOT_CAPACITY;
    payload.total_booked = Math.max(0, Math.min(cap, Math.floor(opts.totalBooked)));
  }
  return payload;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function clampLength(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_SLOT_LENGTH_MIN;
  return Math.max(MIN_SLOT_LENGTH_MIN, Math.min(MAX_SLOT_LENGTH_MIN, Math.floor(minutes)));
}

function clampCapacity(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SLOT_CAPACITY, Math.floor(n)));
}

// Wellhub requires room names between 2 and 200 chars when present. We emit
// `undefined` for empty/short names so Wellhub treats the slot as "no room".
function normalizeRoomName(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < 2) return undefined;
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}
