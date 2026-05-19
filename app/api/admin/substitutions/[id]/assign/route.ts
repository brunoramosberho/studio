import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { notifyRequestAccepted } from "@/lib/substitutions";

/**
 * Admin picks a specific coach to take a PENDING / PENDING_ADMIN request
 * without going through the notification loop. The request is closed as
 * ACCEPTED and the class is reassigned atomically. Useful for SWAP-less
 * direct overrides from the admin side (e.g. the admin already spoke to
 * the substitute off-system).
 *
 * Not supported for SWAP requests — those have to go through the swap
 * approval flow because they're two-way.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireRole("ADMIN");
    const { id } = await params;
    const body = (await request.json()) as { coachProfileId?: string };
    if (!body.coachProfileId) {
      return NextResponse.json(
        { error: "coachProfileId required" },
        { status: 400 },
      );
    }

    const reqRow = await prisma.substitutionRequest.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        class: { include: { classType: { select: { name: true } } } },
        requestingCoach: { include: { user: { select: { id: true, email: true } } } },
      },
    });
    if (!reqRow) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (reqRow.status !== "PENDING" && reqRow.status !== "PENDING_ADMIN") {
      return NextResponse.json(
        { error: "Only open requests can be reassigned" },
        { status: 400 },
      );
    }
    if (reqRow.mode === "SWAP") {
      return NextResponse.json(
        { error: "Swap requests cannot be reassigned manually" },
        { status: 400 },
      );
    }

    const target = await prisma.coachProfile.findFirst({
      where: { id: body.coachProfileId, tenantId: tenant.id },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!target || !target.userId) {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id: reqRow.classId },
        select: { coachId: true, originalCoachId: true },
      });
      if (!cls) return;

      await tx.class.update({
        where: { id: reqRow.classId },
        data: {
          coachId: target.id,
          originalCoachId: cls.originalCoachId ?? cls.coachId,
        },
      });

      await tx.substitutionRequest.update({
        where: { id: reqRow.id },
        data: {
          status: "ACCEPTED",
          acceptedByCoachId: target.id,
          adminReviewedAt: new Date(),
          adminReviewedBy: session.user.id,
          respondedAt: new Date(),
        },
      });
    });

    // Notify the requesting coach (it was their request) and the assigned
    // coach (they got assigned).
    await Promise.allSettled([
      notifyRequestAccepted({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        classId: reqRow.classId,
        className: reqRow.class.classType.name,
        startsAt: reqRow.class.startsAt,
        acceptedByName: target.name,
        requestingCoachUserId: reqRow.requestingCoach.user?.id ?? null,
        requestingCoachEmail: reqRow.requestingCoach.user?.email ?? null,
        requestingCoachName: reqRow.requestingCoach.name,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/substitutions/[id]/assign error:", error);
    return NextResponse.json(
      { error: "Failed to assign coach" },
      { status: 500 },
    );
  }
}
