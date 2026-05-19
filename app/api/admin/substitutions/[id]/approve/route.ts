import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  notifyCandidates,
  notifyRequestAccepted,
} from "@/lib/substitutions";

/**
 * Admin approves a PENDING_ADMIN sub request. Two branches:
 *
 *   - REQUEST: transition to PENDING and notify the chosen coaches.
 *     Optionally accepts an updated `notifiedCoachIds` list so the admin
 *     can adjust the recipient list before approval.
 *
 *   - SWAP: execute the swap atomically. Both classes get their coachId
 *     reassigned and the request becomes ACCEPTED.
 *
 * MANUAL_ASSIGN never lands here (it auto-ACCEPTs at creation).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireRole("ADMIN");
    const { id } = await params;
    const body = (await request
      .json()
      .catch(() => ({}))) as { notifiedCoachIds?: string[] };

    const reqRow = await prisma.substitutionRequest.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        class: { include: { classType: { select: { name: true } } } },
        swapWithClass: { include: { classType: { select: { name: true } } } },
        requestingCoach: { include: { user: { select: { id: true, email: true } } } },
        acceptedByCoach: { include: { user: { select: { id: true, email: true } } } },
      },
    });
    if (!reqRow) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (reqRow.status !== "PENDING_ADMIN") {
      return NextResponse.json(
        { error: "Only requests awaiting admin approval can be approved" },
        { status: 400 },
      );
    }

    // ── SWAP approval ──────────────────────────────────────────────
    if (reqRow.mode === "SWAP") {
      if (!reqRow.swapWithClassId || !reqRow.acceptedByCoachId) {
        return NextResponse.json(
          { error: "Swap is missing class or accepting coach" },
          { status: 400 },
        );
      }
      const swapWith = reqRow.swapWithClass;
      if (!swapWith) {
        return NextResponse.json(
          { error: "Swap-with class no longer exists" },
          { status: 400 },
        );
      }

      await prisma.$transaction(async (tx) => {
        // Original class → other coach (acceptedBy = the swap target)
        await tx.class.update({
          where: { id: reqRow.classId },
          data: {
            coachId: reqRow.acceptedByCoachId!,
            originalCoachId: reqRow.originalCoachId,
          },
        });
        // Other class → requesting coach
        await tx.class.update({
          where: { id: swapWith.id },
          data: {
            coachId: reqRow.requestingCoachId,
            originalCoachId: reqRow.acceptedByCoachId!,
          },
        });
        await tx.substitutionRequest.update({
          where: { id: reqRow.id },
          data: {
            status: "ACCEPTED",
            adminReviewedAt: new Date(),
            adminReviewedBy: session.user.id,
          },
        });
      });

      // Notify both coaches
      await Promise.allSettled([
        notifyRequestAccepted({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          classId: reqRow.classId,
          className: reqRow.class.classType.name,
          startsAt: reqRow.class.startsAt,
          acceptedByName: reqRow.acceptedByCoach?.name ?? "Coach",
          requestingCoachUserId: reqRow.requestingCoach.user?.id ?? null,
          requestingCoachEmail: reqRow.requestingCoach.user?.email ?? null,
          requestingCoachName: reqRow.requestingCoach.name,
        }),
      ]);

      return NextResponse.json({ ok: true });
    }

    // ── REQUEST approval ──────────────────────────────────────────
    const notifiedCoachIds =
      body.notifiedCoachIds && body.notifiedCoachIds.length > 0
        ? body.notifiedCoachIds
        : reqRow.notifiedCoachIds;
    if (notifiedCoachIds.length === 0) {
      return NextResponse.json(
        { error: "No coaches selected to notify" },
        { status: 400 },
      );
    }

    const profiles = await prisma.coachProfile.findMany({
      where: { id: { in: notifiedCoachIds }, tenantId: tenant.id },
      include: { user: { select: { id: true, email: true } } },
    });
    const recipients = profiles
      .filter((p) => p.userId)
      .map((p) => ({
        userId: p.userId!,
        email: p.user?.email ?? null,
        name: p.name,
      }));

    await prisma.substitutionRequest.update({
      where: { id: reqRow.id },
      data: {
        status: "PENDING",
        notifiedCoachIds,
        adminReviewedAt: new Date(),
        adminReviewedBy: session.user.id,
      },
    });

    await notifyCandidates({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      classId: reqRow.classId,
      className: reqRow.class.classType.name,
      startsAt: reqRow.class.startsAt,
      fromCoachName: reqRow.requestingCoach.name,
      mode: recipients.length === 1 ? "DIRECT" : "OPEN",
      note: reqRow.note,
      recipients,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/substitutions/[id]/approve error:", error);
    return NextResponse.json(
      { error: "Failed to approve request" },
      { status: 500 },
    );
  }
}
