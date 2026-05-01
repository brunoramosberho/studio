import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { notifyRequestRejected } from "@/lib/substitutions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      rejectionNote?: string;
    };

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
        class: { include: { classType: { select: { name: true } } } },
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

    // OPEN mode: reject just removes the coach from the notified list (no
    // status change — others can still accept). DIRECT mode: actually rejects.
    if (reqRow.mode === "OPEN") {
      if (!reqRow.notifiedCoachIds.includes(coach.id)) {
        return NextResponse.json(
          { error: "You are not part of this request" },
          { status: 403 },
        );
      }
      await prisma.substitutionRequest.update({
        where: { id: reqRow.id },
        data: {
          notifiedCoachIds: reqRow.notifiedCoachIds.filter(
            (cid) => cid !== coach.id,
          ),
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (reqRow.targetCoachId !== coach.id) {
      return NextResponse.json(
        { error: "This request is for another instructor" },
        { status: 403 },
      );
    }

    await prisma.substitutionRequest.update({
      where: { id: reqRow.id },
      data: {
        status: "REJECTED",
        rejectionNote: body.rejectionNote?.trim() || null,
        respondedAt: new Date(),
      },
    });

    await notifyRequestRejected({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      className: reqRow.class.classType.name,
      startsAt: reqRow.class.startsAt,
      rejectedByName: coach.name,
      rejectionNote: body.rejectionNote,
      requestingCoachUserId: reqRow.requestingCoach.user?.id ?? null,
      requestingCoachEmail: reqRow.requestingCoach.user?.email ?? null,
      requestingCoachName: reqRow.requestingCoach.name,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/coach/substitutions/[id]/reject error:", error);
    return NextResponse.json(
      { error: "Failed to reject request" },
      { status: 500 },
    );
  }
}
