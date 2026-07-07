// "Estimated earnings attributed per class" — a gross-revenue attribution view
// for /admin/finance/recognition. UNLIKE the ASC 606 recognized ledger
// (lib/revenue/reports.ts), this attributes EVERY attendance directly from the
// bookings + platform check-ins, capped at the studio's drop-in price:
//
//   - Pack booking       → the pack's per-credit value, capped at the drop-in
//                          price. Credits carry across months, so no monthly
//                          breakage here (pack expiration breakage is separate).
//   - Subscription       → each attended class is worth up to one drop-in; the
//                          member's monthly price is the ceiling, and whatever
//                          isn't "used up" that month is breakage
//                          (pay 199, go to 1 class → 27 attributed + 172 break).
//   - Drop-in / one-off  → its own price (already a single class), capped.
//   - Wellhub / platform → the estimated settlement per class.
//
// Packages and subscriptions are treated the same (both are "packages" here);
// Wellhub is surfaced as its own package row.

import { prisma } from "@/lib/db";
import { resolveTenantCurrency } from "@/lib/currency";
import { getPlatformSettlementByClass } from "@/lib/platforms/settlement";

export type EstSourceKind =
  | "pack"
  | "subscription"
  | "dropin"
  | "platform"
  | "other";

export interface EstByPackage {
  key: string;
  name: string;
  kind: EstSourceKind;
  attributions: number;
  revenueCents: number;
  avgPerAttributionCents: number;
  breakageCents: number;
}

export interface EstByDiscipline {
  disciplineId: string;
  disciplineName: string;
  attributions: number;
  revenueCents: number;
  avgPerAttributionCents: number;
  /** Per-source breakdown for the drill-down. */
  packages: EstByPackage[];
}

export interface EstByCoach {
  coachId: string;
  coachName: string;
  attributions: number;
  revenueCents: number;
}

export interface EstByTimeslot {
  dayOfWeek: number;
  hourOfDay: number;
  attributions: number;
  revenueCents: number;
}

export interface EstHeatmapCell {
  coachId: string;
  coachName: string;
  dayOfWeek: number;
  hourOfDay: number;
  revenueCents: number;
}

export interface EstimatedEarningsReport {
  tenantId: string;
  month: string;
  currency: string;
  dropInCapCents: number;
  summary: {
    attributedCents: number;
    breakageCents: number;
    totalCents: number; // attributed + breakage
  };
  byPackage: EstByPackage[];
  byDiscipline: EstByDiscipline[];
  byCoach: EstByCoach[];
  byTimeslot: EstByTimeslot[];
  heatmap: EstHeatmapCell[];
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
  if (hour === 24) hour = 0;
  return { dow: dowMap[wd] ?? d.getDay(), hour };
}

type ClassLite = {
  id: string;
  startsAt: Date;
  classTypeId: string;
  classTypeName: string;
  coachId: string;
  coachName: string;
  timezone: string | null;
};

export async function getEstimatedEarnings(
  tenantId: string,
  month: string,
): Promise<EstimatedEarningsReport> {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1); // exclusive

  const tenantCurrency = await resolveTenantCurrency(tenantId);

  // Drop-in cap: the "Drop-In" package price (Bruno's chosen per-class ceiling).
  // Prefer a package named ~"drop"; fall back to the priciest real single-class
  // (credits === 1) package so a $1 test SKU never wins.
  const dropInPkg =
    (await prisma.package.findFirst({
      where: { tenantId, name: { contains: "drop", mode: "insensitive" } },
      orderBy: { price: "desc" },
      select: { price: true, currency: true },
    })) ??
    (await prisma.package.findFirst({
      where: { tenantId, credits: 1, price: { gt: 0 } },
      orderBy: { price: "desc" },
      select: { price: true, currency: true },
    }));
  const cap = Math.round((dropInPkg?.price ?? 0) * 100);
  const currency = (dropInPkg?.currency ?? tenantCurrency.code).toLowerCase();

  // ── Member attendances this month ────────────────────────────────────────
  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      status: { in: ["ATTENDED", "CONFIRMED"] },
      userId: { not: null },
      class: { startsAt: { gte: start, lt: end } },
    },
    select: {
      id: true,
      userId: true,
      packageUsed: true,
      class: {
        select: {
          id: true,
          startsAt: true,
          classType: { select: { id: true, name: true } },
          coach: { select: { id: true, name: true } },
          room: { select: { studio: { select: { city: { select: { timezone: true } } } } } },
        },
      },
      sourceEntitlement: {
        select: { packageId: true, type: true, creditsTotal: true, memberSubscriptionId: true },
      },
    },
  });

  const classOf = (b: (typeof bookings)[number]): ClassLite => ({
    id: b.class.id,
    startsAt: b.class.startsAt,
    classTypeId: b.class.classType.id,
    classTypeName: b.class.classType.name,
    coachId: b.class.coach.id,
    coachName: b.class.coach.name,
    timezone: b.class.room?.studio?.city?.timezone ?? null,
  });

  // Resolve package metadata: from the entitlement's packageId and from the
  // userPackage referenced by packageUsed (fallback when the booking has no
  // entitlement).
  const entPkgIds = bookings
    .map((b) => b.sourceEntitlement?.packageId)
    .filter((id): id is string => !!id);
  const userPkgIds = bookings
    .map((b) => b.packageUsed)
    .filter((id): id is string => !!id);
  const [pkgs, userPkgs] = await Promise.all([
    entPkgIds.length
      ? prisma.package.findMany({
          where: { id: { in: [...new Set(entPkgIds)] }, tenantId },
          select: { id: true, name: true, type: true, price: true, credits: true },
        })
      : Promise.resolve([]),
    userPkgIds.length
      ? prisma.userPackage.findMany({
          where: { id: { in: [...new Set(userPkgIds)] }, tenantId },
          select: {
            id: true,
            package: { select: { id: true, name: true, type: true, price: true, credits: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const pkgById = new Map(pkgs.map((p) => [p.id, p]));
  const pkgByUserPkg = new Map(userPkgs.map((u) => [u.id, u.package]));

  // Active subscriptions overlapping the month — drive subscription attribution
  // + breakage even for members whose bookings aren't tagged with a source.
  const subs = await prisma.memberSubscription.findMany({
    where: {
      tenantId,
      status: "active",
      currentPeriodStart: { lt: end },
      currentPeriodEnd: { gte: start },
    },
    select: {
      userId: true,
      package: { select: { id: true, name: true, price: true } },
    },
  });
  const subByUser = new Map(subs.map((s) => [s.userId, s.package]));

  // ── Accumulators ─────────────────────────────────────────────────────────
  // Every attribution event (a pack/sub attendance, or a Wellhub per-class
  // settlement) is folded into the discipline / coach / time-slot / heatmap
  // rollups right here, so "Atrib." means the same thing everywhere (a count of
  // attributions) and each parent row reconciles exactly with its drill-down.
  const byPackage = new Map<string, EstByPackage>();
  const byDiscipline = new Map<
    string,
    { name: string; attributions: number; cents: number }
  >();
  const byCoach = new Map<
    string,
    { name: string; attributions: number; cents: number }
  >();
  const byTimeslot = new Map<string, EstByTimeslot>();
  const heatmap = new Map<string, EstHeatmapCell>();
  let attributedCents = 0;
  const addClass = (cls: ClassLite, cents: number) => {
    attributedCents += cents;
    const d =
      byDiscipline.get(cls.classTypeId) ??
      { name: cls.classTypeName, attributions: 0, cents: 0 };
    d.cents += cents;
    d.attributions++;
    byDiscipline.set(cls.classTypeId, d);
    const co =
      byCoach.get(cls.coachId) ??
      { name: cls.coachName, attributions: 0, cents: 0 };
    co.cents += cents;
    co.attributions++;
    byCoach.set(cls.coachId, co);
    const { dow, hour } = localDayHour(cls.startsAt, cls.timezone);
    const tsKey = `${dow}-${hour}`;
    const ts =
      byTimeslot.get(tsKey) ??
      { dayOfWeek: dow, hourOfDay: hour, attributions: 0, revenueCents: 0 };
    ts.revenueCents += cents;
    ts.attributions++;
    byTimeslot.set(tsKey, ts);
    const hKey = `${cls.coachId}-${dow}-${hour}`;
    const cell =
      heatmap.get(hKey) ??
      {
        coachId: cls.coachId,
        coachName: cls.coachName,
        dayOfWeek: dow,
        hourOfDay: hour,
        revenueCents: 0,
      };
    cell.revenueCents += cents;
    heatmap.set(hKey, cell);
  };
  const addPkg = (
    key: string,
    name: string,
    kind: EstSourceKind,
    cents: number,
    attributions: number,
    breakage: number,
  ) => {
    const e =
      byPackage.get(key) ??
      {
        key,
        name,
        kind,
        attributions: 0,
        revenueCents: 0,
        avgPerAttributionCents: 0,
        breakageCents: 0,
      };
    e.revenueCents += cents;
    e.attributions += attributions;
    e.breakageCents += breakage;
    byPackage.set(key, e);
  };
  // Nested discipline → source, for the "Por disciplina" drill-down.
  const byDiscPkg = new Map<
    string,
    {
      name: string;
      packages: Map<
        string,
        { name: string; kind: EstSourceKind; cents: number; attributions: number }
      >;
    }
  >();
  const addDiscPkg = (
    cls: ClassLite,
    key: string,
    name: string,
    kind: EstSourceKind,
    cents: number,
  ) => {
    const disc =
      byDiscPkg.get(cls.classTypeId) ?? { name: cls.classTypeName, packages: new Map() };
    const p = disc.packages.get(key) ?? { name, kind, cents: 0, attributions: 0 };
    p.cents += cents;
    p.attributions++;
    disc.packages.set(key, p);
    byDiscPkg.set(cls.classTypeId, disc);
  };

  // Split bookings into subscription-attributed vs. pack/dropin/other.
  const subBookingsByUser = new Map<string, (typeof bookings)[number][]>();
  const otherBookings: (typeof bookings)[number][] = [];
  for (const b of bookings) {
    const entPkg = b.sourceEntitlement?.packageId
      ? pkgById.get(b.sourceEntitlement.packageId)
      : undefined;
    const upPkg = b.packageUsed ? pkgByUserPkg.get(b.packageUsed) : undefined;
    const resolvedPkg = entPkg ?? upPkg;
    const isSub =
      b.sourceEntitlement?.type === "unlimited" ||
      !!b.sourceEntitlement?.memberSubscriptionId ||
      resolvedPkg?.type === "SUBSCRIPTION" ||
      (!resolvedPkg && !!b.userId && subByUser.has(b.userId));
    if (isSub && b.userId) {
      const arr = subBookingsByUser.get(b.userId) ?? [];
      arr.push(b);
      subBookingsByUser.set(b.userId, arr);
    } else {
      otherBookings.push(b);
    }
  }

  // ── Subscriptions: attribute per class up to the monthly price; rest breaks ─
  const subUsers = new Set<string>([...subByUser.keys(), ...subBookingsByUser.keys()]);
  for (const userId of subUsers) {
    const plan =
      subByUser.get(userId) ??
      // fall back to the plan on the booking's entitlement / used package
      (() => {
        const b = subBookingsByUser.get(userId)?.[0];
        const entPkg = b?.sourceEntitlement?.packageId
          ? pkgById.get(b.sourceEntitlement.packageId)
          : undefined;
        const upPkg = b?.packageUsed ? pkgByUserPkg.get(b.packageUsed) : undefined;
        const p = entPkg ?? upPkg;
        return p ? { id: p.id, name: p.name, price: p.price } : null;
      })();
    if (!plan) continue;
    const monthlyCents = Math.round(plan.price * 100);
    const attended = subBookingsByUser.get(userId) ?? [];
    let allocated = 0;
    for (const b of attended) {
      const v = Math.min(cap, Math.max(0, monthlyCents - allocated));
      allocated += v;
      const cls = classOf(b);
      addClass(cls, v);
      addDiscPkg(cls, `sub:${plan.id}`, plan.name, "subscription", v);
    }
    const breakage = Math.max(0, monthlyCents - allocated);
    addPkg(`sub:${plan.id}`, plan.name, "subscription", allocated, attended.length, breakage);
  }

  // ── Packs / drop-ins / other: per-class value capped at the drop-in price ──
  for (const b of otherBookings) {
    const entPkg = b.sourceEntitlement?.packageId
      ? pkgById.get(b.sourceEntitlement.packageId)
      : undefined;
    const upPkg = b.packageUsed ? pkgByUserPkg.get(b.packageUsed) : undefined;
    const pkg = entPkg ?? upPkg ?? null;
    let key: string;
    let name: string;
    let kind: EstSourceKind;
    let value: number;
    if (pkg) {
      const credits = pkg.credits ?? null;
      if (credits === 1) {
        kind = "dropin";
      } else {
        kind = "pack";
      }
      const priceCents = Math.round(pkg.price * 100);
      value =
        credits && credits > 0
          ? Math.min(Math.round(priceCents / credits), cap)
          : Math.min(priceCents, cap);
      key = `pkg:${pkg.id}`;
      name = pkg.name;
    } else {
      // No resolvable source — value it at (up to) one drop-in.
      kind = "other";
      value = cap;
      key = "other";
      name = "Sin fuente";
    }
    const cls = classOf(b);
    addClass(cls, value);
    addPkg(key, name, kind, value, 1, 0);
    addDiscPkg(cls, key, name, kind, value);
  }

  // ── Platform (Wellhub) estimate per class ─────────────────────────────────
  const wellhub = await getPlatformSettlementByClass(tenantId, start, end);
  if (wellhub.byClass.size > 0) {
    const whClassIds = [...wellhub.byClass.keys()];
    const whClasses = await prisma.class.findMany({
      where: { id: { in: whClassIds }, tenantId },
      select: {
        id: true,
        startsAt: true,
        classType: { select: { id: true, name: true } },
        coach: { select: { id: true, name: true } },
        room: { select: { studio: { select: { city: { select: { timezone: true } } } } } },
      },
    });
    const whById = new Map(whClasses.map((c) => [c.id, c]));
    for (const [classId, cents] of wellhub.byClass) {
      const c = whById.get(classId);
      if (!c) continue;
      const cls: ClassLite = {
        id: c.id,
        startsAt: c.startsAt,
        classTypeId: c.classType.id,
        classTypeName: c.classType.name,
        coachId: c.coach.id,
        coachName: c.coach.name,
        timezone: c.room?.studio?.city?.timezone ?? null,
      };
      addClass(cls, cents);
      addDiscPkg(cls, "platform:wellhub", "Wellhub", "platform", cents);
    }
    addPkg("platform:wellhub", "Wellhub", "platform", wellhub.totalCents, wellhub.byClass.size, 0);
  }

  // ── Discipline / coach / time-slot / heatmap already rolled up in addClass ─
  const breakageCents = [...byPackage.values()].reduce((s, p) => s + p.breakageCents, 0);

  return {
    tenantId,
    month,
    currency,
    dropInCapCents: cap,
    summary: { attributedCents, breakageCents, totalCents: attributedCents + breakageCents },
    byPackage: [...byPackage.values()]
      .map((p) => ({
        ...p,
        avgPerAttributionCents:
          p.attributions > 0 ? Math.round(p.revenueCents / p.attributions) : 0,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    byDiscipline: [...byDiscipline.entries()]
      .map(([id, v]) => ({
        disciplineId: id,
        disciplineName: v.name,
        attributions: v.attributions,
        revenueCents: v.cents,
        avgPerAttributionCents: v.attributions > 0 ? Math.round(v.cents / v.attributions) : 0,
        packages: [...(byDiscPkg.get(id)?.packages.entries() ?? [])]
          .map(([pkgKey, p]) => ({
            key: pkgKey,
            name: p.name,
            kind: p.kind,
            attributions: p.attributions,
            revenueCents: p.cents,
            avgPerAttributionCents: p.attributions > 0 ? Math.round(p.cents / p.attributions) : 0,
            breakageCents: 0,
          }))
          .sort((a, b) => b.revenueCents - a.revenueCents),
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    byCoach: [...byCoach.entries()]
      .map(([id, v]) => ({ coachId: id, coachName: v.name, attributions: v.attributions, revenueCents: v.cents }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    byTimeslot: [...byTimeslot.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    heatmap: [...heatmap.values()],
  };
}
