import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { validateBlockPayload } from "@/lib/availability-validation";
import { notifyCoachOfAdminCreatedBlock } from "@/lib/availability-notifications";

// Admin-side block creation. Unlike `/api/coaches/availability` (which the
// coach calls for themselves and which can land in `pending_approval` for
// yellow/red zones), an admin-created block is always `active` immediately —
// the admin already has approval authority, so we record them as the
// approver on creation. The coach is notified via push so they aren't
// surprised next time they open their calendar.
export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const { coachUserId, ...payload } = body as {
      coachUserId?: string;
    } & Record<string, unknown>;

    if (!coachUserId) {
      return NextResponse.json({ error: "coachUserId is required" }, { status: 400 });
    }

    // Ensure the target coach belongs to this tenant (anti cross-tenant leak)
    // and has a coach profile here — we only allow blocking actual coaches.
    const coachProfile = await prisma.coachProfile.findFirst({
      where: { tenantId: tenant.id, userId: coachUserId },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!coachProfile || !coachProfile.user) {
      return NextResponse.json(
        { error: "Coach not found in this tenant" },
        { status: 404 },
      );
    }

    const studios = await prisma.studio.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    const validStudioIds = new Set(studios.map((s) => s.id));

    const validation = validateBlockPayload(
      payload,
      {
        studioOpenTime: tenant.studioOpenTime,
        studioCloseTime: tenant.studioCloseTime,
        operatingDays: tenant.operatingDays,
      },
      { validStudioIds },
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const data = validation.data;

    const now = new Date();
    const block = await prisma.coachAvailabilityBlock.create({
      data: {
        tenantId: tenant.id,
        coachId: coachProfile.userId!,
        kind: data.kind,
        type: data.type,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        startDate: data.startDate,
        endDate: data.endDate,
        isAllDay: data.isAllDay,
        reasonType: data.reasonType,
        reasonNote: data.reasonNote,
        status: "active",
        approvedBy: session.user.id,
        approvedAt: now,
        studioPreferences:
          data.studioPreferences.length > 0
            ? {
                create: data.studioPreferences.map((p) => ({
                  studioId: p.studioId,
                  preference: p.preference,
                  tenantId: tenant.id,
                })),
              }
            : undefined,
      },
      include: {
        studioPreferences: { select: { studioId: true, preference: true } },
      },
    });

    // Notify the coach asynchronously. A failure here shouldn't fail the
    // creation — the block exists either way.
    notifyCoachOfAdminCreatedBlock({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      coachUserId: coachProfile.user.id,
      block: {
        id: block.id,
        kind: block.kind as "availability" | "time_off",
        type: block.type as "one_time" | "recurring",
        startDate: block.startDate,
        endDate: block.endDate,
        dayOfWeek: block.dayOfWeek,
        startTime: block.startTime,
        endTime: block.endTime,
        isAllDay: block.isAllDay,
        reasonType: block.reasonType,
        reasonNote: block.reasonNote,
      },
    }).catch((err) => {
      console.error("Failed to notify coach of admin-created block:", err);
    });

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create block";
    console.error("POST /api/admin/availability/blocks error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
