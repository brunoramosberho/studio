import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { autoCloseStaleShifts } from "@/lib/staff";

// Runs hourly. For every tenant, closes any StaffShift that's been OPEN for
// longer than tenant.staffMaxShiftHours. Synthesises a clockOutAt at
// (clockInAt + maxShiftHours) so payroll caps runaway shifts. Idempotent.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let totalClosed = 0;
  const details: Array<{ tenantId: string; closed: number }> = [];

  for (const t of tenants) {
    try {
      const closed = await autoCloseStaleShifts(t.id);
      if (closed > 0) details.push({ tenantId: t.id, closed });
      totalClosed += closed;
    } catch (err) {
      console.error("[staff-auto-close-shifts]", t.id, err);
    }
  }

  return NextResponse.json({ ok: true, totalClosed, details });
}
