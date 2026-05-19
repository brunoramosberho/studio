import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import {
  getEligibleCoaches,
  isUrgentSubRequest,
  notifyAdminsOfSubFlow,
  notifyCandidates,
  notifySwapTarget,
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

type ReasonType = "PERSONAL" | "ILLNESS" | "EMERGENCY" | "TRAVEL" | "OTHER";

export async function POST(req: NextRequest) {
  try {
    const { tenant, coach } = await getCoachContext();
    if (!coach) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const body = (await req.json()) as {
      classId?: string;
      // New unified surface: REQUEST | MANUAL_ASSIGN | SWAP. Legacy OPEN/DIRECT
      // still accepted and mapped to REQUEST for back-compat with any in-flight
      // clients.
      mode?: "REQUEST" | "MANUAL_ASSIGN" | "SWAP" | "OPEN" | "DIRECT";
      // REQUEST: list of CoachProfile IDs to notify. MANUAL_ASSIGN: the
      // single coach taking the class. SWAP: the other coach in the swap.
      targetCoachIds?: string[];
      targetCoachId?: string; // legacy single-target (DIRECT)
      // SWAP: the other coach's class that the requester would teach instead.
      swapWithClassId?: string;
      reasonType?: ReasonType;
      reasonNote?: string;
      note?: string;
    };

    if (!body.classId) {
      return NextResponse.json({ error: "classId required" }, { status: 400 });
    }

    const validModes = ["REQUEST", "MANUAL_ASSIGN", "SWAP", "OPEN", "DIRECT"] as const;
    type Mode = (typeof validModes)[number];
    if (!body.mode || !validModes.includes(body.mode as Mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    // Legacy → unified
    const mode: "REQUEST" | "MANUAL_ASSIGN" | "SWAP" =
      body.mode === "OPEN" || body.mode === "DIRECT" ? "REQUEST" : body.mode;

    if (!body.reasonType) {
      return NextResponse.json({ error: "reasonType required" }, { status: 400 });
    }
    if (!["PERSONAL", "ILLNESS", "EMERGENCY", "TRAVEL", "OTHER"].includes(body.reasonType)) {
      return NextResponse.json({ error: "invalid reasonType" }, { status: 400 });
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
        { error: "Cannot request coverage for this class" },
        { status: 400 },
      );
    }

    // No more than one open coverage request per class at a time.
    const existing = await prisma.substitutionRequest.findFirst({
      where: {
        tenantId: tenant.id,
        classId: cls.id,
        status: { in: ["PENDING", "PENDING_ADMIN"] },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "There is already an open coverage request for this class" },
        { status: 409 },
      );
    }

    const reasonType = body.reasonType;
    const reasonNote = body.reasonNote?.trim() || null;
    const note = body.note?.trim() || null;

    // ── Branch per mode ──────────────────────────────────────────────

    if (mode === "MANUAL_ASSIGN") {
      const targetId = body.targetCoachId ?? body.targetCoachIds?.[0];
      if (!targetId) {
        return NextResponse.json(
          { error: "targetCoachId required for MANUAL_ASSIGN" },
          { status: 400 },
        );
      }
      const target = await prisma.coachProfile.findFirst({
        where: { id: targetId, tenantId: tenant.id },
        include: { user: { select: { id: true, email: true } } },
      });
      if (!target || !target.userId) {
        return NextResponse.json(
          { error: "Target coach not found or has no account" },
          { status: 404 },
        );
      }

      // Atomic: create the request as ACCEPTED and reassign the class.
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.substitutionRequest.create({
          data: {
            tenantId: tenant.id,
            classId: cls.id,
            requestingCoachId: coach.id,
            originalCoachId: coach.id,
            targetCoachId: target.id,
            acceptedByCoachId: target.id,
            mode: "MANUAL_ASSIGN",
            status: "ACCEPTED",
            reasonType,
            reasonNote,
            note,
            notifiedCoachIds: [target.id],
            respondedAt: new Date(),
          },
        });
        await tx.class.update({
          where: { id: cls.id },
          data: { coachId: target.id },
        });
        return created;
      });

      // Notify the assigned coach + admins (informational)
      await Promise.allSettled([
        notifyCandidates({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          classId: cls.id,
          className: cls.classType.name,
          startsAt: cls.startsAt,
          fromCoachName: coach.name,
          mode: "DIRECT",
          note,
          recipients: [
            {
              userId: target.userId,
              email: target.user?.email ?? null,
              name: target.name,
            },
          ],
        }),
        notifyAdminsOfSubFlow({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          requestId: result.id,
          classId: cls.id,
          className: cls.classType.name,
          startsAt: cls.startsAt,
          fromCoachName: coach.name,
          mode: "MANUAL_ASSIGN",
          needsApproval: false,
        }),
      ]);

      return NextResponse.json({ request: result });
    }

    if (mode === "SWAP") {
      const targetId = body.targetCoachId ?? body.targetCoachIds?.[0];
      if (!targetId || !body.swapWithClassId) {
        return NextResponse.json(
          { error: "targetCoachId and swapWithClassId required for SWAP" },
          { status: 400 },
        );
      }
      const target = await prisma.coachProfile.findFirst({
        where: { id: targetId, tenantId: tenant.id },
        include: { user: { select: { id: true, email: true } } },
      });
      if (!target || !target.userId) {
        return NextResponse.json(
          { error: "Target coach not found" },
          { status: 404 },
        );
      }
      const swapWith = await prisma.class.findFirst({
        where: {
          id: body.swapWithClassId,
          tenantId: tenant.id,
          coachId: target.id,
          status: "SCHEDULED",
        },
        include: { classType: { select: { name: true } } },
      });
      if (!swapWith) {
        return NextResponse.json(
          { error: "Swap target class not found" },
          { status: 404 },
        );
      }

      const request = await prisma.substitutionRequest.create({
        data: {
          tenantId: tenant.id,
          classId: cls.id,
          requestingCoachId: coach.id,
          originalCoachId: coach.id,
          targetCoachId: target.id,
          swapWithClassId: swapWith.id,
          mode: "SWAP",
          status: "PENDING", // waits for target to accept first
          reasonType,
          reasonNote,
          note,
          notifiedCoachIds: [target.id],
        },
      });

      await notifySwapTarget({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        targetCoachUserId: target.userId,
        fromCoachName: coach.name,
        yourClassName: swapWith.classType.name,
        yourClassStartsAt: swapWith.startsAt,
        theirClassName: cls.classType.name,
        theirClassStartsAt: cls.startsAt,
      });

      return NextResponse.json({ request });
    }

    // mode === "REQUEST" — coach picked which coaches to notify
    const targetIds =
      body.targetCoachIds && body.targetCoachIds.length > 0
        ? body.targetCoachIds
        : body.targetCoachId
        ? [body.targetCoachId]
        : [];

    let chosen = targetIds;
    if (chosen.length === 0) {
      // Empty list = treat as "send to everyone eligible" (legacy OPEN behaviour).
      const all = await getEligibleCoaches(cls.id, tenant.id);
      chosen = pickNotifiableCandidates(all).map((c) => c.coachProfileId);
    }

    if (chosen.length === 0) {
      return NextResponse.json(
        { error: "No hay instructores elegibles disponibles" },
        { status: 400 },
      );
    }

    // Validate all chosen coaches exist + can take the class (soft check;
    // we allow ok_if_needed but block hard conflicts).
    const profiles = await prisma.coachProfile.findMany({
      where: { id: { in: chosen }, tenantId: tenant.id },
      include: { user: { select: { id: true, email: true } } },
    });
    const recipients = profiles
      .filter((p) => p.userId)
      .map((p) => ({
        userId: p.userId!,
        email: p.user?.email ?? null,
        name: p.name,
        coachProfileId: p.id,
      }));
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No selected coaches have linked accounts" },
        { status: 400 },
      );
    }

    // Time-based gating: classes within the urgent window skip admin
    // approval; everything else needs it.
    const urgent = isUrgentSubRequest(
      cls.startsAt,
      tenant.subRequestAdminApprovalHours,
    );
    const status = urgent ? "PENDING" : "PENDING_ADMIN";

    const request = await prisma.substitutionRequest.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        requestingCoachId: coach.id,
        originalCoachId: coach.id,
        mode: "REQUEST",
        status,
        reasonType,
        reasonNote,
        note,
        notifiedCoachIds: recipients.map((r) => r.coachProfileId),
      },
    });

    if (urgent) {
      await Promise.allSettled([
        notifyCandidates({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          classId: cls.id,
          className: cls.classType.name,
          startsAt: cls.startsAt,
          fromCoachName: coach.name,
          // Legacy mode label for the email/push template — keeps copy
          // sensible without templating churn. OPEN = broadcast, DIRECT = single.
          mode: recipients.length === 1 ? "DIRECT" : "OPEN",
          note,
          recipients: recipients.map((r) => ({
            userId: r.userId,
            email: r.email,
            name: r.name,
          })),
        }),
        notifyAdminsOfSubFlow({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          requestId: request.id,
          classId: cls.id,
          className: cls.classType.name,
          startsAt: cls.startsAt,
          fromCoachName: coach.name,
          mode: "REQUEST",
          needsApproval: false,
        }),
      ]);
    } else {
      await notifyAdminsOfSubFlow({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        requestId: request.id,
        classId: cls.id,
        className: cls.classType.name,
        startsAt: cls.startsAt,
        fromCoachName: coach.name,
        mode: "REQUEST",
        needsApproval: true,
      });
    }

    return NextResponse.json({ request });
  } catch (error) {
    console.error("POST /api/coach/substitutions error:", error);
    return NextResponse.json(
      { error: "Failed to create request" },
      { status: 500 },
    );
  }
}
