import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { notifyCoachOfAvailabilityReview } from "@/lib/availability-notifications";

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
      include: {
        coach: { select: { id: true, name: true, email: true } },
      },
    });

    if (!block) {
      return NextResponse.json(
        { error: "Block not found or already reviewed" },
        { status: 404 },
      );
    }

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

    notifyCoachOfAvailabilityReview({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      action,
      coachUserId: block.coachId,
      coachEmail: block.coach.email,
      coachName: block.coach.name ?? "",
      startDate: block.startDate,
      endDate: block.endDate,
      reasonType: block.reasonType,
      rejectionNote: rejectionNote || null,
    }).catch((err) => {
      console.error("Failed to notify coach of availability review:", err);
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("PATCH /api/admin/availability/[id]/review error:", error);
    return NextResponse.json(
      { error: "Failed to review block" },
      { status: 500 },
    );
  }
}
