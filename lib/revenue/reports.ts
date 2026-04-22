// Reporting queries for the revenue recognition module.
//
// Every function takes a tenantId explicitly and filters on it — this is the
// application-level enforcement of tenant isolation (no DB-level RLS yet).
// Do NOT export a variant that takes "ambient" tenant context; force the
// caller to pass it.
//
// Intermediate `daily_accrual` events are excluded from all reports. They
// live in revenue_events as audit trail but don't belong to recognized revenue
// until month close converts them into `booking` + `monthly_breakage`.

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface RevenueSummary {
  attributedCents: number;
  breakageCents: number;
  totalRecognizedCents: number;
}

export interface BreakageDetail {
  monthlyBreakageCents: number;
  expirationBreakageCents: number;
}

export interface ByDiscipline {
  disciplineId: string;
  disciplineName: string;
  attributions: number;
  revenueCents: number;
  avgPerAttributionCents: number;
}

export interface ByCoach {
  coachId: string;
  coachName: string;
  attributions: number;
  revenueCents: number;
}

export interface ByPackage {
  packageId: string | null;
  packageName: string;
  packageType: string | null;
  attributions: number;
  revenueCents: number;
  avgPerAttributionCents: number;
}

export interface ByTimeSlot {
  dayOfWeek: number; // 0 = Sunday
  hourOfDay: number;
  attributions: number;
  revenueCents: number;
}

export interface HeatmapCell {
  coachId: string;
  coachName: string;
  dayOfWeek: number;
  hourOfDay: number;
  revenueCents: number;
}

export interface RevenueReport {
  tenantId: string;
  month: string;
  currency: string;
  summary: RevenueSummary;
  breakageDetail: BreakageDetail;
  byDiscipline: ByDiscipline[];
  byCoach: ByCoach[];
  byPackage: ByPackage[];
  byTimeslot: ByTimeSlot[];
  heatmap: HeatmapCell[];
}

// Raw rows returned by the base SELECT used across aggregations. Doing the
// join once in app code keeps all queries tenant-scoped in one place.
interface AttributedRow {
  amountCents: number;
  classTypeId: string | null;
  classTypeName: string | null;
  coachId: string | null;
  coachName: string | null;
  scheduledAt: Date | null;
  packageId: string | null;
  packageName: string;
  packageType: string | null;
}

async function loadAttributedRows(
  tenantId: string,
  start: Date,
  end: Date,
): Promise<AttributedRow[]> {
  const events = await prisma.revenueEvent.findMany({
    where: {
      tenantId, // tenant isolation
      type: { in: ["booking", "penalty"] },
      eventDate: { gte: start, lte: end },
    },
    select: {
      amountCents: true,
      type: true,
      classId: true,
      booking: { select: { classId: true } },
      classRef: {
        select: {
          startsAt: true,
          classType: { select: { id: true, name: true } },
          coach: { select: { id: true, name: true } },
        },
      },
      entitlement: {
        select: {
          type: true,
          packageId: true,
        },
      },
    },
  });

  // Entitlement has no `package` relation defined in the schema (just a loose
  // packageId String). Batch-fetch package names in a separate, tenant-scoped
  // query to label the aggregation rows.
  const packageIds = Array.from(
    new Set(
      events
        .map((e) => e.entitlement?.packageId)
        .filter((id): id is string => !!id),
    ),
  );
  const packages = packageIds.length
    ? await prisma.package.findMany({
        where: { id: { in: packageIds }, tenantId },
        select: { id: true, name: true, type: true },
      })
    : [];
  const packageById = new Map(packages.map((p) => [p.id, p]));

  // For booking events the class comes via booking→class; for penalty events
  // it comes via classId. We select both and collapse.
  const extraClassIds = events
    .map((e) => (e.classRef ? null : (e.booking?.classId ?? e.classId)))
    .filter((id): id is string => !!id);

  const classLookup = extraClassIds.length
    ? await prisma.class.findMany({
        where: { id: { in: extraClassIds }, tenantId },
        select: {
          id: true,
          startsAt: true,
          classType: { select: { id: true, name: true } },
          coach: { select: { id: true, name: true } },
        },
      })
    : [];
  const lookupById = new Map(classLookup.map((c) => [c.id, c]));

  return events.map((e) => {
    const cls =
      e.classRef ??
      (e.booking?.classId
        ? lookupById.get(e.booking.classId)
        : e.classId
          ? lookupById.get(e.classId)
          : undefined);
    const pkg = e.entitlement?.packageId
      ? (packageById.get(e.entitlement.packageId) ?? null)
      : null;
    const fallback =
      e.type === "penalty"
        ? "Penalización"
        : e.entitlement?.type === "dropin"
          ? "Dropin / pago único"
          : "Sin paquete";
    return {
      amountCents: e.amountCents,
      classTypeId: cls?.classType.id ?? null,
      classTypeName: cls?.classType.name ?? null,
      coachId: cls?.coach.id ?? null,
      coachName: cls?.coach.name ?? null,
      scheduledAt: cls?.startsAt ?? null,
      packageId: pkg?.id ?? null,
      packageName: pkg?.name ?? fallback,
      packageType: pkg?.type ?? null,
    };
  });
}

export async function getMonthlyRevenueReport(
  tenantId: string,
  month: string,
): Promise<RevenueReport> {
  const { start, end } = monthBoundsInternal(month);

  // Currency: read off the tenant via its packages (fallback to "eur").
  const firstPkg = await prisma.package.findFirst({
    where: { tenantId },
    select: { currency: true },
  });
  const currency = (firstPkg?.currency ?? "eur").toLowerCase();

  const [attributedAgg, breakageRows, attributed] = await Promise.all([
    prisma.revenueEvent.aggregate({
      where: {
        tenantId,
        type: { in: ["booking", "penalty"] },
        eventDate: { gte: start, lte: end },
      },
      _sum: { amountCents: true },
    }),
    prisma.revenueEvent.groupBy({
      by: ["type"],
      where: {
        tenantId,
        type: { in: ["monthly_breakage", "expiration_breakage"] },
        eventDate: { gte: start, lte: end },
      },
      _sum: { amountCents: true },
    }),
    loadAttributedRows(tenantId, start, end),
  ]);

  const attributedCents = attributedAgg._sum.amountCents ?? 0;
  const monthlyBreakageCents =
    breakageRows.find((r) => r.type === "monthly_breakage")?._sum.amountCents ?? 0;
  const expirationBreakageCents =
    breakageRows.find((r) => r.type === "expiration_breakage")?._sum.amountCents ?? 0;
  const breakageCents = monthlyBreakageCents + expirationBreakageCents;

  // In-memory roll-ups (events are already tenant-scoped).
  const byDisciplineMap = new Map<
    string,
    { name: string; attributions: number; revenueCents: number }
  >();
  const byCoachMap = new Map<
    string,
    { name: string; attributions: number; revenueCents: number }
  >();
  const byPackageMap = new Map<
    string,
    {
      packageId: string | null;
      packageName: string;
      packageType: string | null;
      attributions: number;
      revenueCents: number;
    }
  >();
  const byTimeslotMap = new Map<string, ByTimeSlot>();
  const heatmapMap = new Map<string, HeatmapCell>();

  for (const row of attributed) {
    if (row.classTypeId && row.classTypeName) {
      const entry = byDisciplineMap.get(row.classTypeId) ?? {
        name: row.classTypeName,
        attributions: 0,
        revenueCents: 0,
      };
      entry.attributions++;
      entry.revenueCents += row.amountCents;
      byDisciplineMap.set(row.classTypeId, entry);
    }
    if (row.coachId && row.coachName) {
      const entry = byCoachMap.get(row.coachId) ?? {
        name: row.coachName,
        attributions: 0,
        revenueCents: 0,
      };
      entry.attributions++;
      entry.revenueCents += row.amountCents;
      byCoachMap.set(row.coachId, entry);
    }
    {
      const key = row.packageId ?? `fallback:${row.packageName}`;
      const entry = byPackageMap.get(key) ?? {
        packageId: row.packageId,
        packageName: row.packageName,
        packageType: row.packageType,
        attributions: 0,
        revenueCents: 0,
      };
      entry.attributions++;
      entry.revenueCents += row.amountCents;
      byPackageMap.set(key, entry);
    }
    if (row.scheduledAt) {
      const dow = row.scheduledAt.getDay();
      const hour = row.scheduledAt.getHours();
      const tsKey = `${dow}-${hour}`;
      const entry = byTimeslotMap.get(tsKey) ?? {
        dayOfWeek: dow,
        hourOfDay: hour,
        attributions: 0,
        revenueCents: 0,
      };
      entry.attributions++;
      entry.revenueCents += row.amountCents;
      byTimeslotMap.set(tsKey, entry);

      if (row.coachId && row.coachName) {
        const hKey = `${row.coachId}-${dow}-${hour}`;
        const cell = heatmapMap.get(hKey) ?? {
          coachId: row.coachId,
          coachName: row.coachName,
          dayOfWeek: dow,
          hourOfDay: hour,
          revenueCents: 0,
        };
        cell.revenueCents += row.amountCents;
        heatmapMap.set(hKey, cell);
      }
    }
  }

  const byDiscipline: ByDiscipline[] = Array.from(byDisciplineMap.entries())
    .map(([id, v]) => ({
      disciplineId: id,
      disciplineName: v.name,
      attributions: v.attributions,
      revenueCents: v.revenueCents,
      avgPerAttributionCents:
        v.attributions > 0 ? Math.round(v.revenueCents / v.attributions) : 0,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const byCoach: ByCoach[] = Array.from(byCoachMap.entries())
    .map(([id, v]) => ({
      coachId: id,
      coachName: v.name,
      attributions: v.attributions,
      revenueCents: v.revenueCents,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const byPackage: ByPackage[] = Array.from(byPackageMap.values())
    .map((v) => ({
      packageId: v.packageId,
      packageName: v.packageName,
      packageType: v.packageType,
      attributions: v.attributions,
      revenueCents: v.revenueCents,
      avgPerAttributionCents:
        v.attributions > 0 ? Math.round(v.revenueCents / v.attributions) : 0,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const byTimeslot = Array.from(byTimeslotMap.values()).sort(
    (a, b) => b.revenueCents - a.revenueCents,
  );
  const heatmap = Array.from(heatmapMap.values());

  return {
    tenantId,
    month,
    currency,
    summary: {
      attributedCents,
      breakageCents,
      totalRecognizedCents: attributedCents + breakageCents,
    },
    breakageDetail: {
      monthlyBreakageCents,
      expirationBreakageCents,
    },
    byDiscipline,
    byCoach,
    byPackage,
    byTimeslot,
    heatmap,
  };
}

function monthBoundsInternal(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

// Exported for testing.
export const _internal = { monthBoundsInternal };
export type { Prisma };
