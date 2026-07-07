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
import { resolveTenantCurrency } from "@/lib/currency";
import { getPlatformSettlementByClass } from "@/lib/platforms/settlement";
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
  /** Estimated platform (Wellhub) revenue for this discipline — separate from ASC 606 recognized. */
  wellhubCents: number;
}

export interface ByCoach {
  coachId: string;
  coachName: string;
  attributions: number;
  revenueCents: number;
  /** Estimated platform (Wellhub) revenue for this coach — separate from ASC 606 recognized. */
  wellhubCents: number;
}

export interface ByPackage {
  packageId: string | null;
  packageName: string;
  packageType: string | null;
  attributions: number;
  revenueCents: number;
  avgPerAttributionCents: number;
  /** Estimated platform (Wellhub) revenue for this row — separate from recognized; only the Wellhub row uses it. */
  wellhubCents: number;
}

export interface ByDisciplinePackage {
  disciplineId: string;
  disciplineName: string;
  revenueCents: number;
  packages: ByPackage[];
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
  byDisciplinePackage: ByDisciplinePackage[];
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
  /** IANA timezone of the class's studio — day/hour buckets are computed here, not UTC. */
  timezone: string | null;
  packageId: string | null;
  packageName: string;
  packageType: string | null;
}

/** Day-of-week (0=Sun) and hour (0–23) of a UTC instant in a given studio tz. */
function localDayHour(d: Date, tz: string | null): { dow: number; hour: number } {
  if (!tz) return { dow: d.getDay(), hour: d.getHours() };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  if (hour === 24) hour = 0; // some runtimes render midnight as "24" with hour12:false
  return { dow: dowMap[wd] ?? d.getDay(), hour };
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
          room: { select: { studio: { select: { city: { select: { timezone: true } } } } } },
        },
      },
      entitlement: {
        select: {
          type: true,
          packageId: true,
          memberSubscriptionId: true,
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

  // Subscription entitlements: resolve the plan (package) via the member
  // subscription so unlimited revenue shows by its plan (e.g. "All-In") instead
  // of "Sin paquete" when the entitlement itself has no packageId.
  const subIds = Array.from(
    new Set(
      events
        .map((e) => e.entitlement?.memberSubscriptionId)
        .filter((id): id is string => !!id),
    ),
  );
  const subs = subIds.length
    ? await prisma.memberSubscription.findMany({
        where: { id: { in: subIds }, tenantId },
        select: { id: true, package: { select: { id: true, name: true, type: true } } },
      })
    : [];
  const subPackageById = new Map(subs.map((s) => [s.id, s.package]));

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
          room: { select: { studio: { select: { city: { select: { timezone: true } } } } } },
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
    const pkg =
      (e.entitlement?.packageId
        ? packageById.get(e.entitlement.packageId)
        : undefined) ??
      (e.entitlement?.memberSubscriptionId
        ? subPackageById.get(e.entitlement.memberSubscriptionId)
        : undefined) ??
      null;
    const fallback =
      e.type === "penalty"
        ? "Penalización"
        : e.entitlement?.type === "dropin"
          ? "Dropin / pago único"
          : e.entitlement?.type === "unlimited"
            ? "Suscripción"
            : "Sin paquete";
    return {
      amountCents: e.amountCents,
      classTypeId: cls?.classType.id ?? null,
      classTypeName: cls?.classType.name ?? null,
      coachId: cls?.coach.id ?? null,
      coachName: cls?.coach.name ?? null,
      scheduledAt: cls?.startsAt ?? null,
      timezone: cls?.room?.studio?.city?.timezone ?? null,
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
  // Exclusive end (first of next month) for the platform-settlement query,
  // which filters class.startsAt on [start, end).
  const [emY, emM] = month.split("-").map(Number);
  const exclusiveEnd = new Date(emY, emM, 1);

  // Currency: prefer the tenant's default country currency; fall back to the
  // first Package row only if the tenant hasn't been anchored to a country.
  const firstPkg = await prisma.package.findFirst({
    where: { tenantId },
    select: { currency: true },
  });
  const tenantCurrency = await resolveTenantCurrency(tenantId);
  const currency = (firstPkg?.currency ?? tenantCurrency.code).toLowerCase();

  const [attributedAgg, breakageRows, attributed, wellhub] = await Promise.all([
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
    // Estimated platform (Wellhub) revenue per class — a separate estimate
    // layer, never folded into the ASC 606 recognized totals below.
    getPlatformSettlementByClass(tenantId, start, exclusiveEnd),
  ]);

  // Map the per-class Wellhub estimate to discipline + coach.
  const whClassIds = [...wellhub.byClass.keys()];
  const whClasses = whClassIds.length
    ? await prisma.class.findMany({
        where: { id: { in: whClassIds }, tenantId },
        select: {
          id: true,
          classType: { select: { id: true, name: true } },
          coach: { select: { id: true, name: true } },
        },
      })
    : [];
  const whClassById = new Map(whClasses.map((c) => [c.id, c]));
  const wellhubDisc = new Map<string, { name: string; cents: number }>();
  const wellhubCoachMap = new Map<string, { name: string; cents: number }>();
  for (const [classId, cents] of wellhub.byClass) {
    const c = whClassById.get(classId);
    if (!c) continue;
    const d = wellhubDisc.get(c.classType.id) ?? { name: c.classType.name, cents: 0 };
    d.cents += cents;
    wellhubDisc.set(c.classType.id, d);
    const co = wellhubCoachMap.get(c.coach.id) ?? { name: c.coach.name, cents: 0 };
    co.cents += cents;
    wellhubCoachMap.set(c.coach.id, co);
  }

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
  // Nested: disciplineId → (packageKey → package aggregate). Feeds the
  // expandable "Por disciplina" drill-down.
  const byDisciplinePackageMap = new Map<
    string,
    {
      disciplineName: string;
      packages: Map<
        string,
        {
          packageId: string | null;
          packageName: string;
          packageType: string | null;
          attributions: number;
          revenueCents: number;
        }
      >;
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

      if (row.classTypeId && row.classTypeName) {
        const disc = byDisciplinePackageMap.get(row.classTypeId) ?? {
          disciplineName: row.classTypeName,
          packages: new Map(),
        };
        const pkgEntry = disc.packages.get(key) ?? {
          packageId: row.packageId,
          packageName: row.packageName,
          packageType: row.packageType,
          attributions: 0,
          revenueCents: 0,
        };
        pkgEntry.attributions++;
        pkgEntry.revenueCents += row.amountCents;
        disc.packages.set(key, pkgEntry);
        byDisciplinePackageMap.set(row.classTypeId, disc);
      }
    }
    if (row.scheduledAt) {
      const { dow, hour } = localDayHour(row.scheduledAt, row.timezone);
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

  const byDiscipline: ByDiscipline[] = Array.from(byDisciplineMap.entries()).map(
    ([id, v]) => ({
      disciplineId: id,
      disciplineName: v.name,
      attributions: v.attributions,
      revenueCents: v.revenueCents,
      avgPerAttributionCents:
        v.attributions > 0 ? Math.round(v.revenueCents / v.attributions) : 0,
      wellhubCents: wellhubDisc.get(id)?.cents ?? 0,
    }),
  );
  // Disciplines that only have Wellhub (estimated) revenue this month.
  for (const [id, w] of wellhubDisc) {
    if (!byDisciplineMap.has(id)) {
      byDiscipline.push({
        disciplineId: id,
        disciplineName: w.name,
        attributions: 0,
        revenueCents: 0,
        avgPerAttributionCents: 0,
        wellhubCents: w.cents,
      });
    }
  }
  byDiscipline.sort(
    (a, b) => b.revenueCents + b.wellhubCents - (a.revenueCents + a.wellhubCents),
  );

  const byCoach: ByCoach[] = Array.from(byCoachMap.entries()).map(([id, v]) => ({
    coachId: id,
    coachName: v.name,
    attributions: v.attributions,
    revenueCents: v.revenueCents,
    wellhubCents: wellhubCoachMap.get(id)?.cents ?? 0,
  }));
  for (const [id, w] of wellhubCoachMap) {
    if (!byCoachMap.has(id)) {
      byCoach.push({
        coachId: id,
        coachName: w.name,
        attributions: 0,
        revenueCents: 0,
        wellhubCents: w.cents,
      });
    }
  }
  byCoach.sort(
    (a, b) => b.revenueCents + b.wellhubCents - (a.revenueCents + a.wellhubCents),
  );

  const byPackage: ByPackage[] = Array.from(byPackageMap.values()).map((v) => ({
    packageId: v.packageId,
    packageName: v.packageName,
    packageType: v.packageType,
    attributions: v.attributions,
    revenueCents: v.revenueCents,
    avgPerAttributionCents:
      v.attributions > 0 ? Math.round(v.revenueCents / v.attributions) : 0,
    wellhubCents: 0,
  }));
  // A single "Wellhub" row so the estimated platform revenue also shows in the
  // by-package view (marked as estimate, revenueCents = 0).
  if (wellhub.totalCents > 0) {
    byPackage.push({
      packageId: null,
      packageName: "Wellhub",
      packageType: "PLATFORM",
      attributions: wellhub.byClass.size,
      revenueCents: 0,
      avgPerAttributionCents: 0,
      wellhubCents: wellhub.totalCents,
    });
  }
  byPackage.sort(
    (a, b) => b.revenueCents + b.wellhubCents - (a.revenueCents + a.wellhubCents),
  );

  const byDisciplinePackage: ByDisciplinePackage[] = Array.from(
    byDisciplinePackageMap.entries(),
  )
    .map(([disciplineId, v]) => {
      const packages = Array.from(v.packages.values())
        .map((p) => ({
          packageId: p.packageId,
          packageName: p.packageName,
          packageType: p.packageType,
          attributions: p.attributions,
          revenueCents: p.revenueCents,
          avgPerAttributionCents:
            p.attributions > 0 ? Math.round(p.revenueCents / p.attributions) : 0,
          wellhubCents: 0,
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents);
      const revenueCents = packages.reduce((s, p) => s + p.revenueCents, 0);
      return {
        disciplineId,
        disciplineName: v.disciplineName,
        revenueCents,
        packages,
      };
    })
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
    byDisciplinePackage,
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
