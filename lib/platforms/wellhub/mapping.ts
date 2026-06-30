// Pure conversions between Magic models and Wellhub payloads. No I/O.

import type {
  WellhubClassCreatePayload,
  WellhubClassUpdatePayload,
  WellhubSlotCreatePayload,
} from "./types";

// Wellhub hard-caps `cancellable_until` to at most 24h before the slot; we
// never send a window larger than this.
const MIN_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// Slot lengths are constrained to 1..200 minutes per the API spec.
const MIN_SLOT_LENGTH_MIN = 1;
const MAX_SLOT_LENGTH_MIN = 200;

// Capacity / booked counters are constrained to 0..32000.
const MAX_SLOT_CAPACITY = 32000;
const MAX_INSTRUCTOR_NAME = 100;
const MAX_CLASS_NAME = 255;
// Wellhub's `reference` field accepts 1..20 chars. Our ClassType id is a cuid
// (25 chars), so we take the last 20 — still unique enough for partner-side
// traceability, and it round-trips against our own records by suffix match.
const MAX_REFERENCE_LEN = 20;

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
  /** Tenant's free-cancellation window in hours (tenant.cancellationWindowHours). */
  cancellationWindowHours: number;
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
    reference: toReference(classType.id),
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
    reference: toReference(classType.id),
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

  // Free-cancellation deadline = class start − the tenant's cancellation
  // window (tenant.cancellationWindowHours). Wellhub caps this at 24h before
  // the class, so we clamp to a max of 24h to stay deterministic; smaller
  // windows (e.g. Be Toro's 12h) pass through unchanged.
  const windowMs = Math.min(
    MIN_CANCELLATION_WINDOW_MS,
    Math.max(0, cls.cancellationWindowHours) * 60 * 60 * 1000,
  );
  const cancellableUntil = new Date(cls.startsAt.getTime() - windowMs);

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

// Wellhub caps `reference` at 20 chars. Our ids are cuids (25 chars) whose
// entropy lives in the tail, so we keep the LAST 20 to stay unique.
function toReference(id: string): string {
  return id.length > MAX_REFERENCE_LEN ? id.slice(-MAX_REFERENCE_LEN) : id;
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
