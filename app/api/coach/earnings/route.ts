import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, getTenantCurrency } from "@/lib/tenant";
import { computeCoachPay, collapseClassEarnings } from "@/lib/coach/pay";

// Per-month earnings detail for the coach's own view, so instructors can look
// back at past months and see exactly how each class was paid. The current
// month + week already come from /api/coach/stats; this serves any month on
// demand as the coach steps back through the month picker.
//
// GET /api/coach/earnings?month=YYYY-MM
export async function GET(request: NextRequest) {
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

    // Parse ?month=YYYY-MM; fall back to the current month on anything invalid.
    const raw = request.nextUrl.searchParams.get("month") ?? "";
    const m = /^(\d{4})-(\d{2})$/.exec(raw);
    let year = now.getFullYear();
    let monthIdx = now.getMonth();
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) {
        year = y;
        monthIdx = mo - 1;
      }
    }

    const monthStart = new Date(year, monthIdx, 1);
    const monthEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59);
    const monthKey = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

    const currency = (await getTenantCurrency()).code;
    const pay = await computeCoachPay(
      coachProfile.id,
      tenant.id,
      monthStart,
      monthEnd,
      currency,
      now,
    );

    return NextResponse.json({
      month: monthKey,
      total: pay.total,
      earnedSoFar: pay.earnedSoFar,
      projected: pay.projected,
      monthlyFixed: pay.monthlyFixed,
      breakdown: pay.breakdown,
      currency: pay.currency,
      hasRates: pay.hasRates,
      classesCount: pay.classesCount,
      classEarnings: collapseClassEarnings(pay.classLines),
    });
  } catch (error) {
    console.error("GET /api/coach/earnings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch earnings" },
      { status: 500 },
    );
  }
}
