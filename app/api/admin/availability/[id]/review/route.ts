import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireRole("ADMIN");
    const { id } = await params;
    const body = await request.json();
    const { action, rejectionNote } = body as {
      action: "approve" | "reject";
      rejectionNote?: string;
    };

    const block = await prisma.coachAvailabilityBlock.findFirst({
      where: { id, tenantId: tenant.id, status: "pending_approval" },
    });

    if (!block) {
      return NextResponse.json(
        { error: "Block not found or already reviewed" },
        { status: 404 },
      );
    }

    const dateRange =
      block.startDate && block.endDate
        ? `${format(block.startDate, "d MMM", { locale: es })} – ${format(block.endDate, "d MMM", { locale: es })}`
        : "fechas indicadas";

    if (action === "approve") {
      await prisma.coachAvailabilityBlock.update({
        where: { id },
        data: {
          status: "active",
          approvedBy: session.user.id,
          approvedAt: new Date(),
        },
      });

      await prisma.notification.create({
        data: {
          userId: block.coachId,
          tenantId: tenant.id,
          type: "availability_approved",
          actorId: session.user.id,
        },
      });
    } else {
      await prisma.coachAvailabilityBlock.update({
        where: { id },
        data: {
          status: "rejected",
          rejectionNote: rejectionNote || null,
        },
      });

      await prisma.notification.create({
        data: {
          userId: block.coachId,
          tenantId: tenant.id,
          type: "availability_rejected",
          actorId: session.user.id,
        },
      });
    }

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("PATCH /api/admin/availability/[id]/review error:", error);
    return NextResponse.json(
      { error: "Failed to review block" },
      { status: 500 },
    );
  }
}
