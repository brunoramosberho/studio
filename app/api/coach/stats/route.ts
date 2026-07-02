import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, getTenantCurrency } from "@/lib/tenant";
import { computeCoachPay, collapseClassEarnings } from "@/lib/coach/pay";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const coachProfile = await prisma.coachProfile.findFirst({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: { id: true },
    });

    if (!coachProfile) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const now = new Date();

    const weekDay = now.getDay();
    const mondayOffset = weekDay === 0 ? -6 : 1 - weekDay;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    const baseWhere = {
      coachId: coachProfile.id,
      tenantId: tenant.id,
      status: { not: "CANCELLED" as const },
    };

    const [
      weekTotal,
      weekGiven,
      weekStudents,
      monthTotal,
      monthGiven,
      monthStudents,
      yearTotal,
      yearGiven,
      yearStudents,
      allTimeGiven,
      allTimeStudents,
      classHistory,
    ] = await Promise.all([
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: weekStart, lte: weekEnd } },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: weekStart, lt: now } },
      }),
      prisma.booking.count({
        where: {
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { ...baseWhere, startsAt: { gte: weekStart, lte: weekEnd } },
        },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: monthStart, lt: now } },
      }),
      prisma.booking.count({
        where: {
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { ...baseWhere, startsAt: { gte: monthStart, lte: monthEnd } },
        },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: yearStart, lte: yearEnd } },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: yearStart, lt: now } },
      }),
      prisma.booking.count({
        where: {
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { ...baseWhere, startsAt: { gte: yearStart, lte: yearEnd } },
        },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { lt: now } },
      }),
      prisma.booking.count({
        where: {
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { ...baseWhere, startsAt: { lt: now } },
        },
      }),
      prisma.class.findMany({
        where: { ...baseWhere },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          classType: { select: { name: true, color: true } },
          room: { select: { maxCapacity: true } },
          _count: {
            select: {
              bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            },
          },
        },
      }),
    ]);

    // Pay comes from the single source of truth (lib/coach/pay.ts) so the coach
    // sees exactly what admin sees in payroll — including no-shows / late cancels
    // the studio charged for, capped at room capacity.
    const currency = (await getTenantCurrency()).code;
    const [weekPay, monthPay] = await Promise.all([
      computeCoachPay(coachProfile.id, tenant.id, weekStart, weekEnd, currency, now),
      computeCoachPay(coachProfile.id, tenant.id, monthStart, monthEnd, currency, now),
    ]);
    // Trim to the summary the coach view needs (drop the heavy classLines — the
    // per-class detail is delivered separately as classEarnings).
    const summarize = (p: typeof monthPay) => ({
      total: p.total,
      earnedSoFar: p.earnedSoFar,
      projected: p.projected,
      breakdown: p.breakdown,
      currency: p.currency,
      hasRates: p.hasRates,
    });
    const weekEarnings = summarize(weekPay);
    const monthEarnings = summarize(monthPay);
    // One row per class with the seat breakdown + rate lines (shared with the
    // per-month endpoint so the coach sees the same transparent math everywhere).
    const classEarnings = collapseClassEarnings(monthPay.classLines);

    // Earliest month the coach has a class, so the UI knows how far back the
    // month picker can step.
    const firstClass = await prisma.class.findFirst({
      where: baseWhere,
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    const earliestMonth = firstClass
      ? `${firstClass.startsAt.getFullYear()}-${String(firstClass.startsAt.getMonth() + 1).padStart(2, "0")}`
      : null;

    return NextResponse.json({
      week: { total: weekTotal, given: weekGiven, students: weekStudents },
      month: { total: monthTotal, given: monthGiven, students: monthStudents },
      year: { total: yearTotal, given: yearGiven, students: yearStudents },
      allTime: { given: allTimeGiven, students: allTimeStudents },
      earnings: monthEarnings,
      weekEarnings,
      classEarnings,
      earliestMonth,
      history: classHistory.map((c) => ({
        id: c.id,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        className: c.classType.name,
        classColor: c.classType.color,
        capacity: c.room.maxCapacity,
        students: c._count.bookings,
        isPast: new Date(c.startsAt) < now,
      })),
    });
  } catch (error) {
    console.error("GET /api/coach/stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
