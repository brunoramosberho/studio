import { prisma } from "@/lib/db";
import type { StaffShift } from "@prisma/client";
import { findNearestStudioForClockIn, type GeoPoint } from "./geofence";

export class ClockError extends Error {
  constructor(
    public code:
      | "ALREADY_OPEN"
      | "NO_OPEN_SHIFT"
      | "NO_STUDIO_IN_RANGE"
      | "NO_STUDIOS_CONFIGURED"
      | "STUDIO_MISSING_COORDS"
      | "INVALID_COORDS",
    message: string,
    public meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ClockError";
  }
}

export interface ClockInInput {
  tenantId: string;
  userId: string;
  membershipId?: string | null;
  point: GeoPoint;
  accuracy?: number | null;
  notes?: string | null;
}

export interface ClockInResult {
  shift: StaffShift;
  studio: { id: string; name: string };
  distanceMeters: number;
}

// Begin a shift. Validates geolocation against the tenant's studios; on
// success, opens a StaffShift snapshotting the matched studio. If the user
// already has an OPEN shift we refuse — they must clock out first.
export async function clockIn(input: ClockInInput): Promise<ClockInResult> {
  const { tenantId, userId, membershipId, point, accuracy, notes } = input;

  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  ) {
    throw new ClockError("INVALID_COORDS", "Invalid coordinates");
  }

  const existingOpen = await prisma.staffShift.findFirst({
    where: { tenantId, userId, status: "OPEN" },
    select: { id: true },
  });
  if (existingOpen) {
    throw new ClockError("ALREADY_OPEN", "Ya tienes un turno abierto", {
      shiftId: existingOpen.id,
    });
  }

  const match = await findNearestStudioForClockIn(tenantId, point);
  if (!match) {
    throw new ClockError(
      "NO_STUDIOS_CONFIGURED",
      "No hay estudios configurados con ubicación",
    );
  }
  if (!match.withinRadius) {
    throw new ClockError(
      "NO_STUDIO_IN_RANGE",
      `Estás a ${Math.round(match.distanceMeters)}m del estudio más cercano (${match.studio.name})`,
      {
        nearestStudio: match.studio.name,
        distanceMeters: Math.round(match.distanceMeters),
        radiusMeters: match.studio.geofenceRadiusMeters,
      },
    );
  }

  const shift = await prisma.staffShift.create({
    data: {
      tenantId,
      userId,
      membershipId: membershipId ?? null,
      studioId: match.studio.id,
      clockInAt: new Date(),
      clockInLat: point.latitude,
      clockInLng: point.longitude,
      clockInAccuracy: accuracy ?? null,
      clockInDistance: match.distanceMeters,
      status: "OPEN",
      notes: notes ?? null,
    },
  });

  return {
    shift,
    studio: { id: match.studio.id, name: match.studio.name },
    distanceMeters: match.distanceMeters,
  };
}

export interface ClockOutInput {
  tenantId: string;
  userId: string;
  point: GeoPoint;
  accuracy?: number | null;
  notes?: string | null;
}

export interface ClockOutResult {
  shift: StaffShift;
  durationMinutes: number;
}

// Close the user's open shift. Geolocation is recorded for audit but is NOT
// geofenced — staff may legitimately step outside before clocking out, and
// blocking the clock-out leaves shifts orphaned. Distance is logged so admins
// can spot anomalies.
export async function clockOut(input: ClockOutInput): Promise<ClockOutResult> {
  const { tenantId, userId, point, accuracy, notes } = input;

  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  ) {
    throw new ClockError("INVALID_COORDS", "Invalid coordinates");
  }

  const open = await prisma.staffShift.findFirst({
    where: { tenantId, userId, status: "OPEN" },
    include: {
      studio: {
        select: { id: true, name: true, latitude: true, longitude: true },
      },
    },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) {
    throw new ClockError("NO_OPEN_SHIFT", "No hay turno abierto");
  }

  let distance: number | null = null;
  if (open.studio.latitude != null && open.studio.longitude != null) {
    const { haversineDistance } = await import("./geofence");
    distance = haversineDistance(point, {
      latitude: open.studio.latitude,
      longitude: open.studio.longitude,
    });
  }

  const now = new Date();
  const durationMinutes = Math.max(
    0,
    Math.round((now.getTime() - open.clockInAt.getTime()) / 60_000),
  );

  const shift = await prisma.staffShift.update({
    where: { id: open.id },
    data: {
      clockOutAt: now,
      clockOutLat: point.latitude,
      clockOutLng: point.longitude,
      clockOutAccuracy: accuracy ?? null,
      clockOutDistance: distance,
      status: "CLOSED",
      durationMinutes,
      notes: notes ?? open.notes,
    },
  });

  return { shift, durationMinutes };
}

// Returns the user's currently open shift, or null. Cheap by index.
export async function getActiveShift(tenantId: string, userId: string) {
  return prisma.staffShift.findFirst({
    where: { tenantId, userId, status: "OPEN" },
    include: {
      studio: { select: { id: true, name: true } },
    },
    orderBy: { clockInAt: "desc" },
  });
}

// Auto-close shifts older than the tenant's configured max length. Used by
// the staff-auto-close-shifts cron. Returns the count closed for logging.
export async function autoCloseStaleShifts(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { staffMaxShiftHours: true },
  });
  if (!tenant) return 0;

  const cutoff = new Date(Date.now() - tenant.staffMaxShiftHours * 3_600_000);
  const stale = await prisma.staffShift.findMany({
    where: {
      tenantId,
      status: "OPEN",
      clockInAt: { lt: cutoff },
    },
    select: { id: true, clockInAt: true },
  });

  let closed = 0;
  for (const s of stale) {
    const synthesizedOut = new Date(
      s.clockInAt.getTime() + tenant.staffMaxShiftHours * 3_600_000,
    );
    await prisma.staffShift.update({
      where: { id: s.id },
      data: {
        status: "AUTO_CLOSED",
        clockOutAt: synthesizedOut,
        durationMinutes: tenant.staffMaxShiftHours * 60,
      },
    });
    closed++;
  }
  return closed;
}
