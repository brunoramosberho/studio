import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "../_auth";

function parseDate(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Global timesheet view: every shift for the tenant, filterable by period and
// studio. Default period = current month.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireStaffManagement();

    const url = new URL(request.url);
    const fromParam = parseDate(url.searchParams.get("from"));
    const toParam = parseDate(url.searchParams.get("to"));
    const studioId = url.searchParams.get("studioId");

    const now = new Date();
    const from = fromParam ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toParam ?? new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const shifts = await prisma.staffShift.findMany({
      where: {
        tenantId: ctx.tenant.id,
        clockInAt: { gte: from, lt: to },
        ...(studioId ? { studioId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        studio: { select: { id: true, name: true } },
        editedBy: { select: { id: true, name: true } },
      },
      orderBy: { clockInAt: "desc" },
      take: 1000,
    });

    return NextResponse.json({
      from,
      to,
      shifts,
    });
  } catch (error) {
    console.error("GET timesheet error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
