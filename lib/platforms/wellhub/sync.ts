// High-level sync helpers that bridge Magic models and the Wellhub API.
//
// These are the functions admin endpoints, CRUD hooks, and crons call. They
// own the order of operations (ensure class template exists → upsert slot →
// record sync status) and translate Wellhub API errors into PlatformAlert
// rows + a friendly `wellhubLastError` blob on the affected Class.

import type { PlatformBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createPlatformAlert } from "@/lib/platforms/alerts";
import { WellhubApiError } from "./errors";
import {
  createWellhubClass,
  hideWellhubClass,
  updateWellhubClass,
} from "./classes";
import {
  capacityPatchPayload,
  classToWellhubSlotPayload,
  classTypeToWellhubCreatePayload,
  classTypeToWellhubUpdatePayload,
  type MagicClassForSync,
  type MagicClassTypeForSync,
  type MagicInstructorForSync,
} from "./mapping";
import {
  createWellhubSlot,
  deleteWellhubSlot,
  patchWellhubSlot,
  updateWellhubSlot,
} from "./slots";

const CONSUMING_STATUSES: PlatformBookingStatus[] = [
  "confirmed",
  "checked_in",
  "pending_confirmation",
];

// ─── Public API ───────────────────────────────────────────────────────────

export interface WellhubSyncResult {
  status: "synced" | "skipped" | "excluded" | "error";
  reason?: string;
  wellhubSlotId?: number;
}

/**
 * Push the current state of a Magic Class to Wellhub. Idempotent: safe to
 * call after every create/update of the Class or its SchedulePlatformQuota.
 */
export async function syncClassToWellhub(classId: string): Promise<WellhubSyncResult> {
  const ctx = await loadClassContext(classId);
  if (!ctx) return { status: "skipped", reason: "class_not_found" };

  if (!ctx.tenantConfig || ctx.tenantConfig.wellhubMode !== "api") {
    return await markStatus(classId, "excluded", "wellhub_disabled_for_tenant");
  }
  if (!ctx.tenantConfig.wellhubGymId) {
    return await markStatus(classId, "excluded", "tenant_missing_gym_id");
  }
  if (!ctx.classType.wellhubProductId) {
    return await markStatus(classId, "excluded", "classtype_missing_product");
  }
  if (!ctx.quotaSpots || ctx.quotaSpots <= 0) {
    return await markStatus(classId, "excluded", "no_quota_for_wellhub");
  }
  if (ctx.cls.status === "CANCELLED") {
    return await unsyncClassFromWellhub(classId);
  }

  const gymId = ctx.tenantConfig.wellhubGymId;

  try {
    // 1) Ensure the Wellhub `class` template exists for this ClassType.
    const wellhubClassId = await ensureWellhubClassForClassType(gymId, ctx.classType);

    // 2) Build the slot payload from live Magic state.
    const slotPayload = classToWellhubSlotPayload(toMagicClassForSync(ctx), {
      id: ctx.classType.id,
      wellhubProductId: ctx.classType.wellhubProductId,
    });

    // 3) POST if new, PUT if we already have a wellhubSlotId on file.
    let wellhubSlotId = ctx.cls.wellhubSlotId;
    if (!wellhubSlotId) {
      const slot = await createWellhubSlot(gymId, wellhubClassId, slotPayload);
      wellhubSlotId = slot.id;
    } else {
      await updateWellhubSlot(gymId, wellhubClassId, wellhubSlotId, slotPayload);
    }

    await prisma.class.update({
      where: { id: classId },
      data: {
        wellhubSlotId,
        wellhubSyncStatus: "synced",
        wellhubLastSyncAt: new Date(),
        wellhubLastError: null,
      },
    });
    return { status: "synced", wellhubSlotId };
  } catch (error) {
    await handleSyncError(classId, ctx.tenantConfig.tenantId, error);
    return { status: "error", reason: errorReason(error) };
  }
}

/**
 * Delete the Wellhub slot tied to a Magic Class. Wellhub cascades to cancel
 * any bookings sitting on the slot. We keep the Wellhub class template alive
 * (other slots may still belong to it).
 */
export async function unsyncClassFromWellhub(classId: string): Promise<WellhubSyncResult> {
  const ctx = await loadClassContext(classId);
  if (!ctx?.cls.wellhubSlotId) {
    return { status: "skipped", reason: "no_wellhub_slot" };
  }
  if (!ctx.tenantConfig?.wellhubGymId || !ctx.classType.wellhubClassId) {
    return { status: "skipped", reason: "missing_wellhub_ids" };
  }

  try {
    await deleteWellhubSlot(
      ctx.tenantConfig.wellhubGymId,
      ctx.classType.wellhubClassId,
      ctx.cls.wellhubSlotId,
    );
    await prisma.class.update({
      where: { id: classId },
      data: {
        wellhubSlotId: null,
        wellhubSyncStatus: "excluded",
        wellhubLastSyncAt: new Date(),
        wellhubLastError: null,
      },
    });
    return { status: "excluded" };
  } catch (error) {
    if (error instanceof WellhubApiError && error.isNotFound) {
      // Already gone on their side — clear our local pointer.
      await prisma.class.update({
        where: { id: classId },
        data: { wellhubSlotId: null, wellhubSyncStatus: "excluded", wellhubLastSyncAt: new Date() },
      });
      return { status: "excluded" };
    }
    await handleSyncError(classId, ctx.tenantConfig.tenantId, error);
    return { status: "error", reason: errorReason(error) };
  }
}

/**
 * Hide a ClassType in Wellhub. Used when the admin turns the type off (no
 * DELETE class endpoint exists, so we PUT with visible=false).
 */
export async function hideClassTypeInWellhub(classTypeId: string): Promise<WellhubSyncResult> {
  const classType = await prisma.classType.findUnique({
    where: { id: classTypeId },
    select: {
      id: true,
      name: true,
      description: true,
      duration: true,
      wellhubClassId: true,
      wellhubProductId: true,
      wellhubCategoryIds: true,
      tenantId: true,
    },
  });
  if (!classType?.wellhubClassId) return { status: "skipped", reason: "no_wellhub_class_id" };

  const config = await prisma.studioPlatformConfig.findFirst({
    where: { tenantId: classType.tenantId, platform: "wellhub" },
    select: { wellhubGymId: true },
  });
  if (!config?.wellhubGymId) return { status: "skipped", reason: "tenant_missing_gym_id" };

  try {
    await hideWellhubClass(
      config.wellhubGymId,
      classType.wellhubClassId,
      classTypeToWellhubUpdatePayload(toMagicClassType(classType), { visible: false }),
    );
    return { status: "excluded" };
  } catch (error) {
    await handleSyncError(undefined, classType.tenantId, error);
    return { status: "error", reason: errorReason(error) };
  }
}

/**
 * Send a fresh `total_booked` value to Wellhub. Called whenever a Magic
 * booking or platform booking is created/cancelled so Wellhub's view of
 * availability tracks our reality.
 *
 * Per the spec: "total_booked is the total amount of bookings on a given
 * class slot ... every time a class slot is booked through the Wellhub app
 * or NOT, update this." So we count direct Magic bookings + all platform
 * bookings in `consuming` statuses, and cap at total_capacity.
 */
export async function patchWellhubCapacityForClass(
  classId: string,
): Promise<WellhubSyncResult> {
  const ctx = await loadClassContext(classId);
  if (!ctx) return { status: "skipped", reason: "class_not_found" };
  if (!ctx.cls.wellhubSlotId || !ctx.classType.wellhubClassId) {
    return { status: "skipped", reason: "not_synced" };
  }
  if (!ctx.tenantConfig?.wellhubGymId) {
    return { status: "skipped", reason: "tenant_missing_gym_id" };
  }

  const [magicBookingsCount, platformBookingsCount] = await Promise.all([
    prisma.booking.count({
      where: { classId, status: { in: ["CONFIRMED", "ATTENDED"] } },
    }),
    prisma.platformBooking.count({
      where: { classId, status: { in: CONSUMING_STATUSES } },
    }),
  ]);
  const totalBooked = magicBookingsCount + platformBookingsCount;

  try {
    await patchWellhubSlot(
      ctx.tenantConfig.wellhubGymId,
      ctx.classType.wellhubClassId,
      ctx.cls.wellhubSlotId,
      capacityPatchPayload({
        totalCapacity: ctx.quotaSpots ?? 0,
        totalBooked,
      }),
    );
    await prisma.class.update({
      where: { id: classId },
      data: { wellhubLastSyncAt: new Date(), wellhubLastError: null },
    });
    return { status: "synced", wellhubSlotId: ctx.cls.wellhubSlotId };
  } catch (error) {
    await handleSyncError(classId, ctx.tenantConfig.tenantId, error);
    return { status: "error", reason: errorReason(error) };
  }
}

// ─── Internals ────────────────────────────────────────────────────────────

interface ClassContext {
  cls: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    notes: string | null;
    status: "SCHEDULED" | "CANCELLED" | "COMPLETED";
    wellhubSlotId: number | null;
  };
  classType: {
    id: string;
    name: string;
    description: string | null;
    duration: number;
    wellhubClassId: number | null;
    wellhubProductId: number | null;
    wellhubCategoryIds: number[];
    tenantId: string;
  };
  room: { name: string | null } | null;
  coachName: string;
  originalCoachName: string | null;
  quotaSpots: number;
  tenantConfig: {
    tenantId: string;
    wellhubGymId: number | null;
    wellhubMode: "disabled" | "legacy_email" | "api";
  } | null;
}

async function loadClassContext(classId: string): Promise<ClassContext | null> {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      notes: true,
      status: true,
      tenantId: true,
      wellhubSlotId: true,
      classType: {
        select: {
          id: true,
          name: true,
          description: true,
          duration: true,
          wellhubClassId: true,
          wellhubProductId: true,
          wellhubCategoryIds: true,
          tenantId: true,
        },
      },
      coach: { select: { name: true } },
      originalCoach: { select: { name: true } },
      room: { select: { name: true } },
      platformQuotas: {
        where: { platform: "wellhub" },
        select: { quotaSpots: true },
      },
    },
  });
  if (!cls) return null;

  const tenantConfig = await prisma.studioPlatformConfig.findFirst({
    where: { tenantId: cls.tenantId, platform: "wellhub" },
    select: { tenantId: true, wellhubGymId: true, wellhubMode: true },
  });

  return {
    cls: {
      id: cls.id,
      startsAt: cls.startsAt,
      endsAt: cls.endsAt,
      notes: cls.notes,
      status: cls.status,
      wellhubSlotId: cls.wellhubSlotId,
    },
    classType: cls.classType,
    room: cls.room,
    coachName: cls.coach.name,
    originalCoachName: cls.originalCoach?.name ?? null,
    quotaSpots: cls.platformQuotas[0]?.quotaSpots ?? 0,
    tenantConfig,
  };
}

async function ensureWellhubClassForClassType(
  gymId: number,
  classType: ClassContext["classType"],
): Promise<number> {
  if (classType.wellhubClassId) {
    // PUT is idempotent — keep Wellhub in sync with renames / category edits.
    await updateWellhubClass(
      gymId,
      classType.wellhubClassId,
      classTypeToWellhubUpdatePayload(toMagicClassType(classType)),
    );
    return classType.wellhubClassId;
  }
  const created = await createWellhubClass(
    gymId,
    classTypeToWellhubCreatePayload(toMagicClassType(classType)),
  );
  await prisma.classType.update({
    where: { id: classType.id },
    data: { wellhubClassId: created.id },
  });
  return created.id;
}

function toMagicClassType(
  ct: ClassContext["classType"],
): MagicClassTypeForSync {
  return {
    id: ct.id,
    name: ct.name,
    description: ct.description,
    duration: ct.duration,
    wellhubProductId: ct.wellhubProductId,
    wellhubCategoryIds: ct.wellhubCategoryIds,
  };
}

function toMagicClassForSync(ctx: ClassContext): MagicClassForSync {
  const instructors: MagicInstructorForSync[] = [];
  if (ctx.coachName) {
    const isSubstitute = !!(ctx.originalCoachName && ctx.originalCoachName !== ctx.coachName);
    instructors.push({ name: ctx.coachName, isSubstitute });
  }
  return {
    id: ctx.cls.id,
    startsAt: ctx.cls.startsAt,
    endsAt: ctx.cls.endsAt,
    notes: ctx.cls.notes,
    room: ctx.room,
    capacity: ctx.quotaSpots,
    bookedSpots: 0, // Capacity is updated separately via patchWellhubCapacityForClass.
    instructors,
  };
}

async function markStatus(
  classId: string,
  status: "synced" | "excluded" | "error" | "pending",
  reason: string,
): Promise<WellhubSyncResult> {
  await prisma.class.update({
    where: { id: classId },
    data: {
      wellhubSyncStatus: status,
      wellhubLastError: status === "error" ? reason : null,
    },
  });
  return { status: status === "pending" ? "skipped" : status, reason };
}

async function handleSyncError(
  classId: string | undefined,
  tenantId: string,
  error: unknown,
): Promise<void> {
  const reason = errorReason(error);
  if (classId) {
    await prisma.class.update({
      where: { id: classId },
      data: { wellhubSyncStatus: "error", wellhubLastError: reason, wellhubLastSyncAt: new Date() },
    });
  }
  await createPlatformAlert({
    tenantId,
    classId,
    platform: "wellhub",
    type: "wellhub_sync_error",
  }).catch(() => undefined);
  console.error("[wellhub-sync] error", { classId, tenantId, reason, error });
}

function errorReason(error: unknown): string {
  if (error instanceof WellhubApiError) {
    return `wellhub_${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return "unknown_error";
}
