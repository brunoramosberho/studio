import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import {
  checkCoachCanTakeClass,
  notifyAdminsCoverageResolved,
  notifyAdminsOfSubFlow,
  notifyRequestAccepted,
  notifySwapAcceptedPendingAdmin,
} from "@/lib/substitutions";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { id } = await params;

    const coach = await prisma.coachProfile.findFirst({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: { id: true, name: true },
    });
    if (!coach) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const reqRow = await prisma.substitutionRequest.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        class: {
          include: { classType: { select: { name: true } } },
        },
        requestingCoach: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });
    if (!reqRow) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (reqRow.status !== "PENDING") {
      return NextResponse.json(
        { error: "This request is no longer pending" },
        { status: 409 },
      );
    }
    if (reqRow.requestingCoachId === coach.id) {
      return NextResponse.json(
        { error: "Cannot accept your own request" },
        { status: 400 },
      );
    }
    // Mode-specific eligibility for accepting:
    // - DIRECT (legacy) / SWAP: only the named target can accept
    // - OPEN / REQUEST: any coach in notifiedCoachIds can accept
    if (
      (reqRow.mode === "DIRECT" || reqRow.mode === "SWAP") &&
      reqRow.targetCoachId !== coach.id
    ) {
      return NextResponse.json(
        { error: "This request is for another instructor" },
        { status: 403 },
      );
    }
    if (
      (reqRow.mode === "OPEN" || reqRow.mode === "REQUEST") &&
      !reqRow.notifiedCoachIds.includes(coach.id)
    ) {
      return NextResponse.json(
        { error: "You are not eligible for this request" },
        { status: 403 },
      );
    }

    // SWAP acceptance does NOT immediately reassign — it transitions to
    // PENDING_ADMIN so the admin can rubber-stamp before both classes get
    // re-routed. Everything else takes the existing accept path.
    if (reqRow.mode === "SWAP") {
      const updated = await prisma.substitutionRequest.updateMany({
        where: { id: reqRow.id, status: "PENDING" },
        data: {
          status: "PENDING_ADMIN",
          acceptedByCoachId: coach.id,
          respondedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { error: "Request was already updated" },
          { status: 409 },
        );
      }
      await Promise.allSettled([
        notifyAdminsOfSubFlow({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          requestId: reqRow.id,
          classId: reqRow.classId,
          className: reqRow.class.classType.name,
          startsAt: reqRow.class.startsAt,
          fromCoachName: coach.name,
          mode: "SWAP",
          needsApproval: true,
        }),
        // Keep the requesting coach in the loop — their swap was accepted and
        // is now just waiting on admin sign-off.
        notifySwapAcceptedPendingAdmin({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          requestingCoachUserId: reqRow.requestingCoach.user?.id ?? null,
          requestingCoachEmail: reqRow.requestingCoach.user?.email ?? null,
          requestingCoachName: reqRow.requestingCoach.name,
          acceptedByName: coach.name,
          yourClassName: reqRow.class.classType.name,
          yourClassStartsAt: reqRow.class.startsAt,
        }),
      ]);
      return NextResponse.json({ ok: true, awaitingAdmin: true });
    }

    const reason = await checkCoachCanTakeClass(
      coach.id,
      reqRow.classId,
      tenant.id,
    );
    if (reason) {
      return NextResponse.json({ error: reason }, { status: 400 });
    }

    // Atomically claim the request and reassign the class.
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.substitutionRequest.updateMany({
        where: { id: reqRow.id, status: "PENDING" },
        data: {
          status: "ACCEPTED",
          acceptedByCoachId: coach.id,
          respondedAt: new Date(),
        },
      });
      if (claimed.count === 0) return null;

      const cls = await tx.class.findUnique({
        where: { id: reqRow.classId },
        select: { coachId: true, originalCoachId: true },
      });
      if (!cls) return null;

      await tx.class.update({
        where: { id: reqRow.classId },
        data: {
          coachId: coach.id,
          originalCoachId: cls.originalCoachId ?? cls.coachId,
        },
      });

      // Cancel any other pending requests for the same class.
      await tx.substitutionRequest.updateMany({
        where: {
          tenantId: tenant.id,
          classId: reqRow.classId,
          status: "PENDING",
          NOT: { id: reqRow.id },
        },
        data: {
          status: "CANCELLED",
          respondedAt: new Date(),
        },
      });

      return true;
    });

    if (!result) {
      return NextResponse.json(
        { error: "Request was already taken" },
        { status: 409 },
      );
    }

    await Promise.allSettled([
      notifyRequestAccepted({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        classId: reqRow.classId,
        className: reqRow.class.classType.name,
        startsAt: reqRow.class.startsAt,
        acceptedByName: coach.name,
        requestingCoachUserId: reqRow.requestingCoach.user?.id ?? null,
        requestingCoachEmail: reqRow.requestingCoach.user?.email ?? null,
        requestingCoachName: reqRow.requestingCoach.name,
      }),
      // Let admins know the class is covered now.
      notifyAdminsCoverageResolved({
        tenantId: tenant.id,
        classId: reqRow.classId,
        className: reqRow.class.classType.name,
        fromCoachName: reqRow.requestingCoach.name,
        acceptedByName: coach.name,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/coach/substitutions/[id]/accept error:", error);
    return NextResponse.json(
      { error: "Failed to accept request" },
      { status: 500 },
    );
  }
}
