// High-level sync helpers that bridge Magic models and the Wellhub API.
//
// These are the functions admin endpoints, CRUD hooks, and crons call. They
// own the order of operations (ensure class template exists → upsert slot →
// record sync status) and translate Wellhub API errors into PlatformAlert
// rows + a friendly `wellhubLastError` blob on the affected Class.

import type { PlatformBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createPlatformAlert } from "@/lib/platforms/alerts";
import { getWellhubTokenForTenant } from "./client";
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
 * Apply a per-class Wellhub quota choice from the class editor. Three states:
 *   - quota === null  → "use default": delete any override row so the class
 *     follows the tenant default (the cron re-applies it).
 *   - quota === 0     → "closed to Wellhub": upsert a row with quotaSpots=0 and
 *     isClosedManually=true so the default never re-opens it.
 *   - quota > 0       → explicit override: upsert quotaSpots=quota, not closed.
 *
 * Does NOT call sync — the caller syncs the class afterwards (single edit) or
 * batches the re-sync (series edit).
 */
export async function applyWellhubQuotaToClass(
  tenantId: string,
  classId: string,
  quota: number | null,
): Promise<void> {
  if (quota === null) {
    await prisma.schedulePlatformQuota.deleteMany({ where: { classId, platform: "wellhub" } });
    return;
  }
  const closed = quota <= 0;
  await prisma.schedulePlatformQuota.upsert({
    where: { classId_platform: { classId, platform: "wellhub" } },
    create: {
      tenantId,
      classId,
      platform: "wellhub",
      quotaSpots: closed ? 0 : quota,
      isClosedManually: closed,
      isAutoQuota: false, // explicit manual override → default changes leave it alone
      ...(closed ? { closedAt: new Date() } : {}),
    },
    update: {
      quotaSpots: closed ? 0 : quota,
      isClosedManually: closed,
      isAutoQuota: false,
      ...(closed ? { closedAt: new Date() } : { closedAt: null, closedBy: null }),
    },
  });
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
  if (ctx.cls.status === "CANCELLED") {
    return await unsyncClassFromWellhub(classId);
  }

  // Visibility gate: never expose a class to Wellhub before it's visible to
  // our own members. A class beyond the client-visible window stays out of
  // Wellhub (and gets synced later, once it enters the window).
  if (!(await isClassClientVisible(ctx))) {
    return await markStatus(classId, "excluded", "outside_visible_window");
  }

  // Closed-to-Wellhub override: an explicit quota row with isClosedManually
  // means the admin deliberately excluded this class — the default must NOT
  // re-open it. Keep it out of Wellhub.
  if (ctx.quotaClosedManually) {
    return await unsyncClassFromWellhub(classId);
  }

  // Auto-apply the tenant default quota ONLY when the class has no quota row at
  // all (quotaHasRow=false). A row with quotaSpots>0 is an explicit override we
  // never overwrite; a row with quotaSpots=0+closed was handled above.
  if (!ctx.quotaHasRow && ctx.tenantConfig.defaultQuota && ctx.tenantConfig.defaultQuota > 0) {
    await prisma.schedulePlatformQuota.upsert({
      where: { classId_platform: { classId, platform: "wellhub" } },
      create: {
        tenantId: ctx.tenantConfig.tenantId,
        classId,
        platform: "wellhub",
        quotaSpots: ctx.tenantConfig.defaultQuota,
        isAutoQuota: true, // came from the default → follows default changes
      },
      update: { quotaSpots: ctx.tenantConfig.defaultQuota, isAutoQuota: true },
    });
    ctx.quotaSpots = ctx.tenantConfig.defaultQuota;
  }

  if (!ctx.quotaSpots || ctx.quotaSpots <= 0) {
    return await markStatus(classId, "excluded", "no_quota_for_wellhub");
  }

  const gymId = ctx.tenantConfig.wellhubGymId;
  const token = await getWellhubTokenForTenant(ctx.tenantConfig.tenantId);

  try {
    // 1) Ensure the Wellhub `class` template exists for this ClassType.
    const wellhubClassId = await ensureWellhubClassForClassType(gymId, ctx.classType, token);

    // 2) Build the slot payload from live Magic state.
    const slotPayload = classToWellhubSlotPayload(toMagicClassForSync(ctx), {
      id: ctx.classType.id,
      wellhubProductId: ctx.classType.wellhubProductId,
    });

    // 3) POST if new, PUT if we already have a wellhubSlotId on file. If the
    // PUT 404s, our pointer is stale (the slot was deleted on Wellhub's side —
    // e.g. a class edit or partner-side cleanup). Re-create it instead of
    // erroring forever: otherwise every 15-min reconcile pass re-alerts on a
    // class that can never heal itself.
    let wellhubSlotId = ctx.cls.wellhubSlotId;
    if (!wellhubSlotId) {
      const slot = await createWellhubSlot(gymId, wellhubClassId, slotPayload, token);
      wellhubSlotId = slot.id;
    } else {
      try {
        await updateWellhubSlot(gymId, wellhubClassId, wellhubSlotId, slotPayload, token);
      } catch (error) {
        if (error instanceof WellhubApiError && error.isNotFound) {
          console.warn("[wellhub-sync] stale slot pointer 404 — recreating", {
            classId,
            staleSlotId: wellhubSlotId,
          });
          const slot = await createWellhubSlot(gymId, wellhubClassId, slotPayload, token);
          wellhubSlotId = slot.id;
        } else {
          throw error;
        }
      }
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

    // Immediately reconcile effective capacity so a class that's already
    // partly/fully booked by Magic members shows the correct availability in
    // Wellhub from the moment it's synced (not only after the next booking).
    await patchWellhubCapacityForClass(classId).catch((err) =>
      console.error("[wellhub-sync] post-sync capacity patch failed", { classId, err }),
    );

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

  const token = await getWellhubTokenForTenant(ctx.tenantConfig.tenantId);

  try {
    await deleteWellhubSlot(
      ctx.tenantConfig.wellhubGymId,
      ctx.classType.wellhubClassId,
      ctx.cls.wellhubSlotId,
      token,
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
 * A class's ClassType changed, so its existing Wellhub slot lives under the OLD
 * type's template (Wellhub slots belong to a class template). A plain re-sync
 * would PUT under the NEW template → 404 → and the recreate-on-404 heal would
 * leave the OLD slot orphaned & still bookable (two classes at one time — the
 * exact bug we hit). Delete the old slot under the old template and clear the
 * pointer, so the caller's syncClassToWellhub creates a clean slot under the
 * new template. Best-effort — never throws (the re-sync is what matters).
 */
export async function deleteWellhubSlotForOldClassType(
  classId: string,
  oldClassTypeId: string,
): Promise<void> {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { wellhubSlotId: true, tenantId: true },
  });
  if (!cls?.wellhubSlotId) return;

  const [oldType, cfg] = await Promise.all([
    prisma.classType.findUnique({
      where: { id: oldClassTypeId },
      select: { wellhubClassId: true },
    }),
    prisma.studioPlatformConfig.findFirst({
      where: { tenantId: cls.tenantId, platform: "wellhub" },
      select: { wellhubGymId: true },
    }),
  ]);
  if (!oldType?.wellhubClassId || !cfg?.wellhubGymId) return;

  try {
    const token = await getWellhubTokenForTenant(cls.tenantId);
    await deleteWellhubSlot(cfg.wellhubGymId, oldType.wellhubClassId, cls.wellhubSlotId, token);
  } catch (error) {
    // 404 = already gone; anything else we log but still clear our pointer so
    // the re-sync recreates cleanly rather than 404-looping on the old slot.
    if (!(error instanceof WellhubApiError && error.isNotFound)) {
      console.error("[wellhub] delete old-type slot failed", { classId, error });
    }
  }
  await prisma.class.update({ where: { id: classId }, data: { wellhubSlotId: null } });
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

  const token = await getWellhubTokenForTenant(classType.tenantId);

  try {
    await hideWellhubClass(
      config.wellhubGymId,
      classType.wellhubClassId,
      classTypeToWellhubUpdatePayload(toMagicClassType(classType), { visible: false }),
      token,
    );
    return { status: "excluded" };
  } catch (error) {
    await handleSyncError(undefined, classType.tenantId, error);
    return { status: "error", reason: errorReason(error) };
  }
}

/**
 * Send a fresh capacity/availability snapshot to Wellhub. Called whenever a
 * Magic booking or platform booking is created/cancelled so Wellhub's view of
 * availability tracks our reality.
 *
 * Shared-capacity model: the seats Wellhub may sell at any moment are
 * `min(quotaSpots, physicalSeatsLeft + wellhubBooked)`. We express this to
 * Wellhub as a slot where:
 *   - total_capacity = effectiveCapacity = min(quota, wellhubBooked + physicalLeft)
 *   - total_booked   = wellhubBooked
 * so Wellhub's "available = capacity − booked" equals the real number of seats
 * a Wellhub member can still take. When the room fills with Magic members,
 * effectiveCapacity drops to wellhubBooked → Wellhub shows 0 left (the class
 * stops appearing as bookable) without us cancelling existing Wellhub holds.
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

  const [magicBookingsCount, wellhubBookingsCount, blockedCount] = await Promise.all([
    // Only count REAL Magic seats here. Platform reservations (Wellhub/ClassPass)
    // now create a companion Booking, so they show up as CONFIRMED bookings too.
    // Excluding `platformBookingId != null` keeps platform seats out of this
    // term — they're counted separately via wellhubBookingsCount/otherPlatformCount,
    // so each physical person is subtracted from capacity exactly once.
    prisma.booking.count({
      where: { classId, status: { in: ["CONFIRMED", "ATTENDED"] }, platformBookingId: null },
    }),
    prisma.platformBooking.count({
      where: { classId, platform: "wellhub", status: { in: CONSUMING_STATUSES } },
    }),
    prisma.blockedSpot.count({ where: { classId } }),
  ]);

  // Also count OTHER platforms (e.g. ClassPass) occupying physical seats.
  const otherPlatformCount = await prisma.platformBooking.count({
    where: { classId, platform: { not: "wellhub" }, status: { in: CONSUMING_STATUSES } },
  });

  const quota = ctx.quotaSpots ?? 0;
  const physicalLeft = Math.max(
    0,
    ctx.roomCapacity - magicBookingsCount - blockedCount - wellhubBookingsCount - otherPlatformCount,
  );
  // Seats Wellhub can still sell + the ones it already holds.
  const effectiveCapacity = Math.min(quota, wellhubBookingsCount + physicalLeft);

  const token = await getWellhubTokenForTenant(ctx.tenantConfig.tenantId);

  try {
    await patchWellhubSlot(
      ctx.tenantConfig.wellhubGymId,
      ctx.classType.wellhubClassId,
      ctx.cls.wellhubSlotId,
      capacityPatchPayload({
        totalCapacity: effectiveCapacity,
        totalBooked: wellhubBookingsCount,
      }),
      token,
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
  roomCapacity: number;
  coachName: string;
  originalCoachName: string | null;
  /** Tenant free-cancellation window in hours (tenant.cancellationWindowHours). */
  cancellationWindowHours: number;
  quotaSpots: number;
  /** True when a SchedulePlatformQuota row exists for this class (= override). */
  quotaHasRow: boolean;
  /** True when the row exists and is marked closed-to-Wellhub. */
  quotaClosedManually: boolean;
  tenantConfig: {
    tenantId: string;
    wellhubGymId: number | null;
    wellhubMode: "disabled" | "legacy_email" | "api";
    defaultQuota: number | null;
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
      room: { select: { name: true, maxCapacity: true } },
      platformQuotas: {
        where: { platform: "wellhub" },
        select: { quotaSpots: true, isClosedManually: true },
      },
    },
  });
  if (!cls) return null;

  const [tenantConfig, tenant] = await Promise.all([
    prisma.studioPlatformConfig.findFirst({
      where: { tenantId: cls.tenantId, platform: "wellhub" },
      select: { tenantId: true, wellhubGymId: true, wellhubMode: true, wellhubDefaultQuota: true },
    }),
    prisma.tenant.findUnique({
      where: { id: cls.tenantId },
      select: { cancellationWindowHours: true },
    }),
  ]);

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
    room: cls.room ? { name: cls.room.name } : null,
    roomCapacity: cls.room?.maxCapacity ?? 0,
    coachName: cls.coach.name,
    originalCoachName: cls.originalCoach?.name ?? null,
    cancellationWindowHours: tenant?.cancellationWindowHours ?? 12,
    quotaSpots: cls.platformQuotas[0]?.quotaSpots ?? 0,
    quotaHasRow: cls.platformQuotas.length > 0,
    quotaClosedManually: cls.platformQuotas[0]?.isClosedManually ?? false,
    tenantConfig: tenantConfig
      ? {
          tenantId: tenantConfig.tenantId,
          wellhubGymId: tenantConfig.wellhubGymId,
          wellhubMode: tenantConfig.wellhubMode,
          defaultQuota: tenantConfig.wellhubDefaultQuota,
        }
      : null,
  };
}

/**
 * Is this class already visible to our own members? Wellhub must never see a
 * class before clients do. Uses the same computeVisibleUntil the public
 * schedule uses. Past classes are treated as not-syncable.
 */
async function isClassClientVisible(ctx: ClassContext): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.classType.tenantId },
    select: {
      id: true,
      scheduleVisibilityMode: true,
      visibleScheduleDays: true,
      scheduleReleaseDayOfWeek: true,
      scheduleReleaseHour: true,
      scheduleReleaseWeeksAhead: true,
      scheduleReleaseTimezone: true,
    },
  });
  if (!tenant) return false;

  const { computeVisibleUntil, resolveScheduleTimezone } = await import("@/lib/schedule/visibility");
  const timezone = await resolveScheduleTimezone(tenant);
  const now = new Date();
  const visibleUntil = computeVisibleUntil(now, tenant, timezone);
  // In-window = starts in the future AND at/before the visible horizon.
  return ctx.cls.startsAt >= now && ctx.cls.startsAt <= visibleUntil;
}

async function ensureWellhubClassForClassType(
  gymId: number,
  classType: ClassContext["classType"],
  token: string,
): Promise<number> {
  if (classType.wellhubClassId) {
    // PUT is idempotent — keep Wellhub in sync with renames / category edits.
    await updateWellhubClass(
      gymId,
      classType.wellhubClassId,
      classTypeToWellhubUpdatePayload(toMagicClassType(classType)),
      token,
    );
    return classType.wellhubClassId;
  }
  const created = await createWellhubClass(
    gymId,
    classTypeToWellhubCreatePayload(toMagicClassType(classType)),
    token,
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
    cancellationWindowHours: ctx.cancellationWindowHours,
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
    // Dedup: one open sync-error alert per class. Without this the 15-min
    // reconcile cron piled up an identical alert every pass for a class that
    // couldn't self-heal (observed: 4+ copies for one BTM Tone slot).
    const openAlert = await prisma.platformAlert.findFirst({
      where: { tenantId, classId, type: "wellhub_sync_error", isResolved: false },
      select: { id: true },
    });
    if (openAlert) {
      console.error("[wellhub-sync] error (alert already open)", { classId, tenantId, reason });
      return;
    }
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
