import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;
    const { id } = await params;

    const body = await request.json();
    const action = body.action as "paid" | "forgiven" | undefined;
    const notes = typeof body.notes === "string" ? body.notes : undefined;

    if (action !== "paid" && action !== "forgiven") {
      return NextResponse.json(
        { error: "action must be 'paid' or 'forgiven'" },
        { status: 400 },
      );
    }

    const debt = await prisma.debt.findUnique({ where: { id } });
    if (!debt || debt.tenantId !== tenantId) {
      return NextResponse.json({ error: "Debt not found" }, { status: 404 });
    }
    if (debt.status !== "OPEN") {
      return NextResponse.json(
        { error: "Only OPEN debts can be resolved" },
        { status: 400 },
      );
    }

    const updated = await prisma.debt.update({
      where: { id },
      data: {
        status: action === "paid" ? "PAID" : "FORGIVEN",
        resolvedAt: new Date(),
        resolvedById: ctx.session.user!.id!,
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json({ success: true, debt: updated });
  } catch (error) {
    console.error("PATCH /api/admin/debts/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
