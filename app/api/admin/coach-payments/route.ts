import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, getTenantCurrency } from "@/lib/tenant";
import { computeCoachPay } from "@/lib/coach/pay";
import { penaltyInclude, serializePenalty, type SerializedPenalty } from "@/lib/coach/penalties";

/** Resolve the [from, to] of a `YYYY-MM` month param (defaults to current). */
function monthRange(month: string | null): { from: Date; to: Date; label: string } {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-indexed
  if (month) {
    const [yy, mm] = month.split("-").map(Number);
    if (Number.isFinite(yy) && Number.isFinite(mm)) {
      y = yy;
      m = mm - 1;
    }
  }
  return {
    from: new Date(y, m, 1, 0, 0, 0, 0),
    to: new Date(y, m + 1, 0, 23, 59, 59, 999),
    label: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("staffManagement");
    const tenantId = ctx.tenant.id;

    const { from, to, label } = monthRange(request.nextUrl.searchParams.get("month"));
    const coachIdParam = request.nextUrl.searchParams.get("coachId");
    const currency = (await getTenantCurrency()).code;

    const coaches = await prisma.coachProfile.findMany({
      where: {
        tenantId,
        ...(coachIdParam ? { id: coachIdParam } : {}),
      },
      select: { id: true, name: true, photoUrl: true, user: { select: { image: true } } },
      orderBy: { name: "asc" },
    });

    // Penalties logged against these coaches during the period, grouped by coach.
    const penaltyRows = await prisma.coachPenalty.findMany({
      where: {
        tenantId,
        coachProfileId: { in: coaches.map((c) => c.id) },
        occurredAt: { gte: from, lte: to },
      },
      include: penaltyInclude,
      orderBy: { occurredAt: "desc" },
    });
    const penaltiesByCoach = new Map<string, SerializedPenalty[]>();
    for (const p of penaltyRows) {
      const arr = penaltiesByCoach.get(p.coachProfileId) ?? [];
      arr.push(serializePenalty(p));
      penaltiesByCoach.set(p.coachProfileId, arr);
    }

    const results = await Promise.all(
      coaches.map(async (coach) => {
        const pay = await computeCoachPay(coach.id, tenantId, from, to, currency);
        return {
          coachId: coach.id,
          name: coach.name,
          photoUrl: coach.photoUrl ?? coach.user?.image ?? null,
          hasRates: pay.hasRates,
          total: pay.total,
          earnedSoFar: pay.earnedSoFar,
          projected: pay.projected,
          monthlyFixed: pay.monthlyFixed,
          classesCount: pay.classesCount,
          breakdown: pay.breakdown,
          classLines: pay.classLines.map((l) => ({
            classId: l.classId,
            startsAt: l.startsAt,
            classTypeId: l.classTypeId,
            classTypeName: l.classTypeName,
            classTypeColor: l.classTypeColor,
            studioId: l.studioId,
            studioName: l.studioName,
            roomName: l.roomName,
            attendees: l.attendees,
            attended: l.attended,
            chargedNoShows: l.chargedNoShows,
            chargedLateCancels: l.chargedLateCancels,
            capped: l.capped,
            capacity: l.capacity,
            occupancyPct: l.occupancyPct,
            rateType: l.rateType,
            rateLabel: l.rateLabel,
            multiplier: l.multiplier,
            amount: l.amount,
            isPast: l.isPast,
          })),
          penalties: penaltiesByCoach.get(coach.id) ?? [],
        };
      }),
    );

    // Filter dropdown options (studios + disciplines that actually appear).
    const studioMap = new Map<string, string>();
    const typeMap = new Map<string, string>();
    for (const r of results) {
      for (const l of r.classLines) {
        if (l.studioId) studioMap.set(l.studioId, l.studioName);
        typeMap.set(l.classTypeId, l.classTypeName);
      }
    }

    const grandTotal = results.reduce((s, r) => s + r.total, 0);

    return NextResponse.json({
      month: label,
      currency,
      grandTotal: Math.round(grandTotal * 100) / 100,
      coaches: results,
      studios: Array.from(studioMap, ([id, name]) => ({ id, name })),
      classTypes: Array.from(typeMap, ([id, name]) => ({ id, name })),
    });
  } catch (error) {
    console.error("GET /api/admin/coach-payments error:", error);
    return NextResponse.json({ error: "Failed to load coach payments" }, { status: 500 });
  }
}
