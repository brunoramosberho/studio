import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";

function parseDate(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("FRONT_DESK");
    const userId = ctx.session.user!.id!;

    const url = new URL(request.url);
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));

    const shifts = await prisma.staffShift.findMany({
      where: {
        tenantId: ctx.tenant.id,
        userId,
        clockInAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: to } : {}),
        },
      },
      include: {
        studio: { select: { id: true, name: true } },
        editedBy: { select: { id: true, name: true } },
      },
      orderBy: { clockInAt: "desc" },
      take: 200,
    });

    const totalMinutes = shifts.reduce(
      (sum, s) => sum + (s.status !== "VOIDED" ? s.durationMinutes ?? 0 : 0),
      0,
    );

    return NextResponse.json({
      shifts,
      totalMinutes,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
    });
  } catch (error) {
    console.error("GET /api/admin/staff/me/timesheet error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
