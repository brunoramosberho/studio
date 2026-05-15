import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "../../_auth";

function parseDate(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { membershipId } = await params;

    const m = await prisma.membership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenant.id },
      select: { userId: true },
    });
    if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const url = new URL(request.url);
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));

    const shifts = await prisma.staffShift.findMany({
      where: {
        tenantId: ctx.tenant.id,
        userId: m.userId,
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
      take: 500,
    });
    return NextResponse.json({ shifts });
  } catch (error) {
    console.error("GET timesheet error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
