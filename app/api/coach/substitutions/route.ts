import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import {
  checkCoachCanTakeClass,
  getEligibleCoaches,
  notifyCandidates,
  pickNotifiableCandidates,
} from "@/lib/substitutions";

async function getCoachContext() {
  const { session, tenant } = await requireAuth();
  const coach = await prisma.coachProfile.findFirst({
    where: { userId: session.user.id, tenantId: tenant.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return { session, tenant, coach };
}

export async function GET() {
  try {
    const { tenant, coach } = await getCoachContext();
    if (!coach) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const [outgoing, incoming] = await Promise.all([
      prisma.substitutionRequest.findMany({
        where: { tenantId: tenant.id, requestingCoachId: coach.id },
        orderBy: { createdAt: "desc" },
        include: {
          class: {
            include: {
              classType: { select: { name: true, color: true } },
              room: { select: { name: true } },
            },
          },
          targetCoach: { select: { id: true, name: true, photoUrl: true } },
          acceptedByCoach: { select: { id: true, name: true, photoUrl: true } },
        },
      }),
      prisma.substitutionRequest.findMany({
        where: {
          tenantId: tenant.id,
          status: "PENDING",
          OR: [
            { mode: "DIRECT", targetCoachId: coach.id },
            { mode: "OPEN", notifiedCoachIds: { has: coach.id } },
          ],
          NOT: { requestingCoachId: coach.id },
        },
        orderBy: { createdAt: "desc" },
        include: {
          class: {
            include: {
              classType: { select: { name: true, color: true } },
              room: { select: { name: true } },
            },
          },
          requestingCoach: { select: { id: true, name: true, photoUrl: true } },
        },
      }),
    ]);

    return NextResponse.json({ outgoing, incoming });
  } catch (error) {
    console.error("GET /api/coach/substitutions error:", error);
    return NextResponse.json(
      { error: "Failed to load substitutions" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenant, coach } = await getCoachContext();
    if (!coach) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const body = (await req.json()) as {
      classId?: string;
      mode?: "OPEN" | "DIRECT";
      targetCoachId?: string;
      note?: string;
    };

    if (!body.classId || (body.mode !== "OPEN" && body.mode !== "DIRECT")) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: body.classId, tenantId: tenant.id, coachId: coach.id },
      include: { classType: { select: { name: true } } },
    });
    if (!cls) {
      return NextResponse.json(
        { error: "Class not found or you are not the assigned instructor" },
        { status: 404 },
      );
    }
    if (cls.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: "Cannot request a substitute for this class" },
        { status: 400 },
      );
    }

    const existing = await prisma.substitutionRequest.findFirst({
      where: {
        tenantId: tenant.id,
        classId: cls.id,
        status: "PENDING",
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "There is already an open request for this class" },
        { status: 409 },
      );
    }

    let targetCoachId: string | undefined;
    let recipients: { userId: string; email: string | null; name: string }[] = [];
    let notifiedCoachIds: string[] = [];

    if (body.mode === "DIRECT") {
      if (!body.targetCoachId) {
        return NextResponse.json(
          { error: "targetCoachId required" },
          { status: 400 },
        );
      }
      const target = await prisma.coachProfile.findFirst({
        where: { id: body.targetCoachId, tenantId: tenant.id },
        include: { user: { select: { id: true, email: true } } },
      });
      if (!target || !target.userId) {
        return NextResponse.json(
          { error: "Target coach not found or has no account" },
          { status: 404 },
        );
      }
      const reason = await checkCoachCanTakeClass(target.id, cls.id, tenant.id);
      if (reason) {
        return NextResponse.json({ error: reason }, { status: 400 });
      }
      targetCoachId = target.id;
      notifiedCoachIds = [target.id];
      recipients = [
        {
          userId: target.userId,
          email: target.user?.email ?? null,
          name: target.name,
        },
      ];
    } else {
      const all = await getEligibleCoaches(cls.id, tenant.id);
      const notifiable = pickNotifiableCandidates(all);
      if (notifiable.length === 0) {
        return NextResponse.json(
          { error: "No hay instructores elegibles disponibles" },
          { status: 400 },
        );
      }
      notifiedCoachIds = notifiable.map((c) => c.coachProfileId);
      recipients = notifiable.map((c) => ({
        userId: c.userId,
        email: c.email,
        name: c.name,
      }));
    }

    const request = await prisma.substitutionRequest.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        requestingCoachId: coach.id,
        originalCoachId: coach.id,
        targetCoachId,
        mode: body.mode,
        status: "PENDING",
        note: body.note?.trim() || null,
        notifiedCoachIds,
      },
    });

    await notifyCandidates({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      classId: cls.id,
      className: cls.classType.name,
      startsAt: cls.startsAt,
      fromCoachName: coach.name,
      mode: body.mode,
      note: body.note,
      recipients,
    });

    return NextResponse.json({ request });
  } catch (error) {
    console.error("POST /api/coach/substitutions error:", error);
    return NextResponse.json(
      { error: "Failed to create request" },
      { status: 500 },
    );
  }
}
